# Panama Calls CRM — Backend Architecture

## 1. Module Structure

The backend follows NestJS modular architecture with strict Separation of Concerns.

```
src/
├── main.ts
├── app.module.ts
│
├── auth/                        # Authentication & authorization
│   ├── auth.module.ts
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── strategies/
│   │   └── jwt.strategy.ts
│   ├── guards/
│   │   ├── jwt-auth.guard.ts
│   │   └── roles.guard.ts
│   ├── decorators/
│   │   └── roles.decorator.ts
│   └── dto/
│       └── login.dto.ts
│
├── users/                       # Owner & Promoter account management
│   ├── users.module.ts
│   ├── users.controller.ts
│   ├── users.service.ts
│   ├── schemas/
│   │   └── user.schema.ts
│   └── dto/
│       ├── create-user.dto.ts
│       └── update-user.dto.ts
│
├── clients/                     # Client data management & assignment
│   ├── clients.module.ts
│   ├── clients.controller.ts
│   ├── clients.service.ts
│   ├── schemas/
│   │   └── client.schema.ts
│   └── dto/
│       ├── assign-clients.dto.ts
│       └── client-filter.dto.ts
│
├── interactions/                # Call tracking, notes & outcomes
│   ├── interactions.module.ts
│   ├── interactions.controller.ts
│   ├── interactions.service.ts
│   ├── schemas/
│   │   └── interaction.schema.ts
│   └── dto/
│       ├── create-interaction.dto.ts
│       └── interaction-filter.dto.ts
│
├── follow-ups/                  # Promoter agenda & scheduled follow-ups
│   ├── follow-ups.module.ts
│   ├── follow-ups.controller.ts
│   ├── follow-ups.service.ts
│   ├── schemas/
│   │   └── follow-up.schema.ts
│   └── dto/
│       └── follow-up-filter.dto.ts
│
├── upload/                      # Excel file parsing & client import
│   ├── upload.module.ts
│   ├── upload.controller.ts
│   └── upload.service.ts
│
├── sync/                        # Mobile offline data synchronization
│   ├── sync.module.ts
│   ├── sync.controller.ts
│   └── sync.service.ts
│
├── dashboard/                   # Aggregated stats for Owner panel
│   ├── dashboard.module.ts
│   ├── dashboard.controller.ts
│   └── dashboard.service.ts
│
└── common/                      # Shared utilities & constants
    ├── enums/
    │   ├── role.enum.ts
    │   ├── client-status.enum.ts
    │   ├── call-outcome.enum.ts
    │   └── follow-up-status.enum.ts
    ├── filters/
    │   └── http-exception.filter.ts
    └── interceptors/
        └── transform.interceptor.ts
```

---

## 2. Domain Models (MongoDB Schemas)

All schemas use Mongoose `timestamps: true` for automatic `createdAt` / `updatedAt` management.

### 2.1 User

Represents both Owner (admin) and Promoter accounts in a single collection.

```
{
  _id:        ObjectId,
  role:       String, enum: ['ADMIN', 'PROMOTER'], required,
  name:       String, required,
  email:      String, required, unique,
  password:   String, required,              // bcrypt hashed
  isActive:   Boolean, default: true,        // deactivate without deleting
  createdAt:  Date,                          // auto (timestamps)
  updatedAt:  Date                           // auto (timestamps)
}
```

**Indexes:** `{ email: 1 }` unique.

### 2.2 Client

Represents a person to be contacted. Loaded from Excel, assigned to Promoters.

```
{
  _id:            ObjectId,
  name:           String, required,
  phone:          String, required,
  status:         String, enum: ['PENDING', 'INTERESTED', 'CONVERTED',
                                 'REJECTED', 'INVALID_NUMBER', 'DO_NOT_CALL'],
                  default: 'PENDING',
  assignedTo:     ObjectId | null, ref: 'User',   // current Promoter
  assignedAt:     Date | null,                     // when Owner assigned
  callAttempts:   Number, default: 0,              // incremented per interaction
  lastCalledAt:   Date | null,                     // timestamp of last attempt
  lastOutcome:    String | null, enum: ['INTERESTED', 'NOT_INTERESTED',
                                        'NO_ANSWER', 'BUSY', 'INVALID_NUMBER'],
                                                   // outcome of last interaction
  lastNote:       String | null,                   // note from last interaction
  queueOrder:     Number, default: 0,              // sequence for mobile app
  extraData:      Mixed, default: {},              // dynamic Excel columns
  uploadBatchId:  String,                          // groups clients from same upload
  createdAt:      Date,                            // auto (timestamps)
  updatedAt:      Date                             // auto (timestamps)
}
```

**Why `lastOutcome` and `lastNote`?**
The mobile Pre-Call Screen shows the previous call result and note to give the Promoter context before dialing. Without these denormalized fields, the app would need a second query per client to fetch the latest Interaction (N+1 problem). These fields are updated atomically during sync — zero extra queries for the app.

**Indexes:**
- `{ assignedTo: 1, status: 1 }` — Mobile app queries (fetch assigned + PENDING or INTERESTED).
- `{ status: 1 }` — Owner filters by status (e.g., list all INTERESTED).
- `{ uploadBatchId: 1 }` — Group/rollback by upload batch.

### 2.3 Interaction

A single call attempt by a Promoter to a Client. Created on the device, synced to the backend.

```
{
  _id:              ObjectId,
  mobileSyncId:     String, required, unique,     // UUID from device (idempotency)
  clientId:         ObjectId, ref: 'Client', required,
  promoterId:       ObjectId, ref: 'User', required,
  callStartedAt:    Date, required,
  callEndedAt:      Date, required,
  durationSeconds:  Number, required,             // denormalized for fast queries
  outcome:          String, enum: ['INTERESTED', 'NOT_INTERESTED',
                                   'NO_ANSWER', 'BUSY', 'INVALID_NUMBER'],
                    required,
  note:             String | null,                // free-text, written during call
  disconnectCause:  String | null,                // Android DisconnectCause (LOCAL, REMOTE,
                                                  // BUSY, ERROR, etc.) for debugging/reporting
  deviceCreatedAt:  Date, required,               // when saved on device
  createdAt:        Date,                         // auto (timestamps) = server sync time
  updatedAt:        Date                          // auto (timestamps)
}
```

**Indexes:**
- `{ mobileSyncId: 1 }` unique — Deduplication.
- `{ promoterId: 1, callStartedAt: -1 }` — Dashboard: calls by Promoter in date range.
- `{ clientId: 1 }` — Client call history.

### 2.4 FollowUp

A scheduled follow-up created by the Promoter when a client shows interest. Represents a future call commitment in the Promoter's personal agenda.

```
{
  _id:            ObjectId,
  mobileSyncId:   String, required, unique,       // UUID from device (idempotency)
  clientId:       ObjectId, ref: 'Client', required,
  promoterId:     ObjectId, ref: 'User', required,
  interactionId:  ObjectId | null, ref: 'Interaction',  // the interaction that originated
                                                        // this follow-up (linked after sync)
  scheduledAt:    Date, required,                 // when to call back (date + time)
  reason:         String, required,               // why: "Wants loan rates", "Call back Thursday"
  status:         String, enum: ['PENDING', 'COMPLETED', 'CANCELLED'],
                  default: 'PENDING',
  completedAt:    Date | null,                    // when Promoter completed the follow-up call
  cancelledAt:    Date | null,                    // when cancelled (e.g., client reassigned)
  cancelReason:   String | null,                  // why cancelled (e.g., "Client reassigned to
                                                  // another promoter")
  deviceCreatedAt: Date, required,                // when saved on device
  createdAt:      Date,                           // auto (timestamps) = server sync time
  updatedAt:      Date                            // auto (timestamps)
}
```

**Why a separate collection?**
- A client can have multiple follow-ups over time (reschedules, different campaigns).
- The Promoter's agenda is a query across follow-ups, not across clients — it needs its own indexed collection.
- Follows the same offline-first pattern as Interactions (`mobileSyncId` for dedup).

**Indexes:**
- `{ mobileSyncId: 1 }` unique — Deduplication.
- `{ promoterId: 1, scheduledAt: 1, status: 1 }` — Agenda queries: "my pending follow-ups ordered by date".
- `{ clientId: 1 }` — Follow-up history for a client.
- `{ status: 1, scheduledAt: 1 }` — Owner: all pending follow-ups across Promoters.

---

## 3. API Endpoints

### 3.1 Auth

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/api/auth/login` | Public | Authenticate user, return JWT |

### 3.2 Users (Promoter Management)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/api/users` | Admin | Create a Promoter account |
| GET | `/api/users` | Admin | List all Promoters |
| GET | `/api/users/:id` | Admin | Get Promoter details |
| PATCH | `/api/users/:id` | Admin | Update Promoter (name, isActive, etc.) |

### 3.3 Clients

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/api/clients/upload` | Admin | Upload Excel file, bulk insert clients |
| GET | `/api/clients` | Admin | List clients with filters (status, assignedTo, uploadBatchId) |
| GET | `/api/clients/interested` | Admin | List INTERESTED clients (all or by Promoter via `?promoterId=`) |
| PATCH | `/api/clients/assign` | Admin | Assign/reassign clients to a Promoter. If reassigning, cancels existing PENDING follow-ups for the old Promoter |
| PATCH | `/api/clients/:id/status` | Admin | Manually change client status (e.g., DO_NOT_CALL, CONVERTED) |
| GET | `/api/clients/assigned` | Promoter | Get own assigned clients. Supports `?status=PENDING` (default) or `?status=INTERESTED`. Filtered by JWT user. Ordered by `queueOrder` |

### 3.4 Interactions

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/api/interactions` | Admin | List interactions with filters (promoter, client, date, outcome) |
| GET | `/api/interactions/client/:id` | Admin | Full interaction history for a client |

### 3.5 Follow-Ups

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/api/follow-ups` | Admin | List all follow-ups with filters (promoterId, status, date range). Owner supervision view |
| GET | `/api/follow-ups/promoter/:id` | Admin | All follow-ups for a specific Promoter |
| GET | `/api/follow-ups/client/:id` | Admin | Follow-up history for a specific client |
| GET | `/api/follow-ups/agenda` | Promoter | Own pending follow-ups ordered by `scheduledAt`. The Promoter's personal agenda. Supports `?from=` and `?to=` date filters |

### 3.6 Sync (Mobile)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/api/sync/interactions` | Promoter | Batch sync interactions + follow-ups from device. Returns per-item status |

#### Sync Request Body

```json
{
  "interactions": [
    {
      "mobileSyncId": "uuid-interaction-1",
      "clientId": "mongo-object-id",
      "callStartedAt": "2026-04-08T10:30:00Z",
      "callEndedAt": "2026-04-08T10:33:45Z",
      "durationSeconds": 225,
      "outcome": "INTERESTED",
      "note": "Client wants info about personal loan rates...",
      "disconnectCause": "REMOTE",
      "deviceCreatedAt": "2026-04-08T10:33:50Z"
    }
  ],
  "followUps": [
    {
      "mobileSyncId": "uuid-followup-1",
      "clientId": "mongo-object-id",
      "interactionMobileSyncId": "uuid-interaction-1",
      "scheduledAt": "2026-04-10T14:00:00Z",
      "reason": "Wants personal loan rates, call Thursday 2pm",
      "deviceCreatedAt": "2026-04-08T10:34:00Z"
    }
  ],
  "completedFollowUps": [
    {
      "mobileSyncId": "uuid-followup-previous",
      "completedAt": "2026-04-08T10:33:50Z"
    }
  ]
}
```

> `promoterId` is NOT sent in the body — it is extracted from the JWT token server-side.

**`interactionMobileSyncId`**: Links the follow-up to the interaction that originated it. The backend resolves this to `interactionId` (ObjectId) after the interaction is inserted. If the interaction is in the same batch, it's resolved in order. If it was synced previously, the backend looks it up by `mobileSyncId`.

**`completedFollowUps`**: When a Promoter calls back a follow-up client and saves the outcome, the original follow-up is marked as COMPLETED. The device sends the `mobileSyncId` of the completed follow-up along with the timestamp.

#### Sync Response Contract

```json
{
  "interactions": {
    "results": [
      { "mobileSyncId": "uuid-1", "status": "created" },
      { "mobileSyncId": "uuid-2", "status": "duplicate" }
    ],
    "syncedCount": 1,
    "duplicateCount": 1,
    "errorCount": 0
  },
  "followUps": {
    "results": [
      { "mobileSyncId": "uuid-f1", "status": "created" },
      { "mobileSyncId": "uuid-f2", "status": "duplicate" }
    ],
    "syncedCount": 1,
    "duplicateCount": 1,
    "errorCount": 0
  },
  "completedFollowUps": {
    "results": [
      { "mobileSyncId": "uuid-fp", "status": "updated" }
    ],
    "updatedCount": 1,
    "errorCount": 0
  }
}
```

| Status | Meaning | App Action |
|---|---|---|
| `created` | Record inserted, side effects applied | Mark local as SYNCED |
| `duplicate` | `mobileSyncId` already exists in DB | Mark local as SYNCED (already on server) |
| `updated` | Follow-up marked as completed | Mark local as SYNCED |
| `error` | Validation or processing failed | Keep local as PENDING, log error, retry |

#### Sync Side Effects

**Per created interaction:**
```
client.callAttempts++
client.lastCalledAt   = interaction.callStartedAt
client.lastOutcome    = interaction.outcome
client.lastNote       = interaction.note

Status transition based on outcome:
  INTERESTED      → client.status = INTERESTED
  NOT_INTERESTED  → client.status = REJECTED
  NO_ANSWER       → client.status = PENDING  (stays in queue)
  BUSY            → client.status = PENDING  (stays in queue)
  INVALID_NUMBER  → client.status = INVALID_NUMBER
```

**Per created follow-up:**
```
followUp.interactionId = resolved from interactionMobileSyncId
followUp.promoterId    = from JWT
```

**Per completed follow-up:**
```
followUp.status      = COMPLETED
followUp.completedAt = from request
```

**On client reassignment (Owner action, not sync):**
```
All PENDING follow-ups for the old Promoter on this client:
  → status = CANCELLED
  → cancelledAt = now
  → cancelReason = "Client reassigned to another promoter"
```

### 3.7 Dashboard

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/api/dashboard/summary` | Admin | Per-Promoter stats: total calls, outcome counts, follow-up counts, last activity |
| GET | `/api/dashboard/promoter/:id` | Admin | Detailed stats for a single Promoter including agenda overview |

---

## 4. Authentication & Authorization

- **JWT-based** authentication for both Admin and Promoter roles.
- Token payload includes `userId`, `email`, and `role`.
- A custom `@Roles()` decorator combined with a `RolesGuard` restricts endpoints by role.
- Passwords are hashed with **bcrypt** (10 salt rounds) before storage.
- JWT expiration: configurable via `JWT_EXPIRATION` env variable.

---

## 5. Sync Strategy (Mobile → Backend)

The mobile app operates in an **offline-first** model. Data flows **one direction**: device → server.

1. **On call end**: The app sends `POST /api/sync/interactions` with the interaction, follow-up (if any), and completed follow-ups (if calling from agenda).
2. **On failure / offline**: Records are stored locally in Room DB, marked as `pending sync`.
3. **Background sync**: Android `WorkManager` retries every 15–30 minutes, sending all pending records as a batch.
4. **Deduplication**: Each interaction and follow-up carries a `mobileSyncId` (UUID generated on device). The backend's unique indexes silently reject duplicates, returning `"duplicate"` status.
5. **Processing order**: The backend processes the sync batch in order: interactions first, then follow-ups (so `interactionMobileSyncId` can be resolved), then completed follow-ups.
6. **Side effects on sync**: When records are successfully processed, the backend atomically updates related Client documents (see Sync Side Effects above).
7. **Post-sync refresh**: After a successful sync, the app re-fetches:
   - `GET /api/clients/assigned` — updated client statuses and new assignments.
   - `GET /api/follow-ups/agenda` — updated follow-up list (catches cancellations from reassignment).
8. **Conflict-free by design**: The device only creates interactions and follow-ups, never updates existing server records (except marking follow-ups as completed via `completedFollowUps`).

---

## 6. Excel Upload Flow

1. Owner uploads an `.xlsx` file via the web panel.
2. Backend parses the file using `exceljs`.
3. Minimal validation: `name` and `phone` columns must be present.
4. Known columns map to schema fields. Unknown columns go into `extraData` as key-value pairs.
5. All parsed rows are bulk-inserted as `Client` documents sharing one `uploadBatchId` (UUID).
6. All clients start in `PENDING` status with no assignment.

---

## 7. Key Design Decisions

| Decision | Rationale |
|---|---|
| Single `User` schema with `role` field | MVP simplicity — Admin and Promoter share the same model, differentiated by role |
| `mobileSyncId` unique index | Idempotent sync — retried requests are safely deduplicated without application logic |
| `extraData: Mixed` on Client | Flexible Excel support — unknown columns are preserved without schema changes |
| `uploadBatchId` on Client | Groups clients from same upload for traceability and potential rollback |
| `callAttempts` + `lastCalledAt` denormalized on Client | Avoids counting Interactions on every query. Updated atomically on sync |
| `lastOutcome` + `lastNote` denormalized on Client | Pre-Call Screen needs previous call context. Avoids N+1 queries from the mobile app |
| `durationSeconds` on Interaction | Denormalized for dashboard aggregations. Avoids computing `endedAt - startedAt` in queries |
| `disconnectCause` on Interaction | Optional field from Android TelecomManager. Useful for debugging dropped calls and network error analysis |
| Interactions in separate collection (not embedded) | Enables MongoDB aggregation pipeline for dashboard stats without `$unwind` overhead |
| FollowUp as separate collection | A client can have multiple follow-ups over time. The Promoter agenda queries across follow-ups, not clients. Same offline-first dedup pattern as Interactions |
| `interactionMobileSyncId` for linking | The device doesn't know the server ObjectId yet. The backend resolves the link after both records are synced. Handles same-batch and cross-batch scenarios |
| Cancel follow-ups on reassignment | When Owner reassigns a client, old Promoter's pending follow-ups are automatically cancelled. New Promoter manages their own agenda |
| Unified `outcome` field (no separate `callStatus`) | The Promoter selects one option. Technical call status is inferred: INTERESTED/NOT_INTERESTED imply answered; NO_ANSWER/BUSY/INVALID_NUMBER imply not answered |
| `note` as optional String | Free-text field open during the call. No note required if client didn't answer |
| `promoterId` from JWT (not request body) | Security — prevents a device from forging records on behalf of another Promoter |
| Sync response with per-item status | The app needs to know exactly which records were accepted, duplicated, or failed to update local sync state correctly |
| Single sync endpoint for all record types | Interactions, follow-ups, and completed follow-ups are sent together. Backend processes in dependency order. Simpler for the app than multiple sync calls |
| Owner has read-only follow-up access | Follow-ups are the Promoter's personal tool. Owner supervises but doesn't create or edit them. Owner CAN reassign clients which cancels follow-ups as a side effect |
| No soft deletes in MVP | Hard deletes for simplicity. Can be added later with `deletedAt` field |
| Offset-based pagination | Sufficient for expected MVP data volume |
