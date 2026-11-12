/**
 * ASP.NET answers a validation failure with `application/problem+json`. The client used to
 * parse only `application/json`, so the body -- the one place the server names the bad field --
 * was thrown away and the app logged "server sent no body".
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
});

it('reads an application/problem+json error body', async () => {
  const body = { title: 'One or more validation errors occurred.', errors: { '$.x': ['bad'] } };
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 400,
    headers: { get: () => 'application/problem+json; charset=utf-8' },
    json: async () => body,
  });

  let thrown;
  try {
    await ApiClient.post('https://example.test/journals/sync', { a: 1 });
  } catch (e) {
    thrown = e;
  }

  expect(thrown).toBeDefined();
  expect(thrown.data.errors).toEqual({ '$.x': ['bad'] });
  expect(thrown.message).toContain('$.x');
});
