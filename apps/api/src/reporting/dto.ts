import { IsIn, IsOptional, IsString } from 'class-validator';

export const reportTypes = [
  'tenant_overview',
  'teacher_performance',
  'student_engagement',
  'parent_activity',
  'platform_revenue',
] as const;

export type ReportType = (typeof reportTypes)[number];

export class GenerateReportDto {
  @IsString()
  @IsIn(reportTypes)
  type!: ReportType;

  @IsOptional()
  @IsString()
  classRoomId?: string;

  @IsOptional()
  @IsString()
  teacherId?: string;

  @IsOptional()
  @IsString()
  studentId?: string;
}
