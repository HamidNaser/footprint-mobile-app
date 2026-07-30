/**
 * LifelineApi - API service for the Timeline (Lifeline) feature.
 *
 * Serves a person's year-by-year, generation-by-generation life story live from
 * the Hub API (GET /api/v1/lifeline...), projected from journal entries + family
 * tree — the same source the web app uses. Falls back to local mock data when the
 * backend is unreachable or the user is signed out, so the screen always renders.
 */

import { ApiClient } from './ApiClient';
import { API_CONFIG, buildUrl } from '../config/api.config';

const AVATARS = {
  you: 'https://randomuser.me/api/portraits/men/32.jpg',
  dad: 'https://randomuser.me/api/portraits/men/64.jpg',
  grandpa: 'https://randomuser.me/api/portraits/men/75.jpg',
};

const seededPhoto = (seed) =>
  `https://picsum.photos/seed/${encodeURIComponent(seed)}/400/300`;

const MOCK_LINEAGE = [
  { personId: 'you', userId: 'you', name: 'You', avatar: AVATARS.you, birthYear: 1992, deathYear: null, relationship: 'self', isSelf: true, hasTimeline: true },
  { personId: 'dad', userId: null, name: 'Dad · Omar', avatar: AVATARS.dad, birthYear: 1958, deathYear: 2019, relationship: 'father', isSelf: false, hasTimeline: true },
  { personId: 'grandpa', userId: null, name: 'Grandpa · Ali', avatar: AVATARS.grandpa, birthYear: 1929, deathYear: 2001, relationship: 'grandfather', isSelf: false, hasTimeline: false },
];

const MOCK_YEARS = {
  you: [
    { year: 2026, momentCount: 4, previewMedia: [seededPhoto('mia'), seededPhoto('home')] },
    { year: 2024, momentCount: 7, previewMedia: [seededPhoto('banff')] },
    { year: 2022, momentCount: 5, previewMedia: [seededPhoto('wedding')] },
    { year: 2018, momentCount: 9, previewMedia: [seededPhoto('grad')] },
    { year: 2014, momentCount: 12, previewMedia: [seededPhoto('college')] },
    { year: 2010, momentCount: 6, previewMedia: [seededPhoto('roadtrip')] },
  ],
  dad: [
    { year: 2015, momentCount: 3, previewMedia: [seededPhoto('dad-shop')] },
    { year: 1994, momentCount: 2, previewMedia: [seededPhoto('dad-first-shop')] },
  ],
  grandpa: [
    { year: 1963, momentCount: 1, previewMedia: [seededPhoto('grandpa-sea')] },
  ],
};

const MOCK_WORLD = {
  2026: { year: 2026, headline: 'AI reshapes daily life', summary: 'Generative AI becomes woven into everyday work, art and learning.' },
  1994: { year: 1994, headline: 'The web goes public', summary: 'The World Wide Web begins spreading into homes and offices.' },
  1963: { year: 1963, headline: 'A turbulent decade', summary: 'Civil-rights movements gather force across the world.' },
};

const MOCK_MOMENTS = {
  'you:2026': [
    { entryId: 'm1', authorName: 'You', authorAvatar: AVATARS.you, date: '2026-03-01', title: null, text: 'Mia is born', photos: [seededPhoto('mia')], type: 'milestone', isCurrentUser: true },
    { entryId: 'm2', authorName: 'You', authorAvatar: AVATARS.you, date: '2026-06-01', title: null, text: 'Our first home', photos: [seededPhoto('home')], type: 'journal', isCurrentUser: true },
    { entryId: 'm3', authorName: 'You', authorAvatar: AVATARS.you, date: '2026-08-01', title: null, text: 'Banff road trip', photos: [seededPhoto('banff')], type: 'journal', isCurrentUser: true },
    { entryId: 'm4', authorName: 'You', authorAvatar: AVATARS.you, date: '2026-11-01', title: null, text: 'Finished night school', photos: [seededPhoto('grad')], type: 'journal', isCurrentUser: true },
  ],
};

const HIGHLIGHTS = {
  you: 'Just became a parent',
  dad: 'Opened his first shop',
  grandpa: 'Emigrated across the sea',
};

const mockAtAge = (age) =>
  MOCK_LINEAGE.filter((p) => p.birthYear > 0 && age >= 0).map((p) => ({
    personId: p.personId,
    name: p.name,
    avatar: p.avatar,
    relationship: p.relationship,
    isSelf: p.isSelf,
    age,
    year: p.birthYear + age,
    momentCount: p.personId === 'you' ? 4 : p.personId === 'dad' ? 1 : 0,
    highlight: HIGHLIGHTS[p.personId] || null,
  }));

export const mockLifeline = (personId = 'you') => {
  const id = MOCK_YEARS[personId] ? personId : 'you';
  const person = MOCK_LINEAGE.find((p) => p.personId === id) || MOCK_LINEAGE[0];
  const years = (MOCK_YEARS[id] || []).map((y) => ({
    ...y,
    age: person.birthYear > 0 ? y.year - person.birthYear : 0,
    isBirthYear: false,
  }));
  if (person.birthYear > 0 && !years.some((y) => y.year === person.birthYear)) {
    years.push({ year: person.birthYear, age: 0, momentCount: 0, previewMedia: [], isBirthYear: true });
  }
  years.sort((a, b) => b.year - a.year);
  return {
    person,
    years,
    lineage: MOCK_LINEAGE,
    totalMoments: years.reduce((sum, y) => sum + y.momentCount, 0),
  };
};

export const mockLifelineYear = (personId = 'you', year = 2026) => {
  const person = MOCK_LINEAGE.find((p) => p.personId === personId) || MOCK_LINEAGE[0];
  const age = person.birthYear > 0 ? year - person.birthYear : 0;
  const isBirthYear = person.birthYear > 0 && year === person.birthYear;
  return {
    person,
    year,
    age,
    isBirthYear,
    world: MOCK_WORLD[year] || null,
    atAge: mockAtAge(age),
    moments: MOCK_MOMENTS[`${personId}:${year}`] || [],
    gateway: isBirthYear
      ? MOCK_LINEAGE.filter((p) => p.relationship === 'father' || p.relationship === 'mother')
      : [],
  };
};

/**
 * Get a person's Lifeline overview (years + lineage). Pass no id for the current
 * user. Falls back to mock data on any error.
 */
export const getLifeline = async (personId = null) => {
  try {
    const endpoint = personId ? `/lifeline/${encodeURIComponent(personId)}` : '/lifeline';
    const url = buildUrl(API_CONFIG.HUB_BASE_URL, endpoint);
    const data = await ApiClient.get(url);
    if (data && Array.isArray(data.years) && data.years.length > 0) {
      return data;
    }
    return mockLifeline(personId || 'you');
  } catch (err) {
    console.warn('[LifelineApi] falling back to mock overview:', err.message);
    return mockLifeline(personId || 'you');
  }
};

/**
 * Get the detail for a single year of a person's Lifeline. Falls back to mock
 * data on any error.
 */
export const getLifelineYear = async (personId, year) => {
  try {
    const url = buildUrl(
      API_CONFIG.HUB_BASE_URL,
      `/lifeline/${encodeURIComponent(personId)}/year/${year}`
    );
    const data = await ApiClient.get(url);
    return data || mockLifelineYear(personId, year);
  } catch (err) {
    console.warn('[LifelineApi] falling back to mock year:', err.message);
    return mockLifelineYear(personId, year);
  }
};

export default { getLifeline, getLifelineYear, mockLifeline, mockLifelineYear };
