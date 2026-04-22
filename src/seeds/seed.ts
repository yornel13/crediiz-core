import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { type Model, type Types } from 'mongoose';
import { AppModule } from '../app.module';
import { AdminsService } from '../admins/admins.service';
import { AgentsService } from '../agents/agents.service';
import { type AdminDocument } from '../admins/schemas/admin.schema';
import { type AgentDocument } from '../agents/schemas/agent.schema';
import { type ClientDocument } from '../clients/schemas/client.schema';
import { type InteractionDocument } from '../interactions/schemas/interaction.schema';
import { type NoteDocument } from '../notes/schemas/note.schema';
import { type FollowUpDocument } from '../follow-ups/schemas/follow-up.schema';
import { normalizePhone } from '../common/utils';
import { SEED_CLIENTS } from './seed-clients.data';

interface UserSeedEntry {
  name: string;
  email: string;
  password: string;
}

const SEED_ADMINS: UserSeedEntry[] = [
  { name: 'Admin', email: 'admin@test.com', password: 'test1234' },
];

const SEED_AGENTS: UserSeedEntry[] = [
  { name: 'Agent 1', email: 'agent1@test.com', password: 'test1234' },
  { name: 'Agent 2', email: 'agent2@test.com', password: 'test1234' },
];

async function seed(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const adminModel = app.get<Model<AdminDocument>>(getModelToken('Admin'));
  const agentModel = app.get<Model<AgentDocument>>(getModelToken('Agent'));
  const clientModel = app.get<Model<ClientDocument>>(getModelToken('Client'));
  const interactionModel = app.get<Model<InteractionDocument>>(getModelToken('Interaction'));
  const noteModel = app.get<Model<NoteDocument>>(getModelToken('Note'));
  const followUpModel = app.get<Model<FollowUpDocument>>(getModelToken('FollowUp'));

  const adminsService = app.get(AdminsService);
  const agentsService = app.get(AgentsService);

  console.log('\n--- Panama Calls CRM: Database Seed ---\n');

  // 1. Full clean slate — order matters less since we delete everything.
  console.log('  [CLEAN]');

  // Drop indexes from prior runs so schema changes (e.g. switching from sparse
  // to partial unique indexes) take effect cleanly. Mongoose recreates them
  // on next write per the current schema definition.
  for (const model of [
    clientModel,
    agentModel,
    adminModel,
    interactionModel,
    noteModel,
    followUpModel,
  ]) {
    try {
      await model.collection.dropIndexes();
    } catch {
      // Collection may not exist yet — ignore.
    }
  }

  const cleanResults = await Promise.all([
    followUpModel.deleteMany({}),
    noteModel.deleteMany({}),
    interactionModel.deleteMany({}),
    clientModel.deleteMany({}),
    agentModel.deleteMany({}),
    adminModel.deleteMany({}),
  ]);
  const [followUps, notes, interactions, clients, agents, admins] = cleanResults;
  console.log(`    admins:        ${String(admins.deletedCount)} removed`);
  console.log(`    agents:        ${String(agents.deletedCount)} removed`);
  console.log(`    clients:       ${String(clients.deletedCount)} removed`);
  console.log(`    interactions:  ${String(interactions.deletedCount)} removed`);
  console.log(`    notes:         ${String(notes.deletedCount)} removed`);
  console.log(`    follow-ups:    ${String(followUps.deletedCount)} removed`);

  // 2. Admins
  console.log('\n  [CREATE] admins:');
  for (const data of SEED_ADMINS) {
    await adminsService.create(data);
    console.log(`    ${data.email}  /  ${data.password}`);
  }

  // 3. Agents
  console.log('\n  [CREATE] agents:');
  const createdAgents: { email: string; id: Types.ObjectId }[] = [];
  for (const data of SEED_AGENTS) {
    const agent = await agentsService.create(data);
    createdAgents.push({ email: data.email, id: agent._id });
    console.log(`    ${data.email}  /  ${data.password}`);
  }

  const agent1 = createdAgents.find((a) => a.email === 'agent1@test.com');
  const agent2 = createdAgents.find((a) => a.email === 'agent2@test.com');
  if (!agent1 || !agent2) {
    throw new Error('Seed agents not created — cannot assign clients');
  }

  // 4. Clients — split 33% / 33% / 34% (unassigned)
  const total = SEED_CLIENTS.length;
  const agent1Slice = Math.floor(total / 3);
  const agent2Slice = Math.floor(total / 3);
  const now = new Date();
  const seedBatchId = `seed-${String(now.getTime())}`;

  const clientDocs = SEED_CLIENTS.map((c, index) => {
    let assignedTo: Types.ObjectId | null = null;
    let assignedAt: Date | null = null;

    if (index < agent1Slice) {
      assignedTo = agent1.id;
      assignedAt = now;
    } else if (index < agent1Slice + agent2Slice) {
      assignedTo = agent2.id;
      assignedAt = now;
    }

    return {
      name: c.name,
      phone: c.phone,
      phoneNormalized: normalizePhone(c.phone),
      cedula: c.cedula ?? null,
      ssNumber: c.ssNumber ?? null,
      salary: c.salary ?? null,
      extraData: c.extraData ?? {},
      uploadBatchId: seedBatchId,
      queueOrder: index,
      assignedTo,
      assignedAt,
    };
  });

  await clientModel.insertMany(clientDocs);

  const agent1Count = agent1Slice;
  const agent2Count = agent2Slice;
  const unassignedCount = total - agent1Count - agent2Count;

  console.log('\n  [CREATE] clients:');
  console.log(`    total:        ${String(total)} (batchId: ${seedBatchId})`);
  console.log(`    agent1:       ${String(agent1Count)}`);
  console.log(`    agent2:       ${String(agent2Count)}`);
  console.log(`    unassigned:   ${String(unassignedCount)}`);

  // Summary
  console.log('\n--- Summary ---');
  console.log(`  Admins:    ${String(SEED_ADMINS.length)}`);
  console.log(`  Agents:    ${String(SEED_AGENTS.length)}`);
  console.log(`  Clients:   ${String(total)}`);
  console.log('\n  Login credentials (password for all: test1234):');
  console.log('    Admin:    admin@test.com');
  console.log(`    Agent 1:  agent1@test.com  ← ${String(agent1Count)} clients`);
  console.log(`    Agent 2:  agent2@test.com  ← ${String(agent2Count)} clients`);
  console.log(`    Pool:     ${String(unassignedCount)} unassigned clients`);
  console.log('\n--- Seed complete ---\n');

  await app.close();
}

void seed();
