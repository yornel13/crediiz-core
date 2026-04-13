import { Controller, Get, Param, Query } from '@nestjs/common';
import { Role } from '@/common/enums';
import { Roles } from '@/auth/decorators/roles.decorator';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import { type AuthenticatedUser } from '@/auth/interfaces/jwt-payload.interface';
import { FollowUpsService } from './follow-ups.service';
import { FollowUpFilterDto } from './dto/follow-up-filter.dto';
import { type FollowUpDocument } from './schemas/follow-up.schema';

@Controller('follow-ups')
export class FollowUpsController {
  constructor(private readonly followUpsService: FollowUpsService) {}

  @Get()
  @Roles(Role.ADMIN)
  async findAll(@Query() filter: FollowUpFilterDto): Promise<{
    data: FollowUpDocument[];
    total: number;
    page: number;
    limit: number;
  }> {
    return this.followUpsService.findAll(filter);
  }

  @Get('agenda')
  @Roles(Role.AGENT)
  async findAgenda(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<FollowUpDocument[]> {
    return this.followUpsService.findAgenda(user.userId, from, to);
  }

  @Get('agent/:id')
  @Roles(Role.ADMIN)
  async findByAgent(@Param('id') agentId: string): Promise<FollowUpDocument[]> {
    return this.followUpsService.findByAgent(agentId);
  }

  @Get('client/:id')
  @Roles(Role.ADMIN)
  async findByClient(@Param('id') clientId: string): Promise<FollowUpDocument[]> {
    return this.followUpsService.findByClient(clientId);
  }
}
