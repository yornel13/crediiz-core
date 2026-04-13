import { Controller, Get, Param, Query } from '@nestjs/common';
import { Role } from '@/common/enums';
import { Roles } from '@/auth/decorators/roles.decorator';
import { DashboardService } from './dashboard.service';
import { DashboardFilterDto } from './dto/dashboard-filter.dto';

@Controller('dashboard')
@Roles(Role.ADMIN)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  async getSummary(
    @Query() filter: DashboardFilterDto,
  ): Promise<ReturnType<DashboardService['getSummary']>> {
    return this.dashboardService.getSummary(filter.from, filter.to);
  }

  @Get('agent/:id')
  async getAgentDetail(
    @Param('id') agentId: string,
    @Query() filter: DashboardFilterDto,
  ): Promise<ReturnType<DashboardService['getAgentDetail']>> {
    return this.dashboardService.getAgentDetail(agentId, filter.from, filter.to);
  }
}
