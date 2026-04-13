import { forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, type Types } from 'mongoose';
import { CallOutcome, ClientStatus } from '@/common/enums';
import { FollowUpsService } from '@/follow-ups/follow-ups.service';
import { Client, type ClientDocument } from './schemas/client.schema';
import { type AssignClientsDto } from './dto/assign-clients.dto';
import { type ClientFilterDto } from './dto/client-filter.dto';

interface ClientInput {
  name: string;
  phone: string;
  extraData?: Record<string, unknown> | undefined;
}

interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

interface InteractionData {
  outcome: CallOutcome;
  callStartedAt: Date;
}

const OUTCOME_TO_STATUS: Record<CallOutcome, ClientStatus> = {
  [CallOutcome.INTERESTED]: ClientStatus.INTERESTED,
  [CallOutcome.NOT_INTERESTED]: ClientStatus.REJECTED,
  [CallOutcome.NO_ANSWER]: ClientStatus.PENDING,
  [CallOutcome.BUSY]: ClientStatus.PENDING,
  [CallOutcome.INVALID_NUMBER]: ClientStatus.INVALID_NUMBER,
};

@Injectable()
export class ClientsService {
  constructor(
    @InjectModel(Client.name) private readonly clientModel: Model<ClientDocument>,
    @Inject(forwardRef(() => FollowUpsService))
    private readonly followUpsService: FollowUpsService,
  ) {}

  async bulkCreate(clients: ClientInput[], uploadBatchId: string): Promise<ClientDocument[]> {
    const docs = clients.map((client, index) => ({
      name: client.name,
      phone: client.phone,
      extraData: client.extraData ?? {},
      uploadBatchId,
      queueOrder: index,
    }));
    const result = await this.clientModel.insertMany(docs);
    return result as unknown as ClientDocument[];
  }

  async findAll(filter: ClientFilterDto): Promise<PaginatedResult<ClientDocument>> {
    const query: Record<string, unknown> = {};
    if (filter.status) query.status = filter.status;
    if (filter.assignedTo) query.assignedTo = filter.assignedTo;
    if (filter.uploadBatchId) query.uploadBatchId = filter.uploadBatchId;

    const page = filter.page ?? 1;
    const limit = filter.limit ?? 50;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.clientModel.find(query).skip(skip).limit(limit).sort({ queueOrder: 1 }).exec(),
      this.clientModel.countDocuments(query).exec(),
    ]);

    return { data, total, page, limit };
  }

  async findInterested(agentId?: string): Promise<ClientDocument[]> {
    const query: Record<string, unknown> = { status: ClientStatus.INTERESTED };
    if (agentId) query.assignedTo = agentId;
    return this.clientModel.find(query).sort({ updatedAt: -1 }).exec();
  }

  async findAssigned(agentId: string, status?: ClientStatus): Promise<ClientDocument[]> {
    const query: Record<string, unknown> = {
      assignedTo: agentId,
      status: status ?? ClientStatus.PENDING,
    };
    return this.clientModel.find(query).sort({ queueOrder: 1 }).exec();
  }

  async assignClients(dto: AssignClientsDto): Promise<{ modifiedCount: number }> {
    const clients = await this.clientModel
      .find({ _id: { $in: dto.clientIds }, assignedTo: { $ne: null } })
      .select('_id assignedTo')
      .exec();

    for (const client of clients) {
      if (client.assignedTo && client.assignedTo.toString() !== dto.agentId) {
        await this.followUpsService.cancelPendingForClient(
          client._id.toString(),
          client.assignedTo.toString(),
          'Client reassigned to another agent',
        );
      }
    }

    const now = new Date();
    const result = await this.clientModel.updateMany(
      { _id: { $in: dto.clientIds } },
      {
        $set: {
          assignedTo: dto.agentId as unknown as Types.ObjectId,
          assignedAt: now,
        },
      },
    );
    return { modifiedCount: result.modifiedCount };
  }

  async updateStatus(clientId: string, status: ClientStatus): Promise<ClientDocument> {
    const client = await this.clientModel
      .findByIdAndUpdate(clientId, { status }, { new: true })
      .exec();

    if (!client) {
      throw new NotFoundException(`Client with id ${clientId} not found`);
    }
    return client;
  }

  async updateLastNote(clientId: string, note: string): Promise<void> {
    await this.clientModel.findByIdAndUpdate(clientId, {
      $set: { lastNote: note },
    });
  }

  async updateClientOnInteraction(clientId: string, data: InteractionData): Promise<void> {
    const newStatus = OUTCOME_TO_STATUS[data.outcome];

    await this.clientModel.findByIdAndUpdate(clientId, {
      $inc: { callAttempts: 1 },
      $set: {
        lastCalledAt: data.callStartedAt,
        lastOutcome: data.outcome,
        status: newStatus,
      },
    });
  }
}
