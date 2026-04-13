import { IsDateString, IsOptional } from 'class-validator';

export class DashboardFilterDto {
  @IsOptional()
  @IsDateString()
  from?: string | undefined;

  @IsOptional()
  @IsDateString()
  to?: string | undefined;
}
