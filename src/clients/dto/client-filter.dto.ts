import { IsEnum, IsInt, IsMongoId, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ClientStatus } from '@/common/enums';

export class ClientFilterDto {
  @IsOptional()
  @IsEnum(ClientStatus)
  status?: ClientStatus | undefined;

  @IsOptional()
  @IsMongoId()
  assignedTo?: string | undefined;

  @IsOptional()
  @IsString()
  uploadBatchId?: string | undefined;

  /** Free-text match against name, phoneNormalized, cedula and ssNumber. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string | undefined;

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
