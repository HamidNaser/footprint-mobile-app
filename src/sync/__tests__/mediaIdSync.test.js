/**
 * 007 T056 / R12 / FR-040 -- the server's media id is what gets sent, and an entry whose media
 * has not finished uploading is held, visibly, never sent with a local reference.
 */
jest.mock('../NetworkMonitor', () => ({
  NetworkMonitor: { shouldSync: jest.fn(), subscribe: jest.fn() },
  NetworkState: {},
}));
jest.mock('../SyncQueue', () => ({
  SyncQueue: {
    getPendingOperations: jest.fn(),
    markInProgress: jest.fn(),
    markCompleted: jest.fn(),
    markFailed: jest.fn(),
    enqueue: jest.fn(),
  },
  SyncOperationType: { CREATE_ENTRY: 'create_entry', UPDATE_ENTRY: 'update_entry', DELETE_ENTRY: 'delete_entry' },
  OperationStatus: {},
}));
jest.mock('../ConflictResolver', () => ({ ConflictResolver: {}, ResolutionResult: {} }));
jest.mock('../../api/JournalApi', () => ({
  JournalApi: { batchSync: jest.fn(), createEntry: jest.fn(), updateEntry: jest.fn() },
}));
jest.mock('../../api/MediaApi', () => ({ MediaApi: { uploadMedia: jest.fn() } }));
jest.mock('../../api/ApiClient', () => ({ ApiError: class ApiError extends Error {} }));
jest.mock('../../repositories', () => ({
  JournalRepository: { markSynced: jest.fn(), markSyncFailed: jest.fn() },
}));
jest.mock('../../services/JournalService', () => ({
  JournalService: { _queueMediaForUpload: jest.fn(), fileService: { getFileInfo: jest.fn() } },
}));
jest.mock('../../services/SettingsService', () => ({ SettingsService: {}, StorageMode: {} }));
jest.mock('../../services/DatabaseService', () => ({
  DatabaseService: {
    getEntryByLocalId: jest.fn(),
    updateEntry: jest.fn(),
    getMediaQueue: jest.fn(),
    updateMediaQueueItem: jest.fn(),
    getPendingSyncEntries: jest.fn().mockResolvedValue([]),
  },
}));
jest.mock('../../config/api.config', () => ({ API_CONFIG: {} }));

const { SyncEngine } = require('../SyncEngine');
const { SyncQueue } = require('../SyncQueue');
const { JournalApi } = require('../../api/JournalApi');
const { MediaApi } = require('../../api/MediaApi');
const { JournalRepository } = require('../../repositories');
const { DatabaseService } = require('../../services/DatabaseService');
const { JournalService } = require('../../services/JournalService');

const op = (extra = {}) => ({
  id: 'op1',
  type: 'create_entry',
  entityId: 'L1',
  data: { local_id: 'L1' },
  ...extra,
});
const entryWith = (media) => ({ localId: 'L1', contentBlocks: [{ type: 'image', media }] });

beforeEach(() => {
  jest.clearAllMocks();
  JournalApi.batchSync.mockResolvedValue({ created: [], updated: [], deleted: [], conflicts: [] });
  JournalApi.createEntry.mockResolvedValue({ serverId: 'S1' });
  DatabaseService.getMediaQueue.mockResolvedValue([]);
  JournalService.fileService.getFileInfo.mockResolvedValue({ exists: true }); // files are on disk
});

describe('applying an upload to its entry', () => {
  const media = { id: 'q1', entry_id: 'L1', local_uri: 'file:///a.jpg' };

  it('writes the server media id as the item id, never keeping the local one', async () => {
    DatabaseService.getEntryByLocalId.mockResolvedValue(
      entryWith([{ id: 'local-uuid', localPath: 'file:///a.jpg' }])
    );
    await SyncEngine._applyUploadedMediaToEntry(media, {
      mediaId: 'srv-9',
      url: 'https://cdn/o',
      thumbnailUrl: 'https://cdn/t',
      displayUrl: 'https://cdn/d',
    });
    const item = DatabaseService.updateEntry.mock.calls[0][1].contentBlocks[0].media[0];
    expect(item.id).toBe('srv-9');
    expect(item.mediaId).toBe('srv-9');
    expect(item.displayUrl).toBe('https://cdn/d');
  });

  it('treats an upload that returns no media id as failed, not as done', async () => {
    DatabaseService.getMediaQueue.mockResolvedValue([
      { id: 'q1', status: 'pending', entry_id: 'L1', local_uri: 'file:///a.jpg', media_type: 'image', filename: 'a.jpg' },
    ]);
    MediaApi.uploadMedia.mockResolvedValue({ url: 'https://cdn/o' }); // no mediaId
    DatabaseService.getEntryByLocalId.mockResolvedValue(
      entryWith([{ id: 'local-uuid', localPath: 'file:///a.jpg' }])
    );

    const result = await SyncEngine._uploadPendingMedia();

    expect(result.failed).toBe(1);
    expect(result.uploaded).toBe(0);
    expect(DatabaseService.updateMediaQueueItem).toHaveBeenLastCalledWith(
      'q1',
      expect.objectContaining({ status: 'failed' })
    );
    expect(DatabaseService.updateEntry).not.toHaveBeenCalled(); // no half-reference on the entry
  });
});

describe('holding an entry whose media has not finished uploading', () => {
  it('does not send it, and leaves it Pending (not Failed) rather than dropping it silently', async () => {
    SyncQueue.getPendingOperations.mockResolvedValue([op()]);
    DatabaseService.getEntryByLocalId.mockResolvedValue(
      entryWith([{ id: 'local-uuid', localPath: 'file:///a.jpg' }])
    );

    const result = await SyncEngine._pushLocalChanges();

    expect(JournalApi.batchSync).not.toHaveBeenCalled();
    expect(JournalApi.createEntry).not.toHaveBeenCalled();
    expect(SyncQueue.markInProgress).not.toHaveBeenCalled();
    expect(SyncQueue.markCompleted).not.toHaveBeenCalled();
    // R-b: the visible state is the orange Pending, so no failure is recorded.
    expect(JournalRepository.markSyncFailed).not.toHaveBeenCalled();
    expect(result.failed).toBe(0);
    expect(result.held).toBe(1);
  });

  it('puts an entry that an earlier build marked Failed back to Pending', async () => {
    SyncQueue.getPendingOperations.mockResolvedValue([op()]);
    DatabaseService.getEntryByLocalId.mockResolvedValue({
      ...entryWith([{ id: 'local-uuid', localPath: 'file:///a.jpg' }]),
      syncStatus: 'failed',
    });

    await SyncEngine._pushLocalChanges();

    expect(DatabaseService.updateEntry).toHaveBeenCalledWith('L1', { syncStatus: 'pending' });
  });

  it('sends the rest of the queue while one entry is held', async () => {
    SyncQueue.getPendingOperations.mockResolvedValue([
      op(),
      op({ id: 'op2', entityId: 'L2', data: { local_id: 'L2' } }),
    ]);
    DatabaseService.getEntryByLocalId.mockImplementation(async (id) =>
      id === 'L1'
        ? entryWith([{ id: 'local-uuid', localPath: 'file:///a.jpg' }])
        : { localId: 'L2', contentBlocks: [] }
    );
    JournalApi.batchSync.mockResolvedValue({
      created: [{ localId: 'L2', serverId: 'S2' }],
      updated: [],
      deleted: [],
      conflicts: [],
    });

    await SyncEngine._pushLocalChanges();

    const sent = JournalApi.batchSync.mock.calls[0][0].creates;
    expect(sent.map((c) => c.local_id)).toEqual(['L2']);
  });

  it('sends an entry whose media carries the server id, while the device still renders localPath', async () => {
    SyncQueue.getPendingOperations.mockResolvedValue([op()]);
    DatabaseService.getEntryByLocalId.mockResolvedValue(
      entryWith([{ id: 'srv-9', mediaId: 'srv-9', localPath: 'file:///a.jpg', url: 'https://cdn/o' }])
    );
    JournalApi.batchSync.mockResolvedValue({
      created: [{ localId: 'L1', serverId: 'S1' }],
      updated: [],
      deleted: [],
      conflicts: [],
    });

    await SyncEngine._pushLocalChanges();

    expect(JournalApi.batchSync).toHaveBeenCalled();
    expect(JournalRepository.markSyncFailed).not.toHaveBeenCalled();
  });

  it('holds only entries with a local file that has no server media id', () => {
    expect(SyncEngine._hasUnuploadedMedia(entryWith([]))).toBe(false);
    expect(SyncEngine._hasUnuploadedMedia({ contentBlocks: [] })).toBe(false);
    expect(SyncEngine._hasUnuploadedMedia(null)).toBe(false);
    expect(SyncEngine._hasUnuploadedMedia(entryWith([{ id: 's', url: 'https://cdn/o' }]))).toBe(false);
    expect(SyncEngine._hasUnuploadedMedia(entryWith([{ localPath: 'file:///a.jpg' }]))).toBe(true);
    // Uploaded before mediaId was recorded: has its server url, so it is not stuck forever.
    expect(
      SyncEngine._hasUnuploadedMedia(entryWith([{ id: 's', localPath: 'file:///a.jpg', url: 'https://cdn/o' }]))
    ).toBe(false);
  });
});

describe('what is actually sent (C3)', () => {
  const stale = {
    local_id: 'L1',
    updated_at: 1234,
    // The snapshot taken when the entry was queued offline, before the upload finished.
    content_blocks: JSON.stringify([
      { type: 'image', media: [{ id: 'local-uuid', localPath: 'file:///a.jpg' }] },
    ]),
  };
  const uploaded = {
    id: 'srv-9',
    mediaId: 'srv-9',
    localPath: 'file:///a.jpg',
    url: 'https://cdn/o',
    serverUrl: 'https://cdn/o',
    displayUrl: 'https://cdn/d',
  };

  it('sends the fresh row to the batch endpoint: server id and url, never the local id or path', async () => {
    SyncQueue.getPendingOperations.mockResolvedValue([op({ data: stale })]);
    DatabaseService.getEntryByLocalId.mockResolvedValue(entryWith([uploaded]));

    await SyncEngine._pushLocalChanges();

    const sent = JournalApi.batchSync.mock.calls[0][0].creates[0];
    expect(sent.local_id).toBe('L1');
    expect(sent.updated_at).toBe(1234);
    const wire = JSON.stringify(sent);
    expect(wire).not.toContain('local-uuid');
    expect(wire).not.toContain('file:///a.jpg');
    // and through the real formatter, which prefers content_blocks over contentBlocks
    const real = jest.requireActual('../../api/JournalApi').JournalApi._formatEntryForApi(sent);
    expect(real.contentBlocks[0].media[0]).toMatchObject({ id: 'srv-9', url: 'https://cdn/o' });
    expect(JSON.stringify(real)).not.toContain('local-uuid');
  });

  it('sends the same in the one-by-one fallback', async () => {
    SyncQueue.getPendingOperations.mockResolvedValue([op({ data: stale })]);
    DatabaseService.getEntryByLocalId.mockResolvedValue(entryWith([uploaded]));
    JournalApi.batchSync.mockRejectedValue(new Error('boom'));

    await SyncEngine._pushLocalChanges();

    const payload = JournalApi.createEntry.mock.calls[0][0];
    expect(JSON.stringify(payload.contentBlocks)).not.toContain('file:///a.jpg');
    expect(payload.contentBlocks[0].media[0].id).toBe('srv-9');
  });
});

describe('a photo whose file is gone (R-c)', () => {
  const gone = { id: 'local-gone', localPath: 'file:///gone.jpg' };
  const fine = { id: 'srv-9', mediaId: 'srv-9', localPath: 'file:///a.jpg', url: 'https://cdn/o' };

  beforeEach(() => {
    JournalService.fileService.getFileInfo.mockImplementation(async (p) =>
      p === 'file:///gone.jpg' ? null : { exists: true }
    );
  });

  it('is sent without that photo, and flagged on the device so its tile says so', async () => {
    SyncQueue.getPendingOperations.mockResolvedValue([op()]);
    DatabaseService.getEntryByLocalId.mockResolvedValue(entryWith([fine, gone]));

    await SyncEngine._pushLocalChanges();

    const sent = JournalApi.batchSync.mock.calls[0][0].creates[0];
    const media = sent.contentBlocks[0].media;
    expect(media.map((m) => m.id)).toEqual(['srv-9']);
    expect(JSON.stringify(sent)).not.toContain('local-gone');

    const saved = DatabaseService.updateEntry.mock.calls.find((c) => c[1].contentBlocks)[1].contentBlocks;
    const flagged = saved[0].media.find((m) => m.id === 'local-gone');
    expect(flagged).toMatchObject({ uploadFailed: true, missingFile: true, localPath: 'file:///gone.jpg' });
    expect(saved[0].media.find((m) => m.id === 'srv-9').uploadFailed).toBeUndefined();
  });

  it('does not block the entry even when it is the only photo', async () => {
    SyncQueue.getPendingOperations.mockResolvedValue([op()]);
    DatabaseService.getEntryByLocalId.mockResolvedValue(entryWith([gone]));

    const result = await SyncEngine._pushLocalChanges();

    expect(JournalApi.batchSync).toHaveBeenCalled();
    expect(result.held || 0).toBe(0);
  });

  it('still waits for a sibling photo that can upload', async () => {
    SyncQueue.getPendingOperations.mockResolvedValue([op()]);
    DatabaseService.getEntryByLocalId.mockResolvedValue(
      entryWith([gone, { id: 'local-ok', localPath: 'file:///a.jpg' }])
    );

    const result = await SyncEngine._pushLocalChanges();

    expect(JournalApi.batchSync).not.toHaveBeenCalled();
    expect(result.held).toBe(1);
  });
});
