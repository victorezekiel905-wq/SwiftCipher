import { Module } from '@nestjs/common';
import { AuditService } from '../common/audit.service';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';

@Module({
  controllers: [SupportController],
  providers: [SupportService, AuditService],
})
export class SupportModule {}
