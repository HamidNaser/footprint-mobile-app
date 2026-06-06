# FootPrint Mobile App - Start Here

> **Last Updated:** June 4, 2026  
> **Branch:** feature/google-oauth-authentication

Welcome! This file is your **navigation hub** and **resume point** for working on the FootPrint mobile application. When returning to this project after a break, start here to get oriented.

---

## 📚 Documentation Index

| File | Purpose | When to Read |
|------|---------|--------------|
| [README.md](README.md) | Project overview, quick start, status | First time setup, checking what's done |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Technical design, data patterns, folder structure | Understanding how things work |
| [DEPLOYMENT.md](DEPLOYMENT.md) | CI/CD, builds, store submission, costs | Building and shipping the app |
| [TODO.md](TODO.md) | Tasks, backlog, integration gaps | Planning work, finding what's next |
| [JOURNAL-IMPLEMENTATION-PLAN.md](JOURNAL-IMPLEMENTATION-PLAN.md) | **Active** — Journal wiring phases & tasks | **Start here for current work** |

### Feature Documentation

| File | Feature | Status |
|------|---------|--------|
| [JOURNAL.md](JOURNAL.md) | Journal - privacy, reactions, comments | Design Phase 📋 |
| [FAMILY.md](FAMILY.md) | Family - feed, relationships, sharing | Design Phase 📋 |
| [FRIENDS.md](FRIENDS.md) | Friends - connections, tagging, shared places | Design Phase 📋 |
| [PLACES.md](PLACES.md) | Places - locations, memories, then & now | Prototype Complete ✅ |
| [GOOGLE-OAUTH-SETUP.md](GOOGLE-OAUTH-SETUP.md) | Google Sign-In configuration | Reference Guide |

---

## 🔖 Where We Stopped

### Current Focus
**Journal System Wiring** — Phase B: Sync Your Journal to Server

### Active Implementation Plan
📋 **[JOURNAL-IMPLEMENTATION-PLAN.md](JOURNAL-IMPLEMENTATION-PLAN.md)** — Complete guide with 5 phases (24 tasks)

This document contains:
- Full requirements breakdown (personal journal + viewing others)
- Current state analysis (what's built vs what's missing)
- Data flow architecture diagrams
- Implementation phases A through E with task checklists
- Backend dependency mapping

### Last Completed
- ✅ **Phase A: Wire JournalScreen** (June 6, 2026)
  - getOrCreateDefaultJournal() creates/retrieves journal ID
  - useJournal hook fetches real entries from SQLite/WebDB
  - Compose modal saves entries via createEntry() to database
  - Visibility selector (private/family/friends) saves correctly
  - Entries persist across app restart (localStorage for web)
  - Mock data now only shows when no real entries exist
- ✅ Documentation reorganization (START, README, ARCHITECTURE, DEPLOYMENT, TODO)
- ✅ All 8 implementation phases for Journal infrastructure built
- ✅ SignalR real-time integration built
- ✅ Places feature prototype with Interview Mode
- ✅ Google OAuth for Web and iOS

### Next Up
**Phase B: Sync Your Journal to Server** (requires backend)
- B1: Verify SyncEngine initializes on app start
- B2: Test: Create entry offline → go online → entry syncs
- B3: Verify SyncStatus badge updates in UI
- B4: Test: Server-side entry arrives via SignalR

### Blockers/Notes
- Phases B-E require Footprint.Hub backend running (Docker + LocalStack)
- Android Google OAuth needs SHA-1 fingerprint from EAS build
- Backend needs to auto-create default journal on user registration

---

## 🚀 Quick Commands

```powershell
# Start development
cd c:\Work\mine\footprint-mobile-app
npm install
npx expo start

# Run on specific platform
npx expo start --web      # Browser
npx expo start --ios      # iOS Simulator
npx expo start --android  # Android Emulator
```

---

## 📁 Project Structure Overview

```
footprint-mobile-app/
├── App.js                 # Entry point
├── src/
│   ├── screens/           # Screen components
│   ├── components/        # Reusable UI (journal/, media/, map/, places/)
│   ├── services/          # Business logic
│   ├── repositories/      # Data access layer
│   ├── database/          # SQLite schema & migrations
│   ├── sync/              # Offline-first sync engine
│   ├── api/               # API clients
│   ├── hooks/             # React hooks
│   ├── context/           # Auth, Realtime contexts
│   └── config/            # API & OAuth config
├── assets/                # Images, icons
└── [Documentation files]
```

---

## 🔄 How to Use This File

**When you return to this project:**
1. Read "Where We Stopped" above
2. Check [TODO.md](TODO.md) for the prioritized task list
3. Start working!

**When you pause work:**
1. Update "Current Focus" with what you were doing
2. Update "Last Completed" with what you finished
3. Update "Next Steps" with what should happen next
4. Add any blockers or notes

This ensures continuity across work sessions.
