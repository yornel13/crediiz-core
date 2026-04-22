import {
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model, type Types } from 'mongoose';
import { CallOutcome, ClientStatus } from '@/common/enums';
import { FollowUpsService } from '@/follow-ups/follow-ups.service';
import { normalizePhone } from '@/common/utils';
import { Client, type ClientDocument } from './schemas/client.schema';
import { type AssignClientsDto } from './dto/assign-clients.dto';
import { type ClientFilterDto } from './dto/client-filter.dto';
import { type CreateClientDto } from './dto/create-client.dto';
import { type UpdateClientDto } from './dto/update-client.dto';

interface ClientInput {
  name: string;
  phone: string;
  cedula?: string | null;
  ssNumber?: string | null;
  salary?: number | null;
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

export interface BulkRejectedRow {
  index: number;
  field: string | null;
  value: string | null;
  reason: string;
}

export interface BulkCreateResult {
  inserted: ClientDocument[];
  rejected: BulkRejectedRow[];
}

interface MongoWriteError {
  index: number;
  code?: number;
  errmsg?: string;
}

interface MongoBulkErrorLike {
  code?: number;
  writeErrors?: MongoWriteError[];
  insertedDocs?: ClientDocument[];
}

const OUTCOME_TO_STATUS: Record<CallOutcome, ClientStatus> = {
  [CallOutcome.INTERESTED]: ClientStatus.INTERESTED,
  [CallOutcome.NOT_INTERESTED]: ClientStatus.REJECTED,
  [CallOutcome.NO_ANSWER]: ClientStatus.PENDING,
  [CallOutcome.BUSY]: ClientStatus.PENDING,
  [CallOutcome.INVALID_NUMBER]: ClientStatus.INVALID_NUMBER,
};

/** Extract { field, value } from a Mongo duplicate-key errmsg like:
 *    "E11000 duplicate key ... index: cedula_1 dup key: { cedula: \"8-123\" }"
 */
function parseDuplicateKey(errmsg: string | undefined): {
  field: string | null;
  value: string | null;
} {
  if (errmsg === undefined || errmsg === '') return { field: null, value: null };
  const match = /index: (\w+?)_\d+ dup key: \{ (\w+): "?([^"}]*)"? \}/.exec(errmsg);
  if (match === null) return { field: null, value: null };
  return { field: match[2] ?? null, value: match[3] ?? null };
}

@Injectable()
export class ClientsService {
  constructor(
    @InjectModel(Client.name) private readonly clientModel: Model<ClientDocument>,
    @Inject(forwardRef(() => FollowUpsService))
    private readonly followUpsService: FollowUpsService,
  ) {}

  /** Build the persisted document from the canonical input shape. */
  private buildDoc(
    input: ClientInput,
    uploadBatchId: string,
    queueOrder: number,
  ): Record<string, unknown> {
    return {
      name: input.name,
      phone: input.phone,
      phoneNormalized: normalizePhone(input.phone),
      cedula: input.cedula ?? null,
      ssNumber: input.ssNumber ?? null,
      salary: input.salary ?? null,
      extraData: input.extraData ?? {},
      uploadBatchId,
      queueOrder,
    };
  }

  /**
   * Bulk insert with `ordered: false` so a single duplicate does not abort
   * the whole batch. Returns inserted docs plus a structured list of rejected
   * rows (with the field/value that collided) so callers can surface a precise
   * report to the user.
   */
  async bulkCreate(clients: ClientInput[], uploadBatchId: string): Promise<BulkCreateResult> {
    const docs = clients.map((c, i) => this.buildDoc(c, uploadBatchId, i));

    try {
      const result = (await this.clientModel.insertMany(docs, {
        ordered: false,
      })) as ClientDocument[];
      return { inserted: result, rejected: [] };
    } catch (err: unknown) {
      const bulkErr = err as MongoBulkErrorLike;
      const writeErrors = bulkErr.writeErrors ?? [];
      if (writeErrors.length === 0) throw err;

      const rejected: BulkRejectedRow[] = writeErrors.map((we) => {
        const { field, value } = parseDuplicateKey(we.errmsg);
        return {
          index: we.index,
          field,
          value,
          reason: we.code === 11000 ? 'duplicate' : (we.errmsg ?? 'unknown'),
        };
      });

      return { inserted: bulkErr.insertedDocs ?? [], rejected };
    }
  }

  async create(
    dto: CreateClientDto,
    uploadBatchId = `manual-${String(Date.now())}`,
  ): Promise<ClientDocument> {
    const doc = this.buildDoc(dto, uploadBatchId, 0);
    try {
      return await this.clientModel.create(doc);
    } catch (err: unknown) {
      const mongoErr = err as { code?: number; errmsg?: string; message?: string };
      if (mongoErr.code === 11000) {
        const { field, value } = parseDuplicateKey(mongoErr.errmsg ?? mongoErr.message);
        throw new ConflictException(
          field !== null
            ? `Client with ${field} "${value ?? ''}" already exists`
            : 'Client violates a uniqueness constraint',
        );
      }
      throw err;
    }
  }

  async update(clientId: string, dto: UpdateClientDto): Promise<ClientDocument> {
    const updates: Record<string, unknown> = {};
    if (dto.name !== undefined) updates.name = dto.name;
    if (dto.phone !== undefined) {
      updates.phone = dto.phone;
      updates.phoneNormalized = normalizePhone(dto.phone);
    }
    if (dto.cedula !== undefined) updates.cedula = dto.cedula;
    if (dto.ssNumber !== undefined) updates.ssNumber = dto.ssNumber;
    if (dto.salary !== undefined) updates.salary = dto.salary;
    if (dto.extraData !== undefined) updates.extraData = dto.extraData;

    try {
      const updated = await this.clientModel
        .findByIdAndUpdate(clientId, { $set: updates }, { new: true, runValidators: true })
        .exec();
      if (updated === null) throw new NotFoundException(`Client with id ${clientId} not found`);
      return updated;
    } catch (err: unknown) {
      const mongoErr = err as { code?: number; errmsg?: string; message?: string };
      if (mongoErr.code === 11000) {
        const { field, value } = parseDuplicateKey(mongoErr.errmsg ?? mongoErr.message);
        throw new ConflictException(
          field !== null
            ? `Client with ${field} "${value ?? ''}" already exists`
            : 'Client violates a uniqueness constraint',
        );
      }
      throw err;
    }
  }

  async findAll(filter: ClientFilterDto): Promise<PaginatedResult<ClientDocument>> {
    const query: Record<string, unknown> = {};
    if (filter.status !== undefined) query.status = filter.status;
    if (filter.assignedTo !== undefined && filter.assignedTo !== '') {
      query.assignedTo = filter.assignedTo;
    }
    if (filter.uploadBatchId !== undefined && filter.uploadBatchId !== '') {
      query.uploadBatchId = filter.uploadBatchId;
    }

    if (filter.search !== undefined && filter.search.trim() !== '') {
      const term = filter.search.trim();
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(escaped, 'i');
      const digits = term.replace(/\D/g, '');
      const orClauses: Record<string, unknown>[] = [{ name: re }, { cedula: re }, { ssNumber: re }];
      if (digits.length > 0) {
        orClauses.push({ phoneNormalized: new RegExp(digits, 'i') });
      }
      query.$or = orClauses;
    }

    const page = filter.page ?? 1;
    const limit = filter.limit ?? 50;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.clientModel
        .find(query)
        .populate('assignedTo', 'name email')
        .skip(skip)
        .limit(limit)
        .sort({ queueOrder: 1 })
        .exec(),
      this.clientModel.countDocuments(query).exec(),
    ]);

    return { data, total, page, limit };
  }

  async findOne(clientId: string): Promise<ClientDocument> {
    const client = await this.clientModel
      .findById(clientId)
      .populate('assignedTo', 'name email')
      .exec();
    if (client === null) throw new NotFoundException(`Client with id ${clientId} not found`);
    return client;
  }

  async findInterested(agentId?: string): Promise<ClientDocument[]> {
    const query: Record<string, unknown> = { status: ClientStatus.INTERESTED };
    if (agentId !== undefined && agentId !== '') query.assignedTo = agentId;
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
