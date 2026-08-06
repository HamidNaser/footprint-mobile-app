/**
 * Tests for ApiClient's token-expiry and refresh behaviour.
 *
 * These guard a silent-logout path: a failed refresh used to wipe the session
 * while AuthContext kept showing the user as signed in, so every subsequent
 * request went out unauthenticated and live screens rendered as empty.
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));

jest.mock('../../sync/NetworkMonitor', () => ({
  NetworkMonitor: { isOffline: () => false, initialize: jest.fn(async () => {}) },
}));

import { ApiClient } from '../ApiClient';

beforeEach(() => {
  jest.clearAllMocks();
  ApiClient._accessToken = 'token-abc';
  ApiClient._refreshToken = 'refresh-xyz';
  ApiClient._tokenExpiry = null;
  ApiClient._initialized = true;
  ApiClient._isRefreshing = false;
  ApiClient._refreshPromise = null;
});

describe('isTokenExpired', () => {
  it('treats an unknown expiry as not-expired rather than expired', () => {
    // Returning true here forced a refresh on every request whenever the
    // expiry key was missing; a failed refresh then cleared the session.
    ApiClient._tokenExpiry = null;
    expect(ApiClient.isTokenExpired()).toBe(false);
  });

  it('treats a NaN expiry as not-expired', () => {
    // Reachable when expiresIn is undefined: Date.now() + undefined*1000 = NaN.
    ApiClient._tokenExpiry = NaN;
    expect(ApiClient.isTokenExpired()).toBe(false);
  });

  it('is expired once the recorded time has passed', () => {
    ApiClient._tokenExpiry = Date.now() - 1000;
    expect(ApiClient.isTokenExpired()).toBe(true);
  });

  it('is not expired before the recorded time', () => {
    ApiClient._tokenExpiry = Date.now() + 60_000;
    expect(ApiClient.isTokenExpired()).toBe(false);
  });
});

describe('refresh failure handling', () => {
  const jsonResponse = (status, body = {}) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    json: async () => body,
  });

  it('keeps the session when the auth service returns 5xx', async () => {
    // A bad minute for the auth service is not a rejection of the credential.
    // Clearing here logged users out of working accounts, silently.
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(503));

    const result = await ApiClient.refreshAccessToken();

    expect(result).toBe(false);
    expect(ApiClient._accessToken).toBe('token-abc');
    expect(ApiClient._refreshToken).toBe('refresh-xyz');
  });

  it('clears the session when the refresh token itself is rejected', async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse(401));

    const result = await ApiClient.refreshAccessToken();

    expect(result).toBe(false);
    expect(ApiClient._accessToken).toBeNull();
  });

  it('adopts new tokens on success', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse(200, { accessToken: 'new-abc', refreshToken: 'new-xyz', expiresIn: 3600 })
    );

    const result = await ApiClient.refreshAccessToken();

    expect(result).toBe(true);
    expect(ApiClient._accessToken).toBe('new-abc');
  });

  it('does nothing without a refresh token', async () => {
    ApiClient._refreshToken = null;
    expect(await ApiClient.refreshAccessToken()).toBe(false);
  });
});
