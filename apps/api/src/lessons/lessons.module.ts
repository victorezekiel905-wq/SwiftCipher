import { Module } from '@nestjs/common';
import { RolesGuard } from '../common/roles.guard';
import { LessonsController } from './lessons.controller';
import { LessonsService } from './lessons.service';

@Module({
  controllers: [LessonsController],
  providers: [LessonsService, RolesGuard],
  exports: [LessonsService],
})
export class LessonsModule {}
