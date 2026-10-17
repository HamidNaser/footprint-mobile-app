jest.unmock('../MediaApi');
/** 007 contracts/media-status.md: POST /api/v1/media/status with { ids }. */
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));
jest.mock('../../sync/NetworkMonitor', () => ({
  NetworkMonitor: { isOffline: () => false, initialize: jest.fn(async () => {}), shouldUploadMedia: jest.fn(async () => true) },
  NetworkState: {},
}));

import { ApiClient } from '../ApiClient';
import { MediaApi } from '../MediaApi';
import { MediaApi as MediaApiWeb } from '../MediaApi.web';

afterEach(() => jest.restoreAllMocks());

describe.each([['native', MediaApi], ['web', MediaApiWeb]])('MediaApi.status (%s)', (_name, api) => {
  it('posts the ids to /media/status and returns the body untouched', async () => {
    const body = { items: [{ id: 'a', status: 'pending', updatedAt: 't' }], partial: false };
    const post = jest.spyOn(ApiClient, 'post').mockResolvedValue(body);

    const result = await api.status(['a', 'b']);

    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toMatch(/\/media\/status$/);
    expect(post.mock.calls[0][1]).toEqual({ ids: ['a', 'b'] });
    expect(result).toBe(body);
  });
});
