# Journal Feature - Design & Implementation Plan

> **Last Updated:** June 3, 2026  
> **Status:** Design Phase 📋  
> **Branch:** feature/google-oauth-authentication

---

## 🎯 Core Philosophy

**Your journal is YOUR space. Sharing is an invitation, not the default.**

This is fundamentally different from social media:
- Social media: Posting = Sharing (public by default)
- Footprint Journal: Writing = Private reflection, Sharing = Conscious choice

The journal is personal by nature. Every entry belongs to the user. They choose what to keep private and what to share with family, friends, or specific people.

---

## 🔐 Privacy Model

| Level | Icon | Who Sees It | Use Case |
|-------|------|-------------|----------|
| **Private** | 🔒 | Only you | Default. Personal thoughts, unfinished entries, sensitive content |
| **Family** | 👨‍👩‍👧‍👦 | Your family group | Family memories, health updates, milestones, family-only moments |
| **Friends** | 👥 | Your friends group | Travel stories, life updates, adventures |
| **Family & Friends** | 🌐 | Both groups | Big announcements, celebrations, graduations, weddings |
| **Custom** | ⚙️ | Specific people you select | Sensitive topics for select people only |

### Key Principles

1. **Private by default** - New entries start as private
2. **Changeable anytime** - You can change visibility after posting
3. **Clear indicators** - Always know who can see an entry
4. **Granular control** - Share with groups or specific individuals
5. **No surprises** - The app never shares without explicit action

---

## 📱 Journal Screen Design

### Main View

```
┌─────────────────────────────────────────┐
│ My Journal                        [+]   │
├─────────────────────────────────────────┤
│ [All] [Private] [Shared] [Drafts]       │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ June 3, 2026              🔒       │ │
│ │ Thinking about grandpa today...    │ │
│ │ 📍 Home                            │ │
│ │ No comments (Private)              │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ June 1, 2026        👨‍👩‍👧‍👦  ❤️ 5  💬 3 │ │
│ │ Family reunion was amazing! 📷     │ │
│ │ 📍 Grandpa's House                 │ │
│ │ 💬 Mom: "Such a beautiful day!"    │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ May 28, 2026              🔒       │ │
│ │ [Draft] Need to finish this...     │ │
│ │                                     │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ May 25, 2026              👥       │ │
│ │ Road trip with Mike and Emma! 📷🎥 │ │
│ │ 📍 Grand Canyon                    │ │
│ │ ❤️ 12  😊 3  💬 8                   │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### Filter Tabs

| Tab | Shows |
|-----|-------|
| **All** | All entries (private + shared) |
| **Private** | Only 🔒 private entries |
| **Shared** | Entries shared with anyone (family, friends, custom) |
| **Drafts** | Unfinished entries |

### Entry Card Elements

- **Date** - When the entry was created
- **Visibility icon** - 🔒 👨‍👩‍👧‍👦 👥 🌐 ⚙️ (tappable to change)
- **Content preview** - First few lines of text
- **Media indicators** - 📷 🎥 🎤 if photos/video/audio attached
- **Location** - 📍 Place name (links to Places feature)
- **Engagement** - Reactions and comment count (only for shared)
- **Latest comment** - Preview of most recent comment

---

## ✏️ Entry Compose/Edit Screen

```
┌─────────────────────────────────────────┐
│ ←  New Entry                    [Post]  │
├─────────────────────────────────────────┤
│                                         │
│ June 3, 2026                            │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │                                     │ │
│ │ Write your thoughts...              │ │
│ │                                     │ │
│ │                                     │ │
│ │                                     │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ + Add photos/videos                 │ │
│ └─────────────────────────────────────┘ │
│                                         │
├─────────────────────────────────────────┤
│ 📍 Add location                         │
├─────────────────────────────────────────┤
│ 🔒 Private                          ▼  │
│    Only you can see this                │
├─────────────────────────────────────────┤
│                                         │
│ [Save as Draft]                         │
└─────────────────────────────────────────┘
```

### Visibility Picker (when tapping visibility row)

```
┌─────────────────────────────────────────┐
│ Who can see this?                   ✕   │
├─────────────────────────────────────────┤
│                                         │
│ ○ 🔒 Private                           │
│   Only you can see this                 │
│                                         │
│ ○ 👨‍👩‍👧‍👦 Family                           │
│   Your family members (12 people)       │
│                                         │
│ ○ 👥 Friends                            │
│   Your friends (8 people)               │
│                                         │
│ ○ 🌐 Family & Friends                   │
│   Everyone in both groups (20 people)   │
│                                         │
│ ○ ⚙️ Custom                             │
│   Choose specific people                │
│                                         │
├─────────────────────────────────────────┤
│              [Done]                     │
└─────────────────────────────────────────┘
```

### Custom Visibility Picker

```
┌─────────────────────────────────────────┐
│ ←  Choose People                 [Done] │
├─────────────────────────────────────────┤
│ 🔍 Search...                            │
├─────────────────────────────────────────┤
│ Family                                  │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐           │
│ │ ✓ │ │    │ │ ✓ │ │    │           │
│ │ 👴 │ │ 👵 │ │ 👨 │ │ 👩 │           │
│ │Akram│ │Fatima│ │Omar│ │Layla│           │
│ └────┘ └────┘ └────┘ └────┘           │
│                                         │
│ Friends                                 │
│ ┌────┐ ┌────┐ ┌────┐                   │
│ │ ✓ │ │    │ │    │                   │
│ │Mike│ │Emma│ │ Joe│                   │
│ └────┘ └────┘ └────┘                   │
├─────────────────────────────────────────┤
│ Selected: Grandpa Akram, Dad, Mike      │
└─────────────────────────────────────────┘
```

---

## ❤️ Reactions System

For a family journal app, generic "likes" feel impersonal. Reactions should be **meaningful**:

| Reaction | Emoji | Meaning | When to use |
|----------|-------|---------|-------------|
| **Love** | ❤️ | "I love this" | Beautiful memory, heartwarming content |
| **Grateful** | 🙏 | "Thank you for sharing" | Vulnerable or meaningful posts |
| **Touched** | 😢 | "This moved me" | Sad, nostalgic, or emotional content |
| **Happy** | 😊 | "This makes me smile" | Joyful content, funny moments |
| **Hug** | 🤗 | "Sending you love" | Supportive, comforting |

### Reaction UI

```
Long press on entry → Reaction picker appears:

     ❤️    🙏    😢    😊    🤗
    Love  Thanks Moved Happy  Hug
```

### Reaction Display

```
❤️ 5  🙏 2  😊 3

Tap to expand:
├── ❤️ Mom, Dad, Grandpa, Sara, Mike
├── 🙏 Grandma, Uncle Hassan  
└── 😊 Emma, Cousin Sara, Friend Joe
```

---

## 💬 Comments / Responses

Comments should feel like **family conversations**, not social media noise.

### Design Principles

1. Call them "Responses" not "Comments" - feels more personal
2. Support threaded replies
3. Allow "Ask Question" to tie into Places question flow
4. Show conversation context

### Response Thread UI

```
┌─────────────────────────────────────────┐
│ 💬 Responses (4)                        │
├─────────────────────────────────────────┤
│ 👩 Mom                         2h ago  │
│ I remember this day! You were so       │
│ nervous to meet grandma's family.      │
│                          [Reply] [❤️]  │
│                                         │
│    ↳ 👴 Grandpa Akram          1h ago  │
│      Ha! I was terrified! Your         │
│      great-uncle was very serious.     │
│                          [Reply] [❤️]  │
│                                         │
│ 👨 Dad                        30m ago  │
│ Dad, you never told me this story!     │
│ Can you tell me more about the bakery? │
│                 [Reply] [❤️] [Answer ❓]│
├─────────────────────────────────────────┤
│ Write a response...              [Send] │
└─────────────────────────────────────────┘
```

### "Answer" Button in Responses

When someone asks a question in the comments, the entry owner sees an [Answer ❓] button. This ties into the **Places question flow**:
- Tapping opens the Interview/Answer mode
- The response gets recorded (text/audio/video)
- Both asker and answerer see the connection

---

## 📊 Data Model

```javascript
JournalEntry: {
  id: string,
  authorId: string,
  
  // Content
  title: string | null,           // Optional title
  content: string,                // Main text content
  media: [{
    id: string,
    type: 'photo' | 'video' | 'audio',
    uri: string,
    thumbnail: string | null,
    caption: string | null,
  }],
  
  // Location (connects to Places feature)
  location: {
    placeId: string | null,       // Links to Places
    name: string,
    coordinates: { lat, lng } | null,
  } | null,
  
  // Visibility
  visibility: 'private' | 'family' | 'friends' | 'family_friends' | 'custom',
  customSharedWith: [userId, ...],  // Only used when visibility = 'custom'
  
  // Status
  isDraft: boolean,
  createdAt: Date,
  updatedAt: Date,
  publishedAt: Date | null,       // When it was first shared (if ever)
  
  // Engagement (only populated if shared)
  reactions: [{
    id: string,
    userId: string,
    type: 'love' | 'grateful' | 'touched' | 'happy' | 'hug',
    createdAt: Date,
  }],
  
  comments: [{
    id: string,
    authorId: string,
    content: string,
    createdAt: Date,
    updatedAt: Date | null,
    replies: [{
      id: string,
      authorId: string,
      content: string,
      createdAt: Date,
    }],
    // If this comment contains a question
    question: {
      status: 'pending' | 'answered',
      answeredAt: Date | null,
      answerId: string | null,    // Links to answer entry/recording
    } | null,
  }],
  
  // Questions asked about this entry (from Places flow)
  questions: [{
    id: string,
    askerId: string,
    question: string,
    status: 'pending' | 'answered',
    askedAt: Date,
    answeredAt: Date | null,
    answer: {
      type: 'text' | 'audio' | 'video',
      content: string,
      duration: string | null,    // For audio/video
    } | null,
  }],
}
```

---

## 🔗 Connection to Places Feature

The Journal and Places features are deeply connected:

| Journal Action | Places Connection |
|----------------|-------------------|
| Add location to entry | Entry appears in that Place's timeline |
| Entry has media at a place | Shows in YearMemoriesModal for that place |
| Someone asks question in comments | Uses Interview mode from Places |
| Question answered | Shows in both Journal and Places |

---

## 🛠️ Implementation Phases

### Phase 1: Visibility System
- [ ] Add visibility field to entry data model
- [ ] Create VisibilityPicker component
- [ ] Create CustomPeoplePicker component
- [ ] Update JournalComposeModal with visibility selection
- [ ] Update entry cards to show visibility icons

### Phase 2: Journal Screen Updates
- [ ] Add filter tabs (All / Private / Shared / Drafts)
- [ ] Update JournalEntryCard with engagement display
- [ ] Show/hide engagement based on visibility
- [ ] Add "No comments (Private)" for private entries

### Phase 3: Reactions
- [ ] Create ReactionPicker component
- [ ] Create ReactionDisplay component
- [ ] Add reactions to entry detail view
- [ ] Store reactions in data model

### Phase 4: Comments/Responses
- [ ] Create ResponseThread component
- [ ] Create ResponseInput component
- [ ] Support threaded replies
- [ ] Add "Ask Question" capability in comments
- [ ] Connect to Places question flow

### Phase 5: Draft System
- [ ] Implement auto-save for drafts
- [ ] Create draft indicator styling
- [ ] Add "Continue editing" flow

---

## 🎨 UI Components Needed

| Component | Description |
|-----------|-------------|
| `VisibilityPicker` | Modal to select visibility level |
| `CustomPeoplePicker` | Select specific people for custom visibility |
| `VisibilityBadge` | Small icon showing visibility (🔒 👨‍👩‍👧‍👦 etc.) |
| `ReactionPicker` | Long-press popup with reaction options |
| `ReactionDisplay` | Shows reactions with counts |
| `ResponseThread` | Threaded comments display |
| `ResponseInput` | Comment input with reply support |
| `EngagementBar` | Shows reactions count + comments count |
| `JournalFilterTabs` | Tab bar for All/Private/Shared/Drafts |

---

## 📝 Open Questions

1. **Notification preferences**: Should users control which comments/reactions notify them?
2. **Edit history**: Should shared entries show "Edited" indicator?
3. **Delete behavior**: What happens to comments when an entry is deleted?
4. **Visibility changes**: Notify people when entry visibility expands (not when it restricts)?
5. **Archive vs Delete**: Should there be an archive feature for old entries?

---

## 🚫 What This Is NOT

- **Not a social feed**: Your journal is yours, not a timeline for others
- **Not public by default**: Everything is private until you share
- **Not engagement-driven**: Reactions/comments are for connection, not metrics
- **Not algorithmic**: Chronological only, no "top posts"
