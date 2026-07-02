import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AssetStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { RequestUser } from '../common/request-user';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { CompleteAssetUploadDto, InitiateAssetUploadDto } from './dto';

const STAFF_ROLES = new Set(['platform_owner', 'school_admin', 'vice_principal', 'teacher', 'co_teacher']);

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly bucket: string;
  private readonly publicEndpoint: string;
  private readonly s3: S3Client;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
  ) {
    this.bucket = this.configService.get<string>('STORAGE_BUCKET', 'classsphere-assets');
    this.publicEndpoint = this.configService.get<string>('STORAGE_ENDPOINT', 'http://localhost:9000');
    this.s3 = new S3Client({
      region: this.configService.get<string>('STORAGE_REGION', 'us-east-1'),
      endpoint: this.publicEndpoint,
      forcePathStyle: this.configService.get<string>('STORAGE_FORCE_PATH_STYLE', 'true') === 'true',
      credentials: {
        accessKeyId: this.configService.get<string>('STORAGE_ACCESS_KEY', 'classsphere'),
        secretAccessKey: this.configService.get<string>('STORAGE_SECRET_KEY', 'classsphere123'),
      },
    });
  }

  async onModuleInit() {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      this.logger.warn(`Bucket ${this.bucket} not found. Creating it automatically.`);
      await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  async listAssets(lessonId?: string) {
    const tenantId = this.tenantId();
    return this.prisma.mediaAsset.findMany({
      where: {
        tenantId,
        ...(lessonId ? { lessonId } : {}),
      },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  async initiateUpload(dto: InitiateAssetUploadDto, user: RequestUser) {
    const tenantId = this.tenantId();

    if (!STAFF_ROLES.has(user.roles[0] ?? '') && !user.roles.some((role) => STAFF_ROLES.has(role))) {
      throw new BadRequestException('Only instructional staff can upload lesson assets');
    }

    if (dto.lessonId) {
      await this.ensureLesson(dto.lessonId, tenantId);
    }

    const fileName = this.sanitizeFileName(dto.fileName);
    const asset = await this.prisma.mediaAsset.create({
      data: {
        tenantId,
        ownerId: user.sub,
        lessonId: dto.lessonId,
        displayName: dto.displayName?.trim() || fileName,
        fileName,
        objectKey: `${tenantId}/${dto.lessonId ?? 'shared'}/${Date.now()}-${randomUUID()}-${fileName}`,
        mimeType: dto.contentType,
        sizeBytes: dto.sizeBytes,
        bucket: this.bucket,
        metadata: {
          source: 'studio',
          initiatedAt: new Date().toISOString(),
        } satisfies Prisma.InputJsonValue,
      },
    });

    const uploadUrl = await getSignedUrl(
      this.s3,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: asset.objectKey,
        ContentType: dto.contentType,
      }),
      { expiresIn: 900 },
    );

    await this.audit.record({
      tenantId,
      actorId: user.sub,
      action: 'asset.upload.initiated',
      entityType: 'MediaAsset',
      entityId: asset.id,
      metadata: { lessonId: dto.lessonId ?? null, sizeBytes: dto.sizeBytes, mimeType: dto.contentType },
    });

    return {
      asset,
      upload: {
        method: 'PUT',
        uploadUrl,
        expiresInSeconds: 900,
        bucket: this.bucket,
        objectKey: asset.objectKey,
      },
    };
  }

  async uploadAssetViaProxy(assetId: string, file: Express.Multer.File, user: RequestUser) {
    const asset = await this.getAssetOrThrow(assetId);
    this.ensureUploadActor(asset, user);

    await this.s3.send(
      new PutObjectCommand({
        Bucket: asset.bucket,
        Key: asset.objectKey,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    const updated = await this.prisma.mediaAsset.update({
      where: { id: asset.id },
      data: {
        mimeType: file.mimetype,
        sizeBytes: file.size,
        status: AssetStatus.READY,
        checksum: null,
        metadata: {
          ...(asset.metadata as Record<string, unknown> | null),
          uploadedVia: 'api-proxy',
          uploadedAt: new Date().toISOString(),
        } satisfies Prisma.InputJsonValue,
      },
    });

    await this.audit.record({
      tenantId: asset.tenantId,
      actorId: user.sub,
      action: 'asset.upload.completed',
      entityType: 'MediaAsset',
      entityId: asset.id,
      metadata: { delivery: 'api-proxy', sizeBytes: file.size },
    });

    return updated;
  }

  async completeUpload(assetId: string, dto: CompleteAssetUploadDto, user: RequestUser) {
    const asset = await this.getAssetOrThrow(assetId);
    this.ensureUploadActor(asset, user);

    const updated = await this.prisma.mediaAsset.update({
      where: { id: asset.id },
      data: {
        status: AssetStatus.READY,
        checksum: dto.checksum ?? asset.checksum,
        metadata: {
          ...(asset.metadata as Record<string, unknown> | null),
          uploadedVia: 'signed-url',
          completedAt: new Date().toISOString(),
        } satisfies Prisma.InputJsonValue,
      },
    });

    await this.audit.record({
      tenantId: asset.tenantId,
      actorId: user.sub,
      action: 'asset.upload.completed',
      entityType: 'MediaAsset',
      entityId: asset.id,
      metadata: { delivery: 'signed-url', checksum: dto.checksum ?? null },
    });

    return updated;
  }

  async createDownloadUrl(assetId: string) {
    const asset = await this.getAssetOrThrow(assetId);
    const url = await getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: asset.bucket,
        Key: asset.objectKey,
        ResponseContentDisposition: `attachment; filename="${asset.fileName}"`,
      }),
      { expiresIn: 900 },
    );

    return {
      assetId: asset.id,
      downloadUrl: url,
      expiresInSeconds: 900,
      endpoint: this.publicEndpoint,
    };
  }

  private tenantId() {
    return this.tenantContext.getTenantId();
  }

  private sanitizeFileName(fileName: string) {
    return fileName.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').toLowerCase();
  }

  private async ensureLesson(lessonId: string, tenantId: string) {
    const lesson = await this.prisma.lesson.findFirst({ where: { id: lessonId, tenantId } });
    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }
    return lesson;
  }

  private async getAssetOrThrow(assetId: string) {
    const asset = await this.prisma.mediaAsset.findFirst({ where: { id: assetId, tenantId: this.tenantId() } });
    if (!asset) {
      throw new NotFoundException('Asset not found');
    }
    return asset;
  }

  private ensureUploadActor(asset: { ownerId: string }, user: RequestUser) {
    const isStaff = user.roles.some((role) => STAFF_ROLES.has(role));
    if (asset.ownerId !== user.sub && !isStaff) {
      throw new BadRequestException('You are not allowed to upload this asset');
    }
  }
}
