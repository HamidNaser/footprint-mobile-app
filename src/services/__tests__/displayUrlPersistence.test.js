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
    expect(SCHEMA_VERSION).toBe(6);
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

  it('wipes thumbnail and display addresses from the queue, and resets the pull cursor', async () => {
    const db = fakeDb();
    await applyMigration(db, adding());
    const sql = db.statements.join('\n');
    expect(sql).toMatch(/UPDATE media_queue SET thumbnail_server_url = NULL/i);
    expect(sql).toMatch(/display_server_url = NULL/i);
    // The cursor reset is what makes "the next sync repopulates them" true.
    expect(sql).toMatch(/DELETE FROM sync_metadata WHERE key = 'last_pull_timestamp'/i);
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
    expect(remote.serverUrl).toBe('https://cdn/orig'); // the original is not a cached rendition
    expect(local.localPath).toBe('file:///a.jpg');
    expect(local.thumbnailUri).toBe('file:///a.jpg');
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
