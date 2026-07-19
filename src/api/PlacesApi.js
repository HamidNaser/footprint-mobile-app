/**
 * PlacesApi - API service for Places feature
 *
 * The places LIST is served live from the Hub API (GET /api/v1/places),
 * derived from the user's journal entries + family locations — the same source
 * the web app uses. Rich detail features that the backend does not yet provide
 * (per-year memories, interviews, memory requests) still use local data.
 */

import { ApiClient } from './ApiClient';
import { API_CONFIG, buildUrl } from '../config/api.config';
import { PLACES_DATA, PLACE_MEMORIES } from '../data/placesData';

// Shown when a place has no associated photo yet.
const PLACEHOLDER_IMAGE =
  'https://images.unsplash.com/photo-1502082553048-f009c37129b9?w=400&h=300&fit=crop';

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
    image: place.image || PLACEHOLDER_IMAGE,
    // Backend has no category concept; everything is visible under "everyone".
    category: 'everyone',
    iWasHere: false,
    // Detail-view fields with no backend source yet — safe defaults.
    photos: place.image ? [place.image] : [],
    location: null,
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
 * Get place details with all years
 * @param {string} placeId 
 * @returns {Promise<Place>}
 */
export const getPlace = async (placeId) => {
  // TODO: Replace with real API call
  // return ApiClient.get(`/api/places/${placeId}`);
  
  const place = PLACES_DATA.find(p => p.id === placeId);
  if (!place) {
    throw new Error('Place not found');
  }
  return place;
};

/**
 * Get memories for a specific year at a place
 * @param {string} placeId 
 * @param {number} year 
 * @returns {Promise<PlaceMemory[]>}
 */
export const getPlaceYearMemories = async (placeId, year) => {
  // TODO: Replace with real API call
  // return ApiClient.get(`/api/places/${placeId}/years/${year}`);
  
  const placeMemories = PLACE_MEMORIES[placeId];
  if (!placeMemories) {
    return [];
  }
  
  return placeMemories.filter(m => m.year === year);
};

/**
 * Get all memories for a place (all years)
 * @param {string} placeId 
 * @returns {Promise<PlaceMemory[]>}
 */
export const getPlaceMemories = async (placeId) => {
  // TODO: Replace with real API call
  // return ApiClient.get(`/api/places/${placeId}/memories`);
  
  return PLACE_MEMORIES[placeId] || [];
};

/**
 * Check if current user has been to a place
 * @param {string} placeId 
 * @returns {Promise<{iWasHere: boolean, myYears: number[]}>}
 */
export const checkIWasHere = async (placeId) => {
  // TODO: Replace with real API call
  // return ApiClient.get(`/api/places/${placeId}/i-was-here`);
  
  const memories = PLACE_MEMORIES[placeId] || [];
  const myMemories = memories.filter(m => m.isCurrentUser);
  const myYears = [...new Set(myMemories.map(m => m.year))];
  
  return {
    iWasHere: myMemories.length > 0,
    myYears,
  };
};

// ============================================
// INTERVIEW API
// ============================================

/**
 * Start a new interview session
 * @param {Object} data 
 * @param {string} data.placeId
 * @param {string} data.intervieweeId
 * @returns {Promise<InterviewSession>}
 */
export const startInterview = async ({ placeId, intervieweeId }) => {
  // TODO: Replace with real API call
  // return ApiClient.post('/api/interviews', { placeId, intervieweeId });
  
  return {
    id: `interview_${Date.now()}`,
    placeId,
    intervieweeId,
    date: new Date().toISOString(),
    questions: [],
    status: 'draft',
  };
};

/**
 * Update interview with answers
 * @param {string} interviewId 
 * @param {Object} data 
 * @returns {Promise<InterviewSession>}
 */
export const updateInterview = async (interviewId, data) => {
  // TODO: Replace with real API call
  // return ApiClient.put(`/api/interviews/${interviewId}`, data);
  
  return {
    id: interviewId,
    ...data,
    updatedAt: new Date().toISOString(),
  };
};

/**
 * Complete and save interview as journal entry
 * @param {string} interviewId 
 * @returns {Promise<{interview: InterviewSession, journalEntry: JournalEntry}>}
 */
export const completeInterview = async (interviewId) => {
  // TODO: Replace with real API call
  // return ApiClient.post(`/api/interviews/${interviewId}/complete`);
  
  return {
    interview: {
      id: interviewId,
      status: 'complete',
    },
    journalEntryId: `entry_${Date.now()}`,
  };
};

// ============================================
// MEMORY REQUEST API
// ============================================

/**
 * Create a memory request (ask someone about a place)
 * @param {Object} data 
 * @param {string} data.placeId
 * @param {string} data.requestedFromId
 * @param {string} data.message
 * @returns {Promise<MemoryRequest>}
 */
export const createMemoryRequest = async ({ placeId, requestedFromId, message }) => {
  // TODO: Replace with real API call
  // return ApiClient.post('/api/memory-requests', { placeId, requestedFromId, message });
  
  const place = PLACES_DATA.find(p => p.id === placeId);
  
  return {
    id: `request_${Date.now()}`,
    placeId,
    placeName: place?.name || 'Unknown Place',
    requestedFromId,
    message,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
};

/**
 * Get memory requests (sent or received)
 * @param {Object} options
 * @param {'sent' | 'received'} options.type
 * @returns {Promise<MemoryRequest[]>}
 */
export const getMemoryRequests = async ({ type = 'received' } = {}) => {
  // TODO: Replace with real API call
  // return ApiClient.get('/api/memory-requests', { type });
  
  // Mock data
  return [
    {
      id: 'request_1',
      placeId: 1,
      placeName: 'Manhattan',
      requestedBy: {
        id: 'user_1',
        name: 'Sarah',
        avatar: 'https://randomuser.me/api/portraits/women/44.jpg',
      },
      message: 'Grandpa, can you tell me about your trip to Manhattan?',
      status: 'pending',
      createdAt: '2024-01-15T10:00:00Z',
    },
  ];
};

/**
 * Update memory request status
 * @param {string} requestId 
 * @param {Object} data
 * @param {'fulfilled' | 'declined'} data.status
 * @param {string} data.memoryId - If fulfilled, the memory that was created
 * @returns {Promise<MemoryRequest>}
 */
export const updateMemoryRequest = async (requestId, { status, memoryId }) => {
  // TODO: Replace with real API call
  // return ApiClient.put(`/api/memory-requests/${requestId}`, { status, memoryId });
  
  return {
    id: requestId,
    status,
    fulfilledMemoryId: memoryId,
    updatedAt: new Date().toISOString(),
  };
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
