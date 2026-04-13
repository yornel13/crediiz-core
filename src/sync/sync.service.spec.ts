import { Test, type TestingModule } from '@nestjs/testing';
import { SyncService } from './sync.service';
import { InteractionsService } from '@/interactions/interactions.service';
import { FollowUpsService } from '@/follow-ups/follow-ups.service';
import { ClientsService } from '@/clients/clients.service';
import { NotesService } from '@/notes/notes.service';
import { CallOutcome, NoteType } from '@/common/enums';

const AGENT_ID = 'agent-123';

function createMongoError(code: number): Error {
  const error = new Error('Duplicate key') as Error & { code: number };
  error.code = code;
  return error;
}

describe('SyncService', () => {
  let service: SyncService;
  let interactionsService: { create: jest.Mock; findByMobileSyncId: jest.Mock };
  let followUpsService: { create: jest.Mock; markCompleted: jest.Mock };
  let clientsService: { updateClientOnInteraction: jest.Mock; updateLastNote: jest.Mock };
  let notesService: { create: jest.Mock };

  beforeEach(async () => {
    interactionsService = { create: jest.fn(), findByMobileSyncId: jest.fn() };
    followUpsService = { create: jest.fn(), markCompleted: jest.fn() };
    clientsService = {
      updateClientOnInteraction: jest.fn(),
      updateLastNote: jest.fn(),
    };
    notesService = { create: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncService,
        { provide: InteractionsService, useValue: interactionsService },
        { provide: FollowUpsService, useValue: followUpsService },
        { provide: ClientsService, useValue: clientsService },
        { provide: NotesService, useValue: notesService },
      ],
    }).compile();

    service = module.get<SyncService>(SyncService);
  });

  describe('interactions', () => {
    it('should create interaction and update client', async () => {
      interactionsService.create.mockResolvedValue({ _id: 'int-1' });
      clientsService.updateClientOnInteraction.mockResolvedValue(undefined);

      const result = await service.processSync(AGENT_ID, {
        interactions: [
          {
            mobileSyncId: 'uuid-1',
            clientId: 'client-1',
            callStartedAt: '2026-04-10T10:00:00Z',
            callEndedAt: '2026-04-10T10:03:00Z',
            durationSeconds: 180,
            outcome: CallOutcome.INTERESTED,
            deviceCreatedAt: '2026-04-10T10:03:05Z',
          },
        ],
      });

      expect(result.interactions.syncedCount).toBe(1);
      expect(result.interactions.results[0]?.status).toBe('created');
    });

    it('should handle duplicates', async () => {
      interactionsService.create.mockRejectedValue(createMongoError(11000));

      const result = await service.processSync(AGENT_ID, {
        interactions: [
          {
            mobileSyncId: 'uuid-dup',
            clientId: 'c1',
            callStartedAt: '2026-04-10T10:00:00Z',
            callEndedAt: '2026-04-10T10:01:00Z',
            durationSeconds: 60,
            outcome: CallOutcome.NO_ANSWER,
            deviceCreatedAt: '2026-04-10T10:01:05Z',
          },
        ],
      });

      expect(result.interactions.duplicateCount).toBe(1);
    });
  });

  describe('notes', () => {
    it('should create note and update client lastNote', async () => {
      notesService.create.mockResolvedValue({ _id: 'note-1' });
      clientsService.updateLastNote.mockResolvedValue(undefined);

      const result = await service.processSync(AGENT_ID, {
        notes: [
          {
            mobileSyncId: 'uuid-n1',
            clientId: 'client-1',
            content: 'Wants loan info',
            type: NoteType.CALL,
            deviceCreatedAt: '2026-04-10T10:03:00Z',
          },
        ],
      });

      expect(result.notes.syncedCount).toBe(1);
      expect(clientsService.updateLastNote).toHaveBeenCalledWith('client-1', 'Wants loan info');
    });

    it('should resolve interaction link for note', async () => {
      interactionsService.findByMobileSyncId.mockResolvedValue({ _id: 'int-obj-id' });
      notesService.create.mockResolvedValue({ _id: 'note-1' });
      clientsService.updateLastNote.mockResolvedValue(undefined);

      await service.processSync(AGENT_ID, {
        notes: [
          {
            mobileSyncId: 'uuid-n2',
            clientId: 'client-1',
            interactionMobileSyncId: 'uuid-int-1',
            content: 'Note during call',
            type: NoteType.CALL,
            deviceCreatedAt: '2026-04-10T10:03:00Z',
          },
        ],
      });

      expect(notesService.create).toHaveBeenCalledWith(
        expect.objectContaining({ interactionId: 'int-obj-id' }),
      );
    });
  });

  describe('follow-ups', () => {
    it('should create follow-up', async () => {
      interactionsService.findByMobileSyncId.mockResolvedValue({ _id: 'int-obj-id' });
      followUpsService.create.mockResolvedValue({ _id: 'fu-1' });

      const result = await service.processSync(AGENT_ID, {
        followUps: [
          {
            mobileSyncId: 'uuid-f1',
            clientId: 'client-1',
            interactionMobileSyncId: 'uuid-int-1',
            scheduledAt: '2026-04-15T14:00:00Z',
            reason: 'Wants rates',
            deviceCreatedAt: '2026-04-10T10:05:00Z',
          },
        ],
      });

      expect(result.followUps.syncedCount).toBe(1);
    });
  });

  describe('completed follow-ups', () => {
    it('should mark follow-up as completed', async () => {
      followUpsService.markCompleted.mockResolvedValue({ mobileSyncId: 'uuid-fp' });

      const result = await service.processSync(AGENT_ID, {
        completedFollowUps: [{ mobileSyncId: 'uuid-fp', completedAt: '2026-04-10T10:30:00Z' }],
      });

      expect(result.completedFollowUps.updatedCount).toBe(1);
    });

    it('should report error when not found', async () => {
      followUpsService.markCompleted.mockResolvedValue(null);

      const result = await service.processSync(AGENT_ID, {
        completedFollowUps: [{ mobileSyncId: 'uuid-unknown', completedAt: '2026-04-10T10:30:00Z' }],
      });

      expect(result.completedFollowUps.errorCount).toBe(1);
    });
  });

  describe('empty request', () => {
    it('should handle empty sync request', async () => {
      const result = await service.processSync(AGENT_ID, {});

      expect(result.interactions.syncedCount).toBe(0);
      expect(result.notes.syncedCount).toBe(0);
      expect(result.followUps.syncedCount).toBe(0);
      expect(result.completedFollowUps.updatedCount).toBe(0);
    });
  });
});
