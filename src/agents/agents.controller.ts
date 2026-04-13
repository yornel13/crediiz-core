import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Role } from '@/common/enums';
import { Roles } from '@/auth/decorators/roles.decorator';
import { AgentsService } from './agents.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { type AgentDocument } from './schemas/agent.schema';

@Controller('agents')
@Roles(Role.ADMIN)
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Post()
  async create(@Body() dto: CreateAgentDto): Promise<AgentDocument> {
    return this.agentsService.create(dto);
  }

  @Get()
  async findAll(): Promise<AgentDocument[]> {
    return this.agentsService.findAll();
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<AgentDocument> {
    return this.agentsService.findById(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateAgentDto): Promise<AgentDocument> {
    return this.agentsService.update(id, dto);
  }
}
