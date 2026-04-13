import { Controller, Get, Param, Query } from '@nestjs/common';
import { Role } from '@/common/enums';
import { Roles } from '@/auth/decorators/roles.decorator';
import { InteractionsService } from './interactions.service';
import { InteractionFilterDto } from './dto/interaction-filter.dto';
import { type InteractionDocument } from './schemas/interaction.schema';

@Controller('interactions')
@Roles(Role.ADMIN)
export class InteractionsController {
  constructor(private readonly interactionsService: InteractionsService) {}

  @Get()
  async findAll(@Query() filter: InteractionFilterDto): Promise<{
    data: InteractionDocument[];
    total: number;
    page: number;
    limit: number;
  }> {
    return this.interactionsService.findAll(filter);
  }

  @Get('client/:id')
  async findByClient(@Param('id') clientId: string): Promise<InteractionDocument[]> {
    return this.interactionsService.findByClient(clientId);
  }
}
