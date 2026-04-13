import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { Agent, type AgentDocument } from './schemas/agent.schema';
import { type CreateAgentDto } from './dto/create-agent.dto';
import { type UpdateAgentDto } from './dto/update-agent.dto';

const BCRYPT_SALT_ROUNDS = 10;

@Injectable()
export class AgentsService {
  constructor(@InjectModel(Agent.name) private readonly agentModel: Model<AgentDocument>) {}

  async create(dto: CreateAgentDto): Promise<AgentDocument> {
    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);
    const agent = await this.agentModel.create({
      name: dto.name,
      email: dto.email,
      password: hashedPassword,
    });
    agent.password = '';
    return agent;
  }

  async findAll(): Promise<AgentDocument[]> {
    return this.agentModel.find().select('-password').exec();
  }

  async findById(id: string): Promise<AgentDocument> {
    const agent = await this.agentModel.findById(id).select('-password').exec();
    if (!agent) {
      throw new NotFoundException(`Agent with id ${id} not found`);
    }
    return agent;
  }

  async findByEmail(email: string): Promise<AgentDocument | null> {
    return this.agentModel.findOne({ email }).exec();
  }

  async update(id: string, dto: UpdateAgentDto): Promise<AgentDocument> {
    const updateData: Record<string, unknown> = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;

    if (dto.password !== undefined && dto.password !== '') {
      updateData.password = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);
    }

    const agent = await this.agentModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .select('-password')
      .exec();

    if (!agent) {
      throw new NotFoundException(`Agent with id ${id} not found`);
    }
    return agent;
  }
}
