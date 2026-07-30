# Events Feature — Mobile Design & Implementation Plan

> **Last Updated:** July 27, 2026
> **Status:** ✅ Implemented (UI complete; uses mock fallback until backend is on AWS)
> **Depends on:** Backend Events endpoints deployed to AWS for live data (see TODO)

---

## 🎯 Vision

Bring the **Events / invitations** feature (already built on web) to mobile. Users can
create themed event invitations (wedding, birthday, party…), invite guests, and let
guests RSVP (Going / Maybe / Declined). The mobile experience mirrors the web
functionality but is redesigned for a phone: **stacked, gesture-friendly, one thing at a
time** instead of the web's two-page "book spread".

---

## 🔗 Parity with Web

The web app (`footprint-web-app`) implements Events as a book spread:

| Web (desktop) | Mobile equivalent |
|---------------|-------------------|
| Left sidebar list + tabs (My / Invites / Drafts) | `EventsScreen` list with a **segmented control** at top + FAB to create |
| Left page = themed invitation card | `EventDetailScreen` **hero header** (themed cover) |
| Right page = details / guests / RSVP / actions | Same screen, scrolls **below** the hero |
| Template gallery (create mode) | `EventFormScreen` **horizontal template carousel** |
| Inline controlled form | `EventFormScreen` full-screen form (modal presentation) |

Backend contract is identical — reuse the same Hub API (`/api/v1/events`).

---

## 🧭 Navigation & Entry Points

Events is **not** added as a 7th bottom tab (the bar already has 6: Home, Journal,
Family, Friends, Places, Timeline). Instead register it in the stack (like Profile /
Settings / PersonJournal) and open it from:

- **Home screen** → an "Events" card / quick action
- (Optional later) a "More" menu

```
AppNavigator (Stack)
 ├─ MainTabs
 ├─ Events            → EventsScreen        (presentation: 'card')
 ├─ EventDetail       → EventDetailScreen   (presentation: 'card')
 └─ EventForm         → EventFormScreen     (presentation: 'fullScreenModal')  // create + edit
```

---

## 📱 Screen 1 — `EventsScreen` (list)

Purpose: browse events across the three tabs.

**Layout (top → bottom):**
1. **Header** — title "Events", back button, notifications/avatar (match `PlacesScreen` header).
2. **Segmented control** — `My` · `Invites` · `Drafts` (mirrors web `EVENT_TABS`).
3. **Event list** (`FlatList`) of **event cards**:
   - Cover thumbnail (themed by template accent).
   - Title + subtitle.
   - 📅 Date · 📍 Location (short).
   - RSVP status pill (guest view) or status pill `Published` / `Draft` (host view).
   - Stacked guest avatars + "+N going".
4. **FAB `+`** (bottom-right) → opens `EventFormScreen` in create mode.
5. Empty state per tab (e.g. "No invitations yet").
6. Pull-to-refresh.

---

## 📱 Screen 2 — `EventDetailScreen`

Purpose: view a single event; RSVP (guest) or manage (host).

**Layout (scroll):**
1. **Hero header** — themed cover image, template kicker, title, subtitle, date/time
   overlaid (mirrors web `EventInvitation` card).
2. **Details block** — time, location (with `PlaceMapPreview` map), host row.
3. **Description**.
4. **Guests** — horizontal avatar row with status ring (going/maybe/declined/invited),
   tap → guest list sheet with counts (`going / maybe / declined / invited`).
5. **Sticky bottom action bar** (role-aware, matches web authz):
   - **Guest** → RSVP segmented (`Going` / `Maybe` / `Declined`) + **Share invite**.
   - **Host** → **Edit** · **Delete** (confirm) · **Share**.
   - `isHost = event.tab === 'my' || event.tab === 'drafts'`.

RSVP is optimistic (update immediately, revert on failure) — same as web.

---

## 📱 Screen 3 — `EventFormScreen` (create & edit)

Presented as a full-screen modal.

**Create flow:**
1. **Template carousel** (horizontal) — wedding / birthday / party themed cards
   (`EVENT_TEMPLATES`). Selecting one sets the accent/background/cover.
2. **Form fields**:
   - Title (required)
   - Subtitle
   - Date & time → native `DateTimePicker`
   - Location → reuse the existing **map location picker** (LocationService) from Journal/Places
   - Description → multiline
3. **Publish toggle** (Publish now vs save as Draft).
4. **Save** button in header → create/update via service, then pop + toast.

**Edit flow:** same screen, pre-populated from the selected event; header shows
"Save changes".

---

## 🧱 Files to Create (mirrors web structure)

| File | Purpose | Web counterpart |
|------|---------|-----------------|
| `src/data/eventsData.js` | Mock data + shapes (tabs, templates, mock events, helpers) | `src/data/eventsData.js` |
| `src/api/EventsApi.js` | Fetch wrapper (Bearer + 401 refresh), CRUD + RSVP, adapt API→UI | `src/services/eventsService.js` |
| `src/hooks/useEvents.js` | `useEvents(tab)` → `{ events, isLoading, source, refresh }`, mock fallback when no token | `src/hooks/useEvents.js` |
| `src/screens/EventsScreen.js` | List + segmented tabs + FAB | `EventsPage` (sidebar) |
| `src/screens/EventDetailScreen.js` | Hero + details + guests + action bar | `EventInvitation` + `EventDetailsPanel` |
| `src/screens/EventFormScreen.js` | Template picker + form (create/edit) | create-mode form |
| `src/components/events/*` | EventCard, TemplateCard, GuestAvatarRow, RsvpBar, RsvpPill | web `components/events/*` |
| `src/components/events/index.js` | Barrel | barrel |

**Reuse:** `PlaceMapPreview` / map location picker, avatar components, theme colors
(`PRIMARY #4361ee`, background `#F0F4FF`), `SafeAreaView`, `Ionicons`, toast pattern.

---

## ✅ Consistency Checklist (mobile app conventions)

- [ ] `StyleSheet` + memo'd sub-components (like `PlacesScreen`).
- [ ] Theme colors match Places/Journal (`#4361ee` / `#2B7DE9`, bg `#F0F4FF`).
- [ ] `Ionicons` for all icons; FAB style matches Journal FAB.
- [ ] Mock-data fallback when unauthenticated (offline-friendly), API when signed in.
- [ ] Optimistic RSVP with revert on error.
- [ ] Loading + empty + error states for every screen.
- [ ] Pull-to-refresh on the list.
- [ ] Role-aware actions match backend authz (host can't RSVP; only host edits/deletes).

---

## 🚧 Blockers / Order of Work

1. **Deploy Hub Events endpoints to AWS** so the phone can hit a real API (until then,
   mobile uses `eventsData` mock like the web does).
2. Build data + API + hook layer.
3. Build `EventsScreen` → `EventDetailScreen` → `EventFormScreen`.
4. Wire navigation + Home entry point.
5. Manual smoke test on device/simulator.
