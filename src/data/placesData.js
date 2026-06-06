/**
 * Mock data for Places feature
 * 
 * This file contains comprehensive mock data that mirrors the real data structure.
 * Designed to easily swap with real API responses.
 */

// ============================================
// PEOPLE (Family & Friends)
// ============================================

export const PEOPLE = {
  me: {
    id: 'me',
    name: 'You',
    firstName: 'You',
    avatar: 'https://randomuser.me/api/portraits/women/47.jpg',
    relationship: 'self',
  },
  grandpa_akram: {
    id: 'grandpa_akram',
    name: 'Akram Naser',
    firstName: 'Akram',
    avatar: 'https://randomuser.me/api/portraits/men/72.jpg',
    relationship: 'grandfather',
    birthYear: 1942,
  },
  grandma_fatima: {
    id: 'grandma_fatima',
    name: 'Fatima Naser',
    firstName: 'Fatima',
    avatar: 'https://randomuser.me/api/portraits/women/79.jpg',
    relationship: 'grandmother',
    birthYear: 1945,
  },
  dad_omar: {
    id: 'dad_omar',
    name: 'Omar Naser',
    firstName: 'Omar',
    avatar: 'https://randomuser.me/api/portraits/men/45.jpg',
    relationship: 'father',
    birthYear: 1968,
  },
  mom_layla: {
    id: 'mom_layla',
    name: 'Layla Naser',
    firstName: 'Layla',
    avatar: 'https://randomuser.me/api/portraits/women/44.jpg',
    relationship: 'mother',
    birthYear: 1970,
  },
  uncle_hassan: {
    id: 'uncle_hassan',
    name: 'Hassan Naser',
    firstName: 'Hassan',
    avatar: 'https://randomuser.me/api/portraits/men/52.jpg',
    relationship: 'uncle',
    birthYear: 1965,
  },
  cousin_sara: {
    id: 'cousin_sara',
    name: 'Sara Ahmed',
    firstName: 'Sara',
    avatar: 'https://randomuser.me/api/portraits/women/32.jpg',
    relationship: 'cousin',
    birthYear: 1995,
  },
  friend_mike: {
    id: 'friend_mike',
    name: 'Mike Johnson',
    firstName: 'Mike',
    avatar: 'https://randomuser.me/api/portraits/men/32.jpg',
    relationship: 'friend',
  },
  friend_emma: {
    id: 'friend_emma',
    name: 'Emma Wilson',
    firstName: 'Emma',
    avatar: 'https://randomuser.me/api/portraits/women/28.jpg',
    relationship: 'friend',
  },
};

// ============================================
// INTERVIEW QUESTION TEMPLATES
// ============================================

export const INTERVIEW_QUESTIONS = {
  general: [
    { id: 'q1', text: 'What year did you visit this place?', type: 'year' },
    { id: 'q2', text: 'Who were you with?', type: 'people' },
    { id: 'q3', text: 'What was the occasion?', type: 'text' },
    { id: 'q4', text: 'What do you remember most about it?', type: 'audio' },
    { id: 'q5', text: 'Can you describe what it looked like back then?', type: 'audio' },
    { id: 'q6', text: 'Do you have any photos from this trip?', type: 'photo' },
  ],
  landmark: [
    { id: 'l1', text: 'Was this your first time seeing it?', type: 'boolean' },
    { id: 'l2', text: 'How did it make you feel?', type: 'audio' },
    { id: 'l3', text: 'How has it changed since then?', type: 'audio' },
  ],
  hometown: [
    { id: 'h1', text: 'How long did you live here?', type: 'text' },
    { id: 'h2', text: 'What was your favorite place in the neighborhood?', type: 'audio' },
    { id: 'h3', text: 'Tell me about your neighbors', type: 'audio' },
  ],
};

// ============================================
// PLACE MEMORIES (Photos/Videos by Place)
// ============================================

export const PLACE_MEMORIES = {
  // Manhattan memories
  1: [
    // 2023 - Current user's recent trip
    {
      id: 'm1',
      placeId: 1,
      year: 2023,
      date: '2023-06-15',
      author: PEOPLE.me,
      type: 'photo',
      media: [
        { uri: 'https://images.unsplash.com/photo-1534430480872-3498386e7856?w=800', type: 'photo' },
        { uri: 'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=800', type: 'photo' },
      ],
      caption: 'Times Square never sleeps! 🗽',
      isCurrentUser: true,
    },
    {
      id: 'm2',
      placeId: 1,
      year: 2023,
      date: '2023-06-14',
      author: PEOPLE.friend_mike,
      type: 'photo',
      media: [
        { uri: 'https://images.unsplash.com/photo-1485871981521-5b1fd3805eee?w=800', type: 'photo' },
      ],
      caption: 'Central Park morning run',
      isCurrentUser: false,
    },
    {
      id: 'm3',
      placeId: 1,
      year: 2023,
      date: '2023-04-20',
      author: PEOPLE.cousin_sara,
      type: 'photo',
      media: [
        { uri: 'https://images.unsplash.com/photo-1522083165195-3424ed129620?w=800', type: 'photo' },
      ],
      caption: 'Brooklyn Bridge at sunset',
      isCurrentUser: false,
    },
    
    // 2017 - Family trip
    {
      id: 'm4',
      placeId: 1,
      year: 2017,
      date: '2017-08-10',
      author: PEOPLE.dad_omar,
      type: 'photo',
      media: [
        { uri: 'https://images.unsplash.com/photo-1518235925504-b43f3acc3135?w=800', type: 'photo' },
        { uri: 'https://images.unsplash.com/photo-1499092346589-b9b6be3e94b2?w=800', type: 'photo' },
        { uri: 'https://images.unsplash.com/photo-1534430480872-3498386e7856?w=800', type: 'photo' },
      ],
      caption: 'Family vacation to NYC! The kids loved the Empire State Building.',
      isCurrentUser: false,
    },
    {
      id: 'm5',
      placeId: 1,
      year: 2017,
      date: '2017-08-11',
      author: PEOPLE.mom_layla,
      type: 'photo',
      media: [
        { uri: 'https://images.unsplash.com/photo-1534270804882-6b5048b1c1fc?w=800', type: 'photo' },
      ],
      caption: 'Shopping on 5th Avenue',
      isCurrentUser: false,
    },
    {
      id: 'm6',
      placeId: 1,
      year: 2017,
      date: '2017-08-12',
      author: PEOPLE.me,
      type: 'photo',
      media: [
        { uri: 'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=800', type: 'photo' },
      ],
      caption: 'Me at 15, first time in NYC!',
      isCurrentUser: true,
    },
    
    // 1992 - Uncle's business trip
    {
      id: 'm7',
      placeId: 1,
      year: 1992,
      date: '1992-03-15',
      author: PEOPLE.uncle_hassan,
      type: 'photo',
      media: [
        { uri: 'https://images.unsplash.com/photo-1485871981521-5b1fd3805eee?w=800', type: 'photo' },
        { uri: 'https://images.unsplash.com/photo-1499092346589-b9b6be3e94b2?w=800', type: 'photo' },
      ],
      caption: 'Business conference in Manhattan. The Twin Towers were magnificent.',
      isCurrentUser: false,
    },
    {
      id: 'm8',
      placeId: 1,
      year: 1992,
      date: '1992-03-16',
      author: PEOPLE.dad_omar,
      type: 'photo',
      media: [
        { uri: 'https://images.unsplash.com/photo-1534430480872-3498386e7856?w=800', type: 'photo' },
      ],
      caption: 'Visited Hassan during his trip',
      isCurrentUser: false,
    },
    
    // 1967 - Grandpa's immigration
    {
      id: 'm9',
      placeId: 1,
      year: 1967,
      date: '1967-09-20',
      author: PEOPLE.grandpa_akram,
      type: 'photo',
      media: [
        { uri: 'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=800', type: 'photo' },
      ],
      caption: 'First day in America. Ellis Island behind me. I had $50 in my pocket and a dream.',
      isCurrentUser: false,
      hasStory: true,
      storyPrompt: 'Ask Grandpa Akram about his first day in America',
    },
    {
      id: 'm10',
      placeId: 1,
      year: 1967,
      date: '1967-10-05',
      author: PEOPLE.grandpa_akram,
      type: 'photo',
      media: [
        { uri: 'https://images.unsplash.com/photo-1485871981521-5b1fd3805eee?w=800', type: 'photo' },
      ],
      caption: 'My first apartment on the Lower East Side',
      isCurrentUser: false,
    },
  ],
  
  // London Eye memories
  2: [
    {
      id: 'm11',
      placeId: 2,
      year: 2023,
      date: '2023-12-24',
      author: PEOPLE.me,
      type: 'photo',
      media: [
        { uri: 'https://images.unsplash.com/photo-1529655683826-aba9b3e77383?w=800', type: 'photo' },
        { uri: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800', type: 'photo' },
      ],
      caption: 'Christmas in London! ❄️🎄',
      isCurrentUser: true,
    },
    {
      id: 'm12',
      placeId: 2,
      year: 2023,
      date: '2023-12-25',
      author: PEOPLE.friend_emma,
      type: 'photo',
      media: [
        { uri: 'https://images.unsplash.com/photo-1520986606214-8b456906c813?w=800', type: 'photo' },
      ],
      caption: 'View from the top!',
      isCurrentUser: false,
    },
    {
      id: 'm13',
      placeId: 2,
      year: 2017,
      date: '2017-07-14',
      author: PEOPLE.mom_layla,
      type: 'photo',
      media: [
        { uri: 'https://images.unsplash.com/photo-1529655683826-aba9b3e77383?w=800', type: 'photo' },
      ],
      caption: 'Summer trip to UK with the family',
      isCurrentUser: false,
    },
    {
      id: 'm14',
      placeId: 2,
      year: 1992,
      date: '1992-06-01',
      author: PEOPLE.grandma_fatima,
      type: 'photo',
      media: [
        { uri: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800', type: 'photo' },
      ],
      caption: 'Our honeymoon trip to London',
      isCurrentUser: false,
      hasStory: true,
      storyPrompt: 'Ask Grandma about her honeymoon',
    },
  ],
  
  // Tower Bridge memories
  3: [
    {
      id: 'm15',
      placeId: 3,
      year: 2023,
      date: '2023-12-26',
      author: PEOPLE.me,
      type: 'photo',
      media: [
        { uri: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800', type: 'photo' },
      ],
      caption: 'Tower Bridge at night',
      isCurrentUser: true,
    },
    {
      id: 'm16',
      placeId: 3,
      year: 2017,
      date: '2017-07-15',
      author: PEOPLE.dad_omar,
      type: 'photo',
      media: [
        { uri: 'https://images.unsplash.com/photo-1520986606214-8b456906c813?w=800', type: 'photo' },
      ],
      caption: 'The bridge was opening for a tall ship!',
      isCurrentUser: false,
    },
  ],
  
  // Eiffel Tower memories
  4: [
    {
      id: 'm17',
      placeId: 4,
      year: 2022,
      date: '2022-05-10',
      author: PEOPLE.me,
      type: 'photo',
      media: [
        { uri: 'https://images.unsplash.com/photo-1511739001486-6bfe10ce65f4?w=800', type: 'photo' },
        { uri: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800', type: 'photo' },
      ],
      caption: 'Paris, je t\'aime! 🗼❤️',
      isCurrentUser: true,
    },
    {
      id: 'm18',
      placeId: 4,
      year: 2019,
      date: '2019-08-20',
      author: PEOPLE.cousin_sara,
      type: 'photo',
      media: [
        { uri: 'https://images.unsplash.com/photo-1511739001486-6bfe10ce65f4?w=800', type: 'photo' },
      ],
      caption: 'Study abroad semester in Paris',
      isCurrentUser: false,
    },
    {
      id: 'm19',
      placeId: 4,
      year: 2019,
      date: '2019-04-15',
      author: PEOPLE.grandpa_akram,
      type: 'photo',
      media: [
        { uri: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800', type: 'photo' },
      ],
      caption: 'Revisiting Paris after 50 years. Last time was 1969.',
      isCurrentUser: false,
      hasStory: true,
      storyPrompt: 'Ask Grandpa about his 1969 trip to Paris',
    },
  ],
  
  // Grand Canyon memories
  5: [
    {
      id: 'm20',
      placeId: 5,
      year: 2021,
      date: '2021-10-15',
      author: PEOPLE.me,
      type: 'photo',
      media: [
        { uri: 'https://images.unsplash.com/photo-1474044159687-1ee9f3a51722?w=800', type: 'photo' },
        { uri: 'https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=800', type: 'photo' },
      ],
      caption: 'No photo can capture this. Absolutely breathtaking.',
      isCurrentUser: true,
    },
    {
      id: 'm21',
      placeId: 5,
      year: 2021,
      date: '2021-10-15',
      author: PEOPLE.friend_mike,
      type: 'photo',
      media: [
        { uri: 'https://images.unsplash.com/photo-1474044159687-1ee9f3a51722?w=800', type: 'photo' },
      ],
      caption: 'Road trip with the crew!',
      isCurrentUser: false,
    },
    {
      id: 'm22',
      placeId: 5,
      year: 2021,
      date: '2021-10-16',
      author: PEOPLE.friend_emma,
      type: 'photo',
      media: [
        { uri: 'https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=800', type: 'photo' },
      ],
      caption: 'Sunrise hike was worth waking up at 4am',
      isCurrentUser: false,
    },
  ],
};

// ============================================
// PLACES DATA (Enhanced)
// ============================================

export const PLACES_DATA = [
  {
    id: 1,
    name: 'Manhattan',
    subtitle: 'New York',
    image: 'https://images.unsplash.com/photo-1534430480872-3498386e7856?w=200&h=200&fit=crop',
    location: {
      lat: 40.7831,
      lng: -73.9712,
    },
    years: [
      { 
        year: 2023, 
        avatars: [PEOPLE.me.avatar, PEOPLE.friend_mike.avatar, PEOPLE.cousin_sara.avatar],
        people: [PEOPLE.me, PEOPLE.friend_mike, PEOPLE.cousin_sara],
        memoryCount: 3,
      },
      { 
        year: 2017, 
        avatars: [PEOPLE.dad_omar.avatar, PEOPLE.mom_layla.avatar, PEOPLE.me.avatar],
        people: [PEOPLE.dad_omar, PEOPLE.mom_layla, PEOPLE.me],
        memoryCount: 3,
      },
      { 
        year: 1992, 
        avatars: [PEOPLE.uncle_hassan.avatar, PEOPLE.dad_omar.avatar],
        people: [PEOPLE.uncle_hassan, PEOPLE.dad_omar],
        memoryCount: 2,
      },
      { 
        year: 1967, 
        avatars: [PEOPLE.grandpa_akram.avatar],
        people: [PEOPLE.grandpa_akram],
        memoryCount: 2,
        hasUntoldStory: true,
      },
    ],
    photos: [
      'https://images.unsplash.com/photo-1534430480872-3498386e7856?w=800&h=500&fit=crop',
      'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=800&h=500&fit=crop',
      'https://images.unsplash.com/photo-1485871981521-5b1fd3805eee?w=800&h=500&fit=crop',
      'https://images.unsplash.com/photo-1522083165195-3424ed129620?w=800&h=500&fit=crop',
    ],
    category: 'family',
    iWasHere: true,
    myYears: [2023, 2017],
  },
  {
    id: 2,
    name: 'London Eye',
    subtitle: 'United Kingdom',
    image: 'https://images.unsplash.com/photo-1529655683826-aba9b3e77383?w=200&h=200&fit=crop',
    location: {
      lat: 51.5033,
      lng: -0.1196,
    },
    years: [
      { 
        year: 2023, 
        avatars: [PEOPLE.me.avatar, PEOPLE.friend_emma.avatar],
        people: [PEOPLE.me, PEOPLE.friend_emma],
        memoryCount: 2,
      },
      { 
        year: 2017, 
        avatars: [PEOPLE.mom_layla.avatar],
        people: [PEOPLE.mom_layla],
        memoryCount: 1,
      },
      { 
        year: 1992, 
        avatars: [PEOPLE.grandma_fatima.avatar],
        people: [PEOPLE.grandma_fatima],
        memoryCount: 1,
        hasUntoldStory: true,
      },
    ],
    photos: [
      'https://images.unsplash.com/photo-1529655683826-aba9b3e77383?w=800&h=500&fit=crop',
      'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800&h=500&fit=crop',
      'https://images.unsplash.com/photo-1520986606214-8b456906c813?w=800&h=500&fit=crop',
    ],
    category: 'friends',
    iWasHere: true,
    myYears: [2023],
  },
  {
    id: 3,
    name: 'Tower Bridge',
    subtitle: 'United Kingdom',
    image: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=200&h=200&fit=crop',
    location: {
      lat: 51.5055,
      lng: -0.0754,
    },
    years: [
      { 
        year: 2023, 
        avatars: [PEOPLE.me.avatar],
        people: [PEOPLE.me],
        memoryCount: 1,
      },
      { 
        year: 2017, 
        avatars: [PEOPLE.dad_omar.avatar],
        people: [PEOPLE.dad_omar],
        memoryCount: 1,
      },
    ],
    photos: [
      'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=800&h=500&fit=crop',
      'https://images.unsplash.com/photo-1520986606214-8b456906c813?w=800&h=500&fit=crop',
    ],
    category: 'everyone',
    iWasHere: true,
    myYears: [2023],
  },
  {
    id: 4,
    name: 'Eiffel Tower',
    subtitle: 'Paris, France',
    image: 'https://images.unsplash.com/photo-1511739001486-6bfe10ce65f4?w=200&h=200&fit=crop',
    location: {
      lat: 48.8584,
      lng: 2.2945,
    },
    years: [
      { 
        year: 2022, 
        avatars: [PEOPLE.me.avatar],
        people: [PEOPLE.me],
        memoryCount: 1,
      },
      { 
        year: 2019, 
        avatars: [PEOPLE.cousin_sara.avatar, PEOPLE.grandpa_akram.avatar],
        people: [PEOPLE.cousin_sara, PEOPLE.grandpa_akram],
        memoryCount: 2,
        hasUntoldStory: true,
      },
    ],
    photos: [
      'https://images.unsplash.com/photo-1511739001486-6bfe10ce65f4?w=800&h=500&fit=crop',
      'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&h=500&fit=crop',
    ],
    category: 'family',
    iWasHere: true,
    myYears: [2022],
  },
  {
    id: 5,
    name: 'Grand Canyon',
    subtitle: 'Arizona, USA',
    image: 'https://images.unsplash.com/photo-1474044159687-1ee9f3a51722?w=200&h=200&fit=crop',
    location: {
      lat: 36.0544,
      lng: -112.1401,
    },
    years: [
      { 
        year: 2021, 
        avatars: [PEOPLE.me.avatar, PEOPLE.friend_mike.avatar, PEOPLE.friend_emma.avatar],
        people: [PEOPLE.me, PEOPLE.friend_mike, PEOPLE.friend_emma],
        memoryCount: 3,
      },
    ],
    photos: [
      'https://images.unsplash.com/photo-1474044159687-1ee9f3a51722?w=800&h=500&fit=crop',
      'https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=800&h=500&fit=crop',
    ],
    category: 'following',
    iWasHere: true,
    myYears: [2021],
  },
];

// ============================================
// FILTER OPTIONS
// ============================================

export const PLACE_FILTERS = [
  { id: 'everyone', label: 'Everyone', icon: 'globe-outline' },
  { id: 'family', label: 'Family', icon: 'heart-outline' },
  { id: 'friends', label: 'Friends', icon: 'people-outline' },
  { id: 'following', label: 'Following', icon: 'checkmark-circle-outline' },
];

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get memories for a specific place and year
 */
export const getMemoriesForPlaceYear = (placeId, year) => {
  const memories = PLACE_MEMORIES[placeId] || [];
  return memories.filter(m => m.year === year);
};

/**
 * Get unique people who have memories at a place
 */
export const getPeopleAtPlace = (placeId) => {
  const memories = PLACE_MEMORIES[placeId] || [];
  const peopleMap = {};
  memories.forEach(m => {
    if (!peopleMap[m.author.id]) {
      peopleMap[m.author.id] = m.author;
    }
  });
  return Object.values(peopleMap);
};

/**
 * Check if there are untold stories at a place
 */
export const hasUntoldStories = (placeId) => {
  const memories = PLACE_MEMORIES[placeId] || [];
  return memories.some(m => m.hasStory);
};

/**
 * Get story prompts for a place
 */
export const getStoryPrompts = (placeId) => {
  const memories = PLACE_MEMORIES[placeId] || [];
  return memories
    .filter(m => m.hasStory)
    .map(m => ({
      memoryId: m.id,
      author: m.author,
      prompt: m.storyPrompt,
      year: m.year,
    }));
};

// ============================================
// MEMORY QUESTIONS (Questions asked about memories)
// ============================================

/**
 * Questions asked about specific memories
 * Status: 'pending' | 'answered'
 */
export const MEMORY_QUESTIONS = [
  // Cousin Sara asked Grandpa about his 1967 Ellis Island memory
  {
    id: 'q1',
    memoryId: 'm7', // Grandpa's Ellis Island memory
    memoryOwnerId: 'grandpa_akram',
    askerId: 'cousin_sara',
    asker: PEOPLE.cousin_sara,
    question: "Grandpa, what was it like arriving in America for the first time?",
    status: 'answered',
    askedAt: '2024-01-15',
    answeredAt: '2024-01-20',
    answer: {
      type: 'audio',
      duration: '3:45',
      transcript: "I remember the cold wind off the water...",
    },
  },
  // You (current user) asked Dad about his 1992 business trip
  {
    id: 'q2',
    memoryId: 'm9', // Dad's 1992 business trip
    memoryOwnerId: 'dad_omar',
    askerId: 'me',
    asker: PEOPLE.me,
    question: "Dad, what was NYC like in 1992? Was it very different?",
    status: 'pending',
    askedAt: '2024-02-01',
    answeredAt: null,
    answer: null,
  },
  // Uncle Hassan asked Grandpa about Ellis Island
  {
    id: 'q3',
    memoryId: 'm7',
    memoryOwnerId: 'grandpa_akram',
    askerId: 'uncle_hassan',
    asker: PEOPLE.uncle_hassan,
    question: "Dad, do you remember who met you at the port?",
    status: 'pending',
    askedAt: '2024-02-10',
    answeredAt: null,
    answer: null,
  },
  // Friend Mike asked you about your 2023 Times Square photo
  {
    id: 'q4',
    memoryId: 'm1', // Your Times Square memory
    memoryOwnerId: 'me',
    askerId: 'friend_mike',
    asker: PEOPLE.friend_mike,
    question: "Where was that restaurant you mentioned? Looked amazing!",
    status: 'pending',
    askedAt: '2024-02-15',
    answeredAt: null,
    answer: null,
  },
];

/**
 * Get questions asked about a specific memory
 */
export const getQuestionsForMemory = (memoryId) => {
  return MEMORY_QUESTIONS.filter(q => q.memoryId === memoryId);
};

/**
 * Get pending questions the current user asked (waiting for answers)
 */
export const getMyPendingQuestions = () => {
  return MEMORY_QUESTIONS.filter(q => q.askerId === 'me' && q.status === 'pending');
};

/**
 * Get answered questions the current user asked
 */
export const getMyAnsweredQuestions = () => {
  return MEMORY_QUESTIONS.filter(q => q.askerId === 'me' && q.status === 'answered');
};

/**
 * Get questions asked TO the current user (about their memories)
 */
export const getQuestionsAskedToMe = () => {
  return MEMORY_QUESTIONS.filter(q => q.memoryOwnerId === 'me');
};

/**
 * Get pending questions asked to current user (need to answer)
 */
export const getPendingQuestionsForMe = () => {
  return MEMORY_QUESTIONS.filter(q => q.memoryOwnerId === 'me' && q.status === 'pending');
};

/**
 * Check if a memory has unanswered questions (for memory owner to see)
 */
export const memoryHasPendingQuestions = (memoryId) => {
  return MEMORY_QUESTIONS.some(q => q.memoryId === memoryId && q.status === 'pending');
};

/**
 * Get count of pending questions for a memory
 */
export const getPendingQuestionCount = (memoryId) => {
  return MEMORY_QUESTIONS.filter(q => q.memoryId === memoryId && q.status === 'pending').length;
};
