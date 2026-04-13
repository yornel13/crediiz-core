import { Test, type TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { FollowUpsService } from './follow-ups.service';
import { FollowUp } from './schemas/follow-up.schema';
import { FollowUpStatus } from '@/common/enums';

const mockFollowUpModel = {
  create: jest.fn(),
  find: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateMany: jest.fn(),
  countDocuments: jest.fn(),
};

const chainablePopulate = (result: unknown) => ({
  populate: jest.fn().mockReturnValue({
    skip: jest.fn().mockReturnValue({
      limit: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(result) }),
      }),
    }),
    sort: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(result) }),
  }),
  sort: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(result) }),
});

describe('FollowUpsService', () => {
  let service: FollowUpsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FollowUpsService,
        { provide: getModelToken(FollowUp.name), useValue: mockFollowUpModel },
      ],
    }).compile();

    service = module.get<FollowUpsService>(FollowUpsService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a follow-up', async () => {
      const input = {
        mobileSyncId: 'uuid-f1',
        clientId: 'client-1',
        agentId: 'agent-1',
        interactionId: 'interaction-1',
        scheduledAt: new Date('2026-04-15T14:00:00Z'),
        reason: 'Wants loan rates',
        deviceCreatedAt: new Date(),
      };
      mockFollowUpModel.create.mockResolvedValue(input);

      const result = await service.create(input);

      expect(result).toEqual(input);
    });
  });

  describe('findAgenda', () => {
    it('should query pending follow-ups for agent from today', async () => {
      mockFollowUpModel.find.mockReturnValue(chainablePopulate([]));

      const result = await service.findAgenda('agent-1');

      expect(result).toEqual([]);
      expect(mockFollowUpModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent-1',
          status: FollowUpStatus.PENDING,
        }),
      );
    });
  });

  describe('markCompleted', () => {
    it('should mark a follow-up as completed', async () => {
      const completedAt = new Date();
      const followUp = { mobileSyncId: 'uuid-f1', status: FollowUpStatus.COMPLETED };
      mockFollowUpModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(followUp),
      });

      const result = await service.markCompleted('uuid-f1', completedAt);

      expect(result).toEqual(followUp);
    });
  });

  describe('cancelPendingForClient', () => {
    it('should cancel all pending follow-ups for a client+agent', async () => {
      mockFollowUpModel.updateMany.mockResolvedValue({ modifiedCount: 2 });

      const result = await service.cancelPendingForClient('client-1', 'agent-1', 'Reassigned');

      expect(result).toBe(2);
      expect(mockFollowUpModel.updateMany).toHaveBeenCalledWith(
        { clientId: 'client-1', agentId: 'agent-1', status: FollowUpStatus.PENDING },
        expect.objectContaining({
          status: FollowUpStatus.CANCELLED,
          cancelReason: 'Reassigned',
        }),
      );
    });
  });
});
