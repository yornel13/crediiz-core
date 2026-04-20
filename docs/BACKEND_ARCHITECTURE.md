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
├── admins/                      # Administrator account management
│   ├── admins.module.ts
│   ├── admins.controller.ts
│   ├── admins.service.ts
│   └── schemas/
│       └── admin.schema.ts
│
├── agents/                      # Agent account management (CRUD)
│   ├── agents.module.ts
│   ├── agents.controller.ts
│   ├── agents.service.ts
│   ├── schemas/
│   │   └── agent.schema.ts
│   └── dto/
│       ├── create-agent.dto.ts
│       └── update-agent.dto.ts
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
├── interactions/                # Call tracking & outcomes
│   ├── interactions.module.ts
│   ├── interactions.controller.ts
│   ├── interactions.service.ts
│   ├── schemas/
│   │   └── interaction.schema.ts
│   └── dto/
│       ├── create-interaction.dto.ts
│       └── interaction-filter.dto.ts
│
├── notes/                       # Notes management (separate collection)
│   ├── notes.module.ts
│   ├── notes.controller.ts
│   ├── notes.service.ts
│   └── schemas/
│       └── note.schema.ts
│
├── follow-ups/                  # Agent agenda & scheduled follow-ups
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
    │   ├── follow-up-status.enum.ts
    │   └── note-type.enum.ts
    ├── filters/
    │   └── http-exception.filter.ts
    └── interceptors/
        └── transform.interceptor.ts
```

---

## 2. Domain Models (MongoDB Schemas)

All schemas use Mongoose `timestamps: true` for automatic `createdAt` / `updatedAt` management.

### 2.1 Admin

Represents an Owner/Administrator account. Stored in the `admins` collection.

```
{
  _id:        ObjectId,
  name:       String, required,
  email:      String, required, unique,
  password:   String, required,              // bcrypt hashed
  isActive:   Boolean, default: true,        // deactivate without deleting
  createdAt:  Date,                          // auto (timestamps)
  updatedAt:  Date                           // auto (timestamps)
}
```

**Indexes:** `{ email: 1 }` unique.

### 2.2 Agent

Represents a field Agent account. Stored in the `agents` collection.

```
{
  _id:        ObjectId,
  name:       String, required,
  email:      String, required, unique,
  password:   String, required,              // bcrypt hashed
  isActive:   Boolean, default: true,        // deactivate without deleting
  createdAt:  Date,                          // auto (timestamps)
  updatedAt:  Date                           // auto (timestamps)
}
```

**Indexes:** `{ email: 1 }` unique.

### 2.3 Client

Represents a person to be contacted. Loaded from Excel, assigned to Agents.

```
{
  _id:            ObjectId,
  name:           String, required,
  phone:          String, required,
  status:         String, enum: ['PENDING', 'INTERESTED', 'CONVERTED',
                                 'REJECTED', 'INVALID_NUMBER', 'DO_NOT_CALL'],
                  default: 'PENDING',
  assignedTo:     ObjectId | null, ref: 'Agent',   // current Agent
  assignedAt:     Date | null,                     // when Owner assigned
  callAttempts:   Number, default: 0,              // incremented per interaction
  lastCalledAt:   Date | null,                     // timestamp of last attempt
  lastOutcome:    String | null, enum: ['INTERESTED', 'NOT_INTERESTED',
                                        'NO_ANSWER', 'BUSY', 'INVALID_NUMBER'],
                                                   // outcome of last interaction
  lastNote:       String | null,                   // content from last note (updated via updateLastNote)
  queueOrder:     Number, default: 0,              // sequence for mobile app
  extraData:      Mixed, default: {},              // dynamic Excel columns
  uploadBatchId:  String,                          // groups clients from same upload
  createdAt:      Date,                            // auto (timestamps)
  updatedAt:      Date                             // auto (timestamps)
}
```

**Why `lastOutcome` and `lastNote`?**
The mobile Pre-Call Screen shows the previous call result and note to give the Agent context before dialing. Without these denormalized fields, the app would need a second query per client to fetch the latest data (N+1 problem). `lastNote` is updated via `updateLastNote()` when a note is synced — zero extra queries for the app.

**Indexes:**
- `{ assignedTo: 1, status: 1 }` — Mobile app queries (fetch assigned + PENDING or INTERESTED).
- `{ status: 1 }` — Owner filters by status (e.g., list all INTERESTED).
- `{ uploadBatchId: 1 }` — Group/rollback by upload batch.

### 2.4 Interaction

A single call attempt by an Agent to a Client. Created on the device, synced to the backend.

```
{
  _id:              ObjectId,
  mobileSyncId:     String, required, unique,     // UUID from device (idempotency)
  clientId:         ObjectId, ref: 'Client', required,
  agentId:          ObjectId, ref: 'Agent', required,
  callStartedAt:    Date, required,
  callEndedAt:      Date, required,
  durationSeconds:  Number, required,             // denormalized for fast queries
  outcome:          String, enum: ['INTERESTED', 'NOT_INTERESTED',
                                   'NO_ANSWER', 'BUSY', 'INVALID_NUMBER'],
                    required,
  disconnectCause:  String | null,                // Android DisconnectCause (LOCAL, REMOTE,
                                                  // BUSY, ERROR, etc.) for debugging/reporting
  deviceCreatedAt:  Date, required,               // when saved on device
  createdAt:        Date,                         // auto (timestamps) = server sync time
  updatedAt:        Date                          // auto (timestamps)
}
```

**Indexes:**
- `{ mobileSyncId: 1 }` unique — Deduplication.
- `{ agentId: 1, callStartedAt: -1 }` — Dashboard: calls by Agent in date range.
- `{ clientId: 1 }` — Client call history.

### 2.5 Note

A note written by an Agent, optionally linked to an interaction. Stored in a separate `notes` collection.

```
{
  _id:              ObjectId,
  mobileSyncId:     String, required, unique,     // UUID from device (idempotency)
  clientId:         ObjectId, ref: 'Client', required,
  agentId:          ObjectId, ref: 'Agent', required,
  interactionId:    ObjectId | null, ref: 'Interaction',  // optional link to interaction
  content:          String, required,             // free-text note content
  type:             String, enum: ['CALL', 'POST_CALL', 'MANUAL', 'FOLLOW_UP'],
                    required,
  deviceCreatedAt:  Date, required,               // when saved on device
  createdAt:        Date,                         // auto (timestamps) = server sync time
  updatedAt:        Date                          // auto (timestamps)
}
```

**Why a separate collection?**
- Notes are decoupled from interactions — they can exist independently (e.g., MANUAL notes not tied to any call).
- The `type` enum (NoteType) allows categorizing notes: CALL (during call), POST_CALL (after call), MANUAL (standalone), FOLLOW_UP (tied to follow-up context).
- `Client.lastNote` is updated via `updateLastNote()` when a note is synced.
- Follows the same offline-first pattern as Interactions (`mobileSyncId` for dedup).

**Indexes:**
- `{ mobileSyncId: 1 }` unique — Deduplication.
- `{ clientId: 1 }` — Notes history for a client.
- `{ agentId: 1 }` — Notes by Agent.

### 2.6 FollowUp

A scheduled follow-up created by the Agent when a client shows interest. Represents a future call commitment in the Agent's personal agenda.

```
{
  _id:            ObjectId,
  mobileSyncId:   String, required, unique,       // UUID from device (idempotency)
  clientId:       ObjectId, ref: 'Client', required,
  agentId:        ObjectId, ref: 'Agent', required,
  interactionId:  ObjectId | null, ref: 'Interaction',  // the interaction that originated
                                                        // this follow-up (linked after sync)
  scheduledAt:    Date, required,                 // when to call back (date + time)
  reason:         String, required,               // why: "Wants loan rates", "Call back Thursday"
  status:         String, enum: ['PENDING', 'COMPLETED', 'CANCELLED'],
                  default: 'PENDING',
  completedAt:    Date | null,                    // when Agent completed the follow-up call
  cancelledAt:    Date | null,                    // when cancelled (e.g., client reassigned)
  cancelReason:   String | null,                  // why cancelled (e.g., "Client reassigned to
                                                  // another agent")
  deviceCreatedAt: Date, required,                // when saved on device
  createdAt:      Date,                           // auto (timestamps) = server sync time
  updatedAt:      Date                            // auto (timestamps)
}
```

**Why a separate collection?**
- A client can have multiple follow-ups over time (reschedules, different campaigns).
- The Agent's agenda is a query across follow-ups, not across clients — it needs its own indexed collection.
- Follows the same offline-first pattern as Interactions (`mobileSyncId` for dedup).

**Indexes:**
- `{ mobileSyncId: 1 }` unique — Deduplication.
- `{ agentId: 1, scheduledAt: 1, status: 1 }` — Agenda queries: "my pending follow-ups ordered by date".
- `{ clientId: 1 }` — Follow-up history for a client.
- `{ status: 1, scheduledAt: 1 }` — Owner: all pending follow-ups across Agents.

---

## 3. API Endpoints

### 3.1 Auth

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/api/auth/login` | Public | Authenticate user, return JWT |

### 3.2 Admins

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/api/admins` | Admin | List all administrator accounts |

### 3.3 Agents (Agent Management)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/api/agents` | Admin | Create an Agent account |
| GET | `/api/agents` | Admin | List all Agents |
| GET | `/api/agents/:id` | Admin | Get Agent details |
| PATCH | `/api/agents/:id` | Admin | Update Agent (name, isActive, etc.) |

### 3.4 Clients

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/api/clients/upload` | Admin | Upload Excel file, bulk insert clients |
| GET | `/api/clients` | Admin | List clients with filters (status, assignedTo, uploadBatchId) |
| GET | `/api/clients/interested` | Admin | List INTERESTED clients (all or by Agent via `?agentId=`) |
| PATCH | `/api/clients/assign` | Admin | Assign/reassign clients to an Agent. If reassigning, cancels existing PENDING follow-ups for the old Agent |
| PATCH | `/api/clients/:id/status` | Admin | Manually change client status (e.g., DO_NOT_CALL, CONVERTED) |
| GET | `/api/clients/assigned` | Agent | Get own assigned clients. Supports `?status=PENDING` (default) or `?status=INTERESTED`. Filtered by JWT user. Ordered by `queueOrder` |

### 3.5 Interactions

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/api/interactions` | Admin | List interactions with filters (agent, client, date, outcome) |
| GET | `/api/interactions/client/:id` | Admin | Full interaction history for a client |

### 3.6 Notes

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/api/notes/client/:id` | Admin | All notes for a specific client |
| GET | `/api/notes/agent/:id` | Admin | All notes by a specific Agent |

### 3.7 Follow-Ups

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/api/follow-ups` | Admin | List all follow-ups with filters (agentId, status, date range). Owner supervision view |
| GET | `/api/follow-ups/agent/:id` | Admin | All follow-ups for a specific Agent |
| GET | `/api/follow-ups/client/:id` | Admin | Follow-up history for a specific client |
| GET | `/api/follow-ups/agenda` | Agent | Own pending follow-ups ordered by `scheduledAt`. The Agent's personal agenda. Supports `?from=` and `?to=` date filters |

### 3.8 Sync (Mobile)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/api/sync/interactions` | Agent | Batch sync interactions + notes + follow-ups from device. Returns per-item status |

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
      "disconnectCause": "REMOTE",
      "deviceCreatedAt": "2026-04-08T10:33:50Z"
    }
  ],
  "notes": [
    {
      "mobileSyncId": "uuid-note-1",
      "clientId": "mongo-object-id",
      "interactionId": "mongo-object-id-or-null",
      "content": "Client wants info about personal loan rates...",
      "type": "CALL",
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

> `agentId` is NOT sent in the body — it is extracted from the JWT token server-side.

**`interactionMobileSyncId`**: Links the follow-up to the interaction that originated it. The backend resolves this to `interactionId` (ObjectId) after the interaction is inserted. If the interaction is in the same batch, it's resolved in order. If it was synced previously, the backend looks it up by `mobileSyncId`.

**`completedFollowUps`**: When an Agent calls back a follow-up client and saves the outcome, the original follow-up is marked as COMPLETED. The device sends the `mobileSyncId` of the completed follow-up along with the timestamp.

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
  "notes": {
    "results": [
      { "mobileSyncId": "uuid-n1", "status": "created" },
      { "mobileSyncId": "uuid-n2", "status": "duplicate" }
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

Status transition based on outcome:
  INTERESTED      → client.status = INTERESTED
  NOT_INTERESTED  → client.status = REJECTED
  NO_ANSWER       → client.status = PENDING  (stays in queue)
  BUSY            → client.status = PENDING  (stays in queue)
  INVALID_NUMBER  → client.status = INVALID_NUMBER
```

**Per created note:**
```
client.lastNote = note.content  (via updateLastNote)
```

**Per created follow-up:**
```
followUp.interactionId = resolved from interactionMobileSyncId
followUp.agentId       = from JWT
```

**Per completed follow-up:**
```
followUp.status      = COMPLETED
followUp.completedAt = from request
```

**On client reassignment (Owner action, not sync):**
```
All PENDING follow-ups for the old Agent on this client:
  → status = CANCELLED
  → cancelledAt = now
  → cancelReason = "Client reassigned to another agent"
```

### 3.9 Dashboard

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/api/dashboard/summary` | Admin | Per-Agent stats: total calls, outcome counts (answered, notAnswered), avg call duration, unique clients contacted, follow-up counts, last activity. Supports `?from=` and `?to=` query params for date filtering |
| GET | `/api/dashboard/agent/:id` | Admin | Detailed stats for a single Agent with dedicated aggregation queries. Supports `?from=` and `?to=` query params for date filtering |

---

## 4. Authentication & Authorization

- **JWT-based** authentication for both Admin and Agent roles.
- Token payload includes `userId`, `email`, and `role`.
- A custom `@Roles()` decorator combined with a `RolesGuard` restricts endpoints by role.
- AuthService searches in the `admins` collection first, then the `agents` collection. The role is determined by which collection the user was found in (no `role` field stored in schemas).
- AuthModule imports `AdminsModule` + `AgentsModule`.
- Passwords are hashed with **bcrypt** (10 salt rounds) before storage.
- JWT expiration: configurable via `JWT_EXPIRATION` env variable.

---

## 5. Sync Strategy (Mobile → Backend)

The mobile app operates in an **offline-first** model. Data flows **one direction**: device → server.

1. **On call end**: The app sends `POST /api/sync/interactions` with the interaction, notes, follow-up (if any), and completed follow-ups (if calling from agenda).
2. **On failure / offline**: Records are stored locally in Room DB, marked as `pending sync`.
3. **Background sync**: Android `WorkManager` retries every 15–30 minutes, sending all pending records as a batch.
4. **Deduplication**: Each interaction, note, and follow-up carries a `mobileSyncId` (UUID generated on device). The backend's unique indexes silently reject duplicates, returning `"duplicate"` status.
5. **Processing order**: The backend processes the sync batch in order: interactions first, then notes, then follow-ups (so `interactionMobileSyncId` can be resolved), then completed follow-ups.
6. **Side effects on sync**: When records are successfully processed, the backend atomically updates related Client documents (see Sync Side Effects above).
7. **Post-sync refresh**: After a successful sync, the app re-fetches:
   - `GET /api/clients/assigned` — updated client statuses and new assignments.
   - `GET /api/follow-ups/agenda` — updated follow-up list (catches cancellations from reassignment).
8. **Conflict-free by design**: The device only creates interactions, notes, and follow-ups, never updates existing server records (except marking follow-ups as completed via `completedFollowUps`).

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
| Separate `Admin` and `Agent` schemas (two collections) | Clear separation of concerns — Admin and Agent have independent schemas, services, and controllers. Role is determined by which collection the user is found in during authentication |
| `mobileSyncId` unique index | Idempotent sync — retried requests are safely deduplicated without application logic |
| `extraData: Mixed` on Client | Flexible Excel support — unknown columns are preserved without schema changes |
| `uploadBatchId` on Client | Groups clients from same upload for traceability and potential rollback |
| `callAttempts` + `lastCalledAt` denormalized on Client | Avoids counting Interactions on every query. Updated atomically on sync |
| `lastOutcome` + `lastNote` denormalized on Client | Pre-Call Screen needs previous call context. `lastNote` updated via `updateLastNote()`. Avoids N+1 queries from the mobile app |
| `durationSeconds` on Interaction | Denormalized for dashboard aggregations. Avoids computing `endedAt - startedAt` in queries |
| `disconnectCause` on Interaction | Optional field from Android TelecomManager. Useful for debugging dropped calls and network error analysis |
| Notes in separate collection | Decoupled from interactions — supports CALL, POST_CALL, MANUAL, and FOLLOW_UP note types independently. Same offline-first dedup pattern |
| Interactions in separate collection (not embedded) | Enables MongoDB aggregation pipeline for dashboard stats without `$unwind` overhead |
| FollowUp as separate collection | A client can have multiple follow-ups over time. The Agent agenda queries across follow-ups, not clients. Same offline-first dedup pattern as Interactions |
| `interactionMobileSyncId` for linking | The device doesn't know the server ObjectId yet. The backend resolves the link after both records are synced. Handles same-batch and cross-batch scenarios |
| Cancel follow-ups on reassignment | When Owner reassigns a client, old Agent's pending follow-ups are automatically cancelled. New Agent manages their own agenda |
| Unified `outcome` field (no separate `callStatus`) | The Agent selects one option. Technical call status is inferred: INTERESTED/NOT_INTERESTED imply answered; NO_ANSWER/BUSY/INVALID_NUMBER imply not answered |
| `agentId` from JWT (not request body) | Security — prevents a device from forging records on behalf of another Agent |
| Sync response with per-item status | The app needs to know exactly which records were accepted, duplicated, or failed to update local sync state correctly |
| Single sync endpoint for all record types | Interactions, notes, follow-ups, and completed follow-ups are sent together. Backend processes in dependency order. Simpler for the app than multiple sync calls |
| Owner has read-only follow-up access | Follow-ups are the Agent's personal tool. Owner supervises but doesn't create or edit them. Owner CAN reassign clients which cancels follow-ups as a side effect |
| Dashboard with date filtering | `?from=` and `?to=` query params enable daily/weekly/monthly reports. `getAgentDetail()` uses dedicated aggregation queries |
| No soft deletes in MVP | Hard deletes for simplicity. Can be added later with `deletedAt` field |
| Offset-based pagination | Sufficient for expected MVP data volume |
