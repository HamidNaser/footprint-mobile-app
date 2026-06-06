# Friends Feature - Design & Implementation Plan

> **Last Updated:** June 3, 2026  
> **Status:** Design Phase 📋  
> **Branch:** feature/google-oauth-authentication

---

## 🎯 Core Philosophy

**Friends are chosen family.**

The Friends feature mirrors the Family feature but for your chosen connections—friends you want to share memories with. While family relationships are defined by blood/marriage, friendships are defined by shared experiences and trust.

Key insight: Friends in Footprint aren't like social media "friends" (acquaintances). These are people you trust enough to share personal memories with.

---

## 👥 Friend Relationships

### Friend Categories (Optional Organization)

Users can optionally categorize friends:

| Category | Icon | Example |
|----------|------|---------|
| Close Friends | ⭐ | Best friends, inner circle |
| Childhood Friends | 🎈 | Friends from growing up |
| College/School | 🎓 | University, high school friends |
| Work Friends | 💼 | Colleagues who became friends |
| Travel Buddies | ✈️ | Friends you travel with |
| Neighbors | 🏠 | Community friends |
| Hobby Friends | 🎨 | Friends from shared interests |
| Uncategorized | 👤 | Default |

*Categories are optional and private to you—friends don't see how you've categorized them.*

---

## 📱 Friends Screen Design

### Main View - Combined Feed

```
┌─────────────────────────────────────────┐
│ Friends                                 │
├─────────────────────────────────────────┤
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐    │
│ │All │ │Mike│ │Emma│ │ Joe│ │Sarah│ →  │
│ │    │ │ •2 │ │    │ │ •1 │ │    │    │
│ └────┘ └────┘ └────┘ └────┘ └────┘    │
├─────────────────────────────────────────┤
│ Friends Feed                  [Filter ▼]│
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ 👤 Mike Johnson            3h ago  │ │
│ │ Finally hiked to the summit! The   │ │
│ │ view was absolutely worth the      │ │
│ │ 5-hour climb.                      │ │
│ │ 📷 [mountain photo]                │ │
│ │ 📍 Mt. Rainier, WA                 │ │
│ │ ❤️ 15  😊 4  💬 8                   │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ 👤 Emma Wilson           Yesterday │ │
│ │ Remember our trip here 10 years    │ │
│ │ ago? Found this old photo...       │ │
│ │ 📷 [throwback photo]               │ │
│ │ 📍 Grand Canyon, AZ                │ │
│ │ ❤️ 8  🙏 2  💬 12                   │ │
│ │ 📎 Tagged you                       │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ 👤 Joe Martinez           3 days   │ │
│ │ Our annual camping trip - year 15! │ │
│ │ 📷🎥 [media]                        │ │
│ │ 📍 Yosemite National Park          │ │
│ │ ❤️ 23  😊 8  💬 15                  │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### Friend Selector (Horizontal Scroll)

```
┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐
│All │ │Mike│ │Emma│ │ Joe│ │Sarah│ │Alex│ →
│    │ │ ⭐ │ │ 🎓 │ │ ✈️ │ │ 💼 │ │    │
│    │ │ •2 │ │    │ │ •1 │ │    │ │ •3 │
└────┘ └────┘ └────┘ └────┘ └────┘ └────┘
        ↑ Category icon (optional)
        ↑ Dot = new/unseen entries
```

### Filter Options

```
┌─────────────────────────────────────────┐
│ Filter Friends Feed                 ✕   │
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
│ Friend Groups (if using categories)     │
│ [✓] Close Friends ⭐                    │
│ [✓] Childhood Friends 🎈                │
│ [✓] College Friends 🎓                  │
│ [✓] Work Friends 💼                     │
│ [✓] Travel Buddies ✈️                   │
│ [✓] All Others                          │
├─────────────────────────────────────────┤
│ Location                                │
│ [Any location ▼]                        │
├─────────────────────────────────────────┤
│ Show entries where I'm tagged           │
│ [Toggle: ON]                            │
├─────────────────────────────────────────┤
│       [Clear All]     [Apply]           │
└─────────────────────────────────────────┘
```

---

## 👤 Friend Profile View

When you tap a friend, you see their shared journal:

```
┌─────────────────────────────────────────┐
│ ←  Mike Johnson                     ⋯   │
├─────────────────────────────────────────┤
│              ┌─────┐                    │
│              │ 👤  │                    │
│              └─────┘                    │
│          Mike Johnson                   │
│       Friend since 2015                 │
│       ⭐ Close Friend                   │
│                                         │
│   23 entries shared with you            │
│   8 places you've both been             │
│   Friends: You, Emma, Joe (3 mutual)    │
├─────────────────────────────────────────┤
│ [Timeline] [Photos] [Shared Places]     │
├─────────────────────────────────────────┤
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ June 3, 2026                       │ │
│ │ Finally hiked to the summit!       │ │
│ │ 📷                    ❤️ 15  💬 8  │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ May 20, 2026                       │ │
│ │ Road trip prep begins...           │ │
│ │ 📷                    ❤️ 8  💬 4   │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### Profile Header Details

| Element | Description |
|---------|-------------|
| Avatar | Their profile photo |
| Name | Full name |
| Friend since | When you connected |
| Category | ⭐ Close Friend (if categorized) |
| Entry count | "23 entries shared with you" |
| Shared places | "8 places you've both been" |
| Mutual friends | "Friends: You, Emma, Joe (3 mutual)" |

### Tab Views

**Timeline Tab**: Chronological list of all their shared entries

**Photos Tab**: Grid of all photos from their entries

**Shared Places Tab**: Places you've BOTH been (this is unique and powerful!)

```
┌─────────────────────────────────────────┐
│ Places You've Both Visited              │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ 📍 Grand Canyon, AZ                │ │
│ │ You: 2019 • Mike: 2019, 2023       │ │
│ │ → You were there together in 2019! │ │
│ │                    [View Memories]  │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ 📍 Manhattan, NY                   │ │
│ │ You: 2023 • Mike: 2018, 2022       │ │
│ │ Different times, same place        │ │
│ │                    [View Memories]  │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ 📍 Yosemite National Park          │ │
│ │ You: 2021 • Mike: 2021, 2024       │ │
│ │ → You were there together in 2021! │ │
│ │                    [View Memories]  │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

This is the **"Then & Now"** feature but for friends—showing your shared geography.

---

## 🏷️ Tagging Friends

### When Creating an Entry

```
┌─────────────────────────────────────────┐
│ Who were you with?                      │
├─────────────────────────────────────────┤
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐            │
│ │ ✓ │ │ ✓ │ │    │ │ + │            │
│ │Mike│ │Emma│ │ Joe│ │Add │            │
│ └────┘ └────┘ └────┘ └────┘            │
│                                         │
│ Tagged: Mike Johnson, Emma Wilson       │
└─────────────────────────────────────────┘
```

### How Tags Work

- Tagged friends see a "📎 Tagged you" indicator
- Helps build shared memory collections
- Tags are visible to people who can see the entry
- Tagged person can "Accept" (show on their profile) or "Hide" (don't show)

---

## 🔔 Key Differences from Family

| Aspect | Family | Friends |
|--------|--------|---------|
| Relationship | Fixed (blood/marriage) | Chosen |
| Categories | Generational | Interest-based (optional) |
| Connection | Automatic via family tree | Manual add/accept |
| Shared content | Family memories | Shared experiences |
| Default trust | Higher | Varies |
| Tagging | "Family was there" | "Friends I was with" |

---

## 🤝 Friend Actions

### On Entry Card

| Action | Icon | Description |
|--------|------|-------------|
| React | Long press | Add ❤️ 🙏 😢 😊 🤗 reaction |
| Comment | 💬 | Add a response |
| Share | ↗️ | Share within friends or save |
| Bookmark | 🔖 | Save to your collection |
| "I was there too!" | 📍 | If at same place, indicate you were there |

### On Friend Profile

| Action | Description |
|--------|-------------|
| **View Shared Places** | See places you've both been |
| **Message** | Direct message (if implemented) |
| **Edit Friendship** | Change category, remove |
| **Mute** | Hide their posts without unfriending |

---

## ➕ Adding Friends

### Methods to Add Friends

1. **Search by username/email**
2. **QR code scan** (for in-person)
3. **Shared link invitation**
4. **Contact book sync** (optional)
5. **Mutual friend suggestion**

### Friend Request Flow

```
┌─────────────────────────────────────────┐
│ Friend Requests                         │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ 👤 Sarah Chen                       │ │
│ │ "We met at the photography meetup"  │ │
│ │ 3 mutual friends                    │ │
│ │                                     │ │
│ │ [Accept]  [Decline]  [Message]      │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ 👤 Alex Rivera                      │ │
│ │ Via: Emma Wilson (mutual friend)    │ │
│ │ 1 mutual friend                     │ │
│ │                                     │ │
│ │ [Accept]  [Decline]  [Message]      │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

---

## 📊 Data Model

```javascript
// Friend relationship
Friendship: {
  id: string,
  userId: string,              // You
  friendId: string,            // The friend
  
  status: 'pending' | 'accepted' | 'blocked',
  initiatedBy: string,         // Who sent the request
  
  category: 'close' | 'childhood' | 'college' | 'work' | 'travel' | 'neighbor' | 'hobby' | null,
  customLabel: string | null,  // Nickname or custom label
  
  connectedSince: Date,        // When friendship was accepted
  mutedAt: Date | null,        // If muted
  
  // Cached stats
  stats: {
    totalSharedEntries: number,
    unreadEntries: number,
    sharedPlacesCount: number,
    mutualFriendsCount: number,
  }
}

// Friend request
FriendRequest: {
  id: string,
  fromUserId: string,
  toUserId: string,
  message: string | null,      // Optional personal message
  mutualFriendIds: string[],
  createdAt: Date,
  status: 'pending' | 'accepted' | 'declined',
}

// Tag on an entry
EntryTag: {
  entryId: string,
  taggedUserId: string,
  taggedBy: string,            // Entry author
  status: 'visible' | 'hidden', // Tagged person's preference
  createdAt: Date,
}
```

---

## 🔗 Connection to Other Features

### → Journal Connection
- Friends feed shows entries where `visibility` includes 'friends' or 'family_friends'
- Tagged entries appear even if visibility is more restricted
- Tapping an entry opens the full Journal entry view

### → Places Connection
- "Shared Places" shows overlap between your Places and theirs
- "I was there too!" creates a Place connection
- Supports "Then & Now" comparisons between friends

### → Family Connection
- Some people may be both family AND friends
- They appear in both feeds
- Visibility "Family & Friends" reaches both

---

## 🛠️ Implementation Phases

### Phase 1: Friends Feed Basics
- [ ] Create FriendsScreen layout
- [ ] Create FriendSelector horizontal scroll component
- [ ] Fetch and display friends entries feed
- [ ] Basic entry card with author attribution

### Phase 2: Friend Filtering
- [ ] Tap friend to filter feed
- [ ] "All" selection to show combined feed
- [ ] Unread/new entry indicators (dots)

### Phase 3: Friend Profile View
- [ ] Create FriendProfileScreen
- [ ] Profile header with stats
- [ ] Timeline tab
- [ ] Photos tab

### Phase 4: Shared Places
- [ ] Calculate shared places between you and friend
- [ ] Create SharedPlaces tab
- [ ] "Were there together" detection
- [ ] Link to Places feature

### Phase 5: Friend Categories
- [ ] Create category management UI
- [ ] Filter by category
- [ ] Category icons on friend chips

### Phase 6: Tagging System
- [ ] Add tagging during entry creation
- [ ] "Tagged you" indicator
- [ ] Accept/Hide tag preferences

### Phase 7: Friend Management
- [ ] Add friend flow (search, QR, link)
- [ ] Friend request inbox
- [ ] Edit friendship (category, mute, remove)

---

## 🎨 UI Components Needed

| Component | Description |
|-----------|-------------|
| `FriendSelector` | Horizontal scroll of friend avatars |
| `FriendChip` | Avatar + name + category icon + indicator |
| `FriendEntryCard` | Entry card with author info + tag indicator |
| `FriendProfileHeader` | Profile info + stats |
| `FriendProfileTabs` | Tab bar for Timeline/Photos/Shared Places |
| `SharedPlacesList` | List of places you've both been |
| `SharedPlaceCard` | Shows overlap with "together" detection |
| `FriendFilterSheet` | Bottom sheet with filter options |
| `TagPeoplePicker` | Select friends to tag in entry |
| `FriendRequestCard` | Incoming request with actions |
| `AddFriendSheet` | Methods to add a friend |

---

## 📝 Open Questions

1. **Privacy on tags**: Can tagged person remove tag, or just hide it?
2. **Blocking**: What happens to shared content when blocked?
3. **Friend limits**: Should there be a limit on friends?
4. **Close friends**: Special treatment for "Close Friends" category?
5. **Friend suggestions**: Algorithmic suggestions based on mutual friends?
6. **Cross-platform**: What if a friend doesn't have Footprint?

---

## 🚫 What This Is NOT

- **Not Facebook friends**: Quality over quantity
- **Not follower-based**: Mutual friendship required
- **Not public**: Friend content stays between friends
- **Not competitive**: No friend counts displayed publicly
- **Not for acquaintances**: For real friends you trust with memories
