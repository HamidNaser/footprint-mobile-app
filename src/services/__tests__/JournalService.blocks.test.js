/**
 * Tests for content-block construction, media persistence, and re-sharing a memory whose
 * audience the server would not apply (013 T035).
 *
 * The first two guard production failures where an entry saved fine but rendered as
 * nothing (wrong block shape) or as a grey placeholder (media left in the OS
 * cache). Heavy dependencies are mocked; no database or native modules load.
 */

jest.mock('../DatabaseService', () => {
  // Writes land in the same fake rows the repository mock below holds, so a test can read
  // back what was stored rather than only what was asked for.
  const repository = require('../../repositories/JournalRepository');
  return {
    DatabaseService: {
      updateEntry: jest.fn(async (localId, updates) => repository.__write(localId, updates)),
    },
  };
});
jest.mock('../SettingsService', () => ({
  SettingsService: {},
  StorageMode: { LOCAL_ONLY: 'local_only' },
}));
/**
 * A fake repository over an in-memory row map. Three things about it are deliberate:
 *
 *   - the row map is the single store, so `visibility`, `sync_status` and `share_state` are
 *     asserted as *stored values*, not as arguments that happened to be passed;
 *   - `isSyncEnabled` is a mock, because it is the Local Only storage mode — a mode in which
 *     nothing drains the sync queue, so nothing can reach the server at all;
 *   - ⚠ **`update` is faithful to `_enqueueSync`, swallow and all.** The real method queues
 *     through that private helper (`JournalRepository.js:552-563`), which **returns early when
 *     sync is disabled and catches every enqueue error** — so the real `update` resolves
 *     normally whether or not an operation was really written, and it moves a synced memory
 *     back to pending only when sync is enabled (`:346-349`). An earlier version of this fake
 *     enqueued unconditionally and let errors propagate, which is what hid round-1 Critical 1:
 *     a `reshareEntry` that cleared the refusal "once the memory is queued" cleared it over a
 *     memory that was never queued, leaving a card reading "Friends" over a memory nobody can
 *     see. The fake must be able to lie in the same way the real one does, or the test cannot
 *     see the defect.
 *
 * Since that fix `reshareEntry` does not use `update` on either arm — it queues the one
 * operation itself, so a failure to queue reaches it — and the tests below assert that. The
 * fake stays faithful so that routing back through `update` would once again go red.
 */
jest.mock('../../repositories/JournalRepository', () => {
  const rows = new Map();

  const write = (localId, updates) => {
    const row = rows.get(localId);
    if (!row) throw new Error(`fake repository: no entry ${localId}`);
    const next = { ...row, ...updates };
    rows.set(localId, next);
    return next;
  };

  const isSyncEnabled = jest.fn(async () => true);

  const JournalRepository = {
    isSyncEnabled,
    getByLocalId: jest.fn(async (localId) => rows.get(localId) ?? null),
    update: jest.fn(async (localId, updates) => {
      const before = rows.get(localId);
      const syncEnabled = await isSyncEnabled();
      const next = write(localId, {
        ...updates,
        ...(syncEnabled && before?.syncStatus === 'synced' ? { syncStatus: 'pending' } : {}),
      });
      // `_enqueueSync`, modelled: a no-op in Local Only mode, and every failure swallowed.
      try {
        if (!syncEnabled) return next;
        const { SyncQueue, SyncOperationType } = require('../../sync/SyncQueue');
        await SyncQueue.enqueue({
          type: SyncOperationType.UPDATE_ENTRY,
          entityId: localId,
          serverId: next.serverId || null,
          data: { ...next, local_id: localId },
        });
      } catch {
        /* swallowed, exactly as `_enqueueSync` does */
      }
      return next;
    }),
    setShareState: jest.fn(async (localId, state) => {
      write(localId, { shareState: state ?? null });
    }),
  };

  return {
    __esModule: true,
    EntryVisibility: {
      PRIVATE: 'private',
      FAMILY: 'family',
      FRIENDS: 'friends',
      FAMILY_FRIENDS: 'family_friends',
    },
    LocationSharing: { PRIVATE: 'private' },
    SortOrder: { DESC: 'desc' },
    __rows: rows,
    __write: write,
    JournalRepository,
  };
});
jest.mock('../FileService', () => ({
  FileService: { persist: jest.fn(), isPersisted: jest.fn() },
  MediaType: { IMAGE: 'image', VIDEO: 'video', AUDIO: 'audio' },
}));
// The real `SyncQueue` module, for its real `SyncOperationType` tokens -- a restated copy
// could drift from the queue the engine reads. Only `enqueue` is replaced, so every queued
// operation is visible and none is written. Its `../database` import is stubbed below, so no
// SQLite loads.
jest.mock('../../sync/SyncQueue', () => {
  const actual = jest.requireActual('../../sync/SyncQueue');
  return {
    __esModule: true,
    ...actual,
    SyncQueue: { enqueue: jest.fn(async () => 'operation-1') },
  };
});
jest.mock('../../database', () => {
  const schema = require('../../database/schema');
  return { ...schema, getDatabase: jest.fn(async () => ({})) };
});
jest.mock('../../sync/SyncEngine', () => ({
  SyncEngine: { sync: jest.fn(async () => ({})) },
  SyncEvent: { SYNC_COMPLETED: 'sync_completed' },
}));

import { JournalService, ContentBlock } from '../JournalService';
import { FileService, MediaType } from '../FileService';
import { ContentBlockType, ShareState } from '../../database/schema';
import { JournalRepository, __rows } from '../../repositories/JournalRepository';
import { SyncQueue, SyncOperationType } from '../../sync/SyncQueue';
import { SyncEngine } from '../../sync/SyncEngine';

beforeEach(() => {
  jest.clearAllMocks();
  __rows.clear();
  // Cloud sync on, unless a test says otherwise. Re-set rather than cleared: `clearAllMocks`
  // forgets calls, not implementations, so a test that switches storage to Local Only would
  // otherwise leak that into every test after it.
  JournalRepository.isSyncEnabled.mockResolvedValue(true);
  // Default: pretend every source path is a cache path that gets copied.
  FileService.persist.mockImplementation(async (uri) =>
    uri.startsWith('file:///docs/') ? uri : `file:///docs/media/${uri.split('/').pop()}`
  );
});

describe('ContentBlock shapes', () => {
  // JournalEntryCard switches on block.type and reads block.media. A block that
  // matches neither renders as nothing, which is what made photos invisible.
  it('builds a photos block, not an undefined type', () => {
    const block = ContentBlock.image({ localPath: 'file:///tmp/a.jpg', width: 100, height: 50 });

    expect(block.type).toBe(ContentBlockType.PHOTOS);
    expect(block.type).toBeDefined();
    expect(block.media).toHaveLength(1);
    expect(block.media[0].localPath).toBe('file:///tmp/a.jpg');
    expect(block.media[0].width).toBe(100);
  });

  it('builds a video block carrying its media array', () => {
    const block = ContentBlock.video({ localPath: 'file:///tmp/v.mp4', duration: 12 });

    expect(block.type).toBe(ContentBlockType.VIDEO);
    expect(block.media[0].localPath).toBe('file:///tmp/v.mp4');
    expect(block.duration).toBe(12);
  });

  it('builds an audio block carrying its media array', () => {
    const block = ContentBlock.audio({ localPath: 'file:///tmp/a.m4a', duration: 3 });

    expect(block.type).toBe(ContentBlockType.AUDIO);
    expect(block.media[0].localPath).toBe('file:///tmp/a.m4a');
  });

  it('gives location blocks a real type', () => {
    const block = ContentBlock.location({ lat: 1, lng: 2, name: 'Gare du Nord' });

    expect(block.type).toBe(ContentBlockType.LOCATION);
    expect(block.type).toBeDefined();
  });

  it('builds a text block the card can render', () => {
    const block = ContentBlock.text('hello');
    expect(block.type).toBe(ContentBlockType.TEXT);
    expect(block.content).toBe('hello');
  });
});

describe('_persistMediaBlocks', () => {
  it('copies capture URIs out of the cache', async () => {
    // The regression: the compose modal stored the raw ImagePicker URI, which
    // the OS purges, so the photo later rendered as a grey placeholder.
    const blocks = [
      { type: 'photos', media: [{ localId: 'p1', localPath: 'file:///cache/pic.jpg' }] },
    ];

    const [photos] = await JournalService._persistMediaBlocks(blocks);

    expect(FileService.persist).toHaveBeenCalledWith('file:///cache/pic.jpg', MediaType.IMAGE);
    expect(photos.media[0].localPath).toBe('file:///docs/media/pic.jpg');
    expect(photos.media[0].localId).toBe('p1');
  });

  it('uses the right media type per block', async () => {
    await JournalService._persistMediaBlocks([
      { type: 'photos', media: [{ localPath: 'file:///cache/a.jpg' }] },
      { type: 'video', media: [{ localPath: 'file:///cache/b.mp4' }] },
      { type: 'audio', media: [{ localPath: 'file:///cache/c.m4a' }] },
    ]);

    expect(FileService.persist).toHaveBeenCalledWith('file:///cache/a.jpg', MediaType.IMAGE);
    expect(FileService.persist).toHaveBeenCalledWith('file:///cache/b.mp4', MediaType.VIDEO);
    expect(FileService.persist).toHaveBeenCalledWith('file:///cache/c.m4a', MediaType.AUDIO);
  });

  it('persists video thumbnails too', async () => {
    const blocks = [{
      type: 'video',
      media: [{ localPath: 'file:///cache/v.mp4', thumbnailPath: 'file:///cache/v.jpg' }],
    }];

    const [video] = await JournalService._persistMediaBlocks(blocks);

    expect(video.media[0].thumbnailPath).toBe('file:///docs/media/v.jpg');
  });

  it('leaves text blocks untouched', async () => {
    const text = { type: 'text', content: 'walked to the station' };
    const [result] = await JournalService._persistMediaBlocks([text]);

    expect(result).toBe(text);
    expect(FileService.persist).not.toHaveBeenCalled();
  });

  it('is safe to run twice on already-persisted media', async () => {
    const blocks = [{ type: 'photos', media: [{ localPath: 'file:///docs/media/pic.jpg' }] }];

    const once = await JournalService._persistMediaBlocks(blocks);
    const twice = await JournalService._persistMediaBlocks(once);

    expect(twice[0].media[0].localPath).toBe('file:///docs/media/pic.jpg');
  });

  it('keeps the original URI when persisting fails, rather than losing the capture', async () => {
    FileService.persist.mockRejectedValue(new Error('disk full'));
    const blocks = [{ type: 'photos', media: [{ localPath: 'file:///cache/pic.jpg' }] }];

    const [photos] = await JournalService._persistMediaBlocks(blocks);

    expect(photos.media[0].localPath).toBe('file:///cache/pic.jpg');
  });

  it('tolerates malformed blocks', async () => {
    const result = await JournalService._persistMediaBlocks([
      null,
      { type: 'photos' },
      { type: 'photos', media: [{ localId: 'no-path' }] },
    ]);

    expect(result).toHaveLength(3);
    expect(FileService.persist).not.toHaveBeenCalled();
  });

  it('returns an empty array for a missing block list', async () => {
    expect(await JournalService._persistMediaBlocks(undefined)).toEqual([]);
  });
});

/**
 * 013 T035 — `JournalService.reshareEntry(localId, visibility)`, the other half of the card's
 * "Not shared — tap to choose who can see it" (FR-011, research R15).
 *
 * R15: *"Choosing an audience updates the entry's visibility, clears `share_state` and
 * enqueues it again: a `CREATE` when the entry has no server id, otherwise an `UPDATE`."*
 *
 * **Exactly one** operation is the part these tests exist for. Two is how a memory gets
 * written to the server twice — once by a create that carries the content and once by an
 * update that cannot find it — and the way to get two here is to lean on the repository's
 * `update`, which queues an `UPDATE_ENTRY` whether or not the memory has ever reached the
 * server. An `UPDATE_ENTRY` without a server id is then dropped as completed
 * (`SyncEngine._processSingleOperation`), so taking that route for a memory the server never
 * held would leave it unshared for good with nothing on the card to say so.
 *
 * The order of the two writes matters too, and in one direction only: the refusal is cleared
 * **after** the memory is queued. Clearing first and failing to queue would leave a card
 * reading "Family" over a memory on nobody's screen, which is SC-010's "appears as shared"
 * and the one failure with no safe side. The other way round is harmless — the card keeps
 * saying "Not shared" for a moment over a memory that is already on its way, and a successful
 * push clears it anyway (`markSynced`).
 */
describe('reshareEntry', () => {
  const BLOCKS = [{ type: 'text', content: 'the arcade on the corner' }];

  const seedEntry = (overrides = {}) => {
    const entry = {
      localId: 'local-1',
      journalId: 'journal-1',
      userId: 'user-1',
      serverId: null,
      date: '2026-11-08',
      visibility: 'family',
      locationSharing: 'private',
      syncStatus: 'pending',
      shareState: ShareState.REFUSED,
      contentBlocks: BLOCKS,
      ...overrides,
    };
    __rows.set(entry.localId, entry);
    return entry;
  };

  const stored = (localId = 'local-1') => __rows.get(localId);
  const queued = () => SyncQueue.enqueue.mock.calls.map(([operation]) => operation);

  it('queues one CREATE for a memory the server has never held', async () => {
    seedEntry({ serverId: null });

    await JournalService.reshareEntry('local-1', 'friends');

    expect(queued()).toHaveLength(1);
    expect(queued()[0].type).toBe(SyncOperationType.CREATE_ENTRY);
    expect(queued()[0].entityId).toBe('local-1');
    expect(queued()[0].serverId ?? null).toBeNull();
  });

  it('queues the operation itself on both arms, never through the repository update', async () => {
    // Not a style preference. `JournalRepository.update` queues through `_enqueueSync`, which
    // returns early in Local Only mode and swallows every enqueue error — so it resolves the
    // same way whether or not an operation was written, and a caller cannot tell. The refusal
    // may be cleared only when the operation is **known** to exist, so this queues it here,
    // where a failure is a rejection (round-1 Critical 1). It is also what keeps "exactly one
    // operation" true: `update` would queue an `UPDATE_ENTRY` even with no server id, which
    // the engine drops as completed, so the memory would stay unshared with nothing on its
    // card to say so.
    for (const serverId of [null, 'server-1']) {
      jest.clearAllMocks();
      __rows.clear();
      seedEntry({ serverId });

      await JournalService.reshareEntry('local-1', 'friends');

      expect({ serverId, update: JournalRepository.update.mock.calls.length }).toEqual({
        serverId,
        update: 0,
      });
      expect(queued()).toHaveLength(1);
    }
  });

  it('sends the latest content, so an edit made while it was refused is not lost (R15)', async () => {
    // A memory whose first upload was refused keeps its changes on the phone until it is
    // re-shared: its create was removed from the queue and no update is enqueued for an entry
    // with no server id. So the create this makes has to carry the content as it stands now,
    // not the shell the memory was first saved as.
    const edited = [
      { type: 'text', content: 'the arcade on the corner' },
      { type: 'photos', media: [{ localId: 'p1', localPath: 'file:///docs/media/arcade.jpg' }] },
    ];
    seedEntry({ serverId: null, contentBlocks: edited });

    await JournalService.reshareEntry('local-1', 'friends');

    expect(queued()[0].data.contentBlocks).toEqual(edited);
    expect(queued()[0].data.local_id).toBe('local-1');
  });

  it('queues one UPDATE, carrying the server id and the chosen audience', async () => {
    seedEntry({ serverId: 'server-1', syncStatus: 'synced' });

    await JournalService.reshareEntry('local-1', 'friends');

    expect(queued()).toHaveLength(1);
    expect(queued()[0].type).toBe(SyncOperationType.UPDATE_ENTRY);
    expect(queued()[0].entityId).toBe('local-1');
    expect(queued()[0].serverId).toBe('server-1');
    expect(queued()[0].data.visibility).toBe('friends');
    expect(queued()[0].data.local_id).toBe('local-1');
  });

  it('moves a memory the server already holds back to pending, so the push collects it', async () => {
    // What `JournalRepository.update` did for this arm before it stopped being used, and it
    // still has to happen: the push walks pending entries, and a row left `synced` over a
    // visibility the server has not been told about is a memory that never goes.
    seedEntry({ serverId: 'server-1', syncStatus: 'synced' });

    await JournalService.reshareEntry('local-1', 'friends');

    expect(stored().syncStatus).toBe('pending');
  });

  it('stores the chosen audience and clears the refusal, either way', async () => {
    for (const serverId of [null, 'server-1']) {
      jest.clearAllMocks();
      __rows.clear();
      seedEntry({ serverId });

      await JournalService.reshareEntry('local-1', 'family_friends');

      expect({ serverId, visibility: stored().visibility, shareState: stored().shareState }).toEqual(
        { serverId, visibility: 'family_friends', shareState: null },
      );
    }
  });

  it('clears the refusal only once the memory is queued again', async () => {
    for (const serverId of [null, 'server-1']) {
      jest.clearAllMocks();
      __rows.clear();
      seedEntry({ serverId });

      await JournalService.reshareEntry('local-1', 'friends');

      expect(SyncQueue.enqueue).toHaveBeenCalledTimes(1);
      expect(JournalRepository.setShareState).toHaveBeenCalledWith('local-1', null);
      expect(SyncQueue.enqueue.mock.invocationCallOrder[0]).toBeLessThan(
        JournalRepository.setShareState.mock.invocationCallOrder[0],
      );
    }
  });

  it('keeps the refusal when the operation cannot be queued at all, on either arm', async () => {
    // Fails closed: the card goes on saying "Not shared", which is true, and the person can
    // try again. Clearing the refusal here would leave the memory looking shared and queued
    // nowhere — SC-010's "appears as shared", caused by the very code meant to fix it.
    //
    // **Both arms**, because they were once asymmetric: the create arm queued here, so a
    // failed insert threw and the refusal survived, while the server-id arm queued through
    // `JournalRepository.update` → `_enqueueSync`, which swallows the same failure and
    // resolves — and the refusal was then cleared over a memory with nothing queued for it
    // (round-1 Critical 1).
    for (const serverId of [null, 'server-1']) {
      jest.clearAllMocks();
      __rows.clear();
      seedEntry({ serverId });
      SyncQueue.enqueue.mockRejectedValueOnce(new Error('queue is unavailable'));

      await expect(JournalService.reshareEntry('local-1', 'friends')).rejects.toThrow(
        'queue is unavailable',
      );

      expect({ serverId, shareState: stored().shareState }).toEqual({
        serverId,
        shareState: ShareState.REFUSED,
      });
      expect(JournalRepository.setShareState).not.toHaveBeenCalled();
    }
  });

  it('shares nothing, and keeps the refusal, while storage is Local Only', async () => {
    // Local Only is the other way an operation can fail to exist, and the one that needs no
    // failure at all: `_enqueueSync` returns early, nothing drains the queue, and a memory
    // cannot reach the server however long it waits. Clearing the refusal there would leave a
    // card reading "Friends" over a memory nobody can see, with no queued operation that will
    // ever change that — SC-010's exact prohibition, on a phone where nothing went wrong.
    //
    // So this refuses, before anything is written: the audience is not stored either, because
    // a stored audience the server will never be told about is the same lie one layer down.
    // The person is told (`JournalScreen`'s Alert), and the card goes on saying "Not shared".
    for (const serverId of [null, 'server-1']) {
      jest.clearAllMocks();
      __rows.clear();
      JournalRepository.isSyncEnabled.mockResolvedValue(false);
      seedEntry({ serverId });

      await expect(JournalService.reshareEntry('local-1', 'friends')).rejects.toThrow(
        /local only/i,
      );

      expect(SyncQueue.enqueue).not.toHaveBeenCalled();
      expect(JournalRepository.setShareState).not.toHaveBeenCalled();
      expect({
        serverId,
        shareState: stored().shareState,
        visibility: stored().visibility,
      }).toEqual({ serverId, shareState: ShareState.REFUSED, visibility: 'family' });
    }
  });

  it('refuses to re-share without an audience, and shares nothing', async () => {
    // FR-011: a memory is never saved, or shared, on anything but an explicit choice. The
    // sheet cannot produce an empty choice, but a caller could, and the answer must not be a
    // guess at what the person meant.
    seedEntry();

    await expect(JournalService.reshareEntry('local-1')).rejects.toThrow(/audience/i);

    expect(SyncQueue.enqueue).not.toHaveBeenCalled();
    expect(stored().shareState).toBe(ShareState.REFUSED);
    expect(stored().visibility).toBe('family');
  });

  it('refuses a memory that is not there, and shares nothing', async () => {
    await expect(JournalService.reshareEntry('local-missing', 'friends')).rejects.toThrow(
      /local-missing/,
    );

    expect(SyncQueue.enqueue).not.toHaveBeenCalled();
  });

  it('asks the sync engine to send it now rather than waiting for the timer', async () => {
    seedEntry({ serverId: null });

    await JournalService.reshareEntry('local-1', 'friends');

    expect(SyncEngine.sync).toHaveBeenCalledTimes(1);
  });

  it('tells the screens the memory changed, with the refusal already gone', async () => {
    // How the card stops saying "Not shared" without the screen reloading: `useJournal`
    // listens for this and replaces the entry it holds.
    seedEntry({ serverId: null });
    const seen = [];
    const unsubscribe = JournalService.on('entryUpdated', (entry) => seen.push(entry));

    const returned = await JournalService.reshareEntry('local-1', 'friends');
    unsubscribe();

    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual(expect.objectContaining({ visibility: 'friends', shareState: null }));
    expect(returned).toEqual(expect.objectContaining({ visibility: 'friends', shareState: null }));
  });
});
