import { Test, type TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { AdminsService } from '@/admins/admins.service';
import { AgentsService } from '@/agents/agents.service';
import { Role } from '@/common/enums';

jest.mock('bcrypt');

const mockAdmin = {
  _id: { toString: () => 'admin-id-1' },
  name: 'Admin',
  email: 'admin@test.com',
  password: 'hashed-password',
  isActive: true,
};

const mockAgent = {
  _id: { toString: () => 'agent-id-1' },
  name: 'Agent 1',
  email: 'agent@test.com',
  password: 'hashed-password',
  isActive: true,
};

describe('AuthService', () => {
  let service: AuthService;
  let adminsService: { findByEmail: jest.Mock };
  let agentsService: { findByEmail: jest.Mock };
  let jwtService: { signAsync: jest.Mock };

  beforeEach(async () => {
    adminsService = { findByEmail: jest.fn() };
    agentsService = { findByEmail: jest.fn() };
    jwtService = { signAsync: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: AdminsService, useValue: adminsService },
        { provide: AgentsService, useValue: agentsService },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe('validateUser', () => {
    it('should return admin when admin credentials are valid', async () => {
      adminsService.findByEmail.mockResolvedValue(mockAdmin);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser('admin@test.com', 'password');

      expect(result.role).toBe(Role.ADMIN);
    });

    it('should return agent when agent credentials are valid', async () => {
      adminsService.findByEmail.mockResolvedValue(null);
      agentsService.findByEmail.mockResolvedValue(mockAgent);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser('agent@test.com', 'password');

      expect(result.role).toBe(Role.AGENT);
    });

    it('should throw when user not found in either collection', async () => {
      adminsService.findByEmail.mockResolvedValue(null);
      agentsService.findByEmail.mockResolvedValue(null);

      await expect(service.validateUser('unknown@test.com', 'pass')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw when account is deactivated', async () => {
      adminsService.findByEmail.mockResolvedValue({ ...mockAdmin, isActive: false });

      await expect(service.validateUser('admin@test.com', 'pass')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw when password is invalid', async () => {
      adminsService.findByEmail.mockResolvedValue(mockAdmin);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.validateUser('admin@test.com', 'wrong')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('login', () => {
    it('should return access token', async () => {
      jwtService.signAsync.mockResolvedValue('jwt-token');

      const result = await service.login({
        id: 'admin-id-1',
        email: 'admin@test.com',
        name: 'Admin',
        role: Role.ADMIN,
      });

      expect(result).toEqual({ accessToken: 'jwt-token' });
    });
  });
});
