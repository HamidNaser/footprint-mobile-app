/**
 * PlacesApi - API service for Places feature
 * 
 * Handles fetching places, memories by year, interviews, and memory requests.
 * Currently uses mock data, designed to easily swap to real API.
 */

import { ApiClient } from './ApiClient';
import { PLACES_DATA, PLACE_MEMORIES } from '../data/placesData';

/**
 * Get all places with memories
 * @param {Object} options - Filter options
 * @param {string} options.filter - 'everyone' | 'family' | 'friends' | 'following'
 * @param {string} options.search - Search query
 * @returns {Promise<Place[]>}
 */
export const getPlaces = async ({ filter = 'everyone', search = '' } = {}) => {
  // TODO: Replace with real API call
  // return ApiClient.get('/api/places', { filter, search });
  
  let places = [...PLACES_DATA];
  
  // Filter by category
  if (filter !== 'everyone') {
    places = places.filter(p => p.category === filter || p.category === 'everyone');
  }
  
  // Filter by search
  if (search.trim()) {
    const query = search.toLowerCase();
    places = places.filter(p => 
      p.name.toLowerCase().includes(query) ||
      p.subtitle.toLowerCase().includes(query)
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
