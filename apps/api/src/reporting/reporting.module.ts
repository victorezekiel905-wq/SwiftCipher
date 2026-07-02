import { Module } from '@nestjs/common';
import { AuditService } from '../common/audit.service';
import { PrismaModule } from '../common/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { ReportingController } from './reporting.controller';
import { ReportingService } from './reporting.service';

@Module({
  imports: [PrismaModule, TenancyModule],
  controllers: [ReportingController],
  providers: [ReportingService, AuditService],
  exports: [ReportingService],
})
export class ReportingModule {}
