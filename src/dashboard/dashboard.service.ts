import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, type PipelineStage } from 'mongoose';
import { ClientStatus, FollowUpStatus } from '@/common/enums';
import { Interaction, type InteractionDocument } from '@/interactions/schemas/interaction.schema';
import { FollowUp, type FollowUpDocument } from '@/follow-ups/schemas/follow-up.schema';
import { Client, type ClientDocument } from '@/clients/schemas/client.schema';
import { Agent, type AgentDocument } from '@/agents/schemas/agent.schema';

interface OutcomeCounts {
  interested: number;
  notInterested: number;
  noAnswer: number;
  busy: number;
  invalidNumber: number;
}

interface FollowUpCounts {
  pending: number;
  completed: number;
  cancelled: number;
}

interface AgentStats {
  agentId: string;
  name: string;
  totalCalls: number;
  answered: number;
  notAnswered: number;
  avgCallDurationSeconds: number;
  uniqueClientsContacted: number;
  outcomes: OutcomeCounts;
  followUps: FollowUpCounts;
  lastActivity: Date | null;
}

interface ClientTotals {
  totalClients: number;
  pending: number;
  interested: number;
  converted: number;
  rejected: number;
  invalidNumber: number;
  pendingFollowUps: number;
}

interface DashboardSummary {
  agents: AgentStats[];
  totals: ClientTotals;
}

interface OutcomeAggResult {
  _id: { agentId: { toString(): string }; outcome: string };
  count: number;
}

interface AvgDurationResult {
  _id: { toString(): string };
  avgDuration: number;
}

interface UniqueClientsResult {
  _id: { toString(): string };
  uniqueClients: string[];
}

interface FollowUpAggResult {
  _id: { agentId: { toString(): string }; status: string };
  count: number;
}

interface LastActivityResult {
  _id: { toString(): string };
  lastActivity: Date;
}

interface ClientStatusResult {
  _id: string;
  count: number;
}

const ANSWERED_OUTCOMES = ['INTERESTED', 'NOT_INTERESTED'];

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(Interaction.name) private readonly interactionModel: Model<InteractionDocument>,
    @InjectModel(FollowUp.name) private readonly followUpModel: Model<FollowUpDocument>,
    @InjectModel(Client.name) private readonly clientModel: Model<ClientDocument>,
    @InjectModel(Agent.name) private readonly agentModel: Model<AgentDocument>,
  ) {}

  private buildDateMatch(from?: string, to?: string): PipelineStage | null {
    if (!from && !to) return null;
    const match: Record<string, unknown> = {};
    if (from) match.$gte = new Date(from);
    if (to) match.$lte = new Date(to);
    return { $match: { callStartedAt: match } };
  }

  async getSummary(from?: string, to?: string): Promise<DashboardSummary> {
    const dateMatch = this.buildDateMatch(from, to);
    const pipeline: PipelineStage[] = dateMatch ? [dateMatch] : [];

    const [
      agents,
      outcomeAgg,
      avgDurationAgg,
      uniqueClientsAgg,
      followUpAgg,
      lastActivityAgg,
      clientStatusAgg,
      pendingFollowUps,
    ] = await Promise.all([
      this.agentModel.find({ isActive: true }).select('name').exec(),
      this.interactionModel.aggregate<OutcomeAggResult>([
        ...pipeline,
        { $group: { _id: { agentId: '$agentId', outcome: '$outcome' }, count: { $sum: 1 } } },
      ]),
      this.interactionModel.aggregate<AvgDurationResult>([
        ...pipeline,
        { $match: { outcome: { $in: ANSWERED_OUTCOMES } } },
        { $group: { _id: '$agentId', avgDuration: { $avg: '$durationSeconds' } } },
      ]),
      this.interactionModel.aggregate<UniqueClientsResult>([
        ...pipeline,
        { $match: { outcome: { $in: ANSWERED_OUTCOMES } } },
        { $group: { _id: '$agentId', uniqueClients: { $addToSet: '$clientId' } } },
      ]),
      this.followUpModel.aggregate<FollowUpAggResult>([
        { $group: { _id: { agentId: '$agentId', status: '$status' }, count: { $sum: 1 } } },
      ]),
      this.interactionModel.aggregate<LastActivityResult>([
        ...pipeline,
        { $group: { _id: '$agentId', lastActivity: { $max: '$callStartedAt' } } },
      ]),
      this.clientModel.aggregate<ClientStatusResult>([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.followUpModel.countDocuments({ status: FollowUpStatus.PENDING }).exec(),
    ]);

    const agentStats: AgentStats[] = agents.map((agent) => {
      const aid = agent._id.toString();
      const outcomes = this.buildOutcomeCounts(outcomeAgg, aid);
      const totalCalls = (Object.values(outcomes) as number[]).reduce((sum, v) => sum + v, 0);
      const answered = outcomes.interested + outcomes.notInterested;
      const notAnswered = totalCalls - answered;

      const avgEntry = avgDurationAgg.find((a) => a._id.toString() === aid);
      const uniqueEntry = uniqueClientsAgg.find((a) => a._id.toString() === aid);
      const lastAct = lastActivityAgg.find((a) => a._id.toString() === aid);

      const followUps = this.buildFollowUpCounts(followUpAgg, aid);

      return {
        agentId: aid,
        name: agent.name,
        totalCalls,
        answered,
        notAnswered,
        avgCallDurationSeconds: Math.round(avgEntry?.avgDuration ?? 0),
        uniqueClientsContacted: uniqueEntry?.uniqueClients.length ?? 0,
        outcomes,
        followUps,
        lastActivity: lastAct?.lastActivity ?? null,
      };
    });

    const totals = this.buildClientTotals(clientStatusAgg, pendingFollowUps);

    return { agents: agentStats, totals };
  }

  async getAgentDetail(agentId: string, from?: string, to?: string): Promise<AgentStats> {
    const dateMatch = this.buildDateMatch(from, to);
    const pipeline: PipelineStage[] = dateMatch ? [dateMatch] : [];
    const agentMatch: PipelineStage = { $match: { agentId } };

    const [agent, outcomeAgg, avgDurationAgg, uniqueClientsAgg, followUpAgg, lastActivityAgg] =
      await Promise.all([
        this.agentModel.findById(agentId).select('name').exec(),
        this.interactionModel.aggregate<OutcomeAggResult>([
          agentMatch,
          ...pipeline,
          { $group: { _id: { agentId: '$agentId', outcome: '$outcome' }, count: { $sum: 1 } } },
        ]),
        this.interactionModel.aggregate<AvgDurationResult>([
          agentMatch,
          ...pipeline,
          { $match: { outcome: { $in: ANSWERED_OUTCOMES } } },
          { $group: { _id: '$agentId', avgDuration: { $avg: '$durationSeconds' } } },
        ]),
        this.interactionModel.aggregate<UniqueClientsResult>([
          agentMatch,
          ...pipeline,
          { $match: { outcome: { $in: ANSWERED_OUTCOMES } } },
          { $group: { _id: '$agentId', uniqueClients: { $addToSet: '$clientId' } } },
        ]),
        this.followUpModel.aggregate<FollowUpAggResult>([
          { $match: { agentId } },
          { $group: { _id: { agentId: '$agentId', status: '$status' }, count: { $sum: 1 } } },
        ]),
        this.interactionModel.aggregate<LastActivityResult>([
          agentMatch,
          ...pipeline,
          { $group: { _id: '$agentId', lastActivity: { $max: '$callStartedAt' } } },
        ]),
      ]);

    const outcomes = this.buildOutcomeCounts(outcomeAgg, agentId);
    const totalCalls = (Object.values(outcomes) as number[]).reduce((sum, v) => sum + v, 0);
    const answered = outcomes.interested + outcomes.notInterested;

    return {
      agentId,
      name: agent?.name ?? '',
      totalCalls,
      answered,
      notAnswered: totalCalls - answered,
      avgCallDurationSeconds: Math.round(avgDurationAgg[0]?.avgDuration ?? 0),
      uniqueClientsContacted: uniqueClientsAgg[0]?.uniqueClients.length ?? 0,
      outcomes,
      followUps: this.buildFollowUpCounts(followUpAgg, agentId),
      lastActivity: lastActivityAgg[0]?.lastActivity ?? null,
    };
  }

  private buildOutcomeCounts(agg: OutcomeAggResult[], targetId: string): OutcomeCounts {
    const outcomes: OutcomeCounts = {
      interested: 0,
      notInterested: 0,
      noAnswer: 0,
      busy: 0,
      invalidNumber: 0,
    };
    const keyMap: Record<string, keyof OutcomeCounts> = {
      INTERESTED: 'interested',
      NOT_INTERESTED: 'notInterested',
      NO_ANSWER: 'noAnswer',
      BUSY: 'busy',
      INVALID_NUMBER: 'invalidNumber',
    };
    for (const entry of agg) {
      if (entry._id.agentId.toString() === targetId) {
        const key = keyMap[entry._id.outcome];
        if (key) outcomes[key] = entry.count;
      }
    }
    return outcomes;
  }

  private buildFollowUpCounts(agg: FollowUpAggResult[], targetId: string): FollowUpCounts {
    const counts: FollowUpCounts = { pending: 0, completed: 0, cancelled: 0 };
    const keyMap: Record<string, keyof FollowUpCounts> = {
      PENDING: 'pending',
      COMPLETED: 'completed',
      CANCELLED: 'cancelled',
    };
    for (const entry of agg) {
      if (entry._id.agentId.toString() === targetId) {
        const key = keyMap[entry._id.status];
        if (key) counts[key] = entry.count;
      }
    }
    return counts;
  }

  private buildClientTotals(agg: ClientStatusResult[], pendingFollowUps: number): ClientTotals {
    const statusKeyMap: Record<
      string,
      keyof Omit<ClientTotals, 'totalClients' | 'pendingFollowUps'>
    > = {
      [ClientStatus.PENDING]: 'pending',
      [ClientStatus.INTERESTED]: 'interested',
      [ClientStatus.CONVERTED]: 'converted',
      [ClientStatus.REJECTED]: 'rejected',
      [ClientStatus.INVALID_NUMBER]: 'invalidNumber',
    };
    const totals: ClientTotals = {
      totalClients: 0,
      pending: 0,
      interested: 0,
      converted: 0,
      rejected: 0,
      invalidNumber: 0,
      pendingFollowUps,
    };
    for (const entry of agg) {
      totals.totalClients += entry.count;
      const key = statusKeyMap[entry._id];
      if (key) totals[key] = entry.count;
    }
    return totals;
  }
}
