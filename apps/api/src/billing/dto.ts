import { IsBoolean, IsOptional } from 'class-validator';

export class ReconcileBillingDto {
  @IsOptional()
  @IsBoolean()
  includeDraftInvoice?: boolean;
}
