import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { type HydratedDocument, type Types } from 'mongoose';
import { CallOutcome } from '@/common/enums';

export type InteractionDocument = HydratedDocument<Interaction>;

@Schema({ timestamps: true })
export class Interaction {
  @Prop({ type: String, required: true, unique: true })
  mobileSyncId!: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true })
  clientId!: Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Agent', required: true })
  agentId!: Types.ObjectId;

  @Prop({ type: Date, required: true })
  callStartedAt!: Date;

  @Prop({ type: Date, required: true })
  callEndedAt!: Date;

  @Prop({ type: Number, required: true })
  durationSeconds!: number;

  @Prop({ type: String, enum: CallOutcome, required: true })
  outcome!: CallOutcome;

  @Prop({ type: String, default: null })
  disconnectCause!: string | null;

  @Prop({ type: Date, required: true })
  deviceCreatedAt!: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const InteractionSchema = SchemaFactory.createForClass(Interaction);

InteractionSchema.index({ agentId: 1, callStartedAt: -1 });
InteractionSchema.index({ clientId: 1 });
