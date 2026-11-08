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

/** Set to an Error to make a delete of this path fail. */
let deleteFails = null;

/** Everything that happened, file operations and SQL together, in order. */
const trail = [];

/** Just the SQL, as the store issued it. */
const sql = [];

/**
 * A promise somebody else resolves. Used to hold a draft write in flight so a test can stand
 * inside the window between "the write started" and "the write landed".
 */
function deferred() {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

/** While set, the next draft write waits for it. One-shot: the write that takes it clears it. */
let stallNextWrite = null;

/** While set, every media copy waits for it -- two shutter taps with both copies in flight. */
let stallCopies = null;

/** While set, every draft write throws it: a disk that has no room for the row. */
let failDraftWrites = null;

/** While set, the next entries read waits for it -- suspending a load part-way. One-shot. */
let stallNextEntryRead = null;

/**
 * Wait until something has actually happened.
 *
 * Needed because a locked call does not begin synchronously: it is queued behind the lock, so a
 * test that fires a call and then does the "concurrent" thing on the next line has not opened the
 * window at all -- the second thing happens first. These tests wait until the copy is genuinely
 * under way before interfering with it.
 */
async function until(predicate, what) {
  for (let attempt = 0; attempt < 200 && !predicate(); attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  if (!predicate()) {
    throw new Error(`waited for ${what} and it never happened`);
  }
}

/**
 * Let whatever is already in flight get as far as it can, without insisting that it gets
 * anywhere. The companion to `until`, for the case where the thing being waited for is a call
 * that *should* be stuck behind the lock: `until` would have to throw to say so, and that is the
 * passing outcome.
 */
async function settle(ticks = 20) {
  for (let tick = 0; tick < ticks; tick += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

const copiesStarted = () => mockFileSystem.copyAsync.mock.calls.length;

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
    if (stallCopies) await stallCopies.promise;
    if (copyFails) throw copyFails;
    if (!files.has(from)) files.add(from);
    trail.push(`copy ${from} -> ${to}`);
    files.add(to);
  }),
  deleteAsync: jest.fn(async (uri) => {
    if (deleteFails) throw deleteFails;
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
      if (stallNextWrite && /INSERT INTO capture_drafts/i.test(text)) {
        const gate = stallNextWrite;
        stallNextWrite = null;
        await gate.promise;
      }
      if (failDraftWrites && /INSERT INTO capture_drafts/i.test(text)) {
        throw failDraftWrites;
      }
      return raw.prepare(text).run(...params);
    },
    getAllAsync: async (text, params = []) => {
      note(text);
      return raw.prepare(text).all(...params);
    },
    getFirstAsync: async (text, params = []) => {
      note(text);
      if (stallNextEntryRead && /FROM journal_entries/i.test(text)) {
        const gate = stallNextEntryRead;
        stallNextEntryRead = null;
        await gate.promise;
      }
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

/**
 * An existing server media item in an edit: never copied, never re-uploaded. `uri` is optional
 * because an edit loaded from the server may also have a local file in hand to show on screen --
 * which is the shape that would tempt the copy path if `remote` were not honoured.
 */
const remotePhoto = (localId, uri) => ({
  localId,
  kind: 'photo',
  capturedAt: '2019-06-01T12:00:00.000Z',
  location: null,
  remote: { id: 'srv-1', url: 'https://cdn/orig.jpg' },
  ...(uri ? { uri } : {}),
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
  deleteFails = null;
  stallNextWrite = null;
  stallCopies = null;
  failDraftWrites = null;
  stallNextEntryRead = null;

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

  it("never records a piece whose file the slot's own cleanup has just deleted", async () => {
    // The memory being edited is deleted on another device, the app is killed, and the next
    // thing the person does on reopening it is tap Photo. With nothing in hand, `addPiece` has
    // to `load` -- and `load` sweeps an edit of a memory that has gone, folder and all. That
    // folder is where the copy lands, so the sweep has to happen BEFORE the copy. The other way
    // round the draft is left listing a photograph whose file the store itself just deleted:
    // present in the list, missing on screen, which is the rule above exactly inverted.
    seedEntry('e1', { deleted_at: 1700000000 });
    await store.startEdit('e1', [note('t1', 'mid-sentence')]);

    jest.resetModules();
    await bootDatabase();
    const restarted = loadStore();

    const stored = await restarted.addPiece('edit', photo('p1'));

    expect(stored.uri).toBe(`${EDIT_DIR}p1.jpg`);
    expect(files.has(`${EDIT_DIR}p1.jpg`)).toBe(true);
    expect(piecesOf('edit').map((piece) => piece.localId)).toEqual(['p1']);
    // The sweep did happen: the slot no longer claims to be an edit of the deleted memory.
    expect(rowFor('edit').entry_local_id).toBeNull();
  });

  it('never copies an existing server media item, even one with a local file in hand', async () => {
    seedEntry('e1');
    await store.startEdit('e1', []);

    // The realistic edit shape: an item the server holds, which this phone also happens to have
    // a local copy of to show on screen. The server's copy is the real one -- copying it into the
    // draft folder would make a second durable copy of something already safe, and re-uploading
    // it would duplicate the memory's media.
    const stored = await store.addPiece('edit', remotePhoto('r1', 'file:///cache/r1-display.jpg'));

    expect(mockFileSystem.copyAsync).not.toHaveBeenCalled();
    expect(stored.uri).toBe('file:///cache/r1-display.jpg');
    expect(stored.remote).toEqual({ id: 'srv-1', url: 'https://cdn/orig.jpg' });
    expect(files.has(`${EDIT_DIR}r1.jpg`)).toBe(false);
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

  it('throws rather than losing the keystrokes when the slot was never loaded', () => {
    // A cold start: the screen typed before loading. Returning quietly would throw the typing
    // away where nobody could see it happen, which is the one outcome FR-012 forbids.
    expect(() => store.updateText('new', 't1', 'into the void')).toThrow(/load/i);
  });
});

/**
 * The window the first round's guard missed. The cache is allowed to be ahead of the row -- that
 * is what the debounce is for -- but every read has to be given the newer of the two, and a
 * pending timer is not what "newer" means. A write that has started has no timer and has not
 * landed, and anything handed the row in that window re-caches a draft that is behind the
 * database. The next write then persists it, and the keystrokes in flight are gone for good.
 */
describe('CaptureDraftStore: a write in flight (FR-012)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('a read after the debounce has fired but before the write lands keeps the newest text', async () => {
    await store.addPiece('new', note('t1', ''));

    const gate = deferred();
    stallNextWrite = gate;
    store.updateText('new', 't1', 'A');
    await jest.advanceTimersByTimeAsync(store.TEXT_DEBOUNCE_MS);

    // The timer has fired and deleted itself; the write is in flight and the row is still old.
    expect(textIn('new', 't1')).toBe('');
    const seen = await store.load('new');
    expect(seen.pieces[0].content).toBe('A');

    gate.release();
    await store.flush('new');
    expect(textIn('new', 't1')).toBe('A');

    // And the draft the store went on to build was the newer one, so a later write cannot
    // resurrect the empty text over the top of it.
    await store.addPiece('new', note('t2', 'B'));
    await store.flush('new');
    expect(textIn('new', 't1')).toBe('A');
    expect(textIn('new', 't2')).toBe('B');
  });

  it('a read during a flush keeps the newest text', async () => {
    await store.addPiece('new', note('t1', ''));
    store.updateText('new', 't1', 'A');

    const gate = deferred();
    stallNextWrite = gate;
    const flushing = store.flush('new');

    // flush cancelled the timer first, so "a timer is pending" is false here too.
    const seen = await store.load('new');
    expect(seen.pieces[0].content).toBe('A');

    gate.release();
    await flushing;
    expect(textIn('new', 't1')).toBe('A');
  });

  it('never lets an older draft land on top of a newer one', async () => {
    await store.addPiece('new', note('t1', ''));

    const gate = deferred();
    stallNextWrite = gate;
    store.updateText('new', 't1', 'A');
    await jest.advanceTimersByTimeAsync(store.TEXT_DEBOUNCE_MS);

    // More typing, and a blur, while the first write is still in flight.
    store.updateText('new', 't1', 'AB');
    const flushing = store.flush('new');

    gate.release();
    await flushing;

    // Whatever order the two writes resolved in, the database ends with the later text.
    expect(textIn('new', 't1')).toBe('AB');
  });

  it('backgrounding during a pending debounce leaves the newest text in the database', async () => {
    await store.addPiece('new', note('t1', ''));
    sql.length = 0;

    store.updateText('new', 't1', 'A');
    store.updateText('new', 't1', 'AB');

    // AppState -> background: the screen flushes, and the phone may be killed a moment later.
    await store.flush('new');
    expect(textIn('new', 't1')).toBe('AB');

    await jest.advanceTimersByTimeAsync(5000);
    expect(textIn('new', 't1')).toBe('AB');
    expect(draftWrites()).toHaveLength(1);
  });
});

/**
 * Two things can change a draft while a media copy is still running, and a copy is long: it is a
 * photograph being written to disk. FR-008 gives each tap of Photo its own photograph, and the
 * spec's own scenario is somebody tapping Photo twice in quick succession on a bus -- so two
 * copies in flight at once is the designed use of this store, not an exotic race. SC-004 allows
 * zero pieces lost.
 */
describe('CaptureDraftStore: two things happening at once (FR-008, SC-004)', () => {
  it('two photographs taken in quick succession both land', async () => {
    const gate = deferred();
    stallCopies = gate;

    const first = store.addPiece('new', photo('p1'));
    await until(() => copiesStarted() === 1, 'the first copy to start');
    const second = store.addPiece('new', photo('p2'));
    // The second tap gets as far as it can. Behind the lock that is nowhere -- which is the
    // point, and why this cannot be an `until`: with the fix in place the second copy never
    // starts, and without it both copies are in flight before the first is let go.
    await settle();
    gate.release();
    stallCopies = null;
    const [one, two] = await Promise.all([first, second]);

    // Neither tap may be the one that "did not count".
    expect(piecesOf('new').map((piece) => piece.localId)).toEqual(['p1', 'p2']);
    expect(files.has(one.uri)).toBe(true);
    expect(files.has(two.uri)).toBe(true);
  });

  it('a removal while a photograph is being copied is not undone by it', async () => {
    await store.addPiece('new', photo('p1'));
    await store.addPiece('new', note('t1', 'a line'));

    const gate = deferred();
    stallCopies = gate;
    const adding = store.addPiece('new', photo('p2'));
    // Two copies so far, not three: a text piece has no file, so it never reaches `copyAsync`.
    await until(() => copiesStarted() === 2, 'the copy to be under way');
    const removing = store.removePiece('new', 'p1');
    gate.release();
    stallCopies = null;
    await Promise.all([adding, removing]);

    // The removal stays done, and -- the inversion removePiece's own ordering exists to prevent
    // -- the draft must not list a piece whose media has already been deleted. Two mechanisms
    // hold this jointly and either alone is enough, so it goes red only when both are undone:
    // the lock, which puts the removal strictly after the capture; and the capture reading the
    // draft after its copy, which keeps the ordering honest if the lock is ever taken away.
    expect(piecesOf('new').map((piece) => piece.localId)).toEqual(['t1', 'p2']);
    expect(files.has(`${NEW_DIR}p1.jpg`)).toBe(false);
    expect(files.has(`${NEW_DIR}p2.jpg`)).toBe(true);
  });

  it('a draft discarded while a photograph is being copied does not come back', async () => {
    await store.addPiece('new', photo('p1'));

    const gate = deferred();
    stallCopies = gate;
    const adding = store.addPiece('new', photo('p2'));
    await until(() => copiesStarted() === 2, 'the copy to be under way');
    // The person taps Discard and confirms while the shutter is still writing to disk.
    const discarding = store.discard('new');
    gate.release();
    stallCopies = null;
    await Promise.all([adding, discarding]);

    // Discard means gone (FR-015). A capture that was already in flight must not write the slot
    // back afterwards: that would leave a draft the person threw away, listing a photograph whose
    // file the discard had already deleted.
    expect(rowFor('new')).toBeNull();
    expect([...files].filter((path) => path.startsWith(NEW_DIR))).toEqual([]);
    await expect(store.load('new')).resolves.toBeNull();
  });

  it('typing while a photograph is being copied is not lost', async () => {
    await store.addPiece('new', note('t1', ''));

    const gate = deferred();
    stallCopies = gate;
    const adding = store.addPiece('new', photo('p1'));
    await until(() => copiesStarted() === 1, 'the copy to be under way');
    // A keystroke cannot wait for a lock -- updateText is synchronous by design -- so the piece
    // being recorded has to read the draft as it stands when the copy finishes, not as it stood
    // when the shutter was tapped.
    store.updateText('new', 't1', 'what she said next');
    gate.release();
    stallCopies = null;
    await adding;

    expect(piecesOf('new').map((piece) => piece.localId)).toEqual(['t1', 'p1']);
    expect(textIn('new', 't1')).toBe('what she said next');
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

  it('discards an edit row that names no memory at all, with its folder', async () => {
    // Reachable without anybody misusing the store: the memory is deleted on another device
    // mid-edit, the next load clears the row and the cache, and a capture still on screen adds
    // a piece to a slot that no longer knows what it is editing. The row that leaves behind
    // matches no card and no cleanup can reach it, so it is swept on the next load.
    seedEntry('e1', { deleted_at: 1700000000 });
    await store.startEdit('e1', [note('t1', 'mid-sentence')]);
    await store.load('edit');
    await store.addPiece('edit', photo('p1'));
    expect(rowFor('edit').entry_local_id).toBeNull();

    await expect(store.load('edit')).resolves.toBeNull();
    expect(rowFor('edit')).toBeNull();
    expect(files.has(`${EDIT_DIR}p1.jpg`)).toBe(false);
  });
});

/**
 * The edit slot is a slot, not a drawer. Moving it to a different memory has to pass through
 * (none), because that is what takes the previous memory's media with it; and an edit of a memory
 * that is gone has to take itself away. Fake timers so "a new draft, not the old row renamed" is
 * an exact claim about `created_at` rather than a race with the millisecond clock.
 */
describe("CaptureDraftStore: the edit slot's lifecycle (FR-013, FR-015)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starting an edit of a different memory takes the previous one away first', async () => {
    seedEntry('e1');
    seedEntry('e2');
    await store.startEdit('e1', [note('t1', 'first edit')]);
    await store.addPiece('edit', photo('p1'));
    expect(files.has(`${EDIT_DIR}p1.jpg`)).toBe(true);
    const firstCreatedAt = rowFor('edit').created_at;
    await jest.advanceTimersByTimeAsync(1000);

    await store.startEdit('e2', [note('t2', 'a different memory')]);

    // The lifecycle passes through (none), and that is what takes the folder with it: the
    // previous memory's photographs must not be sitting in a different memory's draft folder,
    // where discarding this one would be the only thing that ever removed them.
    expect(files.has(`${EDIT_DIR}p1.jpg`)).toBe(false);
    expect(mockFileSystem.deleteAsync).toHaveBeenCalledWith(EDIT_DIR, { idempotent: true });

    // And it is a new draft, not the old row wearing a new name: its creation time is its own.
    const row = rowFor('edit');
    expect(row.entry_local_id).toBe('e2');
    expect(row.created_at).not.toBe(firstCreatedAt);
    expect(row.created_at).toBe((await store.getEditFor('e2')).createdAt);
    expect(JSON.parse(row.pieces_json).map((piece) => piece.localId)).toEqual(['t2']);
  });

  it('takes the previous edit away even when its write never landed', async () => {
    seedEntry('e1');
    seedEntry('e2');

    // A disk with no room for the row. The draft stays in hand on purpose -- the next flush
    // retries it -- so "there is no row" does not mean "there is no previous edit".
    failDraftWrites = new Error('ENOSPC: no space left on device');
    await expect(store.startEdit('e1', [note('t1', 'first edit')])).rejects.toThrow('ENOSPC');
    await expect(store.addPiece('edit', photo('p1'))).rejects.toThrow('ENOSPC');
    failDraftWrites = null;
    expect(files.has(`${EDIT_DIR}p1.jpg`)).toBe(true);
    expect(rowFor('edit')).toBeNull();

    await store.startEdit('e2', [note('t2', 'a different memory')]);

    // The store's own rule -- the draft in hand wins while it is unwritten -- has to apply here
    // too, or the previous memory's photograph stays in this memory's draft folder.
    expect(files.has(`${EDIT_DIR}p1.jpg`)).toBe(false);
    expect(rowFor('edit').entry_local_id).toBe('e2');
    expect(piecesOf('edit').map((piece) => piece.localId)).toEqual(['t2']);
  });

  it('starting an edit of the SAME memory keeps its draft, folder and creation time', async () => {
    seedEntry('e1');
    await store.startEdit('e1', [note('t1', 'first change')]);
    await store.addPiece('edit', photo('p1'));
    const firstCreatedAt = rowFor('edit').created_at;
    mockFileSystem.deleteAsync.mockClear();
    await jest.advanceTimersByTimeAsync(1000);

    await store.startEdit('e1', [note('t1', 'another change')]);

    // Task 57 reopens an unsaved edit of the same memory; nothing here may throw its media away.
    expect(mockFileSystem.deleteAsync).not.toHaveBeenCalled();
    expect(files.has(`${EDIT_DIR}p1.jpg`)).toBe(true);

    // The row and the draft in hand agree about when the edit began -- one of them silently
    // winning at the next restart is exactly the sort of disagreement that is never noticed.
    const row = rowFor('edit');
    expect(row.created_at).toBe(firstCreatedAt);
    expect((await store.getEditFor('e1')).createdAt).toBe(firstCreatedAt);
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

  it('still lets go of the draft when the folder cannot be deleted', async () => {
    await store.addPiece('new', photo('p1'));
    deleteFails = new Error('EBUSY: resource busy');

    // A save that succeeded must not report an error, or the person saves again and ends up with
    // the memory twice. Files nobody can reach are harmless -- no screen reads the folder -- but
    // a draft that outlives its save is not.
    await expect(store.clearAfterSave('new')).resolves.toBeUndefined();
    expect(rowFor('new')).toBeNull();
    await expect(store.load('new')).resolves.toBeNull();
  });

  it('a read overtaken by the save does not leave the cleared draft in hand', async () => {
    seedEntry('e1');
    await store.startEdit('e1', [note('t1', 'changed')]);
    await store.addPiece('edit', photo('p1'));

    // The Journal is asking "does this memory have an unfinished edit?" at the moment the save
    // completes. Its read is suspended part-way, on the lookup of the memory itself.
    const gate = deferred();
    stallNextEntryRead = gate;
    const asking = store.getEditFor('e1');
    const saving = store.clearAfterSave('edit');
    gate.release();
    stallNextEntryRead = null;
    await Promise.all([asking, saving]);

    expect(rowFor('edit')).toBeNull();
    // Nothing may be left in hand: a keystroke would otherwise re-persist the draft the save has
    // just cleared, and the card would offer "Unfinished edit -- continue" for a saved memory.
    expect(() => store.updateText('edit', 't1', 'more')).toThrow(/load/i);
    expect(rowFor('edit')).toBeNull();
    await expect(store.getEditFor('e1')).resolves.toBeNull();
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

/**
 * `spec.md`'s edit scenario is "adds or removes pieces", and FR-013 counts a removal as the
 * change that makes an edit unsaved. Removal is an edit-mode need: nothing asks for it while a
 * new memory is being captured.
 */
describe('CaptureDraftStore: taking a piece back out (FR-013)', () => {
  it('removes the piece from the draft and its file from the phone', async () => {
    seedEntry('e1');
    await store.startEdit('e1', []);
    await store.addPiece('edit', photo('p1'));
    await store.addPiece('edit', note('t1', 'a line'));
    await store.addPiece('edit', photo('p2'));

    const draft = await store.removePiece('edit', 'p1');

    expect(draft.pieces.map((piece) => piece.localId)).toEqual(['t1', 'p2']);
    expect(piecesOf('edit').map((piece) => piece.localId)).toEqual(['t1', 'p2']);
    expect(files.has(`${EDIT_DIR}p1.jpg`)).toBe(false);
    // The pieces that stayed keep their media.
    expect(files.has(`${EDIT_DIR}p2.jpg`)).toBe(true);
  });

  it('records the removal before deleting the file, never the other way round', async () => {
    seedEntry('e1');
    await store.startEdit('e1', []);
    await store.addPiece('edit', photo('p1'));
    trail.length = 0;

    await store.removePiece('edit', 'p1');

    // The mirror of the capture rule: a draft must never hold a piece whose file has already
    // gone, which is what a failed write after a successful delete would leave behind.
    const recordedAt = trail.findIndex((step) => /INSERT INTO capture_drafts/i.test(step));
    const deletedAt = trail.findIndex((step) => step === `delete ${EDIT_DIR}p1.jpg`);
    expect(recordedAt).toBeGreaterThanOrEqual(0);
    expect(deletedAt).toBeGreaterThan(recordedAt);
  });

  it('never deletes a file the phone does not own', async () => {
    seedEntry('e1');
    await store.startEdit('e1', []);
    // An item the server holds, with a local copy on hand for the screen...
    await store.addPiece('edit', remotePhoto('r1', 'file:///cache/r1-display.jpg'));
    // ...and a text piece, which has no file at all.
    await store.addPiece('edit', note('t1', 'a line'));
    mockFileSystem.deleteAsync.mockClear();

    await store.removePiece('edit', 'r1');
    await store.removePiece('edit', 't1');

    // Deleting the server's media from under it, or a file this store never copied, is not
    // this store's business.
    expect(mockFileSystem.deleteAsync).not.toHaveBeenCalled();
    expect(piecesOf('edit')).toEqual([]);
  });

  it('does nothing for a piece that is not there', async () => {
    seedEntry('e1');
    await store.startEdit('e1', [note('t1', 'a line')]);
    sql.length = 0;

    await expect(store.removePiece('edit', 'nope')).resolves.toMatchObject({
      pieces: [expect.objectContaining({ localId: 't1' })],
    });
    expect(draftWrites()).toHaveLength(0);
    expect(mockFileSystem.deleteAsync).not.toHaveBeenCalled();
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
    await store.addPiece('edit', photo('p3'));
    await store.removePiece('edit', 'p3');
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
