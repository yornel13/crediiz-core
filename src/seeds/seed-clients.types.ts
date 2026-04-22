/**
 * Canonical shape for any client we ingest — both seed data and Excel uploads.
 *
 * Required: `name`, `phone`, `ssNumber`. Everything else is optional.
 * `extraData` is reserved for partner-specific fields not promoted to flat
 * columns on the `Client` schema.
 */
export interface ClientSeedEntry {
  name: string;
  phone: string;
  cedula?: string;
  ssNumber?: string;
  salary?: number;
  extraData?: Record<string, unknown>;
}
