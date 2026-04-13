import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { type HydratedDocument, type Types } from 'mongoose';
import { NoteType } from '@/common/enums';

export type NoteDocument = HydratedDocument<Note>;

@Schema({ timestamps: true })
export class Note {
  @Prop({ type: String, required: true, unique: true })
  mobileSyncId!: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true })
  clientId!: Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Agent', required: true })
  agentId!: Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Interaction', default: null })
  interactionId!: Types.ObjectId | null;

  @Prop({ type: String, required: true })
  content!: string;

  @Prop({ type: String, enum: NoteType, required: true })
  type!: NoteType;

  @Prop({ type: Date, required: true })
  deviceCreatedAt!: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const NoteSchema = SchemaFactory.createForClass(Note);

NoteSchema.index({ clientId: 1, createdAt: -1 });
NoteSchema.index({ agentId: 1 });
