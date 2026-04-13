import { Test, type TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AgentsService } from './agents.service';
import { Agent } from './schemas/agent.schema';

jest.mock('bcrypt');

const mockAgent = {
  _id: '507f1f77bcf86cd799439011',
  name: 'John Doe',
  email: 'john@example.com',
  password: '',
  isActive: true,
};

const mockAgentModel = {
  create: jest.fn(),
  find: jest.fn(),
  findById: jest.fn(),
  findOne: jest.fn(),
  findByIdAndUpdate: jest.fn(),
};

const chainable = (result: unknown): { select: jest.Mock } => ({
  select: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(result) }),
});

describe('AgentsService', () => {
  let service: AgentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AgentsService, { provide: getModelToken(Agent.name), useValue: mockAgentModel }],
    }).compile();

    service = module.get<AgentsService>(AgentsService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should hash password and create agent', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
      mockAgentModel.create.mockResolvedValue({ ...mockAgent, password: '' });

      const result = await service.create({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
      });

      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10);
      expect(result.password).toBe('');
    });
  });

  describe('findAll', () => {
    it('should return all agents without passwords', async () => {
      mockAgentModel.find.mockReturnValue(chainable([mockAgent]));

      const result = await service.findAll();

      expect(result).toEqual([mockAgent]);
    });
  });

  describe('findById', () => {
    it('should return agent by id', async () => {
      mockAgentModel.findById.mockReturnValue(chainable(mockAgent));

      const result = await service.findById(mockAgent._id);

      expect(result).toEqual(mockAgent);
    });

    it('should throw NotFoundException if not found', async () => {
      mockAgentModel.findById.mockReturnValue(chainable(null));

      await expect(service.findById('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByEmail', () => {
    it('should return null if not found', async () => {
      mockAgentModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

      const result = await service.findByEmail('unknown@example.com');

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should hash password if included in update', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed');
      mockAgentModel.findByIdAndUpdate.mockReturnValue(chainable(mockAgent));

      await service.update(mockAgent._id, { password: 'newpass123' });

      expect(bcrypt.hash).toHaveBeenCalledWith('newpass123', 10);
    });

    it('should throw NotFoundException if not found', async () => {
      mockAgentModel.findByIdAndUpdate.mockReturnValue(chainable(null));

      await expect(service.update('nonexistent', { name: 'Test' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
