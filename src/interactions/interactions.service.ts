import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model } from 'mongoose';
import { Interaction, type InteractionDocument } from './schemas/interaction.schema';
import { type InteractionFilterDto } from './dto/interaction-filter.dto';

interface CreateInteractionInput {
  mobileSyncId: string;
  clientId: string;
  agentId: string;
  callStartedAt: Date;
  callEndedAt: Date;
  durationSeconds: number;
  outcome: string;
  disconnectCause: string | null;
  deviceCreatedAt: Date;
}

interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class InteractionsService {
  constructor(
    @InjectModel(Interaction.name) private readonly interactionModel: Model<InteractionDocument>,
  ) {}

  async create(data: CreateInteractionInput): Promise<InteractionDocument> {
    return this.interactionModel.create(data);
  }

  async findAll(filter: InteractionFilterDto): Promise<PaginatedResult<InteractionDocument>> {
    const query: Record<string, unknown> = {};
    if (filter.agentId) query.agentId = filter.agentId;
    if (filter.clientId) query.clientId = filter.clientId;
    if (filter.outcome) query.outcome = filter.outcome;

    if (filter.from || filter.to) {
      const dateQuery: Record<string, unknown> = {};
      if (filter.from) dateQuery.$gte = new Date(filter.from);
      if (filter.to) dateQuery.$lte = new Date(filter.to);
      query.callStartedAt = dateQuery;
    }

    const page = filter.page ?? 1;
    const limit = filter.limit ?? 50;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.interactionModel.find(query).skip(skip).limit(limit).sort({ callStartedAt: -1 }).exec(),
      this.interactionModel.countDocuments(query).exec(),
    ]);

    return { data, total, page, limit };
  }

  async findByClient(clientId: string): Promise<InteractionDocument[]> {
    return this.interactionModel.find({ clientId }).sort({ callStartedAt: -1 }).exec();
  }

  async findByMobileSyncId(mobileSyncId: string): Promise<InteractionDocument | null> {
    return this.interactionModel.findOne({ mobileSyncId }).exec();
  }
}
