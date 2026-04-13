import { IsDateString, IsEnum, IsMongoId, IsOptional, IsString, IsUUID } from 'class-validator';
import { NoteType } from '@/common/enums';

export class SyncNoteDto {
  @IsUUID()
  mobileSyncId!: string;

  @IsMongoId()
  clientId!: string;

  @IsOptional()
  @IsUUID()
  interactionMobileSyncId?: string | undefined;

  @IsString()
  content!: string;

  @IsEnum(NoteType)
  type!: NoteType;

  @IsDateString()
  deviceCreatedAt!: string;
}
