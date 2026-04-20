# Panama Calls CRM — Data Flow & User Journeys

## 1. Owner: Client Upload & Assignment

```
┌──────────────────────────────────────────────────────────────┐
│                     OWNER PANEL (Web)                         │
│                                                              │
│  1. Owner logs in (POST /api/auth/login)                     │
│         │                                                    │
│         ▼                                                    │
│  2. Uploads Excel file (POST /api/clients/upload)            │
│         │                                                    │
│         ▼                                                    │
│  ┌────────────────────────────────┐                          │
│  │  Upload Service                │                          │
│  │  - Parse .xlsx with exceljs    │                          │
│  │  - Map known columns to fields │                          │
│  │  - Store unknown cols in       │                          │
│  │    extraData                   │                          │
│  │  - Generate uploadBatchId      │                          │
│  │  - Bulk insert Clients         │                          │
│  │    (status: PENDING)           │                          │
│  └──────────────┬─────────────────┘                          │
│                 │                                            │
│                 ▼                                            │
│  3. Owner views client list (GET /api/clients)               │
│         │                                                    │
│         ▼                                                    │
│  4. Owner selects clients → assigns to Agent                 │
│     (PATCH /api/clients/assign)                              │
│         │                                                    │
│         ▼                                                    │
│  ┌────────────────────────────────┐                          │
│  │  Client Service                │                          │
│  │  - Set assignedTo = agentId    │                          │
│  │  - Set assignedAt = now        │                          │
│  │  - Set queueOrder per client   │                          │
│  └────────────────────────────────┘                          │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Agent: Call Flow — Pending Client (Online)

```
┌──────────────────────────────────────────────────────────────┐
│                    MOBILE APP (Android)                       │
│                                                              │
│  1. Agent logs in (POST /api/auth/login)                     │
│         │                                                    │
│         ▼                                                    │
│  2. App fetches assigned clients + agenda                    │
│     (GET /api/clients/assigned?status=PENDING)               │
│     (GET /api/follow-ups/agenda)                             │
│         │                                                    │
│         ▼                                                    │
│  3. App shows FIRST client in queue                          │
│     (name, phone, extraData, callAttempts, lastOutcome)      │
│         │                                                    │
│         ▼                                                    │
│  4. Agent taps "Call" button                                 │
│     ┌─────────────────────────────┐                          │
│     │ - Generate mobileSyncId     │                          │
│     │ - Record callStartedAt      │                          │
│     │ - Launch native dialer      │                          │
│     └─────────────┬───────────────┘                          │
│                   │                                          │
│          (Agent can open Notes and type during call)          │
│                   │                                          │
│                   ▼                                          │
│  5. Call ends                                                │
│     ┌─────────────────────────────┐                          │
│     │ - Record callEndedAt        │                          │
│     │ - Calculate durationSeconds │                          │
│     │ - Capture disconnectCause   │                          │
│     │ - Close note                │                          │
│     │ - Show outcome selector     │                          │
│     └─────────────┬───────────────┘                          │
│                   │                                          │
│         ┌─────────┴──────────────────┐                       │
│         │                            │                       │
│    Outcome ≠ INTERESTED        Outcome = INTERESTED          │
│         │                            │                       │
│         ▼                            ▼                       │
│    Save & Next              Show follow-up form:             │
│                              [ Date picker ]                 │
│                              [ Time picker ]                 │
│                              [ Reason: ________ ]            │
│                                      │                       │
│                                      ▼                       │
│                              Save interaction                │
│                              + Save note                     │
│                              + Save follow-up                │
│                              + Advance to next               │
│                                                              │
│  6. App syncs (POST /api/sync/interactions)                  │
│         │                                                    │
│         ▼                                                    │
│  7. App auto-advances to NEXT client in queue                │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. Agent: Call Flow — Follow-Up Client (from Agenda)

```
┌──────────────────────────────────────────────────────────────┐
│                    MOBILE APP (Android)                       │
│                                                              │
│  1. Agent opens Agenda tab                                   │
│     Shows follow-ups grouped: Today, Tomorrow, This Week     │
│         │                                                    │
│         ▼                                                    │
│  2. Taps a follow-up entry (or starts auto-call for today)   │
│     Pre-Call shows: client info + follow-up reason            │
│         │                                                    │
│         ▼                                                    │
│  3. Agent taps "Call" → same call flow as above              │
│         │                                                    │
│         ▼                                                    │
│  4. Call ends → Post-Call Screen                             │
│         │                                                    │
│         ├── Outcome = INTERESTED                             │
│         │   → Schedule NEW follow-up (reschedule)            │
│         │   → Original follow-up marked COMPLETED            │
│         │                                                    │
│         ├── Outcome = NOT_INTERESTED                         │
│         │   → Client → REJECTED                              │
│         │   → Follow-up marked COMPLETED                     │
│         │                                                    │
│         └── Outcome = NO_ANSWER / BUSY                       │
│             → Client stays INTERESTED                        │
│             → Follow-up stays PENDING (not yet completed)    │
│             → Agent can reschedule or try later              │
│                                                              │
│  5. Sync: interaction + notes + new follow-up (if any)       │
│           + completed follow-up (if applicable)              │
└──────────────────────────────────────────────────────────────┘
```

---

## 4. Agent: Offline Sync Flow

```
┌──────────────────────────────────────────────────────────────┐
│                      OFFLINE SCENARIO                        │
│                                                              │
│  Agent makes calls without internet.                         │
│  The call flow works identically — all data saved locally.    │
│         │                                                    │
│         ▼                                                    │
│  ┌────────────────────────────────┐                          │
│  │  Local DB (Room)               │                          │
│  │  - InteractionEntity (PENDING) │                          │
│  │  - NoteEntity (PENDING)        │                          │
│  │  - FollowUpEntity (PENDING)    │                          │
│  │  - CompletedFollowUp (PENDING) │                          │
│  └──────────────┬─────────────────┘                          │
│                 │                                            │
│       ┌─────────┴────────────────────┐                       │
│       │                              │                       │
│       ▼                              ▼                       │
│  Immediate Retry               WorkManager Job               │
│  (on call end, if                (every 15-30 min,           │
│   network available)              or on connectivity)        │
│       │                              │                       │
│       └─────────┬────────────────────┘                       │
│                 │                                            │
│                 ▼                                            │
│  POST /api/sync/interactions                                 │
│  Body: {                                                     │
│    interactions: [...],                                      │
│    notes: [...],                                             │
│    followUps: [...],                                         │
│    completedFollowUps: [...]                                 │
│  }                                                           │
│                 │                                            │
│                 ▼                                            │
│  ┌────────────────────────────────────────┐                  │
│  │  Backend: Sync Service                 │                  │
│  │  Processing order:                     │                  │
│  │  1. Insert interactions (dedup)        │                  │
│  │     → Update client fields             │                  │
│  │  2. Insert notes (dedup)               │                  │
│  │     → Update client.lastNote           │                  │
│  │  3. Insert follow-ups (dedup)          │                  │
│  │     → Resolve interactionMobileSyncId  │                  │
│  │  4. Complete follow-ups                │                  │
│  │     → Mark COMPLETED with timestamp    │                  │
│  │  5. Return per-item results            │                  │
│  └────────────────────────────────────────┘                  │
│                 │                                            │
│                 ▼                                            │
│  App marks synced records as SYNCED locally                   │
│  App re-fetches clients + agenda from server                 │
└──────────────────────────────────────────────────────────────┘
```

---

## 5. Backend: Sync Side Effects

```
┌────────────────────────────────────────────────────────────┐
│  PER CREATED INTERACTION:                                  │
│                                                            │
│  ALWAYS:                                                   │
│    client.callAttempts++                                   │
│    client.lastCalledAt = interaction.callStartedAt         │
│    client.lastOutcome  = interaction.outcome               │
│                                                            │
│  STATUS TRANSITION:                                        │
│    outcome = INTERESTED      → client.status = INTERESTED  │
│    outcome = NOT_INTERESTED  → client.status = REJECTED    │
│    outcome = NO_ANSWER       → client.status = PENDING     │
│    outcome = BUSY            → client.status = PENDING     │
│    outcome = INVALID_NUMBER  → client.status = INVALID_NUM │
├────────────────────────────────────────────────────────────┤
│  PER CREATED NOTE:                                         │
│                                                            │
│    client.lastNote = note.content  (via updateLastNote)    │
├────────────────────────────────────────────────────────────┤
│  PER CREATED FOLLOW-UP:                                    │
│                                                            │
│    followUp.agentId       = from JWT                       │
│    followUp.interactionId = resolved from                  │
│                             interactionMobileSyncId        │
├────────────────────────────────────────────────────────────┤
│  PER COMPLETED FOLLOW-UP:                                  │
│                                                            │
│    followUp.status      = COMPLETED                        │
│    followUp.completedAt = from request                     │
├────────────────────────────────────────────────────────────┤
│  ON CLIENT REASSIGNMENT (Owner action):                    │
│                                                            │
│    All PENDING follow-ups for old Agent on this client:    │
│      → status = CANCELLED                                  │
│      → cancelledAt = now                                   │
│      → cancelReason = "Client reassigned"                  │
└────────────────────────────────────────────────────────────┘
```

---

## 6. Owner: Follow-Up Supervision

```
┌──────────────────────────────────────────────────────────────┐
│                     OWNER PANEL (Web)                         │
│                                                              │
│  1. Owner views follow-ups                                   │
│     (GET /api/follow-ups?agentId=optional&status=PENDING)    │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────────────────────────────────────┐            │
│  │  Follow-Up List (read-only)                  │            │
│  │                                              │            │
│  │  Agent       Client         Scheduled    St  │            │
│  │  ─────────── ────────────── ─────────── ──── │            │
│  │  Juan Pérez  María González Apr 10 2pm  PEND │            │
│  │  Juan Pérez  Pedro López    Apr 11 10am PEND │            │
│  │  Ana Ruiz    Luis Herrera   Apr 10 4pm  COMP │            │
│  │                                              │            │
│  │  Filters: [Agent ▼] [Status ▼] [Date ▼]     │            │
│  └──────────────────────────────────────────────┘            │
│                                                              │
│  2. Owner can reassign a client to another Agent             │
│     (PATCH /api/clients/assign)                              │
│     → Old Agent's PENDING follow-ups for this client         │
│       are automatically CANCELLED                            │
│     → New Agent manages their own agenda                     │
│                                                              │
│  3. Owner can mark client as CONVERTED                       │
│     (PATCH /api/clients/:id/status)                          │
│     → Client status = CONVERTED                              │
└──────────────────────────────────────────────────────────────┘
```

---

## 7. Owner: Dashboard

```
┌──────────────────────────────────────────────────────────────┐
│  GET /api/dashboard/summary?from=2026-04-01&to=2026-04-08   │
│                                                              │
│  Response:                                                   │
│  {                                                           │
│    agents: [                                                 │
│      {                                                       │
│        agentId: "...",                                       │
│        name: "Juan Pérez",                                   │
│        totalCalls: 85,                                       │
│        answered: 42,                                         │
│        notAnswered: 43,                                      │
│        avgCallDurationSeconds: 145,                          │
│        uniqueClientsContacted: 60,                           │
│        outcomes: {                                           │
│          interested: 12,                                     │
│          notInterested: 30,                                  │
│          noAnswer: 35,                                       │
│          busy: 5,                                            │
│          invalidNumber: 3                                    │
│        },                                                    │
│        followUps: {                                          │
│          pending: 8,                                         │
│          completed: 4,                                       │
│          cancelled: 1                                        │
│        },                                                    │
│        lastActivity: "2026-04-08T14:30:00Z"                  │
│      },                                                      │
│      ...                                                     │
│    ],                                                        │
│    totals: {                                                 │
│      totalClients: 500,                                      │
│      pending: 200,                                           │
│      interested: 45,                                         │
│      converted: 10,                                          │
│      rejected: 180,                                          │
│      invalidNumber: 15,                                      │
│      pendingFollowUps: 30                                    │
│    }                                                         │
│  }                                                           │
└──────────────────────────────────────────────────────────────┘
```

---

## 8. Entity Relationships

```
┌──────────────┐         ┌──────────────────┐         ┌─────────────────┐
│              │   1:N   │                  │   1:N   │                 │
│    Agent     │◄────────│     Client       │◄────────│  Interaction    │
│              │         │                  │         │                 │
│              │         │  assignedTo ─────┼──► Agent│  clientId ──────┼──► Client
│              │         │  status          │         │  agentId ───────┼──► Agent
│              │         │  callAttempts    │         │  outcome        │
│              │         │  lastOutcome     │         │  mobileSyncId   │
│              │         │  lastNote        │         │  disconnectCause│
│              │         │  extraData       │         │                 │
│              │         │  uploadBatchId   │         │                 │
└──────┬───────┘         └────────┬─────────┘         └────────┬────────┘
       │                          │                            │
       │                          │  1:N                       │ 0..1
       │                          │                            │
       │                          ▼                            ▼
       │                   ┌─────────────────┐         ┌─────────────────┐
       │             1:N   │    FollowUp     │         │      Note       │
       ├──────────────────►│                 │         │                 │
       │                   │  clientId ──────┼──► Client│  clientId ─────┼──► Client
       │                   │  agentId ───────┼──► Agent │  agentId ──────┼──► Agent
       │                   │  interactionId ─┼──► Inter.│  interactionId ┼──► Inter.
       │                   │  scheduledAt    │         │  content        │
       │             1:N   │  reason         │         │  type           │
       └──────────────────►│  status         │         │  mobileSyncId   │
                           │  mobileSyncId   │         └─────────────────┘
                           └─────────────────┘

┌──────────────┐
│    Admin     │  Separate collection for administrators
│              │  (authenticated independently)
└──────────────┘

One Agent     ──── has many ────  Clients assigned
One Client    ──── has many ────  Interactions (call history)
One Client    ──── has many ────  Notes (note history)
One Client    ──── has many ────  FollowUps (scheduled callbacks)
One Agent     ──── has many ────  Interactions (calls made)
One Agent     ──── has many ────  Notes (notes written)
One Agent     ──── has many ────  FollowUps (personal agenda)
One Interaction ── can have ────  many Notes (CALL, POST_CALL types)
One Interaction ── can have ────  one FollowUp (if outcome = INTERESTED)
One FollowUp  ──── links to ────  one Interaction (that originated it)
```
