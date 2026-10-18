/**
 * 007 T056 / R10 -- the display address is persisted, and the old cached addresses go.
 *
 * SQLite holds server-sent thumbnail addresses from before renditions were replaced (they
 * point at /api/v1/media/t/). The migration clears them so the next sync repopulates from the
 * server, and gives the media queue a column for the display address.
 */
import { CREATE_TABLES, SCHEMA_VERSION } from '../../database/schema';
import { migrations, applyMigration } from '../../database/migrations';

jest.mock('../../database', () => ({
  getDatabase: jest.fn(),
  initializeDatabase: jest.fn(),
  getDatabaseStats: jest.fn(),
  clearDatabase: jest.fn(),
}));

const { DatabaseService } = require('../DatabaseService');

const adding = () =>
  migrations.find((m) => m.up.some((s) => typeof s === 'string' && /display_server_url/i.test(s)));

describe('display address column', () => {
  it('is declared for fresh installs and shipped as a migration for installed apps', () => {
    expect(CREATE_TABLES.media_queue).toMatch(/display_server_url\s+TEXT/i);
    const m = adding();
    expect(m).toBeDefined();
    expect(m.up.join('\n')).toMatch(/ALTER TABLE media_queue ADD COLUMN display_server_url/i);
    expect(m.version).toBe(SCHEMA_VERSION);
    // v7, not v6: main shipped its own v6 (location_sharing) first, and a shipped number is fixed.
    expect(SCHEMA_VERSION).toBe(7);
  });

  it('is read and written by the media row mapping', async () => {
    expect(DatabaseService._mapMediaRow({ display_server_url: 'https://d/x' }).displayServerUrl).toBe(
      'https://d/x'
    );

    const runAsync = jest.fn();
    DatabaseService.getDb = jest.fn().mockResolvedValue({ runAsync });
    await DatabaseService.updateMediaStatus('m1', { displayServerUrl: 'https://d/x' });
    expect(runAsync.mock.calls[0][0]).toContain('display_server_url = ?');
    expect(runAsync.mock.calls[0][1]).toContain('https://d/x');
  });
});

describe('migration clears cached addresses', () => {
  const remoteBlocks = JSON.stringify([
    {
      type: 'image',
      media: [
        {
          id: 'srv-1',
          serverUrl: 'https://cdn/orig',
          url: 'https://cdn/orig',
          thumbnailUrl: 'https://api/api/v1/media/t/srv-1',
          thumbnailUri: 'https://api/api/v1/media/t/srv-1',
          displayUrl: 'https://cdn/d',
          displayUri: 'https://cdn/d',
          thumbnailServerUrl: 'https://api/api/v1/media/t/srv-1',
        },
        {
          id: 'local-1',
          localPath: 'file:///a.jpg',
          thumbnailUri: 'file:///a.jpg',
          thumbnailUrl: 'file:///a.jpg',
        },
      ],
    },
  ]);

  function fakeDb() {
    const statements = [];
    const updates = [];
    return {
      statements,
      updates,
      runAsync: jest.fn(async (sql, params) => {
        statements.push(sql);
        if (/UPDATE journal_entries/i.test(sql)) updates.push(params);
      }),
      getAllAsync: jest.fn(async () => [
        { local_id: 'e1', content_blocks: remoteBlocks },
        { local_id: 'e2', content_blocks: '[]' },
        { local_id: 'e3', content_blocks: 'not json' },
      ]),
    };
  }

  it('wipes thumbnail and display addresses from the queue, and leaves the pull cursor alone', async () => {
    const db = fakeDb();
    await applyMigration(db, adding());
    const sql = db.statements.join('\n');
    expect(sql).toMatch(/UPDATE media_queue SET thumbnail_server_url = NULL/i);
    expect(sql).toMatch(/display_server_url = NULL/i);
    // R-a: no re-pull. A reset would also miss deletions made while the cursor was behind.
    expect(sql).not.toMatch(/sync_metadata/i);
  });

  it('strips remote addresses from cached entries but keeps the device copy', async () => {
    const db = fakeDb();
    await applyMigration(db, adding());

    expect(db.updates).toHaveLength(1); // only e1 changed; empty and unparseable rows untouched
    const [json, localId] = db.updates[0];
    expect(localId).toBe('e1');
    const [remote, local] = JSON.parse(json)[0].media;
    expect(remote.thumbnailUrl).toBeUndefined();
    expect(remote.thumbnailUri).toBeUndefined();
    expect(remote.displayUrl).toBeUndefined();
    expect(remote.displayUri).toBeUndefined();
    expect(remote.thumbnailServerUrl).toBeUndefined(); // the video preview key (M3)
    expect(remote.serverUrl).toBe('https://cdn/orig'); // the original is not a cached rendition
    expect(local.localPath).toBe('file:///a.jpg');
    expect(local.thumbnailUri).toBe('file:///a.jpg');
  });
});

/**
 * C2: the migration is all-or-nothing, and cannot trip over a column that already exists.
 * A fresh install builds tables from CREATE_TABLES (which already has the columns) and then
 * runs every migration from v1; an ALTER ... ADD COLUMN there is a "duplicate column" crash.
 */
describe('migration safety', () => {
  function sqliteLikeDb(columns) {
    const calls = { direct: [], txn: [] };
    const exec = (log) => ({
      runAsync: jest.fn(async (sql) => {
        log.push(sql);
        const alter = /ALTER TABLE (\w+) ADD COLUMN (\w+)/i.exec(sql);
        if (alter) {
          if (columns[alter[1]].includes(alter[2])) throw new Error('duplicate column name: ' + alter[2]);
          columns[alter[1]].push(alter[2]);
        }
      }),
      getAllAsync: jest.fn(async (sql) => {
        const pragma = /PRAGMA table_info\((\w+)\)/i.exec(sql);
        if (pragma) return columns[pragma[1]].map((name) => ({ name }));
        return [];
      }),
    });
    const direct = exec(calls.direct);
    const txn = exec(calls.txn);
    const db = {
      ...direct,
      withExclusiveTransactionAsync: jest.fn(async (cb) => cb(txn)),
    };
    return { db, txn, direct, calls };
  }

  const v = (n) => migrations.find((m) => m.version === n);

  it('runs every step and the version insert inside one exclusive transaction', async () => {
    const { db, calls } = sqliteLikeDb({ media_queue: [], journal_entries: [] });
    await applyMigration(db, v(7));

    expect(db.withExclusiveTransactionAsync).toHaveBeenCalledTimes(1);
    expect(calls.direct).toEqual([]); // nothing escaped the transaction
    expect(calls.txn.some((s) => /INSERT OR REPLACE INTO schema_version/i.test(s))).toBe(true);
  });

  it('records no version when a step fails', async () => {
    const { db, txn, calls } = sqliteLikeDb({ media_queue: [], journal_entries: [] });
    txn.getAllAsync.mockImplementation(async (sql) => {
      if (/PRAGMA/i.test(sql)) return [];
      throw new Error('disk full');
    });
    await expect(applyMigration(db, v(7))).rejects.toThrow('disk full');
    expect(calls.txn.some((s) => /schema_version/i.test(s))).toBe(false);
  });

  it('is a no-op when run a second time', async () => {
    const { db } = sqliteLikeDb({ media_queue: [], journal_entries: [] });
    await applyMigration(db, v(7));
    await expect(applyMigration(db, v(7))).resolves.toBe(true);
  });

  it('succeeds on a fresh install, where CREATE_TABLES already has the columns (v5, v6 and v7)', async () => {
    const { db } = sqliteLikeDb({
      media_queue: ['local_id', 'display_server_url'],
      journal_entries: ['local_id', 'date_precision', 'location_sharing'],
    });
    await expect(applyMigration(db, v(5))).resolves.toBe(true);
    // main's v6 has no guard of its own; the shared one in applyMigration covers it.
    await expect(applyMigration(db, v(6))).resolves.toBe(true);
    await expect(applyMigration(db, v(7))).resolves.toBe(true);
  });

  it('still adds the column when it is genuinely missing', async () => {
    const columns = { media_queue: ['local_id'], journal_entries: ['local_id'] };
    const { db } = sqliteLikeDb(columns);
    await applyMigration(db, v(5));
    await applyMigration(db, v(6));
    await applyMigration(db, v(7));
    expect(columns.journal_entries).toContain('date_precision');
    expect(columns.journal_entries).toContain('location_sharing');
    expect(columns.media_queue).toContain('display_server_url');
  });
});

describe('displayUrl round trip', () => {
  it('is mirrored onto displayUri, and the other way, when entries are read', () => {
    const [block] = DatabaseService._normalizeContentBlocks([
      {
        media: [
          { url: 'https://cdn/o', displayUrl: 'https://cdn/d' },
          { url: 'https://cdn/o2', displayUri: 'https://cdn/d2' },
        ],
      },
    ]);
    expect(block.media[0].displayUrl).toBe('https://cdn/d');
    expect(block.media[0].displayUri).toBe('https://cdn/d');
    expect(block.media[1].displayUrl).toBe('https://cdn/d2');
  });

  it('is not invented when the server sent none', () => {
    const [block] = DatabaseService._normalizeContentBlocks([{ media: [{ url: 'https://cdn/o' }] }]);
    expect(block.media[0].displayUrl).toBeNull();
    expect(block.media[0].displayUri).toBeNull();
  });
});
