import { Module } from '@nestjs/common';
import { InteractionsModule } from '@/interactions/interactions.module';
import { FollowUpsModule } from '@/follow-ups/follow-ups.module';
import { ClientsModule } from '@/clients/clients.module';
import { NotesModule } from '@/notes/notes.module';
import { SyncService } from './sync.service';
import { SyncController } from './sync.controller';

@Module({
  imports: [InteractionsModule, FollowUpsModule, ClientsModule, NotesModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
