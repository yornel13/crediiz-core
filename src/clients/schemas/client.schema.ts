import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { type HydratedDocument, type Types } from 'mongoose';
import { CallOutcome, ClientStatus } from '@/common/enums';

export type ClientDocument = HydratedDocument<Client>;

@Schema({ timestamps: true })
export class Client {
  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String, required: true })
  phone!: string;

  @Prop({ type: String, enum: ClientStatus, default: ClientStatus.PENDING })
  status!: ClientStatus;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Agent', default: null })
  assignedTo!: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  assignedAt!: Date | null;

  @Prop({ type: Number, default: 0 })
  callAttempts!: number;

  @Prop({ type: Date, default: null })
  lastCalledAt!: Date | null;

  @Prop({ type: String, enum: CallOutcome, default: null })
  lastOutcome!: CallOutcome | null;

  @Prop({ type: String, default: null })
  lastNote!: string | null;

  @Prop({ type: Number, default: 0 })
  queueOrder!: number;

  @Prop({ type: mongoose.Schema.Types.Mixed, default: {} })
  extraData!: Record<string, unknown>;

  @Prop({ type: String })
  uploadBatchId!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ClientSchema = SchemaFactory.createForClass(Client);

ClientSchema.index({ assignedTo: 1, status: 1 });
ClientSchema.index({ status: 1 });
ClientSchema.index({ uploadBatchId: 1 });
