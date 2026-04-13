import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { type Model } from 'mongoose';
import { AppModule } from '../app.module';
import { AdminsService } from '../admins/admins.service';
import { AgentsService } from '../agents/agents.service';
import { type AdminDocument } from '../admins/schemas/admin.schema';
import { type AgentDocument } from '../agents/schemas/agent.schema';

interface SeedEntry {
  name: string;
  email: string;
  password: string;
}

const SEED_ADMINS: SeedEntry[] = [
  {
    name: 'Admin',
    email: 'admin@test.com',
    password: 'test1234',
  },
];

const SEED_AGENTS: SeedEntry[] = [
  {
    name: 'Agent 1',
    email: 'agent1@test.com',
    password: 'test1234',
  },
  {
    name: 'Agent 2',
    email: 'agent2@test.com',
    password: 'test1234',
  },
];

async function seed(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });

  const adminModel = app.get<Model<AdminDocument>>(getModelToken('Admin'));
  const agentModel = app.get<Model<AgentDocument>>(getModelToken('Agent'));
  const adminsService = app.get(AdminsService);
  const agentsService = app.get(AgentsService);

  console.log('\n--- Panama Calls CRM: Database Seed ---\n');

  const deletedAdmins = await adminModel.deleteMany({});
  console.log(`  [CLEAN] admins: ${String(deletedAdmins.deletedCount)} removed`);

  const deletedAgents = await agentModel.deleteMany({});
  console.log(`  [CLEAN] agents: ${String(deletedAgents.deletedCount)} removed`);

  console.log('\n  Admins:');
  for (const data of SEED_ADMINS) {
    await adminsService.create(data);
    console.log(`    [CREATED] ${data.email}`);
  }

  console.log('  Agents:');
  for (const data of SEED_AGENTS) {
    await agentsService.create(data);
    console.log(`    [CREATED] ${data.email}`);
  }

  console.log(
    `\n  Total: ${String(SEED_ADMINS.length)} admins, ${String(SEED_AGENTS.length)} agents`,
  );
  console.log('\n--- Seed complete ---\n');

  await app.close();
}

void seed();
