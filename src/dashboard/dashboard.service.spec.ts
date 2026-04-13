import { Test, type TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { DashboardService } from './dashboard.service';
import { Interaction } from '@/interactions/schemas/interaction.schema';
import { FollowUp } from '@/follow-ups/schemas/follow-up.schema';
import { Client } from '@/clients/schemas/client.schema';
import { Agent } from '@/agents/schemas/agent.schema';

const AGENT_ID = '507f1f77bcf86cd799439011';

const mockAgentModel = {
  find: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue([{ _id: { toString: () => AGENT_ID }, name: 'Agent 1' }]),
    }),
  }),
  findById: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue({ _id: AGENT_ID, name: 'Agent 1' }),
    }),
  }),
};

const mockInteractionModel = { aggregate: jest.fn() };
const mockFollowUpModel = {
  aggregate: jest.fn(),
  countDocuments: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(5) }),
};
const mockClientModel = { aggregate: jest.fn() };

describe('DashboardService', () => {
  let service: DashboardService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: getModelToken(Interaction.name), useValue: mockInteractionModel },
        { provide: getModelToken(FollowUp.name), useValue: mockFollowUpModel },
        { provide: getModelToken(Client.name), useValue: mockClientModel },
        { provide: getModelToken(Agent.name), useValue: mockAgentModel },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
    jest.clearAllMocks();

    mockAgentModel.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([{ _id: { toString: () => AGENT_ID }, name: 'Agent 1' }]),
      }),
    });
    mockFollowUpModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(5) });
  });

  describe('getSummary', () => {
    it('should aggregate data and return summary with new metrics', async () => {
      mockInteractionModel.aggregate
        .mockResolvedValueOnce([
          { _id: { agentId: AGENT_ID, outcome: 'INTERESTED' }, count: 10 },
          { _id: { agentId: AGENT_ID, outcome: 'NO_ANSWER' }, count: 20 },
        ])
        .mockResolvedValueOnce([{ _id: AGENT_ID, avgDuration: 185.5 }])
        .mockResolvedValueOnce([{ _id: AGENT_ID, uniqueClients: ['c1', 'c2', 'c3'] }])
        .mockResolvedValueOnce([{ _id: AGENT_ID, lastActivity: new Date('2026-04-10T14:00:00Z') }]);

      mockFollowUpModel.aggregate.mockResolvedValue([
        { _id: { agentId: AGENT_ID, status: 'PENDING' }, count: 3 },
      ]);

      mockClientModel.aggregate.mockResolvedValue([
        { _id: 'PENDING', count: 200 },
        { _id: 'INTERESTED', count: 45 },
      ]);

      const result = await service.getSummary();

      const agent = result.agents[0];
      expect(agent?.totalCalls).toBe(30);
      expect(agent?.answered).toBe(10);
      expect(agent?.notAnswered).toBe(20);
      expect(agent?.avgCallDurationSeconds).toBe(186);
      expect(agent?.uniqueClientsContacted).toBe(3);
      expect(result.totals.pending).toBe(200);
      expect(result.totals.interested).toBe(45);
    });
  });

  describe('getAgentDetail', () => {
    it('should return stats for a specific agent', async () => {
      mockAgentModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({ _id: AGENT_ID, name: 'Agent 1' }),
        }),
      });
      mockInteractionModel.aggregate
        .mockResolvedValueOnce([{ _id: { agentId: AGENT_ID, outcome: 'INTERESTED' }, count: 5 }])
        .mockResolvedValueOnce([{ _id: AGENT_ID, avgDuration: 120 }])
        .mockResolvedValueOnce([{ _id: AGENT_ID, uniqueClients: ['c1'] }])
        .mockResolvedValueOnce([{ _id: AGENT_ID, lastActivity: new Date() }]);
      mockFollowUpModel.aggregate.mockResolvedValue([]);

      const result = await service.getAgentDetail(AGENT_ID);

      expect(result.agentId).toBe(AGENT_ID);
      expect(result.totalCalls).toBe(5);
      expect(result.answered).toBe(5);
      expect(result.avgCallDurationSeconds).toBe(120);
      expect(result.uniqueClientsContacted).toBe(1);
    });
  });
});
