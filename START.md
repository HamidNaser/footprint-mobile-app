# FootPrint Mobile App - Start Here

> **Last Updated:** July 30, 2026  
> **Branch:** feature/timeline-lifeline

Welcome! This file is your **navigation hub** and **resume point** for working on the FootPrint mobile application. When returning to this project after a break, start here to get oriented.

---

## 🔌 Local Development Ports

| Service | Port | URL |
|---------|------|-----|
| **Hub API** | 50001 | `http://localhost:50001/api/v0/...` |
| **Hub SignalR** | 50001 | `http://localhost:50001/hubs/footprint` |
| **Aspire Dashboard** | 17289 | `https://localhost:17289` |
| **Auth API** | 5100 | `http://localhost:5100/api/v1/...` |
| **LocalStack** | 4566 | S3, SQS emulation |
| **MongoDB** | 27018 | `mongodb://localhost:27018` |
| **Redis** | 6379 | Cache |
| **Expo Web** | 8081/8082 | Mobile app in browser |

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

### 🖥️ Machine Handoff (July 30, 2026)
Committed all work-in-progress on this laptop so it can be pulled onto the **personal laptop** and continued via cloud. All three repos committed under personal identity (`HamidNaser` / `hamid.naser1106@gmail.com`):
- **mobile** `feature/timeline-lifeline` (`27f9029`) — Events + Timeline/Lifeline + Places memory improvements + iOS TestFlight config
- **backend** `feature/lifeline-api` (`86fbdd5`) — Events API (Hub)
- **web** `feature/timeline-lifeline` (`2e07dc3`) — Events + Timeline/Lifeline + Places explorer

To resume on the personal laptop: `git clone` (or `git pull`) each repo, `npm install`, then `npx expo start`.

### 🍎 iOS TestFlight (blocked on Apple)
- Apple Developer Program enrollment is **Pending** — ID verification submitted, awaiting Apple approval (~24–48h). Once **Active**: confirm the real Team ID, create the App Store Connect app (bundle `com.footprint.app`), fill `ascAppId` in `eas.json`, then `eas build --platform ios --profile production` + `eas submit --platform ios --latest`.
- `eas.json` / `app.json` / CI workflow already prepped with Apple ID `hamid.naser1106@gmail.com` + Team ID `SU865YGCS2` (verify after activation).

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

### Completed Phases
- ✅ **Phase A: Wire JournalScreen** (June 6, 2026)
- ✅ **Phase B: Sync Your Journal to Server** (June 13, 2026)
  - getOrCreateDefaultJournal() creates/retrieves journal ID
  - useJournal hook fetches real entries from SQLite/WebDB
  - Compose modal saves entries via createEntry() to database
  - Visibility selector (private/family/friends) saves correctly
  - Entries persist across app restart (localStorage for web)
  - Mock data now only shows when no real entries exist
- ✅ **B1: Initialize SyncEngine on app start** (June 13, 2026)
  - SyncContext created and wired into App.js
  - SyncEngine initializes on auth, listens for events
  - API config updated to use correct Hub port (50001)
  - SignalR URL configured via api.config.js
  - CORS enabled for Hub API (localhost:8081/8082/19006/3000)
- ✅ Documentation reorganization (START, README, ARCHITECTURE, DEPLOYMENT, TODO)
- ✅ All 8 implementation phases for Journal infrastructure built
- ✅ SignalR real-time integration built
- ✅ Places feature prototype with Interview Mode
- ✅ Google OAuth for Web and iOS

### Currently In Progress
**Phase D: View Others' Journals** — Ready to start

### Last Completed
**Phase C: Reactions & Comments** ✅ (June 13, 2026)
- ✅ C1: ReactionsApi created (like/unlike)
- ✅ C2: CommentsApi created (add comment)
- ✅ C3: JournalScreen wired to call APIs
- ✅ C4: Refresh after react/comment updates cache
- ✅ C5: Tested: likes=2→1, comments work

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
