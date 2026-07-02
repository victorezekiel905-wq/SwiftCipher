import { Module } from '@nestjs/common';
import { RolesGuard } from '../common/roles.guard';
import { BehaviourController } from './behaviour.controller';
import { BehaviourService } from './behaviour.service';

@Module({
  controllers: [BehaviourController],
  providers: [BehaviourService, RolesGuard],
  exports: [BehaviourService],
})
export class BehaviourModule {}
