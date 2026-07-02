import { Module } from '@nestjs/common';
import { RolesGuard } from '../common/roles.guard';
import { QuizzesController } from './quizzes.controller';
import { QuizzesService } from './quizzes.service';

@Module({
  controllers: [QuizzesController],
  providers: [QuizzesService, RolesGuard],
  exports: [QuizzesService],
})
export class QuizzesModule {}
