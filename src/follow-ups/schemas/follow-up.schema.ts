import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { type HydratedDocument, type Types } from 'mongoose';
import { FollowUpStatus } from '@/common/enums';

export type FollowUpDocument = HydratedDocument<FollowUp>;

@Schema({ timestamps: true })
export class FollowUp {
  @Prop({ type: String, required: true, unique: true })
  mobileSyncId!: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true })
  clientId!: Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Agent', required: true })
  agentId!: Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Interaction', default: null })
  interactionId!: Types.ObjectId | null;

  @Prop({ type: Date, required: true })
  scheduledAt!: Date;

  @Prop({ type: String, required: true })
  reason!: string;

  @Prop({ type: String, enum: FollowUpStatus, default: FollowUpStatus.PENDING })
  status!: FollowUpStatus;

  @Prop({ type: Date, default: null })
  completedAt!: Date | null;

  @Prop({ type: Date, default: null })
  cancelledAt!: Date | null;

  @Prop({ type: String, default: null })
  cancelReason!: string | null;

  @Prop({ type: Date, required: true })
  deviceCreatedAt!: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const FollowUpSchema = SchemaFactory.createForClass(FollowUp);

FollowUpSchema.index({ agentId: 1, scheduledAt: 1, status: 1 });
FollowUpSchema.index({ clientId: 1 });
FollowUpSchema.index({ status: 1, scheduledAt: 1 });
