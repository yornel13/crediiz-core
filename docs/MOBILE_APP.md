# Panama Calls CRM — Mobile App Specification

## 1. Platform & Distribution

| Attribute | Value |
|---|---|
| **Platform** | Android Native |
| **Language** | Kotlin |
| **UI Framework** | Jetpack Compose |
| **Target Devices** | Samsung Tablets |
| **Distribution** | Sideloaded APK (not published to Play Store) |
| **App Role** | Default phone/dialer app (replaces stock dialer) |
| **Min SDK** | API 30 (Android 11) |

### 1.1 Why Default Dialer

The app replaces the device's default phone app. This gives it:

- Full control over incoming/outgoing call UI.
- Access to call state events (ringing, connected, disconnected, error).
- Ability to show custom in-call screens with client data, timer, and notes.
- No need to switch between apps during the call flow.

---

## 2. Required Permissions

| Permission | Purpose |
|---|---|
| `CALL_PHONE` | Initiate outgoing calls programmatically |
| `READ_PHONE_STATE` | Detect call state changes (ringing, active, ended, error) |
| `READ_CALL_LOG` | Access call duration and outcome after call ends |
| `MANAGE_OWN_CALLS` | Required for default dialer role |
| `ROLE_DIALER` | Register as the default phone app |
| `INTERNET` | API communication and sync |
| `ACCESS_NETWORK_STATE` | Check connectivity for sync decisions |
| `RECEIVE_BOOT_COMPLETED` | Re-schedule WorkManager sync after device reboot |
| `POST_NOTIFICATIONS` | Show sync status and follow-up reminder notifications |
| `FOREGROUND_SERVICE` | Keep call tracking alive during active calls |
| `SCHEDULE_EXACT_ALARM` | Schedule follow-up reminder notifications at exact times |

> **Accessibility permissions are NOT required.** The default dialer role + TelecomManager API provide everything needed.

---

## 3. App Architecture

```
┌─────────────────────────────────────────────────┐
│                  Presentation                    │
│  (Jetpack Compose screens + ViewModels)          │
├─────────────────────────────────────────────────┤
│                  Domain                          │
│  (Use cases, business rules)                     │
├─────────────────────────────────────────────────┤
│                  Data                            │
│  ┌──────────────┐    ┌────────────────────┐     │
│  │  Remote API   │    │  Local DB (Room)   │     │
│  │  (Retrofit)   │    │  (offline store)   │     │
│  └──────────────┘    └────────────────────┘     │
├─────────────────────────────────────────────────┤
│              Telecom / Call Engine                │
│  (ConnectionService, InCallService, CallManager) │
├─────────────────────────────────────────────────┤
│              Notifications                       │
│  (AlarmManager for follow-up reminders)          │
└─────────────────────────────────────────────────┘
```

### 3.1 Key Libraries

| Library | Purpose |
|---|---|
| **Retrofit + OkHttp** | API communication |
| **Room** | Local SQLite persistence |
| **WorkManager** | Background sync scheduling |
| **Hilt** | Dependency injection |
| **Jetpack Compose** | UI |
| **TelecomManager** | Default dialer integration |
| **ConnectionService** | Call management and state tracking |
| **AlarmManager** | Exact-time follow-up reminders |

---

## 4. Screen Map

```
┌──────────────┐
│    Login     │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   Main Hub   │  ← Bottom navigation (3 tabs)
├──────────────┤
│              │
│  ┌────────┐  │
│  │Pending │  │  ← Assigned clients (PENDING)
│  │Clients │  │     with search bar + auto-call FAB
│  └────────┘  │
│              │
│  ┌────────┐  │
│  │ Agenda │  │  ← Scheduled follow-ups grouped by date
│  │        │  │     (Today, Tomorrow, This Week, Later)
│  └────────┘  │
│              │
│  ┌────────┐  │
│  │Settings│  │  ← Auto-call config, account, sync status
│  └────────┘  │
│              │
└──────┬───────┘
       │
       │  (tap client/follow-up or start auto-call)
       ▼
┌──────────────┐
│  Pre-Call    │  ← Client info + call history + follow-up
│  Screen      │     reason (if from agenda) + "Call" button
└──────┬───────┘
       │
       │  (call initiated)
       ▼
┌──────────────┐
│  In-Call     │  ← Timer, client info, "Notes" button,
│  Screen      │     call status indicator
└──────┬───────┘
       │
       │  (call ends)
       ▼
┌──────────────┐
│  Post-Call   │  ← Outcome selector + note review
│  Screen      │     + follow-up scheduling (if INTERESTED)
│              │     + "Save & Next" button
└──────────────┘
```

---

## 5. Screen Details

### 5.1 Login Screen

- Email + password fields.
- "Login" button → `POST /api/auth/login`.
- JWT stored in encrypted SharedPreferences.
- On success: fetch assigned clients + agenda, store in Room, navigate to Main Hub.
- On failure: show error message.

### 5.2 Main Hub — Pending Clients Tab

- **List** of assigned clients with status `PENDING`.
- Each item shows: name, phone, callAttempts count, lastCalledAt.
- **Search bar** at top: filter by name or phone number (local filter on Room data).
- **"Start Auto-Call" FAB** (floating action button): enters auto-call mode, starts dialing the first PENDING client in queue order.
- **Tap on client**: navigate to Pre-Call Screen for that specific client.

### 5.3 Main Hub — Agenda Tab

The Agent's personal follow-up schedule. Replaces the old "Follow-Up List" concept.

- **Grouped by date**: Today, Tomorrow, This Week, Later.
- Each entry shows:
  - Client name and phone.
  - Scheduled time (e.g., "2:00 PM").
  - Reason preview (e.g., "Wants loan rates...").
  - Status badge (PENDING / COMPLETED).
- **"Start Auto-Call" button** (for Today's entries): enters auto-call mode for today's pending follow-ups only.
- **Tap on entry**: navigate to Pre-Call Screen for that client (with follow-up reason visible).
- **Badge on Agenda tab**: shows count of today's pending follow-ups.
- **Data source**: Room DB, refreshed from `GET /api/follow-ups/agenda` after each sync.

### 5.4 Main Hub — Settings Tab

- **Auto-call behavior toggle**:
  - `Auto-advance`: After a NO_ANSWER/BUSY outcome, auto-dial next client after 5-second countdown.
  - `Manual-advance`: After any outcome, show next client and wait for Agent to tap "Call".
- **Account info**: Agent name, email (read-only).
- **Sync status**: Last sync timestamp, number of pending interactions + notes + follow-ups.
- **Force sync button**: Manually trigger sync of all pending data.

### 5.5 Pre-Call Screen

Shown before dialing. Gives the Agent context about the client.

- **Client info card**: name, phone, extraData fields (company, address, etc.).
- **Call history**: number of previous attempts, last outcome, last note (from denormalized Client fields).
- **Follow-up context** (if coming from Agenda): reason and scheduled time highlighted at the top.
- **"Call" button**: initiates the call.
- **"Skip" button**: skip this client (stays in queue, no interaction recorded).
- **"Back" button**: return to list.

### 5.6 In-Call Screen

The custom dialer UI shown during an active call. Since the app is the default dialer, this screen replaces the stock call UI.

```
┌─────────────────────────────────┐
│  ● CONNECTED       00:03:45    │  ← Status + live timer
│─────────────────────────────────│
│                                 │
│  Client: María González         │
│  Phone:  +507 6XXX-XXXX        │
│  Company: Seguros ABC           │
│                                 │
│─────────────────────────────────│
│                                 │
│  [ Mute ]  [ Speaker ]         │
│                                 │
│         [ Notes ]               │  ← Opens note overlay
│                                 │
│      [ End Call ]               │
│                                 │
└─────────────────────────────────┘
```

**Call status indicators:**

| Status | Display |
|---|---|
| Dialing | "DIALING..." + animated indicator |
| Ringing | "RINGING..." |
| Connected | "CONNECTED" + green dot + running timer |
| On Hold | "ON HOLD" + yellow dot |
| Disconnected | Transition to Post-Call Screen |
| Error/Failed | "CALL FAILED" + auto-transition to Post-Call with pre-selected outcome |

**Notes overlay** (tap "Notes" button to open):

- Full-screen text field overlay on top of the call screen.
- The call timer remains visible at the top.
- Free-text input — the Agent types observations while talking.
- "Close" button hides the overlay (note content is preserved, not lost).
- The note stays in memory until saved in Post-Call Screen.

### 5.7 Post-Call Screen

Shown immediately after the call ends (detected via ConnectionService state change).

```
┌─────────────────────────────────┐
│  Call Ended                     │
│  Duration: 00:03:45             │
│─────────────────────────────────│
│                                 │
│  Client: María González         │
│  Phone:  +507 6XXX-XXXX        │
│                                 │
│─────────────────────────────────│
│  Note:                          │
│  ┌─────────────────────────────┐│
│  │ Client wants info about     ││  ← Editable, pre-filled
│  │ personal loan rates. Has    ││     from in-call note
│  │ salary of $2,500...         ││
│  └─────────────────────────────┘│
│─────────────────────────────────│
│  How did it go?                 │
│                                 │
│  [ Interested ]                 │
│  [ Not Interested ]             │
│  [ No Answer ]                  │
│  [ Busy ]                       │
│  [ Invalid Number ]             │
│─────────────────────────────────│
│                                 │  ← ONLY visible when
│  Schedule follow-up:            │     "Interested" is selected
│  [ Apr 10, 2026 ]  [ 2:00 PM ] │
│  Reason: [ Wants loan rates  ] │
│                                 │
│─────────────────────────────────│
│                                 │
│       [ Save & Next → ]         │
│                                 │
└─────────────────────────────────┘
```

- **Note field**: pre-filled with whatever was typed during the call. Still editable.
- **Outcome selector**: exactly one must be selected before saving.
- **Follow-up section**: appears ONLY when "Interested" is selected. Date, time, and reason are required.
- **"Save & Next"**: saves interaction + note + follow-up locally → attempts sync → shows next client.
- If **call failed due to network error**: the outcome `NO_ANSWER` is pre-selected but the Agent can change it.
- If **calling from Agenda** (follow-up call): the original follow-up is marked as COMPLETED on save. If Interested again, a NEW follow-up is created (reschedule).

---

## 6. Auto-Call Mode Flow

Auto-call mode processes clients sequentially without returning to the list. Works for both Pending Clients and Agenda (today's follow-ups).

```
┌──────────────────────────────────────────────────────────┐
│  ENTER AUTO-CALL MODE                                    │
│  (from Pending Clients tab or Agenda tab)                 │
│                                                          │
│  1. Show Pre-Call Screen (first client in queue)          │
│         │                                                │
│         │  Agent taps "Call" (or auto-dials               │
│         │  if continuing in auto-advance mode)            │
│         ▼                                                │
│  2. In-Call Screen                                       │
│     - Timer running                                      │
│     - Agent can open Notes overlay                       │
│         │                                                │
│         │  Call ends (any reason)                         │
│         ▼                                                │
│  3. Post-Call Screen                                     │
│     - Review/edit note                                   │
│     - Select outcome                                     │
│     - Schedule follow-up (if Interested)                 │
│     - Tap "Save & Next"                                  │
│         │                                                │
│         ├── Interaction saved locally                     │
│         ├── Note saved locally                            │
│         ├── Follow-up saved locally (if applicable)       │
│         ├── Sync attempted                               │
│         │                                                │
│         ▼                                                │
│  4. NEXT CLIENT                                          │
│     ┌─────────────────────────────────────┐              │
│     │  If auto-advance ON:                │              │
│     │    If outcome was NO_ANSWER/BUSY:   │              │
│     │      Show 5s countdown → auto-dial  │              │
│     │    If outcome was other:            │              │
│     │      Show Pre-Call Screen → wait    │              │
│     │                                     │              │
│     │  If auto-advance OFF:               │              │
│     │    Always show Pre-Call Screen      │              │
│     │    Wait for Agent to tap "Call"     │              │
│     └─────────────────────────────────────┘              │
│         │                                                │
│         ▼                                                │
│  5. Repeat from step 2                                   │
│                                                          │
│  EXIT: Agent taps "Exit Auto-Call" at any point          │
│  (available on Pre-Call and Post-Call screens)            │
│                                                          │
│  END: No more clients in queue → show summary +          │
│       return to Main Hub                                 │
└──────────────────────────────────────────────────────────┘
```

### 6.1 Auto-Call Countdown

When auto-advance is enabled and the outcome is NO_ANSWER or BUSY:

```
┌─────────────────────────────┐
│  Next call in: 5            │
│                             │
│  Next: Pedro Martínez       │
│  Phone: +507 6XXX-XXXX     │
│                             │
│  [ Cancel ]  [ Call Now ]   │
└─────────────────────────────┘
```

- Countdown from 5 to 0, then auto-dials.
- "Cancel" stops countdown, shows Pre-Call Screen (manual mode for this one).
- "Call Now" skips countdown, dials immediately.

---

## 7. Call Engine (Telecom Integration)

### 7.1 Default Dialer Registration

On first launch, the app requests to become the default dialer via:

```kotlin
val intent = Intent(TelecomManager.ACTION_CHANGE_DEFAULT_DIALER)
intent.putExtra(TelecomManager.EXTRA_CHANGE_DEFAULT_DIALER_PACKAGE_NAME, packageName)
startActivity(intent)
```

Once set as default dialer, the app:
- Handles all outgoing calls with its own UI.
- Receives `InCallService` callbacks for call state.
- Can show custom in-call screens.

### 7.2 Call State Machine

```
IDLE ──► DIALING ──► RINGING ──► CONNECTED ──► DISCONNECTED
              │          │            │               │
              │          │            │               ▼
              └──────────┴────────────┘         POST-CALL
                    (any failure)               SCREEN
                         │
                         ▼
                   CALL FAILED
                   (pre-select
                    NO_ANSWER)
```

| State | Detected Via | Action |
|---|---|---|
| DIALING | `Call.STATE_DIALING` | Show "DIALING..." on In-Call Screen, start tracking |
| RINGING | `Call.STATE_RINGING` (outgoing context) | Show "RINGING..." |
| CONNECTED | `Call.STATE_ACTIVE` | Start timer, show "CONNECTED", enable Notes button |
| DISCONNECTED | `Call.STATE_DISCONNECTED` | Stop timer, determine disconnect cause, go to Post-Call |
| FAILED | `DisconnectCause.ERROR`, `BUSY`, `REJECTED` | Go to Post-Call with pre-selected outcome |

### 7.3 Disconnect Cause Mapping

When a call disconnects, the system provides a `DisconnectCause`. The app maps it to a suggested outcome:

| DisconnectCause | Suggested Outcome | Auto-select? |
|---|---|---|
| `LOCAL` (Agent hung up) | None — Agent chooses | No |
| `REMOTE` (Client hung up) | None — Agent chooses | No |
| `BUSY` | BUSY | Yes (pre-selected) |
| `REJECTED` | NO_ANSWER | Yes (pre-selected) |
| `ERROR` | NO_ANSWER | Yes (pre-selected) |
| `CONNECTION_MANAGER_NOT_ALLOWED` | NO_ANSWER | Yes (pre-selected) |
| `MISSED` | NO_ANSWER | Yes (pre-selected) |
| `CANCELED` (rang but no answer) | NO_ANSWER | Yes (pre-selected) |

> Pre-selected means the outcome chip is highlighted by default on the Post-Call Screen, but the Agent can always change it.

---

## 8. Offline-First Data Strategy

### 8.1 Local Database (Room)

```
┌──────────────────────────────────────────────────────────────┐
│                        Room Database                          │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────────┐             │
│  │  ClientEntity     │  │  InteractionEntity    │             │
│  │  - id (server)    │  │  - mobileSyncId (PK)  │             │
│  │  - name           │  │  - clientId            │             │
│  │  - phone          │  │  - callStartedAt       │             │
│  │  - status         │  │  - callEndedAt         │             │
│  │  - queueOrder     │  │  - durationSeconds     │             │
│  │  - extraData      │  │  - outcome             │             │
│  │  - callAttempts   │  │  - disconnectCause     │             │
│  │  - lastCalledAt   │  │  - syncStatus          │             │
│  │  - lastOutcome    │  │    (PENDING / SYNCED)   │             │
│  │  - lastNote       │  │  - deviceCreatedAt      │             │
│  └──────────────────┘  └──────────────────────┘             │
│                                                              │
│  ┌──────────────────────┐                                    │
│  │  NoteEntity           │                                    │
│  │  - mobileSyncId (PK)  │                                    │
│  │  - clientId            │                                    │
│  │  - interactionId       │  ← optional link to interaction   │
│  │  - content             │                                    │
│  │  - type (CALL /        │                                    │
│  │    POST_CALL / MANUAL /│                                    │
│  │    FOLLOW_UP)          │                                    │
│  │  - syncStatus          │                                    │
│  │    (PENDING / SYNCED)  │                                    │
│  │  - deviceCreatedAt     │                                    │
│  └──────────────────────┘                                    │
│                                                              │
│  ┌──────────────────────────┐                                │
│  │  FollowUpEntity          │                                │
│  │  - mobileSyncId (PK)     │                                │
│  │  - clientId               │                                │
│  │  - interactionMobileSyncId│  ← links to the interaction   │
│  │  - scheduledAt            │                                │
│  │  - reason                 │                                │
│  │  - status (PENDING /      │                                │
│  │    COMPLETED / CANCELLED) │                                │
│  │  - completedAt            │                                │
│  │  - syncStatus             │                                │
│  │    (PENDING / SYNCED)     │                                │
│  │  - deviceCreatedAt        │                                │
│  └──────────────────────────┘                                │
└──────────────────────────────────────────────────────────────┘
```

### 8.2 Sync Flow

```
┌───────────────────────────────────────────────────────────┐
│                    SYNC TRIGGERS                           │
│                                                           │
│  1. After "Save & Next" on Post-Call Screen                │
│     → Immediate attempt (interaction + note + follow-up)   │
│                                                           │
│  2. WorkManager periodic job (every 15-30 min)             │
│     → Batch all PENDING interactions + notes + follow-ups  │
│                                                           │
│  3. Network connectivity restored                          │
│     → WorkManager constraint triggers batch sync           │
│                                                           │
│  4. Manual "Force Sync" in Settings                        │
│     → Batch all PENDING data                               │
│                                                           │
│  5. On app login / startup                                 │
│     → Fetch latest assigned clients + agenda from server   │
│     → Batch sync any PENDING data                          │
└───────────────────────────────────────────────────────────┘

Sync request: POST /api/sync/interactions
Body: {
  interactions: [...],
  notes: [...],
  followUps: [...],
  completedFollowUps: [...]
}

Response per record:
  - "created"   → mark local as SYNCED
  - "duplicate" → already exists, mark local as SYNCED
  - "updated"   → follow-up completed, mark local as SYNCED
  - "error"     → keep local as PENDING, retry on next sync

After sync: refresh from server:
  - GET /api/clients/assigned → update Room clients
  - GET /api/follow-ups/agenda → update Room follow-ups
    (catches cancellations from Owner reassignment)
```

### 8.3 Client List Refresh

- On login: full fetch of assigned clients + agenda → replace Room data.
- After successful sync: re-fetch both to get server-updated statuses.
- If offline: work with local Room data. Statuses update optimistically.

---

## 9. Follow-Up Notifications

When a follow-up is saved locally (whether synced or not), the app schedules a local notification:

```
┌────────────────────────────────────────┐
│  Follow-Up Reminder                    │
│                                        │
│  FollowUp saved at scheduledAt         │
│         │                              │
│         ▼                              │
│  AlarmManager.setExactAndAllowWhile    │
│  IdleExact(scheduledAt - 5min)         │
│  → fires 5 minutes before              │
│         │                              │
│         ▼                              │
│  Notification:                         │
│  "Reminder: Call María González        │
│   in 5 minutes (Wants loan rates)"    │
│                                        │
│  Tap → opens Pre-Call Screen for       │
│  that client                           │
└────────────────────────────────────────┘
```

- Notification fires **5 minutes before** the scheduled time.
- Tapping the notification opens the app directly to the Pre-Call Screen for that client.
- If the follow-up was cancelled server-side (detected on next sync), the local alarm is removed.
- Uses `SCHEDULE_EXACT_ALARM` permission for precise timing.

---

## 10. Interaction Data Lifecycle

One complete cycle from call to server:

```
Step 1: Agent taps "Call"
  → Generate mobileSyncId (UUID) for interaction
  → Record callStartedAt = now
  → Store in-memory: { mobileSyncId, clientId, callStartedAt }

Step 2: Call connects
  → Start timer
  → Agent opens Notes, starts typing

Step 3: Call ends
  → Record callEndedAt = now
  → Calculate durationSeconds
  → Capture disconnectCause
  → Navigate to Post-Call Screen

Step 4: Agent selects outcome + reviews note
  → If INTERESTED: fill follow-up form (date, time, reason)
  → Tap "Save & Next"

Step 5: Save locally
  → Build InteractionEntity → INSERT into Room
  → Build NoteEntity → INSERT into Room (with type based on context)
  → If INTERESTED:
    → Generate mobileSyncId (UUID) for follow-up
    → Build FollowUpEntity → INSERT into Room
    → Schedule local notification for scheduledAt
  → If calling from Agenda:
    → Mark original FollowUpEntity as COMPLETED locally
  → Update local ClientEntity (callAttempts++, lastCalledAt, status)

Step 6: Sync attempt
  → POST /api/sync/interactions with:
    - interaction
    - note (if created)
    - follow-up (if created)
    - completedFollowUp (if applicable)
  → Success: mark all as SYNCED, refresh from server
  → Failure: stays PENDING (WorkManager will retry)

Step 7: Navigate to next client
```

---

## 11. Edge Cases & Error Handling

| Scenario | Behavior |
|---|---|
| **Call fails immediately** (no signal) | Go to Post-Call, pre-select NO_ANSWER, duration = 0 |
| **Call drops mid-conversation** | Go to Post-Call, note content preserved, Agent chooses outcome |
| **App crashes during call** | On next launch, detect orphaned in-memory interaction (callStartedAt set, no callEndedAt). Show recovery dialog: "You had an active call with [Client]. What happened?" → Post-Call Screen |
| **No clients left in queue** | Show "All clients called" summary with stats → return to Main Hub |
| **Sync fails repeatedly** | Records accumulate locally with PENDING status. Settings tab shows count. WorkManager keeps retrying. No data is lost |
| **Token expired** | API returns 401 → redirect to Login Screen. Pending data stays in Room, will sync after re-login |
| **Client list changed on server** | On next refresh, Room DB updates. If a client was unassigned server-side, it disappears from local list. Pending interactions still sync normally |
| **Follow-up cancelled server-side** | On next agenda refresh, the cancelled follow-up is removed from Room. Its local notification alarm is cancelled |
| **Follow-up notification but no network** | Notification fires regardless of connectivity (it's local). Agent can call from the Pre-Call Screen. Data syncs later |
| **Multiple follow-ups for same client** | Each is a separate FollowUpEntity. Agenda shows all of them. Completing one doesn't affect others |

---

## 12. Auto-Call Session Summary

When auto-call mode ends (no more clients or Agent exits), show a summary:

```
┌─────────────────────────────────┐
│  Auto-Call Session Complete      │
│─────────────────────────────────│
│                                 │
│  Total Calls:        25         │
│  Interested:          4         │
│  Not Interested:     10         │
│  No Answer:           8         │
│  Busy:                2         │
│  Invalid Number:      1         │
│                                 │
│  Follow-Ups Scheduled: 4       │
│  Pending Sync:         0       │
│                                 │
│       [ Back to Home ]          │
└─────────────────────────────────┘
```

---

## 13. Security Considerations

| Concern | Mitigation |
|---|---|
| **JWT storage** | Stored in SharedPreferences |
| **API transport** | HTTPS only |
| **APK distribution** | Signed APK |
| **Lost/stolen device** | Admin can deactivate Agent account → JWT becomes invalid → app forces logout on next API call |
