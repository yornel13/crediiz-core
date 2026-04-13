import {
  IsDateString,
  IsEnum,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { CallOutcome } from '@/common/enums';

export class SyncInteractionDto {
  @IsUUID()
  mobileSyncId!: string;

  @IsMongoId()
  clientId!: string;

  @IsDateString()
  callStartedAt!: string;

  @IsDateString()
  callEndedAt!: string;

  @IsNumber()
  durationSeconds!: number;

  @IsEnum(CallOutcome)
  outcome!: CallOutcome;

  @IsOptional()
  @IsString()
  disconnectCause?: string | undefined;

  @IsDateString()
  deviceCreatedAt!: string;
}
