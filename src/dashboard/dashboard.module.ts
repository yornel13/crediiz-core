import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Interaction, InteractionSchema } from '@/interactions/schemas/interaction.schema';
import { FollowUp, FollowUpSchema } from '@/follow-ups/schemas/follow-up.schema';
import { Client, ClientSchema } from '@/clients/schemas/client.schema';
import { Agent, AgentSchema } from '@/agents/schemas/agent.schema';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Interaction.name, schema: InteractionSchema },
      { name: FollowUp.name, schema: FollowUpSchema },
      { name: Client.name, schema: ClientSchema },
      { name: Agent.name, schema: AgentSchema },
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
