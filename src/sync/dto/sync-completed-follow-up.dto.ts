import { IsDateString, IsUUID } from 'class-validator';

export class SyncCompletedFollowUpDto {
  @IsUUID()
  mobileSyncId!: string;

  @IsDateString()
  completedAt!: string;
}
