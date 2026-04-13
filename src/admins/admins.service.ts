import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { Admin, type AdminDocument } from './schemas/admin.schema';

const BCRYPT_SALT_ROUNDS = 10;

interface CreateAdminInput {
  name: string;
  email: string;
  password: string;
}

@Injectable()
export class AdminsService {
  constructor(@InjectModel(Admin.name) private readonly adminModel: Model<AdminDocument>) {}

  async create(input: CreateAdminInput): Promise<AdminDocument> {
    const hashedPassword = await bcrypt.hash(input.password, BCRYPT_SALT_ROUNDS);
    const admin = await this.adminModel.create({
      name: input.name,
      email: input.email,
      password: hashedPassword,
    });
    admin.password = '';
    return admin;
  }

  async findAll(): Promise<AdminDocument[]> {
    return this.adminModel.find().select('-password').exec();
  }

  async findByEmail(email: string): Promise<AdminDocument | null> {
    return this.adminModel.findOne({ email }).exec();
  }

  async findById(id: string): Promise<AdminDocument | null> {
    return this.adminModel.findById(id).select('-password').exec();
  }
}
