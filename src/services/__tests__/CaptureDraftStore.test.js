/**
 * @jest-environment node
 *
 * 013 T016 -- the unsaved memory on the phone (FR-012 to FR-016, SC-004).
 *
 * <p>
 * Today an interrupted capture is simply lost: a phone lock, an incoming call or the operating
 * system reclaiming the app takes everything captured with it, because durable copies are only
 * made at save time (`JournalService._persistMediaBlocks`). This store is what stops that, and
 * two of its rules carry the whole weight:
 * </p>
 *
 * <ol>
 *   <li><b>The media is copied somewhere durable before the piece is recorded.</b> A piece that
 *       points at a cache file the system may purge is worse than no piece: it reads as present
 *       and plays as missing. So if the copy fails -- storage full -- nothing is persisted, the
 *       call rejects, and the pieces already captured are untouched.</li>
 *   <li><b>A draft is invisible to the sync machinery.</b> It lives in its own table and never
 *       writes to the entries or the sync queue, so nothing can upload it or turn it into a
 *       memory by itself. SC-004 allows <b>zero</b> unsaved memories reaching anyone.</li>
 * </ol>
 *
 * <p>
 * Run against a real SQLite engine through Node's own `node:sqlite` (the `upgradePaths.test.js`
 * adapter), so the SQL asserted here is the SQL production issues, against the real schema v8.
 * That is deliberate for the FR-014 test: a test that only checked a mock was not called would
 * prove nothing about the store reaching those tables another way, so it asserts over every
 * statement the store issues AND over the contents of those tables after a whole draft life.
 * </p>
 */

import { DatabaseSync } from 'node:sqlite';

const DOCS = 'file:///docs/';
const NEW_DIR = `${DOCS}capture-drafts/new/`;
const EDIT_DIR = `${DOCS}capture-drafts/edit/`;

// ---------------------------------------------------------------------------
// The phone's storage, in memory. Held outside the jest.mock factory so it
// survives the module reset that stands in for the app being killed.
// ---------------------------------------------------------------------------

const files = new Set();
const dirs = new Set();

/** Set to an Error to make the next copy fail, the way a full disk does. */
let copyFails = null;

/** Everything that happened, file operations and SQL together, in order. */
const trail = [];

/** Just the SQL, as the store issued it. */
const sql = [];

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
    if (copyFails) throw copyFails;
    if (!files.has(from)) files.add(from);
    trail.push(`copy ${from} -> ${to}`);
    files.add(to);
  }),
  deleteAsync: jest.fn(async (uri) => {
    trail.push(`delete ${uri}`);
    dirs.delete(uri);
    for (const path of [...files]) {
      if (path.startsWith(uri)) files.delete(path);
    }
  }),
};

jest.mock('expo-file-system/legacy', () => mockFileSystem);
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));

// ---------------------------------------------------------------------------
// expo-sqlite's async surface over node:sqlite, logging every statement.
// ---------------------------------------------------------------------------

function adapter(raw) {
  const note = (text) => {
    sql.push(text);
    trail.push(`sql ${text.replace(/\s+/g, ' ').trim()}`);
  };
  const conn = {
    raw,
    execAsync: async (text) => {
      note(text);
      raw.exec(text);
    },
    runAsync: async (text, params = []) => {
      note(text);
      return raw.prepare(text).run(...params);
    },
    getAllAsync: async (text, params = []) => {
      note(text);
      return raw.prepare(text).all(...params);
    },
    getFirstAsync: async (text, params = []) => {
      note(text);
      return raw.prepare(text).get(...params) ?? null;
    },
    // A no-op: the phone's storage outlives the app, and so must this database.
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

/** Open the real database layer -- real CREATE_TABLES, real migrations -- over `raw`. */
async function bootDatabase() {
  const SQLite = require('expo-sqlite');
  SQLite.openDatabaseAsync.mockResolvedValue(adapter(raw));
  const { initializeDatabase } = require('../../database');
  await initializeDatabase();
}

const loadStore = () => require('../CaptureDraftStore');

/** Read a slot's row directly, around the store, so reading does not pollute `sql`. */
const rowFor = (slot) =>
  raw.prepare('SELECT * FROM capture_drafts WHERE id = ?').get(slot) ?? null;

const piecesOf = (slot) => JSON.parse(rowFor(slot).pieces_json);
const textIn = (slot, localId) => piecesOf(slot).find((p) => p.localId === localId)?.content;
const rowsOf = (table) => raw.prepare(`SELECT * FROM ${table}`).all();
const draftWrites = () => sql.filter((text) => /INSERT INTO capture_drafts/i.test(text));

function seedEntry(localId, extra = {}) {
  const row = {
    local_id: localId,
    journal_id: 'j1',
    user_id: 'u1',
    date: '2026-11-08',
    content_blocks: '[]',
    created_at: 1,
    updated_at: 1,
    ...extra,
  };
  const keys = Object.keys(row);
  raw
    .prepare(
      `INSERT INTO journal_entries (${keys.join(', ')})
       VALUES (${keys.map(() => '?').join(', ')})`
    )
    .run(...keys.map((key) => row[key]));
}

function seedQueuedOperation() {
  raw
    .prepare(
      `INSERT INTO sync_queue (id, operation_type, entity_id, payload, created_at)
       VALUES ('op1', 'CREATE_ENTRY', 'e1', '{}', '2026-11-08T09:00:00.000Z')`
    )
    .run();
  raw
    .prepare(
      `INSERT INTO media_queue (local_id, entry_local_id, file_path, media_type, file_size, created_at)
       VALUES ('m1', 'e1', 'file:///docs/media/photos/a.jpg', 'image', 1, 1)`
    )
    .run();
}

// ---------------------------------------------------------------------------
// Pieces, as the capture screen builds them (data-model, *Piece*).
// ---------------------------------------------------------------------------

const photo = (localId, uri = `file:///cache/${localId}.jpg`) => ({
  localId,
  kind: 'photo',
  capturedAt: '2026-11-08T10:00:00.000Z',
  location: { lat: 51.62, lng: -3.94, accuracy: 12 },
  uri,
  width: 4032,
  height: 3024,
});

const note = (localId, content) => ({
  localId,
  kind: 'text',
  capturedAt: '2026-11-08T10:01:00.000Z',
  location: null,
  content,
});

/** An existing server media item in an edit: never copied, never re-uploaded. */
const remotePhoto = (localId) => ({
  localId,
  kind: 'photo',
  capturedAt: '2019-06-01T12:00:00.000Z',
  location: null,
  remote: { id: 'srv-1', url: 'https://cdn/orig.jpg' },
});

beforeEach(async () => {
  jest.resetModules();
  jest.clearAllMocks();
  files.clear();
  dirs.clear();
  dirs.add(DOCS);
  trail.length = 0;
  sql.length = 0;
  copyFails = null;

  raw = new DatabaseSync(':memory:');
  await bootDatabase();

  // The schema's own statements are not the store's.
  sql.length = 0;
  trail.length = 0;
  store = loadStore();
});

afterEach(async () => {
  const { closeDatabase } = require('../../database');
  await closeDatabase();
  raw.close();
});

describe('CaptureDraftStore: nothing kept yet', () => {
  it('has no unsaved new memory and no unsaved edit', async () => {
    await expect(store.load('new')).resolves.toBeNull();
    await expect(store.load('edit')).resolves.toBeNull();
    expect(rowsOf('capture_drafts')).toEqual([]);
  });
});

describe('CaptureDraftStore: capturing a piece (M2, FR-012)', () => {
  it('copies the media somewhere durable BEFORE the piece is recorded', async () => {
    const stored = await store.addPiece('new', photo('p1', 'file:///cache/IMG_0001.jpg'));

    // The piece points at the draft folder, not at the cache file the system may purge.
    expect(stored.uri).toBe(`${NEW_DIR}p1.jpg`);
    expect(files.has(`${NEW_DIR}p1.jpg`)).toBe(true);

    const copiedAt = trail.findIndex((step) => step.startsWith('copy '));
    const recordedAt = trail.findIndex((step) => /INSERT INTO capture_drafts/i.test(step));
    expect(copiedAt).toBeGreaterThanOrEqual(0);
    expect(recordedAt).toBeGreaterThan(copiedAt);
  });

  it('keeps the pieces in capture order, with everything the piece carried', async () => {
    await store.addPiece('new', photo('p1'));
    await store.addPiece('new', note('t1', 'Gran sang this one'));
    await store.addPiece('new', photo('p2'));

    const draft = await store.load('new');
    expect(draft.pieces.map((piece) => piece.localId)).toEqual(['p1', 't1', 'p2']);
    expect(draft.pieces[0]).toMatchObject({
      kind: 'photo',
      capturedAt: '2026-11-08T10:00:00.000Z',
      location: { lat: 51.62, lng: -3.94, accuracy: 12 },
      width: 4032,
      height: 3024,
    });
    expect(draft.pieces[1].content).toBe('Gran sang this one');
  });

  it('persists nothing and rejects when the copy fails, leaving earlier pieces untouched', async () => {
    await store.addPiece('new', photo('p1'));
    const recorded = piecesOf('new');

    copyFails = new Error('ENOSPC: no space left on device');
    await expect(store.addPiece('new', photo('p2'))).rejects.toThrow('no space left on device');

    // Nothing was written: not the row, not the cache, not the store's own idea of the draft.
    expect(piecesOf('new')).toEqual(recorded);
    expect((await store.load('new')).pieces.map((piece) => piece.localId)).toEqual(['p1']);
    expect(files.has(`${NEW_DIR}p2.jpg`)).toBe(false);
  });

  it('never copies an existing server media item in an edit', async () => {
    seedEntry('e1');
    await store.startEdit('e1', [remotePhoto('r1')]);

    expect(mockFileSystem.copyAsync).not.toHaveBeenCalled();
    const [piece] = (await store.getEditFor('e1')).pieces;
    expect(piece.remote).toEqual({ id: 'srv-1', url: 'https://cdn/orig.jpg' });
    expect(piece.uri).toBeUndefined();
  });
});

describe('CaptureDraftStore: writing text (FR-012)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('writes within half a second of the last keystroke, once', async () => {
    await store.addPiece('new', note('t1', ''));
    sql.length = 0;

    store.updateText('new', 't1', 'Gran');
    await jest.advanceTimersByTimeAsync(499);
    expect(textIn('new', 't1')).toBe('');

    // The next keystroke restarts the clock -- a person typing is not a person pausing.
    store.updateText('new', 't1', 'Gran sang');
    await jest.advanceTimersByTimeAsync(499);
    expect(textIn('new', 't1')).toBe('');

    await jest.advanceTimersByTimeAsync(1);
    expect(textIn('new', 't1')).toBe('Gran sang');
    expect(draftWrites()).toHaveLength(1);
  });

  it('a read in the pause before the write never undoes the keystrokes', async () => {
    await store.addPiece('new', note('t1', ''));
    store.updateText('new', 't1', 'mid-sentence');

    // Something else asks for the draft inside the half second -- the Journal checking its
    // cards, say. It must not be handed the older row and leave the typing behind: FR-012 is
    // that nothing captured is lost, not that nothing captured is lost provided nobody looks.
    const seen = await store.load('new');
    expect(seen.pieces[0].content).toBe('mid-sentence');

    await store.flush('new');
    expect(textIn('new', 't1')).toBe('mid-sentence');
  });

  it('flush writes immediately -- what blur and backgrounding use -- and cancels the debounce', async () => {
    await store.addPiece('new', note('t1', ''));
    sql.length = 0;

    store.updateText('new', 't1', 'half a thought');
    await store.flush('new');
    expect(textIn('new', 't1')).toBe('half a thought');
    expect(draftWrites()).toHaveLength(1);

    // The pending write was cancelled, not merely beaten to it.
    await jest.advanceTimersByTimeAsync(5000);
    expect(draftWrites()).toHaveLength(1);
  });
});

describe('CaptureDraftStore: surviving the app being killed (M1, FR-012)', () => {
  it('restores every piece, in order, after the module is loaded afresh', async () => {
    await store.addPiece('new', photo('p1'));
    await store.addPiece('new', note('t1', 'what she said next'));
    await store.addPiece('new', photo('p2'));

    // The app is gone: every module forgotten, the phone's storage still there.
    jest.resetModules();
    await bootDatabase();
    const restarted = loadStore();

    const draft = await restarted.load('new');
    expect(draft.pieces.map((piece) => piece.localId)).toEqual(['p1', 't1', 'p2']);
    expect(draft.pieces.map((piece) => piece.uri)).toEqual([
      `${NEW_DIR}p1.jpg`,
      undefined,
      `${NEW_DIR}p2.jpg`,
    ]);
    expect(draft.pieces[1].content).toBe('what she said next');
  });
});

describe('CaptureDraftStore: one new and one edit, no more (FR-013)', () => {
  it('keeps at most one row per slot however much is captured', async () => {
    seedEntry('e1');
    seedEntry('e2');

    await store.addPiece('new', photo('p1'));
    await store.addPiece('new', photo('p2'));
    await store.startEdit('e1', [note('t1', 'first edit')]);
    await store.startEdit('e2', [note('t2', 'a different memory')]);

    expect(rowsOf('capture_drafts').map((row) => row.id).sort()).toEqual(['edit', 'new']);
    expect(rowFor('edit').entry_local_id).toBe('e2');
    expect(rowFor('new').entry_local_id).toBeNull();
  });

  it('records which memory an edit belongs to, and finds it again', async () => {
    seedEntry('e1');
    seedEntry('e2');
    await store.startEdit('e1', [note('t1', 'changed')]);

    expect(rowFor('edit').entry_local_id).toBe('e1');
    const found = await store.getEditFor('e1');
    expect(found.entryLocalId).toBe('e1');
    expect(found.pieces.map((piece) => piece.content)).toEqual(['changed']);

    // Another memory has no unsaved edit, even though one exists for e1.
    await expect(store.getEditFor('e2')).resolves.toBeNull();
  });

  it('discards an unsaved edit of a memory that no longer exists, with its folder', async () => {
    seedEntry('gone');
    await store.startEdit('gone', [note('t1', 'mid-sentence')]);
    await store.addPiece('edit', photo('p1'));
    expect(files.has(`${EDIT_DIR}p1.jpg`)).toBe(true);

    raw.exec("DELETE FROM journal_entries WHERE local_id = 'gone'");

    await expect(store.load('edit')).resolves.toBeNull();
    expect(rowFor('edit')).toBeNull();
    expect(mockFileSystem.deleteAsync).toHaveBeenCalledWith(EDIT_DIR, { idempotent: true });
    expect(files.has(`${EDIT_DIR}p1.jpg`)).toBe(false);
    await expect(store.getEditFor('gone')).resolves.toBeNull();
  });

  it('treats a memory deleted on another device as no longer existing', async () => {
    seedEntry('e1', { deleted_at: 1700000000 });
    await store.startEdit('e1', [note('t1', 'mid-sentence')]);

    await expect(store.load('edit')).resolves.toBeNull();
    expect(rowFor('edit')).toBeNull();
  });
});

describe('CaptureDraftStore: letting go of a draft (M3, FR-015, FR-016)', () => {
  it.each(['discard', 'clearAfterSave'])('%s removes the row and the folder', async (method) => {
    await store.addPiece('new', photo('p1'));
    await store.addPiece('new', photo('p2'));
    expect(files.has(`${NEW_DIR}p1.jpg`)).toBe(true);

    await store[method]('new');

    expect(rowFor('new')).toBeNull();
    expect(mockFileSystem.deleteAsync).toHaveBeenCalledWith(NEW_DIR, { idempotent: true });
    expect([...files].filter((path) => path.startsWith(NEW_DIR))).toEqual([]);
    expect(dirs.has(NEW_DIR)).toBe(false);
    await expect(store.load('new')).resolves.toBeNull();
  });

  it('leaves the other slot alone', async () => {
    seedEntry('e1');
    await store.addPiece('new', photo('p1'));
    await store.startEdit('e1', [note('t1', 'changed')]);

    await store.discard('new');

    expect(rowFor('new')).toBeNull();
    expect((await store.getEditFor('e1')).pieces).toHaveLength(1);
  });
});

describe('CaptureDraftStore: invisible to sync (FR-014, SC-004)', () => {
  it('never writes to the entries or the sync queue, through a whole draft life', async () => {
    seedEntry('e1');
    seedQueuedOperation();
    const entriesBefore = rowsOf('journal_entries');
    const queueBefore = rowsOf('sync_queue');
    const mediaBefore = rowsOf('media_queue');
    sql.length = 0;

    // A new memory captured, typed into, written and saved...
    await store.addPiece('new', photo('p1'));
    await store.addPiece('new', note('t1', ''));
    store.updateText('new', 't1', 'a line');
    await store.flush('new');
    await store.load('new');
    await store.clearAfterSave('new');

    // ...and an edit captured, found again and discarded.
    await store.startEdit('e1', [note('t2', 'changed')]);
    await store.addPiece('edit', photo('p2'));
    await store.getEditFor('e1');
    await store.discard('edit');

    // Every statement that changed anything changed capture_drafts and nothing else.
    const mutations = sql.filter((text) =>
      /^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)/i.test(text)
    );
    expect(mutations.length).toBeGreaterThan(0);
    for (const statement of mutations) {
      expect(statement).toMatch(/capture_drafts/i);
    }

    // The queues were not so much as read: nothing can enqueue what it never names.
    expect(sql.filter((text) => /sync_queue|media_queue/i.test(text))).toEqual([]);

    // The entries table is read -- to know whether an edited memory still exists -- never written.
    for (const statement of sql.filter((text) => /journal_entries/i.test(text))) {
      expect(statement).toMatch(/^\s*SELECT/i);
    }

    // And the proof that outlives the SQL: those tables are exactly as they were.
    expect(rowsOf('journal_entries')).toEqual(entriesBefore);
    expect(rowsOf('sync_queue')).toEqual(queueBefore);
    expect(rowsOf('media_queue')).toEqual(mediaBefore);
  });
});
