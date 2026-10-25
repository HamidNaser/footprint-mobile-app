jest.unmock('../MediaApi');
/** 007 T070: contracts/derivative-retry.md - POST /api/v1/media/{id}/derivatives/retry, no body. */
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

describe.each([['native', MediaApi], ['web', MediaApiWeb]])('MediaApi.retry (%s)', (_name, api) => {
  it('posts to /media/{id}/derivatives/retry with no body and returns the 202 body', async () => {
    const body = { id: 'abc', status: 'pending', updatedAt: 't' };
    const post = jest.spyOn(ApiClient, 'post').mockResolvedValue(body);

    const result = await api.retry('abc');

    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toMatch(/\/media\/abc\/derivatives\/retry$/);
    expect(post.mock.calls[0][1] == null).toBe(true);
    expect(result).toBe(body);
  });

  it('lets a 409 or any other failure reach the caller with its status', async () => {
    jest.spyOn(ApiClient, 'post').mockRejectedValue(Object.assign(new Error('conflict'), { status: 409 }));
    await expect(api.retry('a')).rejects.toMatchObject({ status: 409 });
  });
});
