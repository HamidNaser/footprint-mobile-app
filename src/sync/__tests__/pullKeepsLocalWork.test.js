/**
 * 007 -- a pull protects only entries this feature is HOLDING (media not yet uploaded).
 * Every other entry keeps the original ConflictResolver path (the server is last-write-wins).
 */
jest.mock('../NetworkMonitor', () => ({ NetworkMonitor: {}, NetworkState: {} }));
jest.mock('../SyncQueue', () => ({
  SyncQueue: {},
  SyncOperationType: {},
  OperationStatus: {},
}));
jest.mock('../../api/JournalApi', () => ({ JournalApi: {} }));
jest.mock('../../api/MediaApi', () => ({ MediaApi: {} }));
jest.mock('../../api/ApiClient', () => ({ ApiError: class ApiError extends Error {} }));
jest.mock('../../repositories', () => ({
  JournalRepository: { getByServerId: jest.fn(), applyServerUpdate: jest.fn(), createFromServer: jest.fn() },
}));
jest.mock('../../services/JournalService', () => ({ JournalService: {} }));
jest.mock('../../services/SettingsService', () => ({
  SettingsService: { getDefaultJournalId: jest.fn().mockResolvedValue('j1') },
  StorageMode: {},
}));
jest.mock('../../services/DatabaseService', () => ({ DatabaseService: {} }));
jest.mock('../../config/api.config', () => ({ API_CONFIG: {} }));

const { SyncEngine } = require('../SyncEngine');
const { ConflictResolver } = require('../ConflictResolver');
const { JournalRepository } = require('../../repositories');

const serverEntry = {
  id: 'S1',
  updatedAt: '2026-10-02T10:00:00.000Z',
  contentBlocks: [{ type: 'text', content: 'server copy' }],
  visibility: 'private',
};
const local = (syncStatus) => ({
  localId: 'L1',
  serverId: 'S1',
  syncStatus,
  updatedAt: '2026-10-01T10:00:00.000Z',
  syncedAt: '2026-09-30T10:00:00.000Z',
  contentBlocks: [{ type: 'text', content: 'my unsent edit' }],
});

const held = (status = 'pending') => ({
  ...local(status),
  contentBlocks: [{ type: 'image', media: [{ id: 'local-uuid', localPath: 'file:///a.jpg' }] }],
});

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe('_processServerEntry', () => {
  it.each(['pending', 'failed'])('does not overwrite a %s entry held for an unfinished upload', async (status) => {
    const resolve = jest.spyOn(ConflictResolver, 'resolveConflict');
    JournalRepository.getByServerId.mockResolvedValue(held(status));

    await SyncEngine._processServerEntry(serverEntry);

    expect(JournalRepository.applyServerUpdate).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
  });

  it('sends a non-held pending entry with a newer server copy down the old conflict path, and it settles', async () => {
    JournalRepository.getByServerId.mockResolvedValue(local('pending'));

    await SyncEngine._processServerEntry(serverEntry);

    // Server is newer, so last-write-wins accepts it (the pre-existing behaviour).
    expect(JournalRepository.applyServerUpdate).toHaveBeenCalledWith(
      'L1',
      expect.objectContaining({ contentBlocks: serverEntry.contentBlocks })
    );
  });

  it('consults the resolver for a non-held pending entry, as before this feature', async () => {
    const resolve = jest.spyOn(ConflictResolver, 'resolveConflict');
    JournalRepository.getByServerId.mockResolvedValue(local('pending'));

    await SyncEngine._processServerEntry(serverEntry);

    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('applies the server copy to a synced entry', async () => {
    JournalRepository.getByServerId.mockResolvedValue(local('synced'));

    await SyncEngine._processServerEntry(serverEntry);

    expect(JournalRepository.applyServerUpdate).toHaveBeenCalledWith(
      'L1',
      expect.objectContaining({ contentBlocks: serverEntry.contentBlocks })
    );
  });

  it('does not treat a flagged missing-file photo as a hold', async () => {
    JournalRepository.getByServerId.mockResolvedValue({
      ...local('pending'),
      contentBlocks: [
        { type: 'image', media: [{ id: 'g', localPath: 'file:///gone.jpg', uploadFailed: true, missingFile: true }] },
      ],
    });

    await SyncEngine._processServerEntry(serverEntry);

    expect(JournalRepository.applyServerUpdate).toHaveBeenCalled();
  });
});
