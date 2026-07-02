export const SYSTEM_TENANT_SLUG = 'system';

export enum SystemRole {
  PLATFORM_OWNER = 'platform_owner',
  SCHOOL_ADMIN = 'school_admin',
  TEACHER = 'teacher',
  STUDENT = 'student',
  PARENT = 'parent',
  SUPPORT_STAFF = 'support_staff',
  FINANCE = 'finance',
}

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    tenantId: string;
    email: string;
    roles: string[];
  };
};
