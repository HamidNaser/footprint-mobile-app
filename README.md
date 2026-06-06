# FootPrint Mobile App

> **Last Updated:** June 4, 2026  
> **Tech Stack:** React Native (Expo SDK 54), TypeScript, SQLite, SignalR  
> **Branch:** feature/google-oauth-authentication

FootPrint is a **family memory preservation app** that lets you journal moments, share with family and friends, and connect memories across generations through places and time.

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| **[START.md](START.md)** | **Start here!** Navigation hub and resume point |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Technical design, data patterns, folder structure |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Build, CI/CD, store submission, costs |
| [TODO.md](TODO.md) | Tasks, backlog, integration gaps |

### Feature Documentation

| Document | Description |
|----------|-------------|
| [JOURNAL.md](JOURNAL.md) | Journal feature - privacy, reactions, comments |
| [FAMILY.md](FAMILY.md) | Family feature - relationships, sharing |
| [FRIENDS.md](FRIENDS.md) | Friends feature - connections, tagging |
| [PLACES.md](PLACES.md) | Places feature - locations, memories |
| [GOOGLE-OAUTH-SETUP.md](GOOGLE-OAUTH-SETUP.md) | Google Sign-In configuration |

---

## 🚀 Quick Start

```powershell
# Clone and install
cd c:\Work\mine\footprint-mobile-app
npm install

# Start development server
npx expo start

# Or run on specific platform
npx expo start --web      # Browser
npx expo start --ios      # iOS Simulator (Mac)
npx expo start --android  # Android Emulator
```

**Testing on device:** Download "Expo Go" app, scan the QR code.

---

## ✅ Current Status

| Category | Status |
|----------|--------|
| **Core Infrastructure** | ✅ All 8 phases complete |
| **Authentication** | ✅ Email/password + Google OAuth (Web/iOS) |
| **Journal Feature** | ✅ Infrastructure built, UI ready |
| **Offline-First** | ✅ SQLite + sync engine |
| **Real-time** | ✅ SignalR integration |
| **Places Prototype** | ✅ Complete with Interview Mode |

**Next up:** Wire Journal screen to actual infrastructure (currently uses mock data). See [TODO.md](TODO.md) for details.

---

## 📁 Project Structure

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
│   ├── hooks/             # React hooks (useJournal, etc.)
│   ├── context/           # Auth, Realtime contexts
│   └── config/            # API & OAuth config
└── assets/                # Images, icons
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed folder structure and data flow.

---

## 🎯 Core Features

### Journal (Offline-First)
- Create entries with text, photos, video, audio
- Works completely offline - syncs when connected
- Three storage modes: Cloud Sync, WiFi Only, Local Only
- Map integration with location tagging

### Family & Friends
- Share memories with family or friends
- See what family members are sharing
- Question/answer flow for preserving stories

### Places
- Connect memories across generations through locations
- "Grandpa was here in 1962, I was here in 2019"
- Then & Now photo comparisons
- Interview mode for recording elder stories

---

## 🔧 Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | React Native (Expo SDK 54) |
| Navigation | React Navigation 7 |
| Local Storage | expo-sqlite |
| Sync | Custom SyncEngine with queue/retry |
| Real-time | SignalR WebSocket |
| Maps | react-native-maps + expo-location |
| Media | expo-camera, expo-av, expo-image-picker |
| Auth | AsyncStorage tokens, Google OAuth |

---

## 📱 Backend Integration

The app connects to the FootPrint backend services:

| Service | Port | Purpose |
|---------|------|---------|
| Auth API | 5100 | Authentication, tokens |
| Hub API | 5200 | Journals, feed, users |
| SignalR Hub | 5200 | Real-time updates |

See [ARCHITECTURE.md](ARCHITECTURE.md) for API endpoints and authentication flow.
