import { Type } from 'class-transformer';
import {
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Min,
} from 'class-validator';

export class CreateClientDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(7)
  @MaxLength(30)
  phone!: string;

  /** Panama national ID. Optional — some banking partners accept clients without one. */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  cedula?: string;

  /** Social security number. Optional — not all source banks provide it. */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  ssNumber?: string;

  /** Monthly salary in USD. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  salary?: number;

  /** Bank-specific fields not promoted to flat columns. */
  @IsOptional()
  @IsObject()
  extraData?: Record<string, unknown>;
}
