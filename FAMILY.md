# Family Feature - Design & Implementation Plan

> **Last Updated:** June 3, 2026  
> **Status:** Design Phase 📋  
> **Branch:** feature/google-oauth-authentication

---

## 🎯 Core Philosophy

**Family is the heart of Footprint.**

The Family screen is where you see what your family is sharing, discover their stories, and stay connected across generations. It's not about broadcasting—it's about preserving and sharing memories with the people who matter most.

Key difference from social media:
- Facebook: "What are my friends posting?"
- Footprint Family: "What are my family members willing to share with me?"

---

## 👨‍👩‍👧‍👦 Family Structure

### Family Groups

Users define their family relationships:

| Relationship | Category | Example |
|--------------|----------|---------|
| Grandparents | Elders | Grandpa Akram, Grandma Fatima |
| Parents | Immediate | Dad Omar, Mom Layla |
| Siblings | Immediate | Brother Ahmed, Sister Noor |
| Aunts/Uncles | Extended | Uncle Hassan, Aunt Mariam |
| Cousins | Extended | Cousin Sara, Cousin Ali |
| Children | Immediate | Son/Daughter |
| Grandchildren | Descendants | Grandchildren |
| Spouse | Immediate | Husband/Wife |
| In-laws | Extended | Mother-in-law, Father-in-law |

### Family Tree Connection

The family relationships can form a tree structure, enabling:
- "See entries from Dad's side of the family"
- "View Grandpa's descendants' entries"
- Generational filtering

---

## 📱 Family Screen Design

### Main View - Combined Feed

```
┌─────────────────────────────────────────┐
│ Family                                  │
├─────────────────────────────────────────┤
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐    │
│ │All │ │ 👴 │ │ 👵 │ │ 👨 │ │ 👩 │ →  │
│ │    │ │Akram│ │Fatima│ │Omar│ │Layla│    │
│ └────┘ └────┘ └────┘ └────┘ └────┘    │
│ ↑ Selected                              │
├─────────────────────────────────────────┤
│ Family Feed                   [Filter ▼]│
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ 👴 Grandpa Akram           2h ago  │ │
│ │ Remembering the old bakery in      │ │
│ │ Damascus where I met your grandma  │ │
│ │ 📷 [photo]                         │ │
│ │ 📍 Damascus, Syria                 │ │
│ │ ❤️ 8  🙏 2  💬 4                    │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ 👩 Mom                    Yesterday │ │
│ │ Garden is finally blooming! Dad    │ │
│ │ would have loved to see this...    │ │
│ │ 📷 [photo]                         │ │
│ │ 📍 Home Garden                     │ │
│ │ ❤️ 12  😢 3  💬 6                   │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ 👨 Dad                    2 days ago│ │
│ │ Found this old photo from our 1992 │ │
│ │ trip to New York...                │ │
│ │ 📷 [vintage photo]                 │ │
│ │ 📍 Manhattan, NY                   │ │
│ │ ❤️ 15  😊 5  💬 12                  │ │
│ │ 💬 You asked a question (pending)  │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### Person Selector (Horizontal Scroll)

```
┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐
│All │ │ 👴 │ │ 👵 │ │ 👨 │ │ 👩 │ │ 👤 │ │ 👤 │
│    │ │Akram│ │Fatima│ │Omar│ │Layla│ │Hassan│ │Sara│
│    │ │ •3 │ │ •1 │ │ •2 │ │ •5 │ │    │ │ •1 │
└────┘ └────┘ └────┘ └────┘ └────┘ └────┘ └────┘
        ↑ Dot indicates new entries you haven't seen
```

Features:
- **"All"** shows combined feed from everyone
- **Tap person** to filter to just their entries
- **Dot indicator** shows new/unseen entries
- **Long press** to view their profile/journal

### Filter Options

```
┌─────────────────────────────────────────┐
│ Filter Family Feed                  ✕   │
├─────────────────────────────────────────┤
│ Time                                    │
│ ○ All time                              │
│ ● This month                            │
│ ○ This year                             │
│ ○ Custom range...                       │
├─────────────────────────────────────────┤
│ Content Type                            │
│ [✓] Photos  [✓] Videos  [✓] Text only  │
│ [✓] Audio recordings                    │
├─────────────────────────────────────────┤
│ Generation                              │
│ [✓] Grandparents                        │
│ [✓] Parents                             │
│ [✓] Siblings                            │
│ [✓] Aunts/Uncles                        │
│ [✓] Cousins                             │
├─────────────────────────────────────────┤
│ Location                                │
│ [Any location ▼]                        │
├─────────────────────────────────────────┤
│       [Clear All]     [Apply]           │
└─────────────────────────────────────────┘
```

---

## 👤 Person Journal View

When you tap a family member, you see their shared journal:

```
┌─────────────────────────────────────────┐
│ ←  Grandpa Akram                    ⋯   │
├─────────────────────────────────────────┤
│              ┌─────┐                    │
│              │ 👴  │                    │
│              └─────┘                    │
│           Akram Naser                   │
│      Grandfather • Born 1942            │
│                                         │
│   47 entries shared with you            │
│   12 places visited                     │
│   5 pending questions                   │
├─────────────────────────────────────────┤
│ [Timeline] [Photos] [Places] [Questions]│
├─────────────────────────────────────────┤
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ June 3, 2026                       │ │
│ │ Remembering the old bakery...      │ │
│ │ 📷                    ❤️ 8  💬 4   │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ May 15, 2026                       │ │
│ │ Teaching Hassan how to make...     │ │
│ │ 🎥                    ❤️ 15  💬 7  │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ April 22, 2026                     │ │
│ │ The secret to good hummus is...    │ │
│ │ 🎤                    ❤️ 23  💬 11 │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### Profile Header Details

| Element | Description |
|---------|-------------|
| Avatar | Their profile photo |
| Name | Full name |
| Relationship + Birth Year | "Grandfather • Born 1942" |
| Entry count | "47 entries shared with you" |
| Places count | "12 places visited" (links to their places) |
| Questions count | "5 pending questions" (questions you asked them) |

### Tab Views

**Timeline Tab**: Chronological list of all their shared entries

**Photos Tab**: Grid of all photos from their entries
```
┌─────────────────────────────────────────┐
│ ┌─────┐ ┌─────┐ ┌─────┐                │
│ │     │ │     │ │     │                │
│ │ 📷  │ │ 📷  │ │ 📷  │                │
│ │     │ │     │ │     │                │
│ └─────┘ └─────┘ └─────┘                │
│ ┌─────┐ ┌─────┐ ┌─────┐                │
│ │     │ │     │ │     │                │
│ │ 📷  │ │ 📷  │ │ 📷  │                │
│ │     │ │     │ │     │                │
│ └─────┘ └─────┘ └─────┘                │
└─────────────────────────────────────────┘
```

**Places Tab**: Map or list of places they've journaled about
```
┌─────────────────────────────────────────┐
│ [Map View] / [List View]                │
│                                         │
│ 📍 Damascus, Syria (23 entries)         │
│ 📍 Manhattan, NY (8 entries)            │
│ 📍 Home (45 entries)                    │
│ 📍 Grandma's House (12 entries)         │
└─────────────────────────────────────────┘
```

**Questions Tab**: Questions you've asked them + status
```
┌─────────────────────────────────────────┐
│ Your Questions to Grandpa               │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ ⏳ Pending                          │ │
│ │ "What was it like leaving Damascus?"│ │
│ │ Asked 3 days ago                    │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ ✅ Answered                         │ │
│ │ "Who taught you to cook?"          │ │
│ │ Answered Jan 15 • 🎤 3:45          │ │
│ │                      [Listen]       │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

---

## 🔔 What You See vs. What They Shared

**Important distinction:**
- You only see entries they've shared with "Family" or "Family & Friends"
- If they shared with "Custom" and included you, you see it
- If they shared with "Friends" only (and you're family), you don't see it
- Private entries are never visible

### Visibility Indicator (optional)

Some families might want transparency:
```
┌─────────────────────────────────────────┐
│ 👴 Grandpa Akram                        │
│ Remembering the old bakery...           │
│ 📷                                      │
│ Shared with: Family 👨‍👩‍👧‍👦                  │
└─────────────────────────────────────────┘
```

---

## 🤝 Family Actions

### On Entry Card

| Action | Icon | Description |
|--------|------|-------------|
| React | Long press | Add ❤️ 🙏 😢 😊 🤗 reaction |
| Comment | 💬 | Add a response |
| Ask | ❓ | Ask a question about this entry |
| Share | ↗️ | Share within family or save |
| Bookmark | 🔖 | Save to your collection |

### On Person Profile

| Action | Description |
|--------|-------------|
| **Ask a Question** | Start a new question to them (not about specific entry) |
| **View Places Together** | See places you've both been (opens Places with filter) |
| **Start Interview** | Begin a guided interview session |
| **Message** | Direct message (if implemented) |

---

## 📊 Data Model Additions

```javascript
// Family relationship stored on user profile
FamilyMember: {
  userId: string,            // Their user ID
  relationship: string,      // 'grandfather', 'mother', 'cousin', etc.
  side: 'paternal' | 'maternal' | null,  // Which side of family
  customLabel: string | null, // "Grandpa Akram", "Aunt Mary"
  addedAt: Date,
  
  // Cached stats (updated periodically)
  stats: {
    totalSharedEntries: number,
    unreadEntries: number,
    pendingQuestions: number,
    sharedPlaces: number,
  }
}

// For the family feed query
FamilyFeedQuery: {
  userId: string,            // Current user
  familyMemberIds: string[], // Filter to specific people (or all)
  timeRange: { start: Date, end: Date } | null,
  contentTypes: ['photo', 'video', 'audio', 'text'][],
  generations: ['grandparents', 'parents', 'siblings', ...][] | null,
  placeId: string | null,    // Filter by place
  limit: number,
  offset: number,
}
```

---

## 🔗 Connection to Other Features

### → Journal Connection
- Family feed shows entries where `visibility` includes 'family' or 'family_friends'
- Tapping an entry opens the full Journal entry view with comments/reactions

### → Places Connection
- "View Places Together" shows Places where both you and that family member have entries
- Location on entry card links to Place detail
- Person's Places tab shows their place timeline

### → Questions Connection
- "Ask a Question" creates a question linked to that person
- Questions tab shows pending/answered questions
- Answered questions link to interview recordings

---

## 🛠️ Implementation Phases

### Phase 1: Family Feed Basics
- [ ] Create FamilyScreen layout
- [ ] Create PersonSelector horizontal scroll component
- [ ] Fetch and display family entries feed
- [ ] Basic entry card with author attribution

### Phase 2: Person Filtering
- [ ] Tap person to filter feed
- [ ] "All" selection to show combined feed
- [ ] Unread/new entry indicators (dots)

### Phase 3: Person Journal View
- [ ] Create PersonJournalScreen
- [ ] Profile header with stats
- [ ] Timeline tab (default)
- [ ] Basic navigation to entry detail

### Phase 4: Additional Tabs
- [ ] Photos tab with grid view
- [ ] Places tab with map/list toggle
- [ ] Questions tab with status

### Phase 5: Feed Filters
- [ ] Create FilterSheet component
- [ ] Time range filtering
- [ ] Content type filtering
- [ ] Generation filtering
- [ ] Location filtering

### Phase 6: Actions & Engagement
- [ ] Reactions on feed entries
- [ ] Quick comment from feed
- [ ] "Ask Question" flow
- [ ] Bookmark functionality

---

## 🎨 UI Components Needed

| Component | Description |
|-----------|-------------|
| `PersonSelector` | Horizontal scroll of family member avatars |
| `PersonChip` | Individual avatar + name + indicator |
| `FamilyEntryCard` | Entry card with author info |
| `PersonProfileHeader` | Profile info + stats at top of PersonJournal |
| `PersonJournalTabs` | Tab bar for Timeline/Photos/Places/Questions |
| `PhotoGrid` | Grid view of photos |
| `PersonPlaces` | List/map of their places |
| `QuestionsList` | Questions you've asked them |
| `FamilyFilterSheet` | Bottom sheet with filter options |

---

## 📝 Open Questions

1. **Family invitations**: How do family members connect? Invite system?
2. **Permissions**: Can you hide entries from specific family members?
3. **Notifications**: What triggers notifications in the family feed?
4. **Memory prompts**: "Dad hasn't posted in 30 days - send a prompt?"
5. **Multiple families**: Support for blended families, in-laws?
6. **Privacy for sensitive topics**: Should there be a "sensitive content" flag?

---

## 🚫 What This Is NOT

- **Not a replacement for a family group chat**: This is for sharing memories, not chatting
- **Not competitive**: No follower counts, no viral content
- **Not public**: Family content stays in the family
- **Not overwhelming**: Quality over quantity, meaningful over frequent
