import { BadRequestException, CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { RequestUser } from './request-user';

@Injectable()
export class TenantAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      user?: RequestUser;
      headers: Record<string, string | string[] | undefined>;
    }>();

    const headerValue = request.headers['x-tenant-id'];
    const tenantId = Array.isArray(headerValue) ? headerValue[0] : headerValue;

    if (!tenantId) {
      throw new BadRequestException('x-tenant-id header is required');
    }

    const user = request.user;
    if (!user) {
      return true;
    }

    const isPlatformOwner = user.roles.includes('platform_owner');
    if (!isPlatformOwner && user.tenantId !== tenantId) {
      throw new ForbiddenException('Cross-tenant access is not allowed');
    }

    return true;
  }
}
