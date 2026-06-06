/**
 * API Client
 * 
 * HTTP client with authentication handling, automatic token refresh,
 * request retries, and error handling.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG, AUTH_ENDPOINTS, buildUrl } from '../config/api.config';
import { NetworkMonitor } from '../sync/NetworkMonitor';

// Storage keys for tokens
const TOKEN_KEYS = {
  ACCESS_TOKEN: '@footprint/access_token',
  REFRESH_TOKEN: '@footprint/refresh_token',
  TOKEN_EXPIRY: '@footprint/token_expiry',
};

/**
 * HTTP Methods
 */
export const HttpMethod = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  PATCH: 'PATCH',
  DELETE: 'DELETE',
};

/**
 * API Error class with additional context
 */
export class ApiError extends Error {
  constructor(message, status, code, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;      // HTTP status code
    this.code = code;          // Application error code
    this.data = data;          // Additional error data
    this.isNetworkError = false;
    this.isAuthError = status === 401 || status === 403;
    this.isServerError = status >= 500;
    this.isClientError = status >= 400 && status < 500;
  }

  static networkError(message = 'Network request failed') {
    const error = new ApiError(message, 0, 'NETWORK_ERROR');
    error.isNetworkError = true;
    return error;
  }

  static timeoutError(message = 'Request timed out') {
    const error = new ApiError(message, 0, 'TIMEOUT');
    error.isNetworkError = true;
    return error;
  }

  static offlineError(message = 'No internet connection') {
    const error = new ApiError(message, 0, 'OFFLINE');
    error.isNetworkError = true;
    return error;
  }
}

class ApiClientClass {
  constructor() {
    this._accessToken = null;
    this._refreshToken = null;
    this._tokenExpiry = null;
    this._isRefreshing = false;
    this._refreshPromise = null;
    this._requestQueue = [];
    this._initialized = false;
  }

  /**
   * Initialize the API client
   * Loads stored tokens from AsyncStorage
   */
  async initialize() {
    if (this._initialized) return;

    console.log('[ApiClient] Initializing...');

    try {
      const [accessToken, refreshToken, expiry] = await Promise.all([
        AsyncStorage.getItem(TOKEN_KEYS.ACCESS_TOKEN),
        AsyncStorage.getItem(TOKEN_KEYS.REFRESH_TOKEN),
        AsyncStorage.getItem(TOKEN_KEYS.TOKEN_EXPIRY),
      ]);

      this._accessToken = accessToken;
      this._refreshToken = refreshToken;
      this._tokenExpiry = expiry ? parseInt(expiry, 10) : null;

      this._initialized = true;
      console.log('[ApiClient] Initialized, hasToken:', !!this._accessToken);
    } catch (error) {
      console.error('[ApiClient] Initialization error:', error);
      this._initialized = true; // Continue without tokens
    }
  }

  // ============================================================
  // Token Management
  // ============================================================

  /**
   * Set authentication tokens (after login)
   * @param {object} tokens - { accessToken, refreshToken, expiresIn }
   */
  async setTokens({ accessToken, refreshToken, expiresIn }) {
    this._accessToken = accessToken;
    this._refreshToken = refreshToken;
    
    // Calculate expiry time (with 60 second buffer)
    const expiryTime = Date.now() + (expiresIn * 1000) - 60000;
    this._tokenExpiry = expiryTime;

    // Persist tokens
    await Promise.all([
      AsyncStorage.setItem(TOKEN_KEYS.ACCESS_TOKEN, accessToken),
      AsyncStorage.setItem(TOKEN_KEYS.REFRESH_TOKEN, refreshToken),
      AsyncStorage.setItem(TOKEN_KEYS.TOKEN_EXPIRY, expiryTime.toString()),
    ]);

    console.log('[ApiClient] Tokens set, expires:', new Date(expiryTime).toISOString());
  }

  /**
   * Clear all tokens (on logout)
   */
  async clearTokens() {
    this._accessToken = null;
    this._refreshToken = null;
    this._tokenExpiry = null;

    await Promise.all([
      AsyncStorage.removeItem(TOKEN_KEYS.ACCESS_TOKEN),
      AsyncStorage.removeItem(TOKEN_KEYS.REFRESH_TOKEN),
      AsyncStorage.removeItem(TOKEN_KEYS.TOKEN_EXPIRY),
    ]);

    console.log('[ApiClient] Tokens cleared');
  }

  /**
   * Check if user is authenticated
   * @returns {boolean} True if has valid token
   */
  isAuthenticated() {
    return !!this._accessToken;
  }

  /**
   * Check if token is expired or about to expire
   * @returns {boolean} True if token needs refresh
   */
  isTokenExpired() {
    if (!this._tokenExpiry) return true;
    return Date.now() >= this._tokenExpiry;
  }

  /**
   * Refresh the access token
   * @returns {Promise<boolean>} True if refresh succeeded
   */
  async refreshAccessToken() {
    // If already refreshing, wait for that to complete
    if (this._isRefreshing) {
      return this._refreshPromise;
    }

    if (!this._refreshToken) {
      console.log('[ApiClient] No refresh token available');
      return false;
    }

    this._isRefreshing = true;
    this._refreshPromise = this._doRefreshToken();

    try {
      const result = await this._refreshPromise;
      return result;
    } finally {
      this._isRefreshing = false;
      this._refreshPromise = null;
    }
  }

  async _doRefreshToken() {
    console.log('[ApiClient] Refreshing access token...');

    try {
      const response = await fetch(
        buildUrl(API_CONFIG.AUTH_BASE_URL, AUTH_ENDPOINTS.REFRESH),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            refreshToken: this._refreshToken,
          }),
        }
      );

      if (!response.ok) {
        console.log('[ApiClient] Token refresh failed:', response.status);
        // Clear invalid tokens
        await this.clearTokens();
        return false;
      }

      const data = await response.json();
      await this.setTokens({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken || this._refreshToken,
        expiresIn: data.expiresIn || 3600,
      });

      console.log('[ApiClient] Token refreshed successfully');
      return true;
    } catch (error) {
      console.error('[ApiClient] Token refresh error:', error);
      return false;
    }
  }

  // ============================================================
  // Request Methods
  // ============================================================

  /**
   * Make an authenticated request
   * @param {string} url - Full URL to request
   * @param {object} options - Request options
   * @returns {Promise<object>} Response data
   */
  async request(url, options = {}) {
    await this.initialize();

    const {
      method = HttpMethod.GET,
      body = null,
      headers = {},
      requiresAuth = true,
      timeout = API_CONFIG.TIMEOUT.DEFAULT,
      retryConfig = null,
    } = options;

    // Check network connectivity
    if (NetworkMonitor.isOffline()) {
      throw ApiError.offlineError();
    }

    // Ensure token is valid for authenticated requests
    if (requiresAuth && this.isTokenExpired()) {
      const refreshed = await this.refreshAccessToken();
      if (!refreshed) {
        throw new ApiError('Authentication required', 401, 'AUTH_REQUIRED');
      }
    }

    // Build request headers
    const requestHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...headers,
    };

    if (requiresAuth && this._accessToken) {
      requestHeaders['Authorization'] = `Bearer ${this._accessToken}`;
    }

    // Build request options
    const requestOptions = {
      method,
      headers: requestHeaders,
    };

    if (body && method !== HttpMethod.GET) {
      requestOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    // Execute request with timeout
    try {
      const response = await this._fetchWithTimeout(url, requestOptions, timeout);
      return this._handleResponse(response);
    } catch (error) {
      // Handle network errors
      if (error.name === 'AbortError') {
        throw ApiError.timeoutError();
      }
      if (error instanceof ApiError) {
        throw error;
      }
      throw ApiError.networkError(error.message);
    }
  }

  /**
   * Make a GET request
   */
  async get(url, options = {}) {
    return this.request(url, { ...options, method: HttpMethod.GET });
  }

  /**
   * Make a POST request
   */
  async post(url, body = null, options = {}) {
    return this.request(url, { ...options, method: HttpMethod.POST, body });
  }

  /**
   * Make a PUT request
   */
  async put(url, body = null, options = {}) {
    return this.request(url, { ...options, method: HttpMethod.PUT, body });
  }

  /**
   * Make a PATCH request
   */
  async patch(url, body = null, options = {}) {
    return this.request(url, { ...options, method: HttpMethod.PATCH, body });
  }

  /**
   * Make a DELETE request
   */
  async delete(url, options = {}) {
    return this.request(url, { ...options, method: HttpMethod.DELETE });
  }

  /**
   * Upload a file using multipart/form-data
   * @param {string} url - Upload URL
   * @param {object} file - File object { uri, name, type }
   * @param {object} additionalData - Additional form data
   * @param {function} onProgress - Progress callback (0-100)
   */
  async uploadFile(url, file, additionalData = {}, onProgress = null) {
    await this.initialize();

    if (NetworkMonitor.isOffline()) {
      throw ApiError.offlineError();
    }

    const formData = new FormData();
    formData.append('file', {
      uri: file.uri,
      name: file.name || 'file',
      type: file.type || 'application/octet-stream',
    });

    // Add additional data
    Object.entries(additionalData).forEach(([key, value]) => {
      formData.append(key, value);
    });

    const headers = {};
    if (this._accessToken) {
      headers['Authorization'] = `Bearer ${this._accessToken}`;
    }

    // Note: Don't set Content-Type header - let fetch set it with boundary
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
    });

    return this._handleResponse(response);
  }

  /**
   * Upload directly to S3 using presigned URL
   * @param {string} presignedUrl - S3 presigned URL
   * @param {string} fileUri - Local file URI
   * @param {string} contentType - File MIME type
   * @param {function} onProgress - Progress callback
   */
  async uploadToS3(presignedUrl, fileUri, contentType, onProgress = null) {
    // For React Native, we need to read the file and upload
    // This uses XMLHttpRequest for progress tracking
    
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          const progress = Math.round((event.loaded / event.total) * 100);
          onProgress(progress);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ success: true });
        } else {
          reject(new ApiError('Upload failed', xhr.status, 'UPLOAD_FAILED'));
        }
      });

      xhr.addEventListener('error', () => {
        reject(ApiError.networkError('Upload failed'));
      });

      xhr.addEventListener('abort', () => {
        reject(new ApiError('Upload cancelled', 0, 'UPLOAD_CANCELLED'));
      });

      xhr.open('PUT', presignedUrl);
      xhr.setRequestHeader('Content-Type', contentType);
      
      // In React Native, we can pass the file URI directly
      xhr.send({ uri: fileUri, type: contentType, name: 'upload' });
    });
  }

  // ============================================================
  // Helper Methods
  // ============================================================

  /**
   * Fetch with timeout
   */
  async _fetchWithTimeout(url, options, timeout) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Handle API response
   */
  async _handleResponse(response) {
    let data = null;

    // Try to parse JSON response
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      try {
        data = await response.json();
      } catch (e) {
        // Response might be empty
        data = null;
      }
    }

    // Handle errors
    if (!response.ok) {
      const message = data?.message || data?.error || `Request failed with status ${response.status}`;
      const code = data?.code || 'API_ERROR';
      throw new ApiError(message, response.status, code, data);
    }

    return data;
  }

  /**
   * Retry a request with exponential backoff
   * @param {function} requestFn - Function that returns a promise
   * @param {object} config - Retry configuration
   */
  async retryWithBackoff(requestFn, config = {}) {
    const {
      maxAttempts = API_CONFIG.RETRY.MAX_ATTEMPTS,
      initialDelay = API_CONFIG.RETRY.INITIAL_DELAY,
      maxDelay = API_CONFIG.RETRY.MAX_DELAY,
      backoffFactor = API_CONFIG.RETRY.BACKOFF_FACTOR,
      shouldRetry = (error) => error.isNetworkError || error.isServerError,
    } = config;

    let lastError;
    let delay = initialDelay;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error;

        // Don't retry if not retryable
        if (!shouldRetry(error)) {
          throw error;
        }

        // Don't wait after last attempt
        if (attempt === maxAttempts) {
          throw error;
        }

        console.log(`[ApiClient] Request failed, retry ${attempt}/${maxAttempts} in ${delay}ms`);
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Increase delay for next attempt (with jitter)
        const jitter = Math.random() * 0.3 + 0.85; // 0.85 - 1.15
        delay = Math.min(delay * backoffFactor * jitter, maxDelay);
      }
    }

    throw lastError;
  }
}

// Export singleton instance
export const ApiClient = new ApiClientClass();
export default ApiClient;
