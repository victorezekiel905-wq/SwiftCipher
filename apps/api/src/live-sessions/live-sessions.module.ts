import { Module } from '@nestjs/common';
import { RolesGuard } from '../common/roles.guard';
import { LiveSessionsController } from './live-sessions.controller';
import { LiveSessionsService } from './live-sessions.service';

@Module({
  controllers: [LiveSessionsController],
  providers: [LiveSessionsService, RolesGuard],
  exports: [LiveSessionsService],
})
export class LiveSessionsModule {}
