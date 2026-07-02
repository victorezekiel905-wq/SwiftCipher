import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuthModule } from './auth/auth.module';
import { BehaviourModule } from './behaviour/behaviour.module';
import { BillingModule } from './billing/billing.module';
import { CommunicationsModule } from './communications/communications.module';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module';
import { HealthModule } from './health/health.module';
import { LessonsModule } from './lessons/lessons.module';
import { LiveSessionsModule } from './live-sessions/live-sessions.module';
import { ParentPortalModule } from './parent-portal/parent-portal.module';
import { PrismaModule } from './common/prisma.module';
import { QuizzesModule } from './quizzes/quizzes.module';
import { ReportingModule } from './reporting/reporting.module';
import { StorageModule } from './storage/storage.module';
import { SupportModule } from './support/support.module';
import { TenancyModule } from './tenancy/tenancy.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    TenancyModule,
    AuthModule,
    UsersModule,
    HealthModule,
    LessonsModule,
    LiveSessionsModule,
    QuizzesModule,
    BehaviourModule,
    BillingModule,
    CommunicationsModule,
    FeatureFlagsModule,
    ParentPortalModule,
    ReportingModule,
    AnalyticsModule,
    StorageModule,
    SupportModule,
  ],
})
export class AppModule {}
