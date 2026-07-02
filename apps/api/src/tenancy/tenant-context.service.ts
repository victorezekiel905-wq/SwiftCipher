import { Injectable, Scope } from '@nestjs/common';

@Injectable({ scope: Scope.REQUEST })
export class TenantContextService {
  private tenantId = '';

  setTenantId(tenantId: string) {
    this.tenantId = tenantId;
  }

  getTenantId() {
    return this.tenantId;
  }
}
