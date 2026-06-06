/**
 * Family Journal Data - Mock entries for family members
 * 
 * This data is used ONLY in development mode (__DEV__) to show 
 * journal entries when viewing a family member's journal.
 * 
 * In production, this would be fetched from the API based on
 * visibility permissions and relationship.
 */

// Import family data for reference
import { FAMILY_BRANCH_DATA, FAMILY_LIST_DATA } from './familyData';

/**
 * Family members lookup - combines all family members for easy lookup
 */
const FAMILY_MEMBERS = {};

// Extract all members from branch data
FAMILY_BRANCH_DATA.branches.forEach(head => {
  FAMILY_MEMBERS[head.id] = {
    id: head.id,
    name: head.name,
    avatar: head.avatar,
  };
  if (head.spouse) {
    FAMILY_MEMBERS[head.spouse.id] = {
      id: head.spouse.id,
      name: head.spouse.name,
      avatar: head.spouse.avatar,
    };
  }
  if (head.children) {
    head.children.forEach(child => {
      FAMILY_MEMBERS[child.id] = {
        id: child.id,
        name: child.name,
        avatar: child.avatar,
      };
    });
  }
});

/**
 * Get family member by ID
 */
export const getFamilyMemberById = (id) => FAMILY_MEMBERS[id] || null;

/**
 * Get all family members
 */
export const getAllFamilyMembers = () => Object.values(FAMILY_MEMBERS);

/**
 * Mock journal entries for family members
 * These entries have visibility set to 'family' or 'family_friends'
 * so they would be visible to family members
 */
export const FAMILY_JOURNAL_ENTRIES = [
  // === Akram Naser's Entries ===
  {
    localId: 'fam_entry_001',
    serverId: 'fam_entry_001',
    journalId: 'akram_journal',
    userId: 'head1', // Akram Naser
    syncStatus: 'synced',
    createdAt: new Date().setHours(9, 30, 0, 0), // Today 9:30 AM
    visibility: 'family',
    location: { lat: 33.8869, lng: 35.5131, name: 'Beirut, Lebanon' },
    contentBlocks: [
      { 
        type: 'text', 
        content: 'صباح الخير للجميع! يوم جديد مليء بالأمل والنشاط. الحمد لله على كل شيء 🌅' 
      },
      { 
        type: 'photos', 
        media: [
          { id: 'fam_photo_001_1', serverUrl: 'https://picsum.photos/seed/beirut1/800/600' },
        ]
      },
    ],
    reactions: {},
    responses: [],
    responsesCount: 0,
  },
  {
    localId: 'fam_entry_002',
    serverId: 'fam_entry_002',
    journalId: 'akram_journal',
    userId: 'head1', // Akram Naser
    syncStatus: 'synced',
    createdAt: new Date(Date.now() - 86400000).setHours(18, 0, 0, 0), // Yesterday 6 PM
    visibility: 'family',
    location: { lat: 33.8869, lng: 35.5131, name: 'Home' },
    contentBlocks: [
      { 
        type: 'text', 
        content: 'عشاء عائلي رائع اليوم! الأولاد كلهم جمعونا. لحظات لا تقدر بثمن 👨‍👩‍👧‍👦❤️' 
      },
      { 
        type: 'photos', 
        media: [
          { id: 'fam_photo_002_1', serverUrl: 'https://picsum.photos/seed/familydinner/800/600' },
          { id: 'fam_photo_002_2', serverUrl: 'https://picsum.photos/seed/dinner2/800/600' },
        ]
      },
    ],
    reactions: {
      heart: [FAMILY_MEMBERS['wife1'], FAMILY_MEMBERS['ch1']],
    },
    responses: [
      {
        id: 'resp_fam_001',
        user: FAMILY_MEMBERS['ch1'],
        text: 'كان يوم جميل بابا! 💕',
        createdAt: new Date(Date.now() - 86400000 + 7200000).getTime(),
      },
    ],
    responsesCount: 1,
  },

  // === Sawsan Alsuos's Entries (wife1) ===
  {
    localId: 'fam_entry_003',
    serverId: 'fam_entry_003',
    journalId: 'sawsan_journal',
    userId: 'wife1', // Sawsan
    syncStatus: 'synced',
    createdAt: new Date().setHours(11, 0, 0, 0), // Today 11 AM
    visibility: 'family',
    location: { lat: 33.8869, lng: 35.5131, name: 'Kitchen' },
    contentBlocks: [
      { 
        type: 'text', 
        content: 'طبخت اليوم مقلوبة على طريقة الست! الريحة ملأت البيت كله 🍲' 
      },
      { 
        type: 'photos', 
        media: [
          { id: 'fam_photo_003_1', serverUrl: 'https://picsum.photos/seed/maqluba/800/600' },
        ]
      },
      { 
        type: 'text', 
        content: 'الوصفة من أمي الله يرحمها. كل مرة بحس إنها معنا ❤️' 
      },
    ],
    reactions: {
      heart: [FAMILY_MEMBERS['head1'], FAMILY_MEMBERS['ch2']],
      touched: [FAMILY_MEMBERS['ch1']],
    },
    responses: [],
    responsesCount: 0,
  },

  // === Reem Naser's Entries (ch1) ===
  {
    localId: 'fam_entry_004',
    serverId: 'fam_entry_004',
    journalId: 'reem_journal',
    userId: 'ch1', // Reem
    syncStatus: 'synced',
    createdAt: new Date().setHours(14, 30, 0, 0), // Today 2:30 PM
    visibility: 'family',
    location: { lat: 40.7128, lng: -74.0060, name: 'New York, NY' },
    contentBlocks: [
      { 
        type: 'text', 
        content: 'First day at the new job! Everyone is so welcoming. Feeling blessed 🙏✨' 
      },
      { 
        type: 'photos', 
        media: [
          { id: 'fam_photo_004_1', serverUrl: 'https://picsum.photos/seed/office/800/600' },
          { id: 'fam_photo_004_2', serverUrl: 'https://picsum.photos/seed/nyc/800/600' },
        ]
      },
    ],
    reactions: {
      heart: [FAMILY_MEMBERS['head1'], FAMILY_MEMBERS['wife1']],
      happy: [FAMILY_MEMBERS['ch2'], FAMILY_MEMBERS['ch3']],
    },
    responses: [
      {
        id: 'resp_fam_002',
        user: FAMILY_MEMBERS['head1'],
        text: 'Proud of you habibti! 👏',
        createdAt: new Date().setHours(15, 0, 0, 0),
      },
      {
        id: 'resp_fam_003',
        user: FAMILY_MEMBERS['wife1'],
        text: 'الله يوفقك يا بنتي ❤️',
        createdAt: new Date().setHours(15, 30, 0, 0),
      },
    ],
    responsesCount: 2,
  },
  {
    localId: 'fam_entry_005',
    serverId: 'fam_entry_005',
    journalId: 'reem_journal',
    userId: 'ch1', // Reem
    syncStatus: 'synced',
    createdAt: new Date(Date.now() - 172800000).setHours(20, 0, 0, 0), // 2 days ago
    visibility: 'family_friends',
    location: { lat: 40.7484, lng: -73.9857, name: 'Empire State Building' },
    contentBlocks: [
      { 
        type: 'text', 
        content: 'Took some visitors to see the city from above! Never gets old 🏙️' 
      },
      { 
        type: 'photos', 
        media: [
          { id: 'fam_photo_005_1', serverUrl: 'https://picsum.photos/seed/empire1/800/600' },
          { id: 'fam_photo_005_2', serverUrl: 'https://picsum.photos/seed/empire2/800/600' },
          { id: 'fam_photo_005_3', serverUrl: 'https://picsum.photos/seed/nycnight/800/600' },
        ]
      },
    ],
    reactions: {
      heart: [FAMILY_MEMBERS['wife1']],
    },
    responses: [],
    responsesCount: 0,
  },

  // === Rana Naser's Entries (ch2) ===
  {
    localId: 'fam_entry_006',
    serverId: 'fam_entry_006',
    journalId: 'rana_journal',
    userId: 'ch2', // Rana
    syncStatus: 'synced',
    createdAt: new Date(Date.now() - 86400000).setHours(10, 0, 0, 0), // Yesterday
    visibility: 'family',
    location: { lat: 48.8566, lng: 2.3522, name: 'Paris, France' },
    contentBlocks: [
      { 
        type: 'text', 
        content: 'Paris in spring is magical! Coffee by the Seine, what more could you ask for? ☕🗼' 
      },
      { 
        type: 'photos', 
        media: [
          { id: 'fam_photo_006_1', serverUrl: 'https://picsum.photos/seed/paris1/800/600' },
          { id: 'fam_photo_006_2', serverUrl: 'https://picsum.photos/seed/seine/800/600' },
        ]
      },
    ],
    reactions: {
      heart: [FAMILY_MEMBERS['head1'], FAMILY_MEMBERS['ch1']],
      touched: [FAMILY_MEMBERS['wife1']],
    },
    responses: [
      {
        id: 'resp_fam_004',
        user: FAMILY_MEMBERS['ch1'],
        text: 'Jealous! Take me next time 😍',
        createdAt: new Date(Date.now() - 86400000 + 3600000).getTime(),
      },
    ],
    responsesCount: 1,
  },

  // === Amar Naser's Entries (ch3) ===
  {
    localId: 'fam_entry_007',
    serverId: 'fam_entry_007',
    journalId: 'amar_journal',
    userId: 'ch3', // Amar
    syncStatus: 'synced',
    createdAt: new Date().setHours(7, 0, 0, 0), // Today 7 AM
    visibility: 'family',
    location: { lat: 34.0522, lng: -118.2437, name: 'Los Angeles, CA' },
    contentBlocks: [
      { 
        type: 'text', 
        content: 'Morning workout done! 💪 5km run to start the day. The weather is perfect here.' 
      },
    ],
    reactions: {
      happy: [FAMILY_MEMBERS['head1']],
    },
    responses: [],
    responsesCount: 0,
  },
  {
    localId: 'fam_entry_008',
    serverId: 'fam_entry_008',
    journalId: 'amar_journal',
    userId: 'ch3', // Amar
    syncStatus: 'synced',
    createdAt: new Date(Date.now() - 259200000).setHours(15, 0, 0, 0), // 3 days ago
    visibility: 'family_friends',
    location: { lat: 34.1341, lng: -118.3215, name: 'Griffith Observatory' },
    contentBlocks: [
      { 
        type: 'text', 
        content: 'Best hiking spot in LA! The view from Griffith is unmatched 🌄' 
      },
      { 
        type: 'photos', 
        media: [
          { id: 'fam_photo_008_1', serverUrl: 'https://picsum.photos/seed/griffith1/800/600' },
          { id: 'fam_photo_008_2', serverUrl: 'https://picsum.photos/seed/griffith2/800/600' },
        ]
      },
      { 
        type: 'text', 
        content: 'Can see all the way to the ocean on a clear day like this!' 
      },
    ],
    reactions: {
      heart: [FAMILY_MEMBERS['wife1'], FAMILY_MEMBERS['ch1'], FAMILY_MEMBERS['ch2']],
    },
    responses: [],
    responsesCount: 0,
  },

  // === Mahnoud Naser's Entries (head2 - uncle) ===
  {
    localId: 'fam_entry_009',
    serverId: 'fam_entry_009',
    journalId: 'mahnoud_journal',
    userId: 'head2', // Mahnoud
    syncStatus: 'synced',
    createdAt: new Date(Date.now() - 86400000).setHours(16, 0, 0, 0), // Yesterday
    visibility: 'family',
    location: { lat: 31.9454, lng: 35.9284, name: 'Amman, Jordan' },
    contentBlocks: [
      { 
        type: 'text', 
        content: 'زيارة جميلة لوسط البلد اليوم. كل زاوية فيها ذكرى 🏛️' 
      },
      { 
        type: 'photos', 
        media: [
          { id: 'fam_photo_009_1', serverUrl: 'https://picsum.photos/seed/amman/800/600' },
        ]
      },
    ],
    reactions: {
      heart: [FAMILY_MEMBERS['head1']],
      touched: [FAMILY_MEMBERS['wife1']],
    },
    responses: [],
    responsesCount: 0,
  },

  // === Adila Murar's Entries (wife2 - aunt) ===
  {
    localId: 'fam_entry_010',
    serverId: 'fam_entry_010',
    journalId: 'adila_journal',
    userId: 'wife2', // Adila
    syncStatus: 'synced',
    createdAt: new Date().setHours(12, 0, 0, 0), // Today noon
    visibility: 'family',
    location: null,
    contentBlocks: [
      { 
        type: 'text', 
        content: 'بدأت مشروع تطريز جديد! إن شاء الله يطلع حلو 🧵✨' 
      },
      { 
        type: 'photos', 
        media: [
          { id: 'fam_photo_010_1', serverUrl: 'https://picsum.photos/seed/embroidery/800/600' },
        ]
      },
    ],
    reactions: {
      heart: [FAMILY_MEMBERS['wife1']],
      happy: [FAMILY_MEMBERS['ch4']],
    },
    responses: [
      {
        id: 'resp_fam_005',
        user: FAMILY_MEMBERS['wife1'],
        text: 'شو حلو! علميني 😍',
        createdAt: new Date().setHours(12, 30, 0, 0),
      },
    ],
    responsesCount: 1,
  },
];

/**
 * Get entries for a specific family member
 */
export const getEntriesForMember = (memberId) => {
  return FAMILY_JOURNAL_ENTRIES.filter(entry => entry.userId === memberId);
};

/**
 * Get entries for multiple family members (for group view)
 */
export const getEntriesForMembers = (memberIds) => {
  return FAMILY_JOURNAL_ENTRIES.filter(entry => memberIds.includes(entry.userId));
};

/**
 * Get all family entries visible to family
 */
export const getAllFamilyEntries = () => {
  return FAMILY_JOURNAL_ENTRIES.filter(
    entry => entry.visibility === 'family' || entry.visibility === 'family_friends'
  );
};
