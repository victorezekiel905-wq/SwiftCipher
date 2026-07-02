import { Module } from '@nestjs/common';
import { AuditService } from '../common/audit.service';
import { PrismaModule } from '../common/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { CommunicationsController } from './communications.controller';
import { CommunicationsService } from './communications.service';

@Module({
  imports: [PrismaModule, TenancyModule],
  controllers: [CommunicationsController],
  providers: [CommunicationsService, AuditService],
  exports: [CommunicationsService],
})
export class CommunicationsModule {}
