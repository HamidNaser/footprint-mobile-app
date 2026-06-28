/**
 * API Configuration
 * 
 * Defines API endpoints for different environments.
 * The mobile app connects to the FootPrint backend services.
 */

import { Platform } from 'react-native';

// Optional build-time override of the backend URL.
// Expo inlines EXPO_PUBLIC_* variables at build time.
const BACKEND_OVERRIDE = process.env.EXPO_PUBLIC_BACKEND_API_URL;

/**
 * Environment configuration
 */
const ENV = {
  development: {
    // Local development - use your machine's IP for physical devices
    // For emulators: Android uses 10.0.2.2, iOS uses localhost
    authApiUrl: Platform.select({
      android: 'http://10.0.2.2:5100',
      ios: 'http://localhost:5100',
      default: 'http://localhost:5100',
    }),
    hubApiUrl: Platform.select({
      android: 'http://10.0.2.2:5200',
      ios: 'http://localhost:5200',
      default: 'http://localhost:5200',
    }),
    signalRUrl: Platform.select({
      android: 'http://10.0.2.2:5200/hubs/journal',
      ios: 'http://localhost:5200/hubs/journal',
      default: 'http://localhost:5200/hubs/journal',
    }),
  },
  staging: {
    authApiUrl: 'https://staging-auth.footprint.app',
    hubApiUrl: 'https://staging-api.footprint.app',
    signalRUrl: 'https://staging-api.footprint.app/hubs/journal',
  },
  production: {
    // Single backend behind the Application Load Balancer (routes by path).
    authApiUrl: BACKEND_OVERRIDE || 'https://api.aqrava.com',
    hubApiUrl: BACKEND_OVERRIDE || 'https://api.aqrava.com',
    signalRUrl: `${BACKEND_OVERRIDE || 'https://api.aqrava.com'}/hubs/footprint`,
  },
};

/**
 * Current environment
 * Change this for different builds or use environment variables
 */
const CURRENT_ENV = __DEV__ ? 'development' : 'production';

/**
 * Get the current environment configuration
 */
export const getConfig = () => ENV[CURRENT_ENV];

/**
 * API URLs
 */
export const API_CONFIG = {
  // Auth service (port 5100)
  AUTH_BASE_URL: ENV[CURRENT_ENV].authApiUrl,
  
  // Hub service (port 5200) - journals, feed, media
  HUB_BASE_URL: ENV[CURRENT_ENV].hubApiUrl,
  
  // SignalR hub for real-time updates
  SIGNALR_URL: ENV[CURRENT_ENV].signalRUrl,
  
  // API version prefix
  API_VERSION: '/api/v1',
  
  // Timeouts (milliseconds)
  TIMEOUT: {
    DEFAULT: 30000,      // 30 seconds
    UPLOAD: 300000,      // 5 minutes for uploads
    LONG_POLL: 60000,    // 1 minute for long polling
  },
  
  // Retry configuration
  RETRY: {
    MAX_ATTEMPTS: 3,
    INITIAL_DELAY: 1000,   // 1 second
    MAX_DELAY: 30000,      // 30 seconds
    BACKOFF_FACTOR: 2,     // Exponential backoff multiplier
  },
};

/**
 * Auth endpoints
 */
export const AUTH_ENDPOINTS = {
  LOGIN: '/auth/login',
  REGISTER: '/auth/register',
  REFRESH: '/auth/refresh',
  LOGOUT: '/auth/logout',
  SOCIAL_GOOGLE: '/auth/social/google',
  SOCIAL_APPLE: '/auth/social/apple',
  SOCIAL_FACEBOOK: '/auth/social/facebook',
  FORGOT_PASSWORD: '/auth/forgot-password',
  RESET_PASSWORD: '/auth/reset-password',
  VERIFY_EMAIL: '/auth/verify-email',
};

/**
 * Journal endpoints
 */
export const JOURNAL_ENDPOINTS = {
  LIST_JOURNALS: '/journals',
  GET_JOURNAL: '/journals/:id',
  CREATE_JOURNAL: '/journals',
  UPDATE_JOURNAL: '/journals/:id',
  DELETE_JOURNAL: '/journals/:id',
  
  LIST_ENTRIES: '/journals/:journalId/entries',
  GET_ENTRY: '/journals/entries/:id',
  CREATE_ENTRY: '/journals/entries',
  UPDATE_ENTRY: '/journals/entries/:id',
  DELETE_ENTRY: '/journals/entries/:id',
  
  // Batch operations for sync
  BATCH_SYNC: '/journals/sync',
  GET_CHANGES: '/journals/changes',  // Get changes since last sync
};

/**
 * Media endpoints
 */
export const MEDIA_ENDPOINTS = {
  REQUEST_UPLOAD_URL: '/media/upload-url',
  COMPLETE_UPLOAD: '/media/complete',
  DELETE_MEDIA: '/media/:id',
  GET_MEDIA: '/media/:id',
};

/**
 * Feed endpoints
 */
export const FEED_ENDPOINTS = {
  GET_FEED: '/feed',
  GET_FAMILY_FEED: '/feed/family',
  GET_FRIENDS_FEED: '/feed/friends',
};

/**
 * User endpoints
 */
export const USER_ENDPOINTS = {
  GET_ME: '/users/me',
  UPDATE_ME: '/users/me',
  UPDATE_LOCATION: '/users/me/location',
  GET_USER: '/users/:id',
  GET_FAMILY: '/users/family',
  GET_FRIENDS: '/users/friends',
};

/**
 * Build full URL for an endpoint
 * @param {string} baseUrl - Base URL (AUTH_BASE_URL or HUB_BASE_URL)
 * @param {string} endpoint - Endpoint path
 * @param {object} params - URL parameters to replace (e.g., { id: '123' })
 * @returns {string} Full URL
 */
export const buildUrl = (baseUrl, endpoint, params = {}) => {
  let url = `${baseUrl}${API_CONFIG.API_VERSION}${endpoint}`;
  
  // Replace path parameters
  Object.entries(params).forEach(([key, value]) => {
    url = url.replace(`:${key}`, encodeURIComponent(value));
  });
  
  return url;
};

/**
 * Build URL with query parameters
 * @param {string} url - Base URL
 * @param {object} query - Query parameters
 * @returns {string} URL with query string
 */
export const buildUrlWithQuery = (url, query = {}) => {
  const params = new URLSearchParams();
  
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      params.append(key, value.toString());
    }
  });
  
  const queryString = params.toString();
  return queryString ? `${url}?${queryString}` : url;
};

export default API_CONFIG;
