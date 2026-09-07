/**
 * Token changes have to be publishable, because two places hold them.
 *
 * ApiClient and AuthContext each keep their own copy under their own storage key, and only
 * login ever wrote both. ApiClient refreshes on its own schedule and updated only its own,
 * so AuthContext's copy stayed frozen at whatever login produced. The next time AuthContext
 * bridged its tokens across it handed back a refresh token the server had already rotated;
 * a rotated token is rejected, and ApiClient clears the session on a rejected refresh. The
 * user was signed out mid-use, with no way back but signing in again, and nothing in the
 * app said why.
 *
 * The observed signature was a token written with a later expiry and then overwritten,
 * minutes afterwards, by one with an earlier expiry -- the stale copy winning.
 *
 * These pin the notification that keeps the two in step, and the two ways the old code
 * could lose a refresh token outright.
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));

jest.mock('../../sync/NetworkMonitor', () => ({
  NetworkMonitor: { isOffline: () => false, initialize: jest.fn(async () => {}) },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiClient } from '../ApiClient';

beforeEach(() => {
  jest.clearAllMocks();
  ApiClient._accessToken = null;
  ApiClient._refreshToken = null;
  ApiClient._tokenExpiry = null;
  ApiClient._tokenListeners = new Set();
});

describe('onTokensChanged', () => {
  it('notifies subscribers when tokens are set', async () => {
    const seen = [];
    ApiClient.onTokensChanged((t) => seen.push(t));

    await ApiClient.setTokens({
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
      expiresIn: 3600,
    });

    expect(seen).toEqual([{ accessToken: 'access-2', refreshToken: 'refresh-2' }]);
  });

  it('notifies subscribers when tokens are cleared, so nobody keeps a dead copy', async () => {
    const seen = [];
    ApiClient._accessToken = 'access-1';
    ApiClient._refreshToken = 'refresh-1';
    ApiClient.onTokensChanged((t) => seen.push(t));

    await ApiClient.clearTokens();

    expect(seen).toEqual([{ accessToken: null, refreshToken: null }]);
  });

  it('returns an unsubscribe that actually stops delivery', async () => {
    const seen = [];
    const off = ApiClient.onTokensChanged((t) => seen.push(t));
    off();

    await ApiClient.setTokens({ accessToken: 'a', refreshToken: 'r', expiresIn: 60 });

    expect(seen).toEqual([]);
  });

  it('does not let one failing subscriber stop the others', async () => {
    const seen = [];
    ApiClient.onTokensChanged(() => { throw new Error('subscriber exploded'); });
    ApiClient.onTokensChanged((t) => seen.push(t));

    await ApiClient.setTokens({ accessToken: 'a', refreshToken: 'r', expiresIn: 60 });

    expect(seen).toHaveLength(1);
  });
});

describe('setTokens', () => {
  it('keeps the existing refresh token when a caller supplies none', async () => {
    // Losing it is unrecoverable in-session: every later call reports "no refresh token
    // available" and the session just ends.
    ApiClient._refreshToken = 'refresh-existing';

    await ApiClient.setTokens({ accessToken: 'access-new', expiresIn: 3600 });

    expect(ApiClient._refreshToken).toBe('refresh-existing');
  });

  it('does not write undefined to storage, which would reject the whole batch', async () => {
    await ApiClient.setTokens({ accessToken: 'access-new', expiresIn: 3600 });

    const wroteUndefined = AsyncStorage.setItem.mock.calls.some(
      ([, value]) => typeof value !== 'string'
    );
    expect(wroteUndefined).toBe(false);
  });

  it('still persists the access token and expiry when there is no refresh token', async () => {
    await ApiClient.setTokens({ accessToken: 'access-new', expiresIn: 3600 });

    const keys = AsyncStorage.setItem.mock.calls.map(([key]) => key);
    expect(keys).toContain('@footprint/access_token');
    expect(keys).toContain('@footprint/token_expiry');
  });

  it('replaces the refresh token when a new one is supplied', async () => {
    // Rotation: the server may hand back a new refresh token, and that one must win.
    ApiClient._refreshToken = 'refresh-old';

    await ApiClient.setTokens({
      accessToken: 'access-new',
      refreshToken: 'refresh-rotated',
      expiresIn: 3600,
    });

    expect(ApiClient._refreshToken).toBe('refresh-rotated');
  });
});
