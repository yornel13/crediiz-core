import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { type HydratedDocument, type Types } from 'mongoose';
import { CallOutcome, ClientStatus } from '@/common/enums';

export type ClientDocument = HydratedDocument<Client>;

@Schema({ timestamps: true })
export class Client {
  // ── Identity (flat, fast access, indexable) ──────────────────────────────

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: String, required: true })
  phone!: string;

  /** Digits-only canonical form of `phone`, computed via `normalizePhone()`. */
  @Prop({ type: String, required: true, index: true })
  phoneNormalized!: string;

  /** Panama national ID. Optional — some banking partners accept clients without one. */
  @Prop({ type: String, default: null })
  cedula!: string | null;

  /** Social security number. Optional — not all source banks provide it. */
  @Prop({ type: String, default: null })
  ssNumber!: string | null;

  /** Monthly salary in USD. */
  @Prop({ type: Number, default: null, min: 0 })
  salary!: number | null;

  // ── Workflow state ───────────────────────────────────────────────────────

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

  // ── Bank-specific overflow & batch metadata ──────────────────────────────

  /** Catch-all for partner-specific fields not promoted to flat columns. */
  @Prop({ type: mongoose.Schema.Types.Mixed, default: {} })
  extraData!: Record<string, unknown>;

  @Prop({ type: String })
  uploadBatchId!: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const ClientSchema = SchemaFactory.createForClass(Client);

// Workflow indexes
ClientSchema.index({ assignedTo: 1, status: 1 });
ClientSchema.index({ status: 1 });
ClientSchema.index({ uploadBatchId: 1 });

// Identity uniqueness — partial index so explicit `null` values coexist.
// `sparse: true` would not work here because the schema sets `default: null`,
// making the field always present (sparse only skips missing fields, not nulls).
ClientSchema.index(
  { cedula: 1 },
  { unique: true, partialFilterExpression: { cedula: { $type: 'string' } } },
);
ClientSchema.index(
  { ssNumber: 1 },
  { unique: true, partialFilterExpression: { ssNumber: { $type: 'string' } } },
);
