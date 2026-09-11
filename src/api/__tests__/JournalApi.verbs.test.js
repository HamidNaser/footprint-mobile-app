/**
 * Updates must use the HTTP verb the server actually declares.
 *
 * Both journal update calls sent PUT. The server declares
 * [HttpPatch("{journalId}")] and [HttpPatch("entries/{entryId}")], and ASP.NET rejects a
 * mismatched verb in routing -- 405, before any controller code runs. That is what made
 * this so hard to see: JournalsController has no logging of its own, so a request that
 * never reaches it leaves no trace whatsoever in CloudWatch. The server looked idle and
 * healthy while every edit to an existing entry failed.
 *
 * It was especially misleading because the *media* for those entries uploaded perfectly:
 * presign and complete both logged success for every photo and the audio. Only the entry
 * carrying them failed, so the visible result was media in S3 attached to nothing.
 *
 * A verb is exactly the kind of detail that reads fine and is wrong, so these pin it.
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => {}),
  removeItem: jest.fn(async () => {}),
}));

jest.mock('../../sync/NetworkMonitor', () => ({
  NetworkMonitor: { isOffline: () => false, initialize: jest.fn(async () => {}) },
  NetworkState: {},
}));

import { ApiClient } from '../ApiClient';
import { JournalApi } from '../JournalApi';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('updating an entry', () => {
  it('uses PATCH, because the server route is [HttpPatch("entries/{entryId}")]', async () => {
    const patch = jest.spyOn(ApiClient, 'patch').mockResolvedValue({ id: 'e1' });
    const put = jest.spyOn(ApiClient, 'put').mockResolvedValue({});

    await JournalApi.updateEntry('entry-1', { title: 'edited' });

    expect(patch).toHaveBeenCalled();
    // A PUT here is a 405 the server never logs.
    expect(put).not.toHaveBeenCalled();
  });

  it('sends it to the entry path', async () => {
    const patch = jest.spyOn(ApiClient, 'patch').mockResolvedValue({ id: 'e1' });

    await JournalApi.updateEntry('entry-1', { title: 'edited' });

    const [url] = patch.mock.calls[0];
    expect(url).toContain('/journals/entries/entry-1');
  });
});

describe('updating a journal', () => {
  it('uses PATCH, because the server route is [HttpPatch("{journalId}")]', async () => {
    const patch = jest.spyOn(ApiClient, 'patch').mockResolvedValue({ id: 'j1' });
    const put = jest.spyOn(ApiClient, 'put').mockResolvedValue({});

    await JournalApi.updateJournal('journal-1', { title: 'renamed' });

    expect(patch).toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });
});
