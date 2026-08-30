/**
 * PlacesApi - API service for Places feature
 *
 * The places LIST is served live from the Hub API (GET /api/v1/places),
 * derived from the user's journal entries + family locations — the same source
 * the web app uses. Rich detail features that the backend does not yet provide
 * (per-year memories, interviews, memory requests) still use local data.
 */

import { ApiClient } from './ApiClient';
import { API_CONFIG, buildUrl, buildUrlWithQuery } from '../config/api.config';

/**
 * Adapt a backend PlaceResponse to the shape the Places screen renders.
 * Fields the backend doesn't provide yet (photos carousel, map coords, memory
 * counts, "untold story") get safe defaults so the UI never crashes.
 */
const adaptPlace = (place) => {
  const years = (place.years || []).map((y) => ({
    year: y.year,
    avatars: y.avatars || [],
    memoryCount: (y.avatars || []).length,
    hasUntoldStory: false,
  }));

  return {
    id: place.id,
    name: place.name,
    subtitle: place.subtitle || '',
    // Null when nobody has photographed it. The card draws a monogram; this used to
    // be an Unsplash travel shot, so an unphotographed place in Amman showed a
    // stranger's picture of somewhere else beside a real family memory.
    image: place.image || null,
    // Backend has no category concept; everything is visible under "everyone".
    category: 'everyone',
    // PlaceResponse (list) carries no IWasHere — only PlaceDetailResponse does.
    iWasHere: false,
    // Detail-view fields with no backend source yet — safe defaults.
    photos: place.image ? [place.image] : [],
    // Lat/Lng *are* on PlaceResponse; 0/0 means unknown. Same rule as
    // adaptPlaceDetail, so the list and detail views agree.
    location: place.lat || place.lng ? { lat: place.lat, lng: place.lng } : null,
    years,
  };
};

/**
 * Get all places with memories
 * @param {Object} options - Filter options
 * @param {string} options.filter - 'everyone' | 'family' | 'friends' | 'following'
 * @param {string} options.search - Search query
 * @returns {Promise<Place[]>}
 */
export const getPlaces = async ({ filter = 'everyone', search = '' } = {}) => {
  const url = buildUrl(API_CONFIG.HUB_BASE_URL, '/places');
  const data = await ApiClient.get(url);
  let places = (data?.places || []).map(adaptPlace);

  // Backend returns the full list; apply search client-side to match the UI.
  if (search.trim()) {
    const query = search.toLowerCase();
    places = places.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        (p.subtitle || '').toLowerCase().includes(query)
    );
  }

  return places;
};

/**
 * Adapt a backend PlaceMemoryResponse to the shape the memory cards render.
 */
const adaptMemory = (m, placeId, year) => {
  const name = m.authorName || 'Someone';
  const photos = m.photos || [];
  return {
    id: m.entryId,
    placeId,
    journalId: m.journalId,
    entryId: m.entryId,
    year,
    date: m.date,
    author: {
      id: m.authorId,
      name,
      firstName: name.split(' ')[0],
      avatar: m.authorAvatar || null,
    },
    type: 'photo',
    media: photos.map((uri) => ({ uri, type: 'photo' })),
    caption: m.text || '',
    isCurrentUser: !!m.isCurrentUser,
    // Photographs nobody has explained -- no text, no voice. Derived on the backend from
    // the entry's blocks rather than stored, so it cannot drift the way the old mock
    // `hasStory` flag did. That flag is why "Record a story" never appeared on live data:
    // it only ever existed on a handful of seeded records.
    needsStory: !!m.needsStory,
  };
};

/**
 * Adapt a backend PlaceDetailResponse to the detail shape the UI renders.
 * Embeds per-year memories so the modals can read them without extra calls.
 */
const adaptPlaceDetail = (detail) => {
  const years = (detail.years || []).map((y) => {
    const memories = (y.memories || []).map((m) => adaptMemory(m, detail.id, y.year));
    const peopleMap = {};
    memories.forEach((mem) => {
      if (!peopleMap[mem.author.id]) peopleMap[mem.author.id] = mem.author;
    });
    return {
      year: y.year,
      avatars: y.avatars || [],
      people: Object.values(peopleMap),
      memoryCount: memories.length,
      memories,
      // True when any memory this year has photographs nobody has explained. Was hardcoded
      // false, so the year badge could never light up on real data.
      hasUntoldStory: memories.some((mem) => mem.needsStory),
    };
  });

  // Collect a photo carousel from all memories, falling back to the header image.
  const allPhotos = [];
  years.forEach((y) =>
    y.memories.forEach((m) => m.media.forEach((mm) => allPhotos.push(mm.uri)))
  );
  const photos = [...new Set(allPhotos)];

  return {
    id: detail.id,
    name: detail.name,
    subtitle: detail.subtitle || '',
    image: detail.image || null,
    category: 'everyone',
    location:
      detail.lat || detail.lng ? { lat: detail.lat, lng: detail.lng } : null,
    photos: photos.length ? photos : detail.image ? [detail.image] : [],
    iWasHere: !!detail.iWasHere,
    myYears: detail.myYears || [],
    years,
  };
};

/**
 * Fetch the raw backend detail for a place.
 * @param {string} placeId
 * @returns {Promise<Object>} PlaceDetailResponse
 */
const fetchPlaceDetail = async (placeId) => {
  const url = buildUrl(API_CONFIG.HUB_BASE_URL, `/places/${placeId}`);
  return ApiClient.get(url);
};

/**
 * Get place details with all years and per-year memories.
 * @param {string} placeId
 * @returns {Promise<Place>}
 */
export const getPlace = async (placeId) => {
  const detail = await fetchPlaceDetail(placeId);
  if (!detail) {
    throw new Error('Place not found');
  }
  return adaptPlaceDetail(detail);
};

/**
 * Get memories for a specific year at a place
 * @param {string} placeId
 * @param {number} year
 * @returns {Promise<PlaceMemory[]>}
 */
export const getPlaceYearMemories = async (placeId, year) => {
  const detail = await fetchPlaceDetail(placeId);
  const yearEntry = (detail?.years || []).find((y) => y.year === year);
  if (!yearEntry) return [];
  return (yearEntry.memories || []).map((m) => adaptMemory(m, placeId, year));
};

/**
 * Get all memories for a place (all years)
 * @param {string} placeId
 * @returns {Promise<PlaceMemory[]>}
 */
export const getPlaceMemories = async (placeId) => {
  const detail = await fetchPlaceDetail(placeId);
  const memories = [];
  (detail?.years || []).forEach((y) =>
    (y.memories || []).forEach((m) => memories.push(adaptMemory(m, placeId, y.year)))
  );
  return memories;
};

/**
 * Check if current user has been to a place
 * @param {string} placeId
 * @returns {Promise<{iWasHere: boolean, myYears: number[]}>}
 */
export const checkIWasHere = async (placeId) => {
  const detail = await fetchPlaceDetail(placeId);
  return {
    iWasHere: !!detail?.iWasHere,
    myYears: detail?.myYears || [],
  };
};

// ============================================
// INTERVIEW API
// ============================================

/**
 * A Mongo ObjectId as the API renders it. Guards the boundary between seeded mock data and
 * the live backend, which still coexist on the Places screens.
 */
const OBJECT_ID = /^[0-9a-f]{24}$/i;

export const isEntryId = (value) =>
  typeof value === 'string' && OBJECT_ID.test(value);

/**
 * Start a new interview session
 * @param {Object} data
 * @param {string} data.intervieweeId
 * @param {string} [data.intervieweeName]
 * @param {string} [data.intervieweeAvatar]
 * @param {string} [data.placeId]
 * @param {string} [data.placeName]
 * @param {string} [data.targetEntryId] - the memory this interview is about. With it,
 *   completing the interview appends the story to that entry instead of creating a second
 *   one beside it: one afternoon, one memory. Without it the interview stands alone, which
 *   is what "tell me about Swansea" in general should do.
 * @returns {Promise<InterviewSession>}
 */
export const startInterview = async ({
  intervieweeId,
  intervieweeName,
  intervieweeAvatar,
  placeId,
  placeName,
  targetEntryId,
} = {}) => {
  const url = buildUrl(API_CONFIG.HUB_BASE_URL, '/interviews');
  return ApiClient.post(url, {
    intervieweeId,
    intervieweeName,
    intervieweeAvatar,
    placeId,
    placeName,
    // Only a real entry id is sent. Seeded places still supply ids like "m1", and the
    // backend refuses to enrich an entry it cannot find -- which would silently drop the
    // story rather than fall back to creating one.
    targetEntryId: isEntryId(targetEntryId) ? targetEntryId : null,
  });
};

/**
 * Update interview with answers
 * @param {string} interviewId
 * @param {Object} data - { status?, answers? }
 * @returns {Promise<InterviewSession>}
 */
export const updateInterview = async (interviewId, data = {}) => {
  const url = buildUrl(API_CONFIG.HUB_BASE_URL, `/interviews/${interviewId}`);
  return ApiClient.put(url, data);
};

/**
 * Complete and save interview as a journal entry
 * @param {string} interviewId
 * @returns {Promise<{interview: InterviewSession, journalEntryId: string|null}>}
 */
export const completeInterview = async (interviewId) => {
  const url = buildUrl(
    API_CONFIG.HUB_BASE_URL,
    `/interviews/${interviewId}/complete`
  );
  return ApiClient.post(url);
};

// ============================================
// MEMORY REQUEST API
// ============================================

/**
 * Create a memory request (ask someone about a place)
 * @param {Object} data
 * @param {string} data.placeId
 * @param {string} data.requestedFromId
 * @param {string} [data.placeName]
 * @param {string} [data.message]
 * @returns {Promise<MemoryRequest>}
 */
export const createMemoryRequest = async ({
  placeId,
  requestedFromId,
  placeName,
  message,
}) => {
  const url = buildUrl(API_CONFIG.HUB_BASE_URL, '/memory-requests');
  return ApiClient.post(url, { placeId, requestedFromId, placeName, message });
};

/**
 * Get memory requests (sent or received)
 * @param {Object} options
 * @param {'sent' | 'received'} options.type
 * @param {number} [options.limit]
 * @param {number} [options.offset]
 * @returns {Promise<MemoryRequest[]>}
 */
export const getMemoryRequests = async ({
  type = 'received',
  limit,
  offset,
} = {}) => {
  const url = buildUrlWithQuery(
    buildUrl(API_CONFIG.HUB_BASE_URL, '/memory-requests'),
    { type, limit, offset }
  );
  const data = await ApiClient.get(url);
  return data?.requests || [];
};

/**
 * Update memory request status
 * @param {string} requestId
 * @param {Object} data
 * @param {'fulfilled' | 'declined'} data.status
 * @param {string} [data.memoryId] - If fulfilled, the memory that was created
 * @returns {Promise<MemoryRequest>}
 */
export const updateMemoryRequest = async (requestId, { status, memoryId }) => {
  const url = buildUrl(
    API_CONFIG.HUB_BASE_URL,
    `/memory-requests/${requestId}`
  );
  return ApiClient.put(url, { status, memoryId });
};

// ============================================
// EXPORT ALL
// ============================================

export default {
  getPlaces,
  getPlace,
  getPlaceYearMemories,
  getPlaceMemories,
  checkIWasHere,
  startInterview,
  updateInterview,
  completeInterview,
  createMemoryRequest,
  getMemoryRequests,
  updateMemoryRequest,
};
