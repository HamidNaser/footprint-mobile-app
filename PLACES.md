# Places Feature - Implementation Documentation

> **Last Updated:** June 3, 2026  
> **Status:** Prototype Complete ✅  
> **Branch:** feature/google-oauth-authentication

---

## 🎯 Vision

**"Grandpa was here in 1962, I was here in 2019"**

The Places feature connects memories across generations through shared locations. When you visit Manhattan, you can see photos from your grandfather who immigrated through Ellis Island in 1967, your uncle's business trip in 1992, your family vacation in 2017, and your own recent visit.

This creates an emotional bridge between family members across time, preserving stories that might otherwise be lost.

---

## 📱 What's Been Built

### Core Components

| Component | File | Description |
|-----------|------|-------------|
| **PlacesScreen** | `src/screens/PlacesScreen.js` | Main screen with filter tabs, search, place cards with year panels |
| **YearMemoriesModal** | `src/components/places/YearMemoriesModal.js` | Shows all memories from a specific year at a place |
| **MemoryCard** | `src/components/places/MemoryCard.js` | Photo card with author attribution (grid/compact/default variants) |
| **ThenNowComparison** | `src/components/places/ThenNowComparison.js` | Side-by-side or slider view comparing old vs new photos |
| **IWasHereIndicator** | `src/components/places/IWasHereIndicator.js` | Badge showing user has visited a place |
| **MemoryRequestCard** | `src/components/places/MemoryRequestCard.js` | "Ask about this place" UI for requesting memories |
| **ShareMemorySheet** | `src/components/places/ShareMemorySheet.js` | Bottom sheet for sharing memories |
| **InterviewModeScreen** | `src/screens/InterviewModeScreen.js` | Guided interview for recording elder stories |

### Data Layer

| File | Description |
|------|-------------|
| `src/data/placesData.js` | Mock data with PEOPLE, PLACE_MEMORIES, INTERVIEW_QUESTIONS |
| `src/api/PlacesApi.js` | API service layer (ready for backend integration) |

### Navigation

- `InterviewMode` screen added to AppNavigator with fullScreenModal presentation

---

## 🔄 User Flow (Current Prototype)

```
Places Tab
    │
    ├── Filter Tabs (Everyone / Family / Friends / Following)
    │
    ├── Search Box
    │
    └── Place Cards
         │
         ├── Place Image + "I Was Here" badge ──► Place Detail Modal
         │
         └── Years Panel (2023, 2017, 1992, 1967...)
              │
              └── Tap Year ──► YearMemoriesModal
                               │
                               ├── People Strip (who was here)
                               │
                               ├── "I was here too" banner (if user wasn't there)
                               │
                               └── Memory Cards (grid or feed view)
                                    │
                                    ├── YOUR MEMORY with questions:
                                    │    └── 🟠 Orange banner: "Mike asked about this"
                                    │         └── Tap ──► See questions + Record answer
                                    │
                                    ├── OTHERS' MEMORY (no question asked yet):
                                    │    └── "Ask" button in action bar
                                    │         └── Tap ──► MemoryRequestCard modal
                                    │              ├── Memory preview
                                    │              ├── Pre-selected recipient
                                    │              ├── Suggested questions
                                    │              └── Send ──► Question sent!
                                    │
                                    └── OTHERS' MEMORY (you already asked):
                                         └── Status: "Waiting for answer..." or "Answered!"
```

### Question Flow Summary

**You see someone's photo → Want to ask about it:**
1. Tap "Ask" button in the action bar
2. Pick a suggested question or write your own
3. Send → They get notified

**Someone asks about YOUR photo:**
1. Orange banner appears on your memory card
2. Shows who asked (or how many people)
3. Tap to see question(s) and record your answer

**Tracking your questions:**
- Gray bar: "Waiting for answer..."
- Green bar: "Your question was answered!"

---

## 📊 Mock Data Structure

### People (PEOPLE object)
```javascript
{
  me: { id: 'me', name: 'You', relationship: 'self' },
  grandpa_akram: { id: 'grandpa_akram', name: 'Akram Naser', relationship: 'grandfather', birthYear: 1942 },
  grandma_fatima: { ... },
  dad_omar: { ... },
  mom_layla: { ... },
  uncle_hassan: { ... },
  cousin_sara: { ... },
  friend_mike: { ... },
  friend_emma: { ... }
}
```

### Place Memories (PLACE_MEMORIES object)
Organized by placeId, each memory includes:
- `year`, `date`, `author`
- `media[]` (photos/videos)
- `caption`
- `isCurrentUser` flag
- `hasStory`, `storyPrompt` (for untold stories)

### Interview Questions (INTERVIEW_QUESTIONS object)
Templates for:
- **General**: Year, who were you with, occasion, what do you remember
- **Landmark**: First time seeing it, how it made you feel
- **Hometown**: How long lived there, favorite places, neighbors

### Memory Questions (MEMORY_QUESTIONS array)
Tracks questions people ask about memories:
```javascript
{
  id: 'q1',
  memoryId: 'm7',           // Which memory this is about
  memoryOwnerId: 'grandpa', // Who owns the memory
  askerId: 'cousin_sara',   // Who asked the question
  question: "What was it like arriving in America?",
  status: 'pending' | 'answered',
  askedAt: '2024-01-15',
  answeredAt: '2024-01-20', // null if pending
  answer: { type: 'audio', duration: '3:45', transcript: '...' }
}
```

Helper functions:
- `getQuestionsForMemory(memoryId)` - All questions about a memory
- `getMyPendingQuestions()` - Questions you asked (waiting)
- `getMyAnsweredQuestions()` - Questions you asked (answered)
- `getQuestionsAskedToMe()` - Questions about YOUR memories
- `getPendingQuestionsForMe()` - Unanswered questions on your memories

---

## ✨ Prototype Features Implemented

### 1. **Year-Based Memory Timeline**
- See who visited a place in each year
- Avatar groups show family/friends
- Memory count badges

### 2. **"I Was Here" Indicators**
- Green badge on places user has visited
- Shows multiple visit count
- Year pills showing when user visited

### 3. **Untold Stories Detection**
- Orange mic icon on years with story prompts
- "Ask Grandpa about his first day in America"
- Links to Interview Mode

### 4. **Interview Mode**
- Large, accessible UI for older relatives
- Step-by-step guided questions
- Voice recording interface (mock)
- Photo attachment option
- Progress tracking

### 5. **Then & Now Comparison**
- Side-by-side view mode
- Slider overlay mode
- Year labels and author attribution
- "X years apart" display

### 6. **Memory Questions (Ask for Stories)**

**Asking about someone's memory:**
- "Ask" button in memory card action bar
- Opens request modal with:
  - Memory preview
  - Pre-selected recipient (memory's author)
  - Suggested context-aware questions
  - Custom message option

**For the person who asked (asker):**
- Status indicator on the memory: "Waiting for answer..." or "Your question was answered!"
- Gray status bar for pending, green for answered

**For the memory owner (recipient):**
- Orange banner on YOUR memory: "Mike asked about this" or "3 people asked about this"
- Tap to see questions and record answers
- Badge count if multiple people asked

### 7. **Sharing**
- Native share integration
- Send to specific family members
- Copy link
- Save to device
- Create Then & Now comparison to share

---

## 🛠️ Technical Details

### Component Variants

**MemoryCard** supports three variants:
- `default` - Full card with header, image, caption, actions
- `compact` - Horizontal row layout
- `grid` - Square thumbnail for grid views

**IWasHereIndicator** supports:
- `badge` - Simple "I was here" badge
- `count` - Shows visit count (3x)
- `years` - Shows year pills
- `full` - Badge + years combined

### Relationship Colors
```javascript
self: '#4361ee'      // Blue
grandfather/mother: '#9333ea'  // Purple
father/mother: '#059669'       // Green
uncle/aunt: '#0891b2'          // Cyan
cousin: '#ea580c'              // Orange
friend: '#64748b'              // Gray
```

---

## 🚧 What's Not Yet Implemented

### Backend Integration
- [ ] Real API calls (currently using mock data)
- [ ] User authentication for memories
- [ ] Real-time updates when family adds memories

### Audio/Media
- [ ] Actual audio recording (currently mock)
- [ ] Audio playback
- [ ] Video support
- [ ] Photo uploads

### Push Notifications
- [ ] Memory request notifications
- [ ] "Someone added a memory at a place you've been"

### Easy Upload Flow (for grandparents)
- [ ] Batch photo upload
- [ ] Date picker for old photos
- [ ] Location picker for old photos
- [ ] "Upload for someone else" flow

### Advanced Features
- [ ] Map view of all places
- [ ] Search by year ("Show me all 1960s memories")
- [ ] Family tree integration
- [ ] Export family place history as PDF/book

---

## 📁 File Structure

```
src/
├── api/
│   └── PlacesApi.js              # API service layer
├── components/
│   └── places/
│       ├── index.js              # Component exports
│       ├── MemoryCard.js         # Individual memory display
│       ├── YearMemoriesModal.js  # Year memories modal
│       ├── ThenNowComparison.js  # Photo comparison view
│       ├── IWasHereIndicator.js  # Visit indicators
│       ├── MemoryRequestCard.js  # Request memories UI
│       └── ShareMemorySheet.js   # Share bottom sheet
├── data/
│   └── placesData.js             # Mock data + helpers
├── screens/
│   ├── PlacesScreen.js           # Main places screen
│   └── InterviewModeScreen.js    # Interview recording screen
└── navigation/
    └── AppNavigator.js           # Includes InterviewMode route
```

---

## 🎨 Design Decisions

1. **Year panels on place cards** - Immediate visibility of "who was here when" without extra taps
2. **Orange mic indicator** - Visual cue for untold stories, prompts action
3. **Large interview UI** - Accessibility for 60+ users who provide content
4. **Relationship badges** - Quick understanding of family connections
5. **Grid + Feed toggle** - Browse quickly or read deeply

---

## 📝 Next Steps to Consider

### High Priority
1. **Backend API integration** - Connect to real data
2. **Audio recording** - Make interview mode functional
3. **Photo upload** - Allow adding memories

### Medium Priority
4. **Push notifications** - Memory requests & new memories
5. **Map view** - See all places geographically
6. **Family tree link** - Connect to family relationships

### Future Ideas
7. **AI story transcription** - Convert audio to text
8. **Photo enhancement** - Restore old photos
9. **Memory book export** - Create printable albums
10. **AR "then & now"** - Camera overlay of old photos at locations

---

## 🔗 Related Files

- Web app reference: `C:\Work\mine\footprint-web-app` (PlacesPage.jsx, PlacesList.jsx)
- Tracking doc: `/memories/repo/places-feature-implementation.md`

---

## 💡 Key Insight

The target demographic is **30-49 year olds** who will onboard their family. They're tech-savvy enough to set things up, but the **60+ content providers** need simple, accessible flows (hence Interview Mode's large buttons and step-by-step guidance).

The emotional hook is powerful: seeing your grandfather's immigration photo at the same place you took a selfie 56 years later creates an irreplaceable family connection.
