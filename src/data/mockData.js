/**
 * Mock Data - Matches Web App (footprint-web-app)
 * 
 * This data is used ONLY in development mode (__DEV__) when the database is empty.
 * In production, data comes from the local SQLite database and syncs with the backend.
 */

// Mock Users - consistent with web app
export const MOCK_USERS = {
  manal: {
    id: 'user_manal',
    name: 'Manal Ahmad',
    handle: '@manalahm',
    email: 'manal.ahmad@example.com',
    avatarUrl: 'https://randomuser.me/api/portraits/women/47.jpg',
  },
  huda: {
    id: 'user_huda',
    name: 'Huda Mohamad',
    handle: '@hudamoh',
    email: 'huda.mohamad@example.com',
    avatarUrl: 'https://randomuser.me/api/portraits/women/49.jpg',
  },
  ahmad: {
    id: 'user_ahmad',
    name: 'Ahmad Naser',
    handle: '@ahmadnsr',
    email: 'ahmad.naser@example.com',
    avatarUrl: 'https://randomuser.me/api/portraits/men/32.jpg',
  },
  sara: {
    id: 'user_sara',
    name: 'Sara Khalil',
    handle: '@sarakhalil',
    email: 'sara.khalil@example.com',
    avatarUrl: 'https://randomuser.me/api/portraits/women/65.jpg',
  },
};

// Default dev user (for AuthContext)
export const DEV_USER = MOCK_USERS.manal;

// Static Mock Entries - matches web app journalEntries.json (historical data)
const STATIC_MOCK_ENTRIES = [
  {
    localId: 'entry_001',
    serverId: 'entry_001',
    journalId: 'default',
    userId: 'user_manal',
    syncStatus: 'synced',
    createdAt: new Date('2024-05-15T10:30:00Z').getTime(),
    visibility: 'private',
    location: { lat: 34.0195, lng: -118.4912, name: 'Santa Monica, CA' },
    contentBlocks: [
      { 
        type: 'text', 
        content: 'Had an amazing morning at the beach today! The weather was perfect and the kids had so much fun.' 
      },
      { 
        type: 'photos', 
        media: [
          { id: 'photo_001_1', serverUrl: 'https://picsum.photos/seed/beach1/800/600' },
          { id: 'photo_001_2', serverUrl: 'https://picsum.photos/seed/beach2/800/600' },
        ]
      },
      { 
        type: 'text', 
        content: 'The sunset was absolutely breathtaking! We stayed until the sky turned orange and pink.' 
      },
    ],
    reactions: {
      heart: [MOCK_USERS.sara, MOCK_USERS.ahmad, MOCK_USERS.huda],
      hug: [MOCK_USERS.sara],
    },
    responses: [
      {
        id: 'resp_001_1',
        user: MOCK_USERS.sara,
        text: 'This looks incredible! We should go together next time 🌊',
        createdAt: new Date('2024-05-15T11:15:00Z').getTime(),
      },
      {
        id: 'resp_001_2',
        user: MOCK_USERS.ahmad,
        text: 'Beautiful photos! The kids look so happy.',
        createdAt: new Date('2024-05-15T12:30:00Z').getTime(),
      },
    ],
    responsesCount: 2,
  },
  {
    localId: 'entry_002',
    serverId: 'entry_002',
    journalId: 'default',
    userId: 'user_huda',
    syncStatus: 'synced',
    createdAt: new Date('2024-05-15T08:15:00Z').getTime(),
    visibility: 'private',
    location: { lat: 33.9425, lng: -118.4081, name: 'Playa Vista, CA' },
    contentBlocks: [
      { 
        type: 'audio', 
        media: [{ id: 'audio_002_1', serverUrl: '/audio/file_example_MP3_700KB.mp3', duration: 165 }]
      },
    ],
    reactions: {
      heart: [MOCK_USERS.manal],
      thanks: [MOCK_USERS.ahmad],
    },
    responses: [],
    responsesCount: 0,
  },
  {
    localId: 'entry_003',
    serverId: 'entry_003',
    journalId: 'default',
    userId: 'user_ahmad',
    syncStatus: 'synced',
    createdAt: new Date('2024-05-14T19:45:00Z').getTime(),
    visibility: 'family',
    location: { lat: 34.0522, lng: -118.2437, name: 'Los Angeles, CA' },
    contentBlocks: [
      { 
        type: 'text', 
        content: "Started learning to cook today! Here's my first attempt at making pasta from scratch." 
      },
      { 
        type: 'photos', 
        media: [
          { id: 'photo_003_1', serverUrl: 'https://picsum.photos/seed/pasta/800/600' },
        ]
      },
      { 
        type: 'audio', 
        media: [{ id: 'audio_003_1', serverUrl: '/audio/file_example_MP3_700KB.mp3', duration: 32 }]
      },
      { 
        type: 'text', 
        content: "Not perfect but I'm proud of myself! Will definitely try again next weekend." 
      },
    ],
    reactions: {
      heart: [MOCK_USERS.manal, MOCK_USERS.huda],
      happy: [MOCK_USERS.sara],
      thanks: [MOCK_USERS.manal],
    },
    responses: [
      {
        id: 'resp_003_1',
        user: MOCK_USERS.manal,
        text: 'That looks delicious! You should share the recipe 🍝',
        createdAt: new Date('2024-05-14T20:00:00Z').getTime(),
      },
    ],
    responsesCount: 1,
  },
  {
    localId: 'entry_004',
    serverId: 'entry_004',
    journalId: 'default',
    userId: 'user_manal',
    syncStatus: 'synced',
    createdAt: new Date('2024-05-13T14:20:00Z').getTime(),
    visibility: 'private',
    location: null,
    contentBlocks: [
      { 
        type: 'text', 
        content: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.' 
      },
    ],
    reactions: {},
    responses: [],
    responsesCount: 0,
  },
  {
    localId: 'entry_005',
    serverId: 'entry_005',
    journalId: 'default',
    userId: 'user_sara',
    syncStatus: 'synced',
    createdAt: new Date('2024-05-12T09:00:00Z').getTime(),
    visibility: 'family_friends',
    location: { lat: 46.8182, lng: 8.2275, name: 'Switzerland' },
    contentBlocks: [
      { 
        type: 'photos', 
        media: [
          { id: 'photo_005_1', serverUrl: 'https://picsum.photos/seed/mountain1/800/600' },
          { id: 'photo_005_2', serverUrl: 'https://picsum.photos/seed/mountain2/800/600' },
          { id: 'photo_005_3', serverUrl: 'https://picsum.photos/seed/forest/800/600' },
        ]
      },
    ],
    reactions: {
      heart: [MOCK_USERS.manal, MOCK_USERS.ahmad, MOCK_USERS.huda],
      touched: [MOCK_USERS.manal],
      hug: [MOCK_USERS.ahmad],
    },
    responses: [
      {
        id: 'resp_005_1',
        user: MOCK_USERS.manal,
        text: 'Breathtaking views! Switzerland is definitely on my bucket list 🏔️',
        createdAt: new Date('2024-05-12T10:30:00Z').getTime(),
      },
      {
        id: 'resp_005_2',
        user: MOCK_USERS.ahmad,
        text: 'Incredible! How was the hiking?',
        createdAt: new Date('2024-05-12T11:45:00Z').getTime(),
      },
      {
        id: 'resp_005_3',
        user: MOCK_USERS.huda,
        text: 'I can almost smell the fresh mountain air through these photos!',
        createdAt: new Date('2024-05-12T14:00:00Z').getTime(),
      },
    ],
    responsesCount: 3,
  },
  {
    localId: 'entry_006',
    serverId: 'entry_006',
    journalId: 'default',
    userId: 'user_ahmad',
    syncStatus: 'synced',
    createdAt: new Date('2024-05-11T16:30:00Z').getTime(),
    visibility: 'family_friends',
    location: { lat: 34.0522, lng: -118.2437, name: 'Griffith Park, LA' },
    contentBlocks: [
      { 
        type: 'text', 
        content: 'Just finished my morning run! 5K in under 25 minutes - new personal best! 🏃‍♂️' 
      },
      { 
        type: 'photos', 
        media: [
          { id: 'photo_006_1', serverUrl: 'https://picsum.photos/seed/running/800/600' },
        ]
      },
    ],
    reactions: {
      heart: [MOCK_USERS.manal, MOCK_USERS.sara],
      happy: [MOCK_USERS.huda],
    },
    responses: [
      {
        id: 'resp_006_1',
        user: MOCK_USERS.huda,
        text: 'So proud of you! Keep it up! 💪',
        createdAt: new Date('2024-05-11T17:00:00Z').getTime(),
      },
    ],
    responsesCount: 1,
  },
  {
    localId: 'entry_007',
    serverId: 'entry_007',
    journalId: 'default',
    userId: 'user_huda',
    syncStatus: 'synced',
    createdAt: new Date('2024-05-10T12:00:00Z').getTime(),
    visibility: 'friends',
    location: { lat: 34.0195, lng: -118.4912, name: 'Blue Bottle Coffee, Santa Monica' },
    contentBlocks: [
      { 
        type: 'text', 
        content: 'Coffee date with my best friend after so long! Nothing beats good conversations over lattes ☕' 
      },
      { 
        type: 'photos', 
        media: [
          { id: 'photo_007_1', serverUrl: 'https://picsum.photos/seed/coffee1/800/600' },
          { id: 'photo_007_2', serverUrl: 'https://picsum.photos/seed/coffee2/800/600' },
        ]
      },
    ],
    reactions: {
      heart: [MOCK_USERS.manal],
      hug: [MOCK_USERS.sara, MOCK_USERS.ahmad],
    },
    responses: [],
    responsesCount: 0,
  },
];

// Generate dynamic entries for recent days (relative to current date)
const generateRecentEntries = () => {
  const now = new Date();
  const recentEntries = [];
  
  // Today's entry
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 30, 0);
  recentEntries.push({
    localId: 'entry_today_001',
    serverId: 'entry_today_001',
    journalId: 'default',
    userId: 'user_manal',
    syncStatus: 'synced',
    createdAt: todayDate.getTime(),
    visibility: 'private',
    location: { lat: 34.0195, lng: -118.4912, name: 'Home' },
    contentBlocks: [
      { 
        type: 'text', 
        content: 'this is a test' 
      },
    ],
    reactions: {},
    responses: [],
    responsesCount: 0,
  });
  
  // Yesterday's entry
  const yesterdayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 14, 0, 0);
  recentEntries.push({
    localId: 'entry_yesterday_001',
    serverId: 'entry_yesterday_001',
    journalId: 'default',
    userId: 'user_ahmad',
    syncStatus: 'synced',
    createdAt: yesterdayDate.getTime(),
    visibility: 'friends',
    location: { lat: 34.0522, lng: -118.2437, name: 'Downtown LA' },
    contentBlocks: [
      { 
        type: 'text', 
        content: 'Great meeting today with the team! Exciting projects coming up.' 
      },
      { 
        type: 'photos', 
        media: [
          { id: 'photo_yest_1', serverUrl: 'https://picsum.photos/seed/meeting1/800/600' },
        ]
      },
    ],
    reactions: {
      heart: [MOCK_USERS.manal, MOCK_USERS.sara],
    },
    responses: [
      {
        id: 'resp_yest_1',
        user: MOCK_USERS.manal,
        text: 'Can\'t wait to hear more about it!',
        createdAt: yesterdayDate.getTime() + 3600000, // 1 hour later
      },
    ],
    responsesCount: 1,
  });
  
  // 2 days ago
  const twoDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2, 10, 15, 0);
  recentEntries.push({
    localId: 'entry_2days_001',
    serverId: 'entry_2days_001',
    journalId: 'default',
    userId: 'user_sara',
    syncStatus: 'synced',
    createdAt: twoDaysAgo.getTime(),
    visibility: 'family',
    location: { lat: 34.0195, lng: -118.4912, name: 'Santa Monica Pier' },
    contentBlocks: [
      { 
        type: 'text', 
        content: 'Weekend fun at the pier! 🎢🎡 The kids loved the rides.' 
      },
      { 
        type: 'photos', 
        media: [
          { id: 'photo_2d_1', serverUrl: 'https://picsum.photos/seed/pier1/800/600' },
          { id: 'photo_2d_2', serverUrl: 'https://picsum.photos/seed/pier2/800/600' },
        ]
      },
    ],
    reactions: {
      heart: [MOCK_USERS.huda],
      happy: [MOCK_USERS.manal, MOCK_USERS.ahmad],
    },
    responses: [],
    responsesCount: 0,
  });
  
  return recentEntries;
};

// Combine static mock entries with dynamic recent entries
const RECENT_ENTRIES = generateRecentEntries();
const ALL_MOCK_ENTRIES = [...RECENT_ENTRIES, ...STATIC_MOCK_ENTRIES];

// Export the combined entries (recent + historical)
export { ALL_MOCK_ENTRIES as MOCK_ENTRIES };

/**
 * Get user by ID
 * @param {string} userId 
 * @returns {object|null}
 */
export const getMockUserById = (userId) => {
  return Object.values(MOCK_USERS).find(u => u.id === userId) || null;
};

/**
 * Get entries with author info populated
 * @returns {Array}
 */
export const getMockEntriesWithAuthors = () => {
  return ALL_MOCK_ENTRIES.map(entry => ({
    ...entry,
    author: getMockUserById(entry.userId),
  }));
};
