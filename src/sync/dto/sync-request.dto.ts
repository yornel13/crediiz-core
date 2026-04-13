import { IsArray, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { SyncInteractionDto } from './sync-interaction.dto';
import { SyncFollowUpDto } from './sync-follow-up.dto';
import { SyncCompletedFollowUpDto } from './sync-completed-follow-up.dto';
import { SyncNoteDto } from './sync-note.dto';

export class SyncRequestDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncInteractionDto)
  interactions?: SyncInteractionDto[] | undefined;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncFollowUpDto)
  followUps?: SyncFollowUpDto[] | undefined;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncCompletedFollowUpDto)
  completedFollowUps?: SyncCompletedFollowUpDto[] | undefined;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncNoteDto)
  notes?: SyncNoteDto[] | undefined;
}
