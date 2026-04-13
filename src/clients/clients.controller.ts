import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role, type ClientStatus } from '@/common/enums';
import { Roles } from '@/auth/decorators/roles.decorator';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';
import { type AuthenticatedUser } from '@/auth/interfaces/jwt-payload.interface';
import { UploadService } from '@/upload/upload.service';
import { ClientsService } from './clients.service';
import { AssignClientsDto } from './dto/assign-clients.dto';
import { ClientFilterDto } from './dto/client-filter.dto';
import { UpdateClientStatusDto } from './dto/update-client-status.dto';
import { type ClientDocument } from './schemas/client.schema';

@Controller('clients')
export class ClientsController {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly uploadService: UploadService,
  ) {}

  @Post('upload')
  @Roles(Role.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ uploadBatchId: string; count: number }> {
    const result = await this.uploadService.importClients(file);
    return { uploadBatchId: result.uploadBatchId, count: result.count };
  }

  @Get()
  @Roles(Role.ADMIN)
  async findAll(@Query() filter: ClientFilterDto): Promise<{
    data: ClientDocument[];
    total: number;
    page: number;
    limit: number;
  }> {
    return this.clientsService.findAll(filter);
  }

  @Get('interested')
  @Roles(Role.ADMIN)
  async findInterested(@Query('agentId') agentId?: string): Promise<ClientDocument[]> {
    return this.clientsService.findInterested(agentId);
  }

  @Get('assigned')
  @Roles(Role.AGENT)
  async findAssigned(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: ClientStatus,
  ): Promise<ClientDocument[]> {
    return this.clientsService.findAssigned(user.userId, status);
  }

  @Patch('assign')
  @Roles(Role.ADMIN)
  async assignClients(@Body() dto: AssignClientsDto): Promise<{ modifiedCount: number }> {
    return this.clientsService.assignClients(dto);
  }

  @Patch(':id/status')
  @Roles(Role.ADMIN)
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateClientStatusDto,
  ): Promise<ClientDocument> {
    return this.clientsService.updateStatus(id, dto.status);
  }
}
