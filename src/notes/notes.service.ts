import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type Model } from 'mongoose';
import { Note, type NoteDocument } from './schemas/note.schema';

interface CreateNoteInput {
  mobileSyncId: string;
  clientId: string;
  agentId: string;
  interactionId: string | null;
  content: string;
  type: string;
  deviceCreatedAt: Date;
}

@Injectable()
export class NotesService {
  constructor(@InjectModel(Note.name) private readonly noteModel: Model<NoteDocument>) {}

  async create(data: CreateNoteInput): Promise<NoteDocument> {
    return this.noteModel.create(data);
  }

  async findByClient(clientId: string): Promise<NoteDocument[]> {
    return this.noteModel
      .find({ clientId })
      .populate('agentId', 'name')
      .sort({ deviceCreatedAt: -1 })
      .exec();
  }

  async findByAgent(agentId: string): Promise<NoteDocument[]> {
    return this.noteModel
      .find({ agentId })
      .populate('clientId', 'name phone')
      .sort({ deviceCreatedAt: -1 })
      .exec();
  }

  async findLatestByClient(clientId: string): Promise<NoteDocument | null> {
    return this.noteModel.findOne({ clientId }).sort({ deviceCreatedAt: -1 }).exec();
  }
}
