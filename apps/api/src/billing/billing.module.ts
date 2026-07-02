import { Module } from '@nestjs/common';
import { AuditService } from '../common/audit.service';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

@Module({
  controllers: [BillingController],
  providers: [BillingService, AuditService],
})
export class BillingModule {}
