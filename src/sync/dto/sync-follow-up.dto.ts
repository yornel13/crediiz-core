import { IsDateString, IsMongoId, IsOptional, IsString, IsUUID } from 'class-validator';

export class SyncFollowUpDto {
  @IsUUID()
  mobileSyncId!: string;

  @IsMongoId()
  clientId!: string;

  @IsOptional()
  @IsUUID()
  interactionMobileSyncId?: string | undefined;

  @IsDateString()
  scheduledAt!: string;

  @IsString()
  reason!: string;

  @IsDateString()
  deviceCreatedAt!: string;
}
