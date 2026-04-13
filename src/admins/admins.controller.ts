import { Controller, Get } from '@nestjs/common';
import { Role } from '@/common/enums';
import { Roles } from '@/auth/decorators/roles.decorator';
import { AdminsService } from './admins.service';
import { type AdminDocument } from './schemas/admin.schema';

@Controller('admins')
@Roles(Role.ADMIN)
export class AdminsController {
  constructor(private readonly adminsService: AdminsService) {}

  @Get()
  async findAll(): Promise<AdminDocument[]> {
    return this.adminsService.findAll();
  }
}
