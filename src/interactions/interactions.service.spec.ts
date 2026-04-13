import { Test, type TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { InteractionsService } from './interactions.service';
import { Interaction } from './schemas/interaction.schema';
import { CallOutcome } from '@/common/enums';

const mockInteractionModel = {
  create: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  countDocuments: jest.fn(),
};

const chainable = (result: unknown) => ({
  skip: jest.fn().mockReturnValue({
    limit: jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(result) }),
    }),
  }),
  sort: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(result) }),
  exec: jest.fn().mockResolvedValue(result),
});

describe('InteractionsService', () => {
  let service: InteractionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InteractionsService,
        { provide: getModelToken(Interaction.name), useValue: mockInteractionModel },
      ],
    }).compile();

    service = module.get<InteractionsService>(InteractionsService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create an interaction', async () => {
      const input = {
        mobileSyncId: 'uuid-1',
        clientId: 'client-1',
        agentId: 'agent-1',
        callStartedAt: new Date(),
        callEndedAt: new Date(),
        durationSeconds: 120,
        outcome: CallOutcome.INTERESTED,
        disconnectCause: null,
        deviceCreatedAt: new Date(),
      };
      mockInteractionModel.create.mockResolvedValue(input);

      const result = await service.create(input);

      expect(result).toEqual(input);
    });
  });

  describe('findAll', () => {
    it('should return paginated results', async () => {
      mockInteractionModel.find.mockReturnValue(chainable([]));
      mockInteractionModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(0) });

      const result = await service.findAll({});

      expect(result).toEqual({ data: [], total: 0, page: 1, limit: 50 });
    });
  });

  describe('findByClient', () => {
    it('should return interactions for a client', async () => {
      mockInteractionModel.find.mockReturnValue(chainable([{ mobileSyncId: 'uuid-1' }]));

      const result = await service.findByClient('client-1');

      expect(result).toHaveLength(1);
    });
  });

  describe('findByMobileSyncId', () => {
    it('should return interaction by mobileSyncId', async () => {
      const interaction = { mobileSyncId: 'uuid-1' };
      mockInteractionModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(interaction),
      });

      const result = await service.findByMobileSyncId('uuid-1');

      expect(result).toEqual(interaction);
    });

    it('should return null when not found', async () => {
      mockInteractionModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

      const result = await service.findByMobileSyncId('nonexistent');

      expect(result).toBeNull();
    });
  });
});
