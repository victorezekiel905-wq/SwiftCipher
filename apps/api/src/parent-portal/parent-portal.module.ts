import { Module } from '@nestjs/common';
import { RolesGuard } from '../common/roles.guard';
import { ParentPortalController } from './parent-portal.controller';
import { ParentPortalService } from './parent-portal.service';

@Module({
  controllers: [ParentPortalController],
  providers: [ParentPortalService, RolesGuard],
  exports: [ParentPortalService],
})
export class ParentPortalModule {}
