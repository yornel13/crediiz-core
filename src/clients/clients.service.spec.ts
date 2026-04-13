import { Test, type TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { Client } from './schemas/client.schema';
import { FollowUpsService } from '@/follow-ups/follow-ups.service';
import { CallOutcome, ClientStatus } from '@/common/enums';

const mockClientModel = {
  insertMany: jest.fn(),
  find: jest.fn(),
  countDocuments: jest.fn(),
  updateMany: jest.fn(),
  findByIdAndUpdate: jest.fn(),
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

const mockFollowUpsService = {
  cancelPendingForClient: jest.fn().mockResolvedValue(0),
};

describe('ClientsService', () => {
  let service: ClientsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientsService,
        { provide: getModelToken(Client.name), useValue: mockClientModel },
        { provide: FollowUpsService, useValue: mockFollowUpsService },
      ],
    }).compile();

    service = module.get<ClientsService>(ClientsService);
    jest.clearAllMocks();
  });

  describe('bulkCreate', () => {
    it('should insert clients with uploadBatchId and queueOrder', async () => {
      const clients = [
        { name: 'Alice', phone: '+5071234' },
        { name: 'Bob', phone: '+5075678' },
      ];
      mockClientModel.insertMany.mockResolvedValue(clients);

      await service.bulkCreate(clients, 'batch-123');

      expect(mockClientModel.insertMany).toHaveBeenCalledWith([
        expect.objectContaining({ name: 'Alice', uploadBatchId: 'batch-123', queueOrder: 0 }),
        expect.objectContaining({ name: 'Bob', uploadBatchId: 'batch-123', queueOrder: 1 }),
      ]);
    });
  });

  describe('findAll', () => {
    it('should return paginated results with default values', async () => {
      mockClientModel.find.mockReturnValue(chainable([{ name: 'Alice' }]));
      mockClientModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(1) });

      const result = await service.findAll({});

      expect(result).toEqual({ data: [{ name: 'Alice' }], total: 1, page: 1, limit: 50 });
    });
  });

  describe('findAssigned', () => {
    it('should query by agentId and default status PENDING', async () => {
      mockClientModel.find.mockReturnValue(chainable([]));

      await service.findAssigned('agent-1');

      expect(mockClientModel.find).toHaveBeenCalledWith({
        assignedTo: 'agent-1',
        status: ClientStatus.PENDING,
      });
    });
  });

  describe('assignClients', () => {
    it('should update multiple clients with agentId', async () => {
      mockClientModel.find.mockReturnValue({
        select: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
      });
      mockClientModel.updateMany.mockResolvedValue({ modifiedCount: 3 });

      const result = await service.assignClients({
        agentId: 'agent-1',
        clientIds: ['c1', 'c2', 'c3'],
      });

      expect(result).toEqual({ modifiedCount: 3 });
    });

    it('should cancel follow-ups of previous agent on reassignment', async () => {
      mockClientModel.find.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest
            .fn()
            .mockResolvedValue([
              { _id: { toString: () => 'c1' }, assignedTo: { toString: () => 'old-agent' } },
            ]),
        }),
      });
      mockClientModel.updateMany.mockResolvedValue({ modifiedCount: 1 });

      await service.assignClients({ agentId: 'new-agent', clientIds: ['c1'] });

      expect(mockFollowUpsService.cancelPendingForClient).toHaveBeenCalledWith(
        'c1',
        'old-agent',
        'Client reassigned to another agent',
      );
    });
  });

  describe('updateStatus', () => {
    it('should throw NotFoundException if client not found', async () => {
      mockClientModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.updateStatus('unknown', ClientStatus.REJECTED)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateClientOnInteraction', () => {
    it('should increment callAttempts and set status based on outcome', async () => {
      mockClientModel.findByIdAndUpdate.mockResolvedValue({});

      await service.updateClientOnInteraction('c1', {
        outcome: CallOutcome.INTERESTED,
        callStartedAt: new Date('2026-04-10T10:00:00Z'),
      });

      /* eslint-disable @typescript-eslint/no-unsafe-assignment */
      expect(mockClientModel.findByIdAndUpdate).toHaveBeenCalledWith('c1', {
        $inc: { callAttempts: 1 },
        $set: expect.objectContaining({
          lastOutcome: CallOutcome.INTERESTED,
          status: ClientStatus.INTERESTED,
        }),
      });
      /* eslint-enable @typescript-eslint/no-unsafe-assignment */
    });
  });
});
