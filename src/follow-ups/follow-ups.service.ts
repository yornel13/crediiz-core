import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model } from 'mongoose';
import { FollowUpStatus } from '@/common/enums';
import { FollowUp, type FollowUpDocument } from './schemas/follow-up.schema';
import { type FollowUpFilterDto } from './dto/follow-up-filter.dto';

interface CreateFollowUpInput {
  mobileSyncId: string;
  clientId: string;
  agentId: string;
  interactionId: string | null;
  scheduledAt: Date;
  reason: string;
  deviceCreatedAt: Date;
}

interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class FollowUpsService {
  constructor(
    @InjectModel(FollowUp.name) private readonly followUpModel: Model<FollowUpDocument>,
  ) {}

  async create(data: CreateFollowUpInput): Promise<FollowUpDocument> {
    return this.followUpModel.create(data);
  }

  async findAll(filter: FollowUpFilterDto): Promise<PaginatedResult<FollowUpDocument>> {
    const query: Record<string, unknown> = {};
    if (filter.agentId) query.agentId = filter.agentId;
    if (filter.status) query.status = filter.status;
    if (filter.clientId) query.clientId = filter.clientId;

    if (filter.from || filter.to) {
      const dateQuery: Record<string, unknown> = {};
      if (filter.from) dateQuery.$gte = new Date(filter.from);
      if (filter.to) dateQuery.$lte = new Date(filter.to);
      query.scheduledAt = dateQuery;
    }

    const page = filter.page ?? 1;
    const limit = filter.limit ?? 50;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.followUpModel
        .find(query)
        .populate('clientId', 'name phone')
        .skip(skip)
        .limit(limit)
        .sort({ scheduledAt: 1 })
        .exec(),
      this.followUpModel.countDocuments(query).exec(),
    ]);

    return { data, total, page, limit };
  }

  async findByAgent(agentId: string): Promise<FollowUpDocument[]> {
    return this.followUpModel
      .find({ agentId })
      .populate('clientId', 'name phone')
      .sort({ scheduledAt: 1 })
      .exec();
  }

  async findByClient(clientId: string): Promise<FollowUpDocument[]> {
    return this.followUpModel.find({ clientId }).sort({ scheduledAt: -1 }).exec();
  }

  async findAgenda(agentId: string, from?: string, to?: string): Promise<FollowUpDocument[]> {
    const query: Record<string, unknown> = {
      agentId,
      status: FollowUpStatus.PENDING,
    };

    const dateQuery: Record<string, unknown> = {};
    if (from) {
      dateQuery.$gte = new Date(from);
    } else {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      dateQuery.$gte = today;
    }
    if (to) dateQuery.$lte = new Date(to);
    query.scheduledAt = dateQuery;

    return this.followUpModel
      .find(query)
      .populate('clientId', 'name phone extraData callAttempts lastOutcome lastNote')
      .sort({ scheduledAt: 1 })
      .exec();
  }

  async markCompleted(mobileSyncId: string, completedAt: Date): Promise<FollowUpDocument | null> {
    return this.followUpModel
      .findOneAndUpdate(
        { mobileSyncId, status: FollowUpStatus.PENDING },
        {
          status: FollowUpStatus.COMPLETED,
          completedAt,
        },
        { new: true },
      )
      .exec();
  }

  async cancelPendingForClient(clientId: string, agentId: string, reason: string): Promise<number> {
    const result = await this.followUpModel.updateMany(
      { clientId, agentId, status: FollowUpStatus.PENDING },
      {
        status: FollowUpStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelReason: reason,
      },
    );
    return result.modifiedCount;
  }
}
