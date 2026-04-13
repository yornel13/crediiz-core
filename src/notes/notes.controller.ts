import { Controller, Get, Param } from '@nestjs/common';
import { Role } from '@/common/enums';
import { Roles } from '@/auth/decorators/roles.decorator';
import { NotesService } from './notes.service';
import { type NoteDocument } from './schemas/note.schema';

@Controller('notes')
@Roles(Role.ADMIN)
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Get('client/:id')
  async findByClient(@Param('id') clientId: string): Promise<NoteDocument[]> {
    return this.notesService.findByClient(clientId);
  }

  @Get('agent/:id')
  async findByAgent(@Param('id') agentId: string): Promise<NoteDocument[]> {
    return this.notesService.findByAgent(agentId);
  }
}
