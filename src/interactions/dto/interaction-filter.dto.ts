import { IsDateString, IsEnum, IsInt, IsMongoId, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CallOutcome } from '@/common/enums';

export class InteractionFilterDto {
  @IsOptional()
  @IsMongoId()
  agentId?: string | undefined;

  @IsOptional()
  @IsMongoId()
  clientId?: string | undefined;

  @IsOptional()
  @IsEnum(CallOutcome)
  outcome?: CallOutcome | undefined;

  @IsOptional()
  @IsDateString()
  from?: string | undefined;

  @IsOptional()
  @IsDateString()
  to?: string | undefined;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number | undefined;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number | undefined;
}
