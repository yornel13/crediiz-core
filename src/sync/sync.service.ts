import { Injectable, Logger } from '@nestjs/common';
import { InteractionsService } from '@/interactions/interactions.service';
import { FollowUpsService } from '@/follow-ups/follow-ups.service';
import { ClientsService } from '@/clients/clients.service';
import { NotesService } from '@/notes/notes.service';
import { type SyncRequestDto } from './dto/sync-request.dto';

interface SyncItemResult {
  mobileSyncId: string;
  status: 'created' | 'duplicate' | 'updated' | 'error';
  error?: string;
}

interface SyncCategoryResult {
  results: SyncItemResult[];
  syncedCount: number;
  duplicateCount: number;
  errorCount: number;
}

interface CompletedCategoryResult {
  results: SyncItemResult[];
  updatedCount: number;
  errorCount: number;
}

interface SyncResponse {
  interactions: SyncCategoryResult;
  notes: SyncCategoryResult;
  followUps: SyncCategoryResult;
  completedFollowUps: CompletedCategoryResult;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    error instanceof Error && 'code' in error && (error as Error & { code: number }).code === 11000
  );
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private readonly interactionsService: InteractionsService,
    private readonly followUpsService: FollowUpsService,
    private readonly clientsService: ClientsService,
    private readonly notesService: NotesService,
  ) {}

  async processSync(agentId: string, dto: SyncRequestDto): Promise<SyncResponse> {
    const interactionsResult = await this.processInteractions(agentId, dto.interactions ?? []);
    const notesResult = await this.processNotes(agentId, dto.notes ?? []);
    const followUpsResult = await this.processFollowUps(agentId, dto.followUps ?? []);
    const completedResult = await this.processCompletedFollowUps(dto.completedFollowUps ?? []);

    return {
      interactions: interactionsResult,
      notes: notesResult,
      followUps: followUpsResult,
      completedFollowUps: completedResult,
    };
  }

  private async processInteractions(
    agentId: string,
    interactions: NonNullable<SyncRequestDto['interactions']>,
  ): Promise<SyncCategoryResult> {
    const results: SyncItemResult[] = [];
    let syncedCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;

    for (const item of interactions) {
      try {
        await this.interactionsService.create({
          mobileSyncId: item.mobileSyncId,
          clientId: item.clientId,
          agentId,
          callStartedAt: new Date(item.callStartedAt),
          callEndedAt: new Date(item.callEndedAt),
          durationSeconds: item.durationSeconds,
          outcome: item.outcome,
          disconnectCause: item.disconnectCause ?? null,
          deviceCreatedAt: new Date(item.deviceCreatedAt),
        });

        await this.clientsService.updateClientOnInteraction(item.clientId, {
          outcome: item.outcome,
          callStartedAt: new Date(item.callStartedAt),
        });

        results.push({ mobileSyncId: item.mobileSyncId, status: 'created' });
        syncedCount++;
      } catch (error: unknown) {
        if (isDuplicateKeyError(error)) {
          results.push({ mobileSyncId: item.mobileSyncId, status: 'duplicate' });
          duplicateCount++;
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(`Failed to sync interaction ${item.mobileSyncId}: ${message}`);
          results.push({ mobileSyncId: item.mobileSyncId, status: 'error', error: message });
          errorCount++;
        }
      }
    }

    return { results, syncedCount, duplicateCount, errorCount };
  }

  private async processNotes(
    agentId: string,
    notes: NonNullable<SyncRequestDto['notes']>,
  ): Promise<SyncCategoryResult> {
    const results: SyncItemResult[] = [];
    let syncedCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;

    for (const item of notes) {
      try {
        let interactionId: string | null = null;

        if (item.interactionMobileSyncId) {
          const interaction = await this.interactionsService.findByMobileSyncId(
            item.interactionMobileSyncId,
          );
          interactionId = interaction?._id.toString() ?? null;
        }

        await this.notesService.create({
          mobileSyncId: item.mobileSyncId,
          clientId: item.clientId,
          agentId,
          interactionId,
          content: item.content,
          type: item.type,
          deviceCreatedAt: new Date(item.deviceCreatedAt),
        });

        await this.clientsService.updateLastNote(item.clientId, item.content);

        results.push({ mobileSyncId: item.mobileSyncId, status: 'created' });
        syncedCount++;
      } catch (error: unknown) {
        if (isDuplicateKeyError(error)) {
          results.push({ mobileSyncId: item.mobileSyncId, status: 'duplicate' });
          duplicateCount++;
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(`Failed to sync note ${item.mobileSyncId}: ${message}`);
          results.push({ mobileSyncId: item.mobileSyncId, status: 'error', error: message });
          errorCount++;
        }
      }
    }

    return { results, syncedCount, duplicateCount, errorCount };
  }

  private async processFollowUps(
    agentId: string,
    followUps: NonNullable<SyncRequestDto['followUps']>,
  ): Promise<SyncCategoryResult> {
    const results: SyncItemResult[] = [];
    let syncedCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;

    for (const item of followUps) {
      try {
        let interactionId: string | null = null;

        if (item.interactionMobileSyncId) {
          const interaction = await this.interactionsService.findByMobileSyncId(
            item.interactionMobileSyncId,
          );
          interactionId = interaction?._id.toString() ?? null;
        }

        await this.followUpsService.create({
          mobileSyncId: item.mobileSyncId,
          clientId: item.clientId,
          agentId,
          interactionId,
          scheduledAt: new Date(item.scheduledAt),
          reason: item.reason,
          deviceCreatedAt: new Date(item.deviceCreatedAt),
        });

        results.push({ mobileSyncId: item.mobileSyncId, status: 'created' });
        syncedCount++;
      } catch (error: unknown) {
        if (isDuplicateKeyError(error)) {
          results.push({ mobileSyncId: item.mobileSyncId, status: 'duplicate' });
          duplicateCount++;
        } else {
          const message = error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(`Failed to sync follow-up ${item.mobileSyncId}: ${message}`);
          results.push({ mobileSyncId: item.mobileSyncId, status: 'error', error: message });
          errorCount++;
        }
      }
    }

    return { results, syncedCount, duplicateCount, errorCount };
  }

  private async processCompletedFollowUps(
    completedFollowUps: NonNullable<SyncRequestDto['completedFollowUps']>,
  ): Promise<CompletedCategoryResult> {
    const results: SyncItemResult[] = [];
    let updatedCount = 0;
    let errorCount = 0;

    for (const item of completedFollowUps) {
      try {
        const updated = await this.followUpsService.markCompleted(
          item.mobileSyncId,
          new Date(item.completedAt),
        );

        if (updated) {
          results.push({ mobileSyncId: item.mobileSyncId, status: 'updated' });
          updatedCount++;
        } else {
          results.push({
            mobileSyncId: item.mobileSyncId,
            status: 'error',
            error: 'Follow-up not found or already completed',
          });
          errorCount++;
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Failed to complete follow-up ${item.mobileSyncId}: ${message}`);
        results.push({ mobileSyncId: item.mobileSyncId, status: 'error', error: message });
        errorCount++;
      }
    }

    return { results, updatedCount, errorCount };
  }
}
