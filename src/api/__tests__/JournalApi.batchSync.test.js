/**
 * The server's answer about an audience it could not apply has to survive the API layer.
 *
 * `POST /journals/sync` answers with `BatchSyncResponse`, and since feature 006 that carries
 * `unresolvedAudience: [{ clientId, reason }]` -- the Hub's only statement that it saved a
 * memory's content but could not work out who may see it, with `reason` one of exactly two
 * tokens, `source_unavailable` and `do_not_resend`
 * (`Footprint.Hub.Contracts/Api/Journals/JournalDtos.cs`, `UnresolvedAudienceReasons`).
 *
 * `JournalApi.batchSync` builds its return value field by field, and the field was not in the
 * list. So the one place the refusal appears on the wire was dropped one function below the
 * engine that needed it, which is why the phone re-sent such a memory forever with nothing
 * shown (research R15; round-3 H3). This is the same failure shape as the five in
 * `syncContract.test.js`: a value arrives, nothing receives it, and no error is raised
 * anywhere.
 *
 * Both halves matter. Present, it must come through untranslated -- the engine branches on the
 * exact token. Absent, it must come through as `[]`: the Hub omits nulls rather than writing
 * them (`WhenWritingNull`), so an older server, or any sync where nothing was refused, sends
 * no such field at all, and a caller that has to test for `undefined` before every loop will
 * one day forget.
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

/** What the Hub sends when it accepted everything. */
const acceptedEverything = () => ({
  created: [],
  updated: [],
  deleted: [],
  conflicts: [],
  serverTimestamp: '2026-11-09T10:00:00.000Z',
});

/** One memory's worth of push, so the call has something to be about. */
const onePush = () => ({
  creates: [{ local_id: 'local-1', journal_id: 'journal-1', date: '2026-11-08', visibility: 'family' }],
  updates: [],
  deletes: [],
});

let post;

beforeEach(() => {
  jest.clearAllMocks();
  post = jest.spyOn(ApiClient, 'post');
});

afterEach(() => {
  post.mockRestore();
});

describe('batchSync and an audience the server could not apply', () => {
  it('returns the unresolvedAudience items the server sent', async () => {
    const unresolvedAudience = [
      { clientId: 'local-1', reason: 'source_unavailable' },
      { clientId: 'local-2', reason: 'do_not_resend' },
    ];
    post.mockResolvedValue({ ...acceptedEverything(), unresolvedAudience });

    const result = await JournalApi.batchSync(onePush());

    expect(result.unresolvedAudience).toEqual(unresolvedAudience);
  });

  it('passes the reason token through word for word, because the engine branches on it', async () => {
    // Not normalised, not lower-cased, not mapped to a message. The two tokens are a closed
    // vocabulary and they decide whether the memory keeps retrying or stops; anything that
    // reworded one here would send a refused memory round the retry loop forever, or abandon
    // one that would have sent perfectly well.
    post.mockResolvedValue({
      ...acceptedEverything(),
      unresolvedAudience: [{ clientId: 'local-1', reason: 'do_not_resend' }],
    });

    const result = await JournalApi.batchSync(onePush());

    expect(result.unresolvedAudience[0].reason).toBe('do_not_resend');
    expect(result.unresolvedAudience[0].clientId).toBe('local-1');
  });

  it('returns an empty list when the server sends no such field (round-3 H3)', async () => {
    post.mockResolvedValue(acceptedEverything());

    const result = await JournalApi.batchSync(onePush());

    expect(result.unresolvedAudience).toEqual([]);
  });

  it('returns an empty list when the server sends the field as null', async () => {
    post.mockResolvedValue({ ...acceptedEverything(), unresolvedAudience: null });

    const result = await JournalApi.batchSync(onePush());

    expect(result.unresolvedAudience).toEqual([]);
  });

  it('still returns everything it returned before, alongside the new field', async () => {
    // The new field is an addition. The four lists and the timestamp the push path already
    // settles its operations from must be untouched by it.
    post.mockResolvedValue({
      created: [{ clientId: 'local-1', serverId: 'srv-1', serverTimestamp: '2026-11-09T10:00:00.000Z' }],
      updated: [{ clientId: 'local-2', serverId: 'srv-2', serverTimestamp: '2026-11-09T10:00:00.000Z' }],
      deleted: ['srv-3'],
      conflicts: [{ clientId: 'local-4', serverId: 'srv-4', reason: 'Entry not found' }],
      unresolvedAudience: [{ clientId: 'local-5', reason: 'source_unavailable' }],
      serverTimestamp: '2026-11-09T10:00:00.000Z',
    });

    const result = await JournalApi.batchSync(onePush());

    expect(result).toEqual({
      created: [{ clientId: 'local-1', serverId: 'srv-1', serverTimestamp: '2026-11-09T10:00:00.000Z' }],
      updated: [{ clientId: 'local-2', serverId: 'srv-2', serverTimestamp: '2026-11-09T10:00:00.000Z' }],
      deleted: ['srv-3'],
      conflicts: [{ clientId: 'local-4', serverId: 'srv-4', reason: 'Entry not found' }],
      unresolvedAudience: [{ clientId: 'local-5', reason: 'source_unavailable' }],
      serverTimestamp: '2026-11-09T10:00:00.000Z',
    });
  });
});
