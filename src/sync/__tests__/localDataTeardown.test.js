/**
 * @jest-environment node
 *
 * The two local-store wipes, end to end: sign-out (`teardownLocalData`) and account switch
 * (`ensureFreshLocalStore`, reached through `startSync`).
 *
 * <p>
 * Both exist, by their own comments, so that no data bleeds across sessions -- and until this was
 * written neither of them touched 013's unsaved memory. `clearDatabase`'s table list was seven
 * names kept by hand with `capture_drafts` missing from it, and nothing anywhere deleted the
 * draft media under `documentDirectory/capture-drafts/`. The consequence is a privacy
 * regression, not an untidiness, and it reads like this: person A types a note, takes two
 * photographs and records a voice clip, does not save, and signs out. Person B signs in on the
 * same phone and taps <b>+</b>. `CaptureScreen`'s mount calls `CaptureDraftStore.load('new')`,
 * finds A's row with A's media still on disk, restores every piece and enables Save -- and
 * `performSave` writes the entry with <b>B's</b> user id. FR-014 is "an unsaved memory MUST
 * remain private to the phone".
 * </p>
 *
 * <p>
 * So this file asserts <b>the property, never a mock call</b>: it runs the real
 * `CaptureDraftStore` against a real SQLite engine (`node:sqlite`, the `upgradePaths.test.js`
 * adapter) and a filesystem held in memory, and after each wipe it reads the `capture_drafts`
 * table, reads the directory, and asks the store itself what the next capture screen would be
 * handed. A test that checked `deleteAsync` had been called would prove nothing about either.
 * </p>
 */

import { DatabaseSync } from 'node:sqlite';

// ---------------------------------------------------------------------------
// The phone's storage, in memory.
// ---------------------------------------------------------------------------

const DOCS = 'file:///docs/';
const DRAFTS_ROOT = `${DOCS}capture-drafts/`;

const files = new Set();
const dirs = new Set();

/** Set to an Error to make a delete fail, the way a wipe can on a real device. */
let deleteFails = null;

const mockFileSystem = {
  documentDirectory: DOCS,
  getInfoAsync: jest.fn(async (uri) => ({
    uri,
    exists: files.has(uri) || dirs.has(uri),
    isDirectory: dirs.has(uri),
  })),
  makeDirectoryAsync: jest.fn(async (uri) => {
    dirs.add(uri);
  }),
  copyAsync: jest.fn(async ({ from, to }) => {
    files.add(from);
    files.add(to);
  }),
  deleteAsync: jest.fn(async (uri) => {
    if (deleteFails) throw deleteFails;
    for (const path of [...dirs]) if (path.startsWith(uri)) dirs.delete(path);
    for (const path of [...files]) if (path.startsWith(uri)) files.delete(path);
  }),
};

jest.mock('expo-file-system/legacy', () => mockFileSystem);
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));

// ---------------------------------------------------------------------------
// Everything around the wipe. `DatabaseService.clearLocalData` runs the REAL wipe, because
// whether the drafts table is cleared is half of what this file is about.
// ---------------------------------------------------------------------------

jest.mock('../../services/DatabaseService', () => ({
  DatabaseService: {
    initialize: jest.fn(async () => {}),
    clearLocalData: jest.fn(async () => {
      const { clearDatabase } = require('../../database');
      await clearDatabase();
    }),
  },
}));

const settings = { userId: null };

jest.mock('../../services/SettingsService', () => ({
  SettingsService: {
    getUserId: jest.fn(async () => settings.userId),
    setUserId: jest.fn(async (id) => {
      settings.userId = id;
    }),
    clearSettings: jest.fn(async () => {
      settings.userId = null;
    }),
    getDefaultJournalId: jest.fn(async () => 'j1'),
    getOrCreateDefaultJournal: jest.fn(async () => 'j1'),
    setDefaultJournalId: jest.fn(async () => {}),
  },
}));

jest.mock('../../api/ApiClient', () => ({ ApiClient: { initialize: jest.fn(async () => {}) } }));
jest.mock('../../api/JournalApi', () => ({
  JournalApi: { listJournals: jest.fn(async () => [{ id: 'j1' }]) },
}));
jest.mock('../SyncEngine', () => ({
  SyncEngine: {
    initialize: jest.fn(async () => {}),
    sync: jest.fn(async () => {}),
    startAutoSync: jest.fn(),
    stopAutoSync: jest.fn(),
  },
}));
jest.mock('../NetworkMonitor', () => ({ NetworkMonitor: { initialize: jest.fn(async () => {}) } }));

// ---------------------------------------------------------------------------
// expo-sqlite's async surface over node:sqlite.
// ---------------------------------------------------------------------------

function adapter(raw) {
  const conn = {
    raw,
    execAsync: async (sql) => raw.exec(sql),
    runAsync: async (sql, params = []) => raw.prepare(sql).run(...params),
    getAllAsync: async (sql, params = []) => raw.prepare(sql).all(...params),
    getFirstAsync: async (sql, params = []) => raw.prepare(sql).get(...params) ?? null,
    // A no-op: the phone's storage outlives a sign-out, and so must this database.
    closeAsync: async () => {},
    withExclusiveTransactionAsync: async (task) => {
      raw.exec('BEGIN EXCLUSIVE');
      try {
        await task(conn);
        raw.exec('COMMIT');
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return conn;
}

let raw;
let store;
let bootstrap;

const draftRows = () => raw.prepare('SELECT * FROM capture_drafts').all();
const entryRows = () => raw.prepare('SELECT * FROM journal_entries').all();

/** A piece, as the capture screen builds one. */
const photo = (localId) => ({
  localId,
  kind: 'photo',
  capturedAt: '2026-11-10T10:00:00.000Z',
  location: null,
  uri: `file:///cache/${localId}.jpg`,
});

const note = (localId, content) => ({
  localId,
  kind: 'text',
  capturedAt: '2026-11-10T10:01:00.000Z',
  location: null,
  content,
});

function seedEntry(localId) {
  raw
    .prepare(
      `INSERT INTO journal_entries (local_id, journal_id, user_id, date, content_blocks,
         created_at, updated_at) VALUES (?, 'j1', 'user-a', '2026-11-10', '[]', 1, 1)`
    )
    .run(localId);
}

/** Person A's unsaved new memory and unsaved edit, media and all. */
async function captureAsPersonA() {
  await store.addPiece(store.DraftSlot.NEW, note('p1', 'the thing I have not saved yet'));
  await store.addPiece(store.DraftSlot.NEW, photo('p2'));
  await store.addPiece(store.DraftSlot.NEW, photo('p3'));

  seedEntry('entry-a');
  await store.startEdit('entry-a', []);
  await store.addPiece(store.DraftSlot.EDIT, photo('p4'));
}

beforeEach(async () => {
  jest.resetModules();
  files.clear();
  dirs.clear();
  deleteFails = null;
  settings.userId = null;

  raw = new DatabaseSync(':memory:');
  const SQLite = require('expo-sqlite');
  SQLite.openDatabaseAsync.mockResolvedValue(adapter(raw));
  const { initializeDatabase } = require('../../database');
  await initializeDatabase();

  store = require('../../services/CaptureDraftStore');
  bootstrap = require('../SyncBootstrap');
});

describe('teardownLocalData: signing out takes the unsaved memory with it (FR-014)', () => {
  it("leaves no capture_drafts row, no draft media, and nothing for the next person's capture screen to load", async () => {
    await captureAsPersonA();

    // The state the regression is about: both slots recorded, media on disk.
    expect(draftRows().map((row) => row.id).sort()).toEqual(['edit', 'new']);
    expect([...files].filter((path) => path.startsWith(DRAFTS_ROOT)).sort()).toEqual([
      `${DRAFTS_ROOT}edit/p4.jpg`,
      `${DRAFTS_ROOT}new/p2.jpg`,
      `${DRAFTS_ROOT}new/p3.jpg`,
    ]);

    await bootstrap.teardownLocalData();

    // Read off the table and the filesystem, not off a mock call.
    expect(draftRows()).toEqual([]);
    expect([...files].filter((path) => path.startsWith(DRAFTS_ROOT))).toEqual([]);
    expect([...dirs].filter((path) => path.startsWith(DRAFTS_ROOT))).toEqual([]);
    expect((await mockFileSystem.getInfoAsync(DRAFTS_ROOT)).exists).toBe(false);
    expect((await mockFileSystem.getInfoAsync(store.slotDirectory('new'))).exists).toBe(false);

    // And the question that actually matters: what is the next person's capture screen handed?
    expect(await store.load(store.DraftSlot.NEW)).toBeNull();
    expect(await store.load(store.DraftSlot.EDIT)).toBeNull();
  });

  it('wipes the rest of the local store at the same time, so nothing else of A survives either', async () => {
    await captureAsPersonA();
    expect(entryRows()).toHaveLength(1);

    await bootstrap.teardownLocalData();

    expect(entryRows()).toEqual([]);
  });

  it('a draft still unwritten in memory is let go as well, not just the row', async () => {
    // The sharpest shape of the hole. `loadHeld` hands back the draft in hand *in preference to
    // the row* while a slot is unwritten (rule 3 in CaptureDraftStore's header), so clearing the
    // row alone would leave exactly the draft that was never saved readable -- and these module
    // caches outlive a sign-out, because the bundle is not reloaded between accounts.
    await store.addPiece(store.DraftSlot.NEW, note('p1', 'half-typed'));
    store.updateText(store.DraftSlot.NEW, 'p1', 'half-typed and still in the air');

    await bootstrap.teardownLocalData();

    expect(await store.load(store.DraftSlot.NEW)).toBeNull();
    expect(draftRows()).toEqual([]);
  });

  it('a phone that has never captured anything is not an error: no directory, no throw', async () => {
    await expect(bootstrap.teardownLocalData()).resolves.toBeUndefined();
    expect(draftRows()).toEqual([]);
  });

  it('a failed media delete does not stop the sign-out, and says so', async () => {
    await captureAsPersonA();
    deleteFails = new Error('storage is busy');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // A logout that refuses to finish leaves the person signed in on a phone they are handing
    // over, which is worse than a wipe that reports what it could not do.
    await expect(bootstrap.teardownLocalData()).resolves.toBeUndefined();
    expect(warn.mock.calls.flat().join(' ')).toContain('clearAllDrafts failed');
    warn.mockRestore();
  });
});

describe('ensureFreshLocalStore: switching account takes the previous one\'s unsaved memory too', () => {
  it('wipes the drafts and their media when a different user signs in', async () => {
    settings.userId = 'user-a';
    await captureAsPersonA();
    expect(draftRows()).toHaveLength(2);

    await bootstrap.startSync('user-b');

    expect(draftRows()).toEqual([]);
    expect([...files].filter((path) => path.startsWith(DRAFTS_ROOT))).toEqual([]);
    expect(await store.load(store.DraftSlot.NEW)).toBeNull();
  });

  it('the same user signing in again keeps their unsaved memory (this is not a wipe)', async () => {
    settings.userId = 'user-a';
    await captureAsPersonA();

    await bootstrap.startSync('user-a');

    // The wipe is for an account *switch*. A person reopening the app must find the note they
    // were in the middle of -- FR-012, nothing captured is ever lost.
    expect(draftRows().map((row) => row.id).sort()).toEqual(['edit', 'new']);
    expect((await store.load(store.DraftSlot.NEW)).pieces).toHaveLength(3);
    expect([...files].filter((path) => path.startsWith(DRAFTS_ROOT))).toHaveLength(3);
  });
});
