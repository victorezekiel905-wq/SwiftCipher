jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://signed.example/upload'),
}));

import { StorageService } from '../src/storage/storage.service';
import { PrismaService } from '../src/common/prisma.service';
import { TenantContextService } from '../src/tenancy/tenant-context.service';
import { AuditService } from '../src/common/audit.service';

describe('StorageService', () => {
  it('creates a tenant-scoped asset record and returns a signed upload URL', async () => {
    const prisma = {
      lesson: {
        findFirst: jest.fn().mockResolvedValue({ id: 'lesson-1', tenantId: 'aurora-high' }),
      },
      mediaAsset: {
        create: jest.fn().mockResolvedValue({
          id: 'asset-1',
          tenantId: 'aurora-high',
          ownerId: 'teacher-1',
          lessonId: 'lesson-1',
          displayName: 'Slide Deck.pdf',
          fileName: 'slide-deck.pdf',
          objectKey: 'aurora-high/lesson-1/object-slide-deck.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          bucket: 'classsphere-assets',
          metadata: { source: 'studio' },
        }),
      },
    } as unknown as PrismaService;

    const config = {
      get: jest.fn((_key: string, fallback: string) => fallback),
    };

    const service = new StorageService(
      config as never,
      prisma,
      { getTenantId: () => 'aurora-high' } as TenantContextService,
      { record: jest.fn() } as unknown as AuditService,
    );

    Object.assign(service as object, {
      s3: { send: jest.fn().mockResolvedValue(undefined) },
    });

    const result = await service.initiateUpload(
      {
        fileName: 'Slide Deck.pdf',
        contentType: 'application/pdf',
        sizeBytes: 1024,
        lessonId: 'lesson-1',
      },
      {
        sub: 'teacher-1',
        tenantId: 'aurora-high',
        email: 'teacher@aurora.local',
        roles: ['teacher'],
      },
    );

    expect(prisma.mediaAsset.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'aurora-high',
          fileName: 'slide-deck.pdf',
          lessonId: 'lesson-1',
        }),
      }),
    );
    expect(result.upload.uploadUrl).toBe('https://signed.example/upload');
  });
});
