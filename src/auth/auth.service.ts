import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AdminsService } from '@/admins/admins.service';
import { AgentsService } from '@/agents/agents.service';
import { Role } from '@/common/enums';
import { type JwtPayload } from './interfaces/jwt-payload.interface';

interface LoginResponse {
  accessToken: string;
}

interface ValidatedUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly adminsService: AdminsService,
    private readonly agentsService: AgentsService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string): Promise<ValidatedUser> {
    const admin = await this.adminsService.findByEmail(email);
    if (admin) {
      if (!admin.isActive) {
        throw new UnauthorizedException('Account is deactivated');
      }
      const isValid = await bcrypt.compare(password, admin.password);
      if (!isValid) {
        throw new UnauthorizedException('Invalid credentials');
      }
      return { id: admin._id.toString(), email: admin.email, name: admin.name, role: Role.ADMIN };
    }

    const agent = await this.agentsService.findByEmail(email);
    if (agent) {
      if (!agent.isActive) {
        throw new UnauthorizedException('Account is deactivated');
      }
      const isValid = await bcrypt.compare(password, agent.password);
      if (!isValid) {
        throw new UnauthorizedException('Invalid credentials');
      }
      return {
        id: agent._id.toString(),
        email: agent.email,
        name: agent.name,
        role: Role.AGENT,
      };
    }

    throw new UnauthorizedException('Invalid credentials');
  }

  async login(user: ValidatedUser): Promise<LoginResponse> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
    };
  }
}
