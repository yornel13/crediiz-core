# Panama Calls CRM — MVP Overview

## 1. Product Vision

A CRM system designed for client acquisition campaigns in Panama. The platform enables an **Owner/Administrator** to upload client lists, assign them to field **Promoters**, and track call activity and outcomes in real time. Promoters use a mobile app to call assigned clients sequentially, write open notes during calls, mark the outcome, schedule follow-ups for interested clients, and sync data back to the CRM — even under unreliable network conditions.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| **Backend API** | NestJS (TypeScript), Express, MongoDB (Mongoose), JWT |
| **Admin Panel** | Angular, Tailwind CSS |
| **Mobile App** | Android Native (Kotlin, Jetpack Compose) |

---

## 3. User Roles

### 3.1 Owner / Administrator (Web Panel)

- Authenticates via email + password (JWT).
- Uploads client lists from Excel files.
- Creates and manages Promoter accounts (CRUD).
- Assigns clients to Promoters.
- Views call activity dashboard (call counts, outcomes, notes — read-only).
- Views the **Promoter agendas**: interested clients, scheduled follow-ups, and their dates — filterable by Promoter. Read-only supervision.
- Can reassign clients to a different Promoter if needed.
- Can manually change client status (e.g., CONVERTED, DO_NOT_CALL).

### 3.2 Promoter (Mobile App)

- Authenticates via login credentials created by the Owner.
- Receives a queue of assigned clients.
- Calls clients one by one in sequence (manual or auto-call mode).
- Writes an open free-text note during the call (Google Keep style).
- On call end: closes the note, selects the call outcome.
- When outcome is **Interested**: schedules a follow-up (date, time, reason).
- Has a personal **Agenda** showing scheduled follow-ups organized by date.
- Works offline with local persistence; syncs when connectivity is available.

---

## 4. MVP Feature Summary

### 4.1 Admin Panel (Web)

| Feature | Description |
|---|---|
| **Auth** | Owner login with JWT |
| **Client Upload** | Upload an Excel file with client data. Minimal validation (format assumed correct). Extra columns stored in a flexible `extraData` field |
| **Client List** | Paginated list of uploaded clients with status filters |
| **Client Assignment** | Assign one or more clients to a Promoter |
| **Promoter CRUD** | Create, edit, activate/deactivate Promoter accounts |
| **Follow-Up Supervision** | View all scheduled follow-ups across all Promoters or filtered by Promoter. See client name, scheduled date/time, reason, and status (pending/completed). Read-only |
| **Interested Clients** | View all clients marked as INTERESTED — filterable by Promoter |
| **Dashboard** | Total calls per Promoter, outcome counts, call attempts per client, follow-up stats, client notes (read-only). Numbers and text only — no complex charts |

### 4.2 Mobile App (Android)

| Feature | Description |
|---|---|
| **Auth** | Promoter login with JWT |
| **Client Queue** | Sequential list of assigned PENDING clients. Search bar, auto-call FAB |
| **Agenda** | Personal follow-up schedule organized by date (Today, Tomorrow, This Week, Later). Each entry shows client, time, and reason. Tap to call. Auto-call mode available for today's follow-ups |
| **Client Detail** | Essential client info (name, phone, extra data, call history) + "Call" button |
| **Call Tracking** | Auto-registers call start and end timestamps + duration + disconnect cause |
| **Open Note** | A free-text field that stays open during the entire call. The Promoter writes observations in real time. Opens via tap on "Notes" button in the in-call screen |
| **Outcome Selection** | After call ends, Promoter selects one outcome: Interested, Not Interested, No Answer, Busy, Invalid Number |
| **Follow-Up Scheduling** | When outcome is Interested: date picker, time picker, and reason field appear. The Promoter schedules when to call back |
| **Follow-Up Notifications** | Local notification at the scheduled time as a reminder |
| **Offline Mode** | Local persistence (Room DB) of clients, interactions, and follow-ups |
| **Sync on Call End** | Attempts immediate sync of interaction + follow-up after each call |
| **Background Sync** | WorkManager-based periodic sync (every 15–30 min or on connectivity restore) |
| **Settings** | Auto-advance toggle (auto-dial vs manual), account info, sync status, force sync |

### 4.3 Call Outcome Options

| Outcome | Effect on Client Status | Follow-Up | Description |
|---|---|---|---|
| **Interested** | → `INTERESTED` | Promoter schedules follow-up (date + time + reason) | Client shows interest. Goes to agenda |
| **Not Interested** | → `REJECTED` | None | Client declined. Removed from active queue |
| **No Answer** | stays `PENDING` | None | Client didn't pick up. Remains in queue for retry. `callAttempts` increments |
| **Busy** | stays `PENDING` | None | Line busy. Same as No Answer for queue purposes |
| **Invalid Number** | → `INVALID_NUMBER` | None | Phone number doesn't work. Flagged for Owner review |

---

## 5. Client Lifecycle (Funnel)

```
PENDING ──────────────────────────────────────────────────────
  │                                                           
  │  Promoter calls                                           
  │                                                           
  ├── No Answer / Busy ──► stays PENDING (callAttempts++)      
  │                                                           
  ├── Interested ────────► INTERESTED                         
  │                          + FollowUp created (scheduled)   
  │                              │                            
  │                    Promoter calls back on scheduled date   
  │                              │                            
  │                    ├── Still interested ► stays INTERESTED 
  │                    │     + new FollowUp (reschedule)       
  │                    ├── Converted ────────► CONVERTED       
  │                    │     (Owner marks via panel)           
  │                    └── Not Interested ──► REJECTED         
  │                                                           
  ├── Not Interested ────► REJECTED                           
  │                                                           
  └── Invalid Number ────► INVALID_NUMBER                     
                                                              
  DO_NOT_CALL: Manually set by Owner (e.g., legal request)    
```

---

## 6. Follow-Up System (Promoter Agenda)

### 6.1 How It Works

1. Promoter calls a client → marks outcome as **Interested**.
2. A follow-up form appears: **date**, **time**, and **reason** (e.g., "Wants loan rates, call Thursday 2pm").
3. The follow-up is saved locally and synced to the backend.
4. The Promoter's **Agenda tab** shows all scheduled follow-ups grouped by date.
5. On the scheduled date, a **local notification** reminds the Promoter.
6. The Promoter calls from the Agenda (tap or auto-call mode).
7. After the follow-up call, the Promoter can:
   - Schedule another follow-up (reschedule) → new FollowUp created.
   - Mark as Not Interested → client moves to REJECTED, follow-up marked COMPLETED.
   - The Owner marks as Converted from the panel → CONVERTED.

### 6.2 Follow-Up Lifecycle

```
PENDING ──► (scheduled date arrives) ──► Promoter calls ──► COMPLETED
   │                                                           │
   │  Promoter or Owner cancels                     New FollowUp if rescheduled
   ▼
CANCELLED
```

### 6.3 Owner Visibility

The Owner can view all follow-ups in the web panel:
- **All follow-ups** across all Promoters, or filtered by Promoter.
- Each entry shows: client name, Promoter name, scheduled date/time, reason, status.
- The Owner does NOT create or edit follow-ups — this is the Promoter's tool.
- The Owner CAN reassign a client to a different Promoter (existing follow-ups for the old Promoter are cancelled, the new Promoter manages their own agenda).

---

## 7. Offline-First Sync Strategy

1. **Local persistence**: The Android app stores assigned clients, interactions, and follow-ups in a local Room database.
2. **Sync on call end**: After each call + note + outcome + follow-up, the app immediately attempts to POST data to the backend.
3. **Deduplication**: Each interaction and follow-up carries a `mobileSyncId` (UUID generated on the device). The backend uses unique indexes to reject duplicates silently.
4. **Background sync**: Android `WorkManager` retries pending syncs every 15–30 minutes or when network connectivity is restored.
5. **Conflict-free**: The device only creates data (interactions, follow-ups), never updates existing server records. This makes sync conflict-free by design.
6. **Post-sync refresh**: After successful sync, the app re-fetches assigned clients and follow-ups to get server-updated data.

---

## 8. Out of Scope (MVP)

- Client editing or deletion from the mobile app.
- Note editing from the admin panel.
- Complex analytics, charts, or graphs.
- Multi-tenant / multi-organization support.
- Push notifications (server-side). Only local notifications for follow-up reminders.
- iOS mobile app.
- Client deduplication logic on upload.
- Call recording or VoIP integration (calls use the device's native dialer).
- Promoter-to-Promoter client transfer (only Owner can reassign).
- Owner creating or editing follow-ups (Promoter-only tool, Owner has read-only visibility).
