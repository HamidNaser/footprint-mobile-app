/**
 * 007 C1 -- a pull never overwrites an entry that has local work not yet pushed.
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

beforeEach(() => {
  jest.clearAllMocks();
  // Server newer than local: last-write-wins would take the server copy.
  jest.spyOn(ConflictResolver, 'resolveConflict').mockImplementation(async (c) => {
    await JournalRepository.applyServerUpdate(c.localEntry.localId, { contentBlocks: [] });
    return { result: 'resolved_server' };
  });
});

describe('_processServerEntry', () => {
  it.each(['pending', 'failed'])('keeps a %s entry with an unsent edit', async (status) => {
    JournalRepository.getByServerId.mockResolvedValue(local(status));

    await SyncEngine._processServerEntry(serverEntry);

    expect(JournalRepository.applyServerUpdate).not.toHaveBeenCalled();
  });

  it('applies the server copy to a synced entry', async () => {
    JournalRepository.getByServerId.mockResolvedValue(local('synced'));

    await SyncEngine._processServerEntry(serverEntry);

    expect(JournalRepository.applyServerUpdate).toHaveBeenCalledWith(
      'L1',
      expect.objectContaining({ contentBlocks: serverEntry.contentBlocks })
    );
  });
});
