import { Body, Controller, Post } from '@nestjs/common';
import { Role } from '@/common/enums';
import { Roles } from '@/auth/decorators/roles.decorator';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import { type AuthenticatedUser } from '@/auth/interfaces/jwt-payload.interface';
import { SyncService } from './sync.service';
import { SyncRequestDto } from './dto/sync-request.dto';

@Controller('sync')
@Roles(Role.AGENT)
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post('interactions')
  async sync(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SyncRequestDto,
  ): Promise<ReturnType<SyncService['processSync']>> {
    return this.syncService.processSync(user.userId, dto);
  }
}
