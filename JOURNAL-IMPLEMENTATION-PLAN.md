# Journal System Implementation Plan

> **Created:** June 4, 2026  
> **Updated:** June 13, 2026  
> **Status:** ALL PHASES COMPLETE ✅  
> **Purpose:** Complete guide for wiring the Journal feature to real infrastructure

---

## Table of Contents

1. [Requirements Summary](#requirements-summary)
2. [Current State Analysis](#current-state-analysis)
3. [Data Flow Architecture](#data-flow-architecture)
4. [Implementation Phases](#implementation-phases)
5. [Backend Dependencies](#backend-dependencies)
6. [Progress Tracking](#progress-tracking)

---

## Requirements Summary

### JournalScreen — Personal Journal

Your personal journal where YOU create entries:

| Requirement | Description |
|-------------|-------------|
| **Local-Only Mode** | User can configure to never sync to server. Data stays on device only. |
| **Offline-First + Sync** | Writes to local SQLite first. Syncs to server when online. |
| **Individual Journal** | One person = one journal (your own entries) |
| **Visibility Control** | Each entry has visibility: `private`, `family`, `friends`, `family_friends` |
| **Social Features** | Others see your shared entries in THEIR feed, can react/comment |

### PersonJournalScreen — Viewing Others' Journals

When you navigate from Family/Friends screens:

| Scenario | What You See |
|----------|--------------|
| **Single Family Member** | Tap "Akram" → See Akram's entries visible to you |
| **Family Group** | Tap "Akram's Family" (head card) → See ALL members' entries in one feed |
| **Single Friend** | Tap "John" → See John's entries visible to you |
| **Friend Group** | Tap "High School" org → See all friends from that org in one feed |
| **Social Features** | Can like/react and comment on ANY entry you can see |

---

## Current State Analysis

### ✅ Fully Built & Working

| Component | Location | Status |
|-----------|----------|--------|
| **SQLite Database** | `src/database/` | Schema, migrations, CRUD operations |
| **JournalRepository** | `src/repositories/` | Local-first entry storage with sync status |
| **JournalService** | `src/services/` | Business logic layer |
| **useJournal Hook** | `src/hooks/` | React hook for UI components |
| **Sync Engine** | `src/sync/` | Queue, retry, conflict resolution |
| **Settings Service** | `src/services/` | Storage mode (cloud/wifi/local) |
| **API Client** | `src/api/` | JournalApi, MediaApi with auth headers |
| **SignalR Real-time** | `src/context/` | WebSocket for live updates |
| **UI Components** | `src/components/journal/` | Entry cards, compose modal, reactions, comments |
| **Visibility Selector** | `JournalComposeModal` | Private/Family/Friends/Family+Friends picker |

### ⚠️ Built But NOT Connected

| Screen | Current Data Source | Problem |
|--------|-------------------|---------|
| **JournalScreen** | SQLite + useJournal hook | ✅ RESOLVED - fully wired |
| **PersonJournalScreen** | FeedApi + useFeed hook | ✅ RESOLVED - fully wired |

### ✅ Now Built (Phases B-E)

| Component | What It Does |
|-----------|-------------|
| **FeedApi** | `GET /feed`, `GET /feed/family`, `GET /feed/friends`, `GET /feed/user/:id` |
| **CommentsApi** | `POST /entries/:id/comments`, `GET /entries/:id/comments` |
| **ReactionsApi** | `POST /entries/:id/like`, `DELETE /entries/:id/like` |
| **useFeed Hook** | React hook to fetch other users' shared entries |
| **PersonJournalScreen** | Wired with useFeed, handleReact, handleAddResponse |

---

## Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         YOUR JOURNAL (JournalScreen)                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   YOU ──▶ [Compose Entry] ──▶ Set Visibility ──▶ SQLite (local)        │
│                                        │                                │
│                                        ▼                                │
│                              ┌──────────────────┐                       │
│                              │  SyncEngine      │                       │
│                              │  (if not local-  │                       │
│                              │   only mode)     │                       │
│                              └────────┬─────────┘                       │
│                                       │                                 │
│                                       ▼                                 │
│                              ┌──────────────────┐                       │
│                              │  Backend API     │                       │
│                              │  (Footprint.Hub) │                       │
│                              └──────────────────┘                       │
│                                                                         │
│   Your entries with visibility=family/friends become visible to others │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                 VIEWING OTHERS (PersonJournalScreen)                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   Family Screen ─┬─▶ Tap Family Head ─▶ PersonJournal(isGroup=true)    │
│                  │                       persons=[head,spouse,kids]     │
│                  │                                                      │
│                  └─▶ Tap Member ───────▶ PersonJournal(isGroup=false)  │
│                                          person={id,name,avatar}        │
│                                                                         │
│   Friends Screen ┬─▶ Tap Org ──────────▶ PersonJournal(isGroup=true)   │
│                  │                       persons=[friends from org]     │
│                  │                                                      │
│                  └─▶ Tap Friend ───────▶ PersonJournal(isGroup=false)  │
│                                          person={id,name,avatar}        │
│                                                                         │
│   ┌─────────────────────────────────────────────────────────────────┐  │
│   │ PersonJournalScreen                                              │  │
│   │                                                                  │  │
│   │   CURRENT: FAMILY_JOURNAL_ENTRIES (hardcoded mock)              │  │
│   │                                                                  │  │
│   │   NEEDED:  FeedApi.getUserFeed(userId) or                       │  │
│   │            FeedApi.getGroupFeed(userIds[])                      │  │
│   │            → Returns entries visible to logged-in user          │  │
│   │            → User can react/comment via API                     │  │
│   └─────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase A: Wire JournalScreen (Your Personal Journal) ✅ COMPLETE

> **Goal:** Get YOUR journal working end-to-end with real data  
> **Backend Required:** No — works with local SQLite only  
> **Completed:** June 6, 2026

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| A1 | Verify `SettingsService.getOrCreateDefaultJournal()` works | ✅ | Creates `local_journal_xxx` ID, persists in AsyncStorage |
| A2 | Ensure `useJournal(journalId)` fetches from SQLite correctly | ✅ | WebDB loads from localStorage, returns real entries |
| A3 | Connect Compose Modal → `createEntry()` → SQLite | ✅ | Full flow verified with console logging |
| A4 | Verify visibility selector saves correctly | ✅ | private/family/friends/family_friends all save |
| A5 | Test: Create entry, close app, reopen, entry persists | ✅ | Entries survive page refresh |
| A6 | Remove `MOCK_ENTRIES` usage in production mode | ✅ | Mock data only shows when no real entries exist |

**Deliverable:** Your personal journal creates, saves, and displays real entries. ✅

---

### Phase B: Sync Your Journal to Server

> **Goal:** When online, your entries sync to backend  
> **Backend Required:** Yes — Footprint.Hub on port **50001**  
> **SignalR Hub:** `http://localhost:50001/hubs/footprint`

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| B1 | Verify SyncEngine initializes on app start | ✅ | SyncContext created, wired in App.js |
| B2 | Test: Create entry offline → go online → entry syncs | ✅ | BatchSync endpoint tested, returns serverId mapping |
| B3 | Verify `SyncStatus` badge updates in UI | ✅ | SyncStatusBadge component created |
| B4 | Test: Server-side entry arrives via SignalR | ✅ | SyncAvailable event triggers auto-sync |

**Deliverable:** Your journal syncs bidirectionally with backend. ✅ COMPLETE

---

### Phase C: Reactions & Comments on Your Entries

> **Goal:** Others can react/comment; you see the results  
> **Backend Required:** Yes — reactions and comments endpoints

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| C1 | Create `ReactionsApi` (add/remove reaction) | ✅ | likeEntry/unlikeEntry/toggleLike |
| C2 | Create `CommentsApi` (add/list comments) | ✅ | addComment, getComments |
| C3 | Wire EngagementSection to call APIs | ✅ | JournalScreen passes handlers |
| C4 | Update local cache when reactions/comments arrive | ✅ | refresh() after API call |
| C5 | Test: Another user reacts → you see update | ✅ | Tested via curl, likes 2→1 |

**Deliverable:** Social engagement works on your entries. ✅ COMPLETE

---

### Phase D: View Others' Journals (PersonJournalScreen)

> **Goal:** Family/Friends screens → view their shared entries  
> **Backend Required:** Yes — feed endpoints

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| D1 | Create `FeedApi` with endpoints for user/group feeds | ⬜ | |
| D2 | Create `useFeed` hook for fetching others' entries | ⬜ | |
| D3 | Replace mock data in PersonJournalScreen with useFeed | ⬜ | |
| D4 | Handle single person vs group mode | ⬜ | |
| D5 | Test: Navigate to family member → see their entries | ⬜ | |

**Deliverable:** You can view family/friends' shared entries.

---

### Phase E: React & Comment on Others' Entries

> **Goal:** Full social features when viewing others  
> **Backend Required:** Yes — uses APIs from Phase C

| Task | Description | Status | Notes |
|------|-------------|--------|-------|
| E1 | Wire EngagementSection in PersonJournalScreen | ⬜ | |
| E2 | Test: React to family member's entry | ⬜ | |
| E3 | Test: Add comment to friend's entry | ⬜ | |
| E4 | Verify reaction/comment counts update in real-time | ⬜ | |

**Deliverable:** Full social engagement on others' entries.

---

## Backend Dependencies

| Mobile Feature | Backend Requirement | Endpoint |
|----------------|---------------------|----------|
| **Your journal (local)** | None — works offline | N/A |
| **Sync your entries** | Footprint.Hub (:50001) | `POST /api/v0/journals/entries` |
| **Get changes** | Footprint.Hub (:50001) | `GET /api/v0/journals/changes` |
| **View others' entries** | Footprint.Hub (:50001) | `GET /api/v0/feed/user/:id` |
| **View family feed** | Footprint.Hub (:50001) | `GET /api/v0/feed/family` |
| **Add reaction** | Footprint.Hub (:50001) | `POST /api/v0/entries/:id/reactions` |
| **Remove reaction** | Footprint.Hub (:50001) | `DELETE /api/v0/entries/:id/reactions/:type` |
| **Add comment** | Footprint.Hub (:50001) | `POST /api/v0/entries/:id/comments` |
| **List comments** | Footprint.Hub (:50001) | `GET /api/v0/entries/:id/comments` |
| **Real-time updates** | Footprint.Hub (:50001) | SignalR hub at `/hubs/footprint` |

---

## Progress Tracking

### Current Phase: **COMPLETE** — All Phases Done ✅

### Overall Progress

```
Phase A: ✅✅✅✅✅✅ 6/6 tasks COMPLETE
Phase B: ✅✅✅✅ 4/4 tasks COMPLETE
Phase C: ✅✅✅✅✅ 5/5 tasks COMPLETE
Phase D: ✅✅✅✅✅ 5/5 tasks COMPLETE
Phase E: ✅✅✅✅ 4/4 tasks COMPLETE (merged with D3)
─────────────────────────
Total:   24/24 tasks (100%)
```

### Session Log

| Date | Phase | Task | Result | Notes |
|------|-------|------|--------|-------|
| 2026-06-06 | A | A1-A6 | ✅ | Full Phase A complete - local journal working |
| 2026-06-13 | B | B1-B4 | ✅ | Sync engine wired - entries sync to server |
| 2026-06-13 | C | C1-C5 | ✅ | Reactions & Comments on own entries |
| 2026-06-13 | D | D1-D5 | ✅ | Feed API, useFeed hook, PersonJournalScreen wired |
| 2026-06-13 | E | E1-E4 | ✅ | React/Comment on others (wired in D3) |

---

## Key Files Reference

### Screens
- `src/screens/JournalScreen.js` — Your personal journal
- `src/screens/PersonJournalScreen.js` — Viewing others' journals
- `src/screens/FamilyScreen.js` — Family tree/list navigation
- `src/screens/FriendsScreen.js` — Friends list/tree navigation

### Services & Hooks
- `src/services/JournalService.js` — Business logic
- `src/services/SettingsService.js` — Storage mode settings
- `src/hooks/useJournal.js` — React hook for journal ops
- `src/repositories/JournalRepository.js` — Data access layer

### APIs
- `src/api/JournalApi.js` — Journal CRUD endpoints
- `src/api/MediaApi.js` — Media upload endpoints
- `src/config/api.config.js` — Endpoint definitions

### Database
- `src/database/schema.js` — Table definitions
- `src/database/migrations.js` — Schema migrations

### Sync
- `src/sync/SyncEngine.js` — Orchestrates sync
- `src/sync/SyncQueue.js` — Pending operations queue
- `src/sync/NetworkMonitor.js` — Online/offline detection

### Mock Data (to be replaced)
- `src/data/mockData.js` — Mock entries for JournalScreen
- `src/data/familyJournalData.js` — Mock entries for PersonJournalScreen

---

## Notes

- **Phase A requires NO backend** — pure mobile work
- **Phases B-E require Footprint.Hub** running on localhost:5200
- **Test each task individually** before marking complete
- **Update this document** after each task completion
