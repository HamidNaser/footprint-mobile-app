/**
 * Tests for content-block construction, media persistence, the save at the end of an edit
 * (013 T055), and re-sharing a memory whose audience the server would not apply (013 T035).
 *
 * The first two guard production failures where an entry saved fine but rendered as
 * nothing (wrong block shape) or as a grey placeholder (media left in the OS
 * cache). Heavy dependencies are mocked; no database or native modules load.
 */

jest.mock('../DatabaseService', () => {
  // Writes land in the same fake rows the repository mock below holds, so a test can read
  // back what was stored rather than only what was asked for.
  const repository = require('../../repositories/JournalRepository');
  // The media upload queue, as a store rather than a spy. `_queueMediaForUpload` writes rows
  // here, so "only the new photo was queued" is read off the queue's whole contents -- a
  // one-row array that any extra row fails -- rather than off a call that did not happen.
  const mediaQueue = [];
  return {
    DatabaseService: {
      updateEntry: jest.fn(async (localId, updates) => repository.__write(localId, updates)),
      queueMedia: jest.fn(async (media) => {
        mediaQueue.push(media);
      }),
    },
    __mediaQueue: mediaQueue,
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
  FileService: {
    persist: jest.fn(),
    isPersisted: jest.fn(),
    // Every captured file is there and has a size, so the upload queue's own
    // "file not found" branch -- and its warning -- stays out of these tests.
    getFileInfo: jest.fn(async () => ({ size: 2048 })),
  },
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
import { __mediaQueue } from '../DatabaseService';
import { SyncQueue, SyncOperationType } from '../../sync/SyncQueue';
import { SyncEngine } from '../../sync/SyncEngine';

beforeEach(() => {
  jest.clearAllMocks();
  __rows.clear();
  // A store, not a mock, so `clearAllMocks` does not empty it.
  __mediaQueue.length = 0;
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
 * 013 T055 — `JournalService.updateEntry`, the save at the end of an edit (FR-018, FR-019,
 * SC-005; research R7 *Edit-mode media durability*, quickstart M13).
 *
 * An edit's media is of two kinds and they are not treated the same:
 *
 *   - a **new** piece is a file captured during the edit. It lives in the draft folder, which
 *     is deleted the moment this resolves (`CaptureDraftStore`, FR-016), or in the OS cache,
 *     which is purged without warning. Until T056 `updateEntry` only queued uploads and never
 *     called `_persistMediaBlocks`, so an edit stored a path to a file about to be removed --
 *     the grey-placeholder defect `createEntry` already fixes, reached through the edit door
 *     instead (R7).
 *   - a **remote** piece is already on the server, referenced by its `{id, url}` and carrying
 *     no `localPath` (`journalBlocks.mediaItemFor`). Nothing may copy it -- the phone may not
 *     hold the file at all -- and nothing may upload it again: a second copy would take a new
 *     media id, and the server carries a piece's capture moment across an edit by matching on
 *     that id and then on its url (research R3). Re-uploading therefore loses the original
 *     moment and place of a piece the person never touched, which is exactly what FR-019 and
 *     SC-005 forbid.
 *
 * Both of the negative claims here are read off a store rather than off a mock call: the
 * entry's stored blocks say what was written, and `__mediaQueue` holds every row the upload
 * queue received, asserted whole.
 */
describe('updateEntry', () => {
  // A piece loaded back by an edit: the server's id and url, no local file.
  const REMOTE = {
    localId: 'piece-1',
    id: 'media-srv-1',
    url: 'https://cdn.example/quay.jpg',
    capturedAt: '2026-11-01T09:12:00.000Z',
    location: { lat: 53.3453, lng: -6.2603 },
    width: 3024,
    height: 4032,
  };

  // The same values in a separate object, copied before any test runs. "Untouched" is asserted
  // against this rather than against REMOTE itself: an implementation that mutated the piece in
  // place would change REMOTE too, and comparing a mutated object with itself passes.
  const REMOTE_AS_SAVED = JSON.parse(JSON.stringify(REMOTE));

  // A photo taken during the edit: a cache path, no server id.
  const newPhoto = (n = 1) => ({
    localId: `piece-new-${n}`,
    localPath: `file:///cache/new-${n}.jpg`,
    capturedAt: `2026-11-08T18:${String(n).padStart(2, '0')}:00.000Z`,
    location: { lat: 53.3491, lng: -6.2601 },
  });

  const SEEDED_BLOCKS = [{ type: 'photos', media: [REMOTE] }];

  const seedEntry = (overrides = {}) => {
    const entry = {
      localId: 'local-1',
      journalId: 'journal-1',
      userId: 'user-1',
      serverId: 'server-1',
      date: '2026-11-01',
      visibility: 'family',
      locationSharing: 'private',
      syncStatus: 'synced',
      shareState: null,
      contentBlocks: SEEDED_BLOCKS,
      ...overrides,
    };
    __rows.set(entry.localId, entry);
    return entry;
  };

  const stored = () => __rows.get('local-1');
  const storedMedia = () => stored().contentBlocks[0].media;

  const edit = (media) =>
    JournalService.updateEntry('local-1', { contentBlocks: [{ type: 'photos', media }] });

  it('copies the new photo out of the cache and leaves the remote piece exactly as it was', async () => {
    seedEntry();

    await edit([REMOTE, newPhoto()]);

    // One copy, for the one file that needs one.
    expect(FileService.persist).toHaveBeenCalledTimes(1);
    expect(FileService.persist).toHaveBeenCalledWith('file:///cache/new-1.jpg', MediaType.IMAGE);
    // Read back from the stored row: the remote piece is byte-for-byte what it was -- its
    // server id, its url, and the capture moment and place FR-019 preserves -- and it has not
    // acquired a local path it would be uploaded from.
    expect(storedMedia()[0]).toEqual(REMOTE_AS_SAVED);
    // The new capture is stored at its durable path, not the cache path it arrived with.
    expect(storedMedia()[1].localPath).toBe('file:///docs/media/new-1.jpg');
    expect(storedMedia()[1].capturedAt).toBe('2026-11-08T18:01:00.000Z');
  });

  it('queues only the new photo for upload, never the piece the server already holds', async () => {
    seedEntry();

    await edit([REMOTE, newPhoto()]);

    // The queue's whole contents. One row, for the new capture, at its durable path -- which
    // also pins the order: the copy happens before the queueing, so the upload reads the file
    // that survives rather than the cache path that may already be gone.
    expect(__mediaQueue).toEqual([
      expect.objectContaining({
        entryLocalId: 'local-1',
        filePath: 'file:///docs/media/new-1.jpg',
        mediaType: MediaType.IMAGE,
      }),
    ]);
  });

  it('leaves the pieces alone when the edit changes something else (an audience, say)', async () => {
    // `updates` with no `contentBlocks` is not an empty entry. Treating a missing block list
    // as one -- `_persistMediaBlocks(undefined)` answers `[]` -- would store no pieces at all
    // and delete the memory's contents on a change of audience.
    seedEntry();

    await JournalService.updateEntry('local-1', { visibility: 'friends' });

    expect(stored().visibility).toBe('friends');
    expect(stored().contentBlocks).toEqual([{ type: 'photos', media: [REMOTE_AS_SAVED] }]);
    expect(FileService.persist).not.toHaveBeenCalled();
    expect(__mediaQueue).toEqual([]);
  });

  it('leaves one memory after ten edits, the untouched piece still its own (SC-005)', async () => {
    seedEntry();
    let media = [REMOTE];

    for (let n = 1; n <= 10; n += 1) {
      await edit([...media, newPhoto(n)]);
      // The next edit starts from what was stored, as reopening the screen does.
      media = storedMedia();
    }

    expect(__rows.size).toBe(1);
    expect(storedMedia()).toHaveLength(11);
    // Ten edits later, the piece nobody touched still carries the server's id and url and its
    // original moment and place.
    expect(storedMedia()[0]).toEqual(REMOTE_AS_SAVED);
    // Every file the upload queue was ever given, as a set: the ten new captures and nothing
    // else. The remote piece has no local file and is never queued, in any round.
    expect(new Set(__mediaQueue.map((row) => row.filePath))).toEqual(
      new Set(Array.from({ length: 10 }, (_, i) => `file:///docs/media/new-${i + 1}.jpg`)),
    );
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
 *
 * ⚠ **"After" is not enough on its own, which is what round 1 missed**: the refusal may be
 * cleared only when the operation is **known to exist**. Two ways it can fail to — a rejected
 * insert, and the Local Only storage mode, where nothing is queued and nothing would be sent
 * if it were — are pinned below on **both** arms, because the arms were once asymmetric and
 * the quiet one cleared the refusal over a memory that was never queued at all.
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
