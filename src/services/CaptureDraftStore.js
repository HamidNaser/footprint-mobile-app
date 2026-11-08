import * as FileSystem from 'expo-file-system/legacy';
import { getDatabase } from '../database';

/**
 * The unsaved memory, kept on the phone and nowhere else.
 *
 * Today a capture interrupted part-way is simply gone: durable copies of media are only made at
 * save time (`JournalService._persistMediaBlocks`), so a phone lock, an incoming call or the
 * operating system reclaiming the app takes everything captured with it. This store is what
 * stops that, and it is the load-bearing piece of "nothing captured is ever lost" (FR-012).
 *
 * Three rules matter more than anything else here:
 *
 * 1. **Media is copied somewhere durable before the piece is recorded** (research R7). A piece
 *    pointing at a cache file the system may purge is worse than no piece: it reads as present
 *    and plays as missing. So the copy comes first, and if it fails — storage full — nothing is
 *    persisted, the call rejects, and the pieces already captured are untouched. `removePiece`
 *    is the mirror: the removal is recorded first, then the file goes.
 * 2. **A draft is never visible to the sync machinery** (FR-014, SC-004). It lives in its own
 *    `capture_drafts` table; this file writes to that table and to nothing else, so nothing can
 *    upload a draft or turn it into a memory by itself. The entries table is *read* — only to
 *    know whether an edited memory still exists — and never written.
 * 3. **The draft in hand wins while it is unwritten.** Text is written half a second after the
 *    last keystroke rather than on every one, so for that half second the draft in memory is
 *    ahead of the row. Every read has to be given the newer of the two, or a reader that happens
 *    to land in the gap caches a draft that is behind the database and the next write persists
 *    it over the top of the typing. The test for that is "while it is unwritten", **not** "while
 *    a timer is pending": a write that has started has no timer and has not landed either.
 *
 * A slot and its folder are deleted only **after** the save has succeeded on the phone
 * (FR-016), or when the person discards the draft (FR-015).
 *
 * There are two slots and no more (FR-013): the unsaved new memory and the unsaved edit. The
 * slot id is the table's primary key, so "at most one of each" is the schema's promise rather
 * than this file's. Moving the `edit` slot to a different memory passes through "no draft" on
 * the way, which is what takes the previous memory's media with it.
 *
 * **Writes are the caller's cue, not this file's.** `addPiece`, `removePiece` and `startEdit`
 * write by themselves; text goes through `updateText`; and the capture screen calls `flush` on
 * text blur and on `AppState` → `background`/`inactive`. Nothing here subscribes to `AppState`
 * — the screen that owns the session does.
 */

/** The two slots, by id. There is at most one row of each (FR-013). */
export const DraftSlot = {
  /** The unsaved new memory. */
  NEW: 'new',
  /** The unsaved edit of a memory that is already saved; carries its `entryLocalId`. */
  EDIT: 'edit',
};

/**
 * Half a second after the last keystroke, which is what FR-012 asks for. Short enough that a
 * person who stops typing and locks the phone loses nothing, long enough that typing a sentence
 * is one write rather than forty.
 */
export const TEXT_DEBOUNCE_MS = 500;

const DRAFTS_ROOT = `${FileSystem.documentDirectory}capture-drafts/`;

/** Where a slot's media lives. Durable: under `documentDirectory`, never the cache. */
export const slotDirectory = (slot) => `${DRAFTS_ROOT}${slot}/`;

/**
 * The draft each slot currently holds, so a keystroke does not cost a read. Rebuilt by `load`,
 * which is what makes a restart transparent: the database is the record, this is only a copy.
 */
const cache = new Map();

/**
 * The slots whose cached draft has not reached the database yet — pending behind the debounce,
 * in flight, or left behind by a write that failed. While a slot is in here the cache is the
 * newer of the two and every read is given it (rule 3 above).
 */
const unwritten = new Set();

/** The pending debounced write per slot, so the next keystroke can restart its clock. */
const timers = new Map();

/**
 * The tail of each slot's write chain. Writes for one slot are serialised: two of them racing
 * could otherwise land in either order, and an older draft landing last would undo the newer.
 */
const writeChains = new Map();

const nowIso = () => new Date().toISOString();

/**
 * @throws SyntaxError if `pieces_json` is not JSON. Deliberately unguarded: the column is only
 *   ever written by `persist` from `JSON.stringify`, so unparseable content means the row was
 *   corrupted underneath us, and silently treating that as "no draft" would destroy a memory
 *   somebody is in the middle of making. Better to fail loudly where it can be seen.
 */
function fromRow(row) {
  return {
    id: row.id,
    entryLocalId: row.entry_local_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    pieces: JSON.parse(row.pieces_json),
  };
}

const emptyDraft = (slot, entryLocalId = null) => {
  const now = nowIso();
  return { id: slot, entryLocalId, createdAt: now, updatedAt: now, pieces: [] };
};

/**
 * The extension of a captured file, so a copied photo is still recognisably a photo.
 *
 * Returns `''` for an address with no extension in its last segment — an Android
 * `content://media/...` picker URI, for instance. The copy still succeeds and the piece still
 * plays, because every reader goes by the piece's `kind`; only the file name is less obvious.
 */
function extensionOf(uri) {
  const name = String(uri).split('?')[0].split('/').pop() || '';
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot) : '';
}

async function ensureSlotDirectory(slot) {
  const directory = slotDirectory(slot);
  const info = await FileSystem.getInfoAsync(directory);
  if (!info?.exists) {
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  }
  return directory;
}

/** True when this store copied the piece's file, and so is the one to delete it. */
function ownsMedia(slot, piece) {
  return !!piece?.uri && !piece.remote && piece.uri.startsWith(slotDirectory(slot));
}

/**
 * Take a durable copy of a piece's media, before anything is recorded about it.
 *
 * Remote media — an existing server item in an edit — is neither copied nor re-uploaded even
 * when the phone has a local file for it in hand, because the server's copy is the real one. A
 * file already inside the slot's folder is left where it is.
 *
 * @throws whatever the copy threw (a full disk, a vanished source). The caller records nothing.
 */
async function adoptMedia(slot, piece) {
  if (!piece?.uri || piece.remote) {
    return piece;
  }

  const directory = await ensureSlotDirectory(slot);
  if (piece.uri.startsWith(directory)) {
    return piece;
  }

  const to = `${directory}${piece.localId}${extensionOf(piece.uri)}`;
  await FileSystem.copyAsync({ from: piece.uri, to });
  return { ...piece, uri: to };
}

/** One row per slot, by primary key: a draft is rewritten, never accumulated (FR-013). */
async function persist(draft) {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO capture_drafts (id, entry_local_id, created_at, updated_at, pieces_json)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       entry_local_id = excluded.entry_local_id,
       updated_at = excluded.updated_at,
       pieces_json = excluded.pieces_json`,
    [
      draft.id,
      draft.entryLocalId ?? null,
      draft.createdAt,
      draft.updatedAt,
      JSON.stringify(draft.pieces),
    ]
  );
}

/**
 * Write whatever the slot holds, behind anything already writing for it.
 *
 * The slot stops being unwritten only once the draft that landed is still the one in hand — an
 * identity check, which is a version check here because every change makes a new object. So a
 * keystroke during a write leaves the slot unwritten, as it should.
 */
function writeSlot(slot) {
  const previous = writeChains.get(slot) ?? Promise.resolve();
  const queued = previous.catch(() => {}).then(async () => {
    const draft = cache.get(slot);
    if (!draft) {
      return; // discarded while this write waited its turn: there is nothing to write
    }
    await persist(draft);
    if (cache.get(slot) === draft) {
      unwritten.delete(slot);
    }
  });

  writeChains.set(slot, queued);
  return queued;
}

/**
 * Take the draft as the slot's current state and write it.
 *
 * The cache is set *before* the write, never after: in between, the row would be ahead of the
 * cache, and a read landing there would be handed the stale copy — the same hole in the other
 * direction.
 */
async function commit(slot, draft) {
  cache.set(slot, draft);
  unwritten.add(slot);
  cancelPendingWrite(slot); // this write carries whatever the debounce was waiting to save
  await writeSlot(slot);
  return draft;
}

function cancelPendingWrite(slot) {
  const pending = timers.get(slot);
  if (pending) {
    clearTimeout(pending);
    timers.delete(slot);
  }
}

/** Whether the memory an edit belongs to is still there — here, or on another device. */
async function editIsLive(db, entryLocalId) {
  if (!entryLocalId) {
    return false;
  }
  const entry = await db.getFirstAsync(
    'SELECT local_id FROM journal_entries WHERE local_id = ? AND deleted_at IS NULL',
    [entryLocalId]
  );
  return !!entry;
}

/**
 * The unsaved memory in a slot, or null if there is none.
 *
 * An `edit` slot that is no longer an edit of anything — its memory deleted here or on another
 * device, or a row that names no memory at all — is discarded with its folder on the way past,
 * rather than offered as an edit of nothing (FR-013). That is the only cleanup this store does
 * by itself.
 *
 * @param {'new'|'edit'} slot
 * @returns {Promise<{id: string, entryLocalId: string|null, createdAt: string,
 *   updatedAt: string, pieces: object[]}|null>}
 */
export async function load(slot) {
  const db = await getDatabase();
  const row = await db.getFirstAsync('SELECT * FROM capture_drafts WHERE id = ?', [slot]);

  // The draft in hand wins while it is unwritten: the row is then behind it, or not there yet.
  const inHand = unwritten.has(slot) ? cache.get(slot) ?? null : null;
  const draft = inHand ?? (row ? fromRow(row) : null);

  if (!draft) {
    cache.delete(slot);
    unwritten.delete(slot);
    return null;
  }

  if (slot === DraftSlot.EDIT && !(await editIsLive(db, draft.entryLocalId))) {
    await discard(slot);
    return null;
  }

  cache.set(slot, draft);
  return draft;
}

/**
 * Record one captured piece, media and all.
 *
 * The copy happens first and the piece is recorded only once it has succeeded, so the stored
 * draft never points at a file that was never made durable (research R7).
 *
 * @param {'new'|'edit'} slot
 * @param {object} piece - a `Piece` (data-model); `uri` is where it was captured, if anywhere
 * @returns {Promise<object>} the piece as stored, with `uri` pointing at the durable copy
 */
export async function addPiece(slot, piece) {
  const draft = cache.get(slot) ?? (await load(slot)) ?? emptyDraft(slot);
  const stored = await adoptMedia(slot, piece);

  await commit(slot, {
    ...draft,
    pieces: [...draft.pieces, stored],
    updatedAt: nowIso(),
  });
  return stored;
}

/**
 * Take a piece back out of the draft — `spec.md`'s edit scenario is "adds or removes pieces",
 * and FR-013 counts a removal as the change that makes an edit unsaved.
 *
 * The removal is recorded before the file goes, which is the mirror of the capture rule: a draft
 * must never list a piece whose media has already been deleted. Only a file this store copied
 * into the slot's folder is deleted — never the server's copy of a remote item, and never a
 * camera-roll original this store merely read.
 *
 * @returns {Promise<object|null>} the draft as it now stands, or null if the slot holds none
 */
export async function removePiece(slot, localId) {
  const draft = cache.get(slot) ?? (await load(slot));
  if (!draft) {
    return null;
  }

  const piece = draft.pieces.find((candidate) => candidate.localId === localId);
  if (!piece) {
    return draft;
  }

  const next = await commit(slot, {
    ...draft,
    pieces: draft.pieces.filter((candidate) => candidate.localId !== localId),
    updatedAt: nowIso(),
  });

  if (ownsMedia(slot, piece)) {
    try {
      await FileSystem.deleteAsync(piece.uri, { idempotent: true });
    } catch (error) {
      // An unreachable file nobody lists is harmless; reporting a removal that did happen is not.
      console.warn('[CaptureDraftStore] Could not delete a removed piece\'s file:', error);
    }
  }

  return next;
}

/**
 * A text piece's content changed. The draft is written within half a second of the last
 * keystroke (FR-012); a keystroke before then restarts the clock.
 *
 * @throws Error if the slot has not been loaded. Returning quietly would throw the typing away
 *   where nobody could see it happen, which is the one outcome FR-012 forbids.
 * @returns {object} the draft as it now stands
 */
export function updateText(slot, localId, content) {
  const draft = cache.get(slot);
  if (!draft) {
    throw new Error(
      `[CaptureDraftStore] No draft in hand for the '${slot}' slot: call load, addPiece or ` +
        'startEdit before updateText, or the typing goes nowhere.'
    );
  }

  const next = {
    ...draft,
    pieces: draft.pieces.map((piece) => (piece.localId === localId ? { ...piece, content } : piece)),
    updatedAt: nowIso(),
  };
  cache.set(slot, next);
  unwritten.add(slot);

  cancelPendingWrite(slot);
  timers.set(
    slot,
    setTimeout(() => {
      timers.delete(slot);
      writeSlot(slot).catch((error) => {
        // The slot stays unwritten, so the next flush -- blur, backgrounding -- tries again.
        console.warn('[CaptureDraftStore] Debounced draft write failed:', error);
      });
    }, TEXT_DEBOUNCE_MS)
  );

  return next;
}

/**
 * Write the slot now, cancelling any pending debounced write. What text blur and `AppState` →
 * `background`/`inactive` call, so leaving the foreground loses nothing (FR-012).
 *
 * A slot with nothing unwritten is already safe, and writing it again would be a write for
 * nothing.
 */
export async function flush(slot) {
  cancelPendingWrite(slot);
  if (unwritten.has(slot)) {
    await writeSlot(slot);
  }
}

/**
 * Begin keeping an unsaved edit of a memory that is already saved.
 *
 * Call this on the **first change**, not when Edit opens: opening Edit and closing without
 * changing anything must leave nothing behind (FR-013).
 *
 * Starting an edit of a **different** memory takes the previous one away first, folder and all —
 * the lifecycle passes through "no draft", and that is what stops one memory's photographs
 * sitting in another memory's draft folder. Starting one for the **same** memory keeps its draft
 * and its media, and keeps the creation time it already had, so the row and the draft in hand
 * never disagree about when the edit began.
 *
 * @param {string} entryLocalId - the memory being edited
 * @param {object[]} pieces - the memory's pieces as loaded; remote media is kept by its server
 *   `id`/`url` and is never copied or re-uploaded
 */
export async function startEdit(entryLocalId, pieces = []) {
  const db = await getDatabase();
  const existing = await db.getFirstAsync(
    'SELECT entry_local_id, created_at FROM capture_drafts WHERE id = ?',
    [DraftSlot.EDIT]
  );
  const continuing = existing && (existing.entry_local_id ?? null) === entryLocalId;

  if (existing && !continuing) {
    await remove(DraftSlot.EDIT);
  }

  return commit(DraftSlot.EDIT, {
    id: DraftSlot.EDIT,
    entryLocalId,
    createdAt: continuing ? existing.created_at : nowIso(),
    updatedAt: nowIso(),
    pieces,
  });
}

/**
 * The unsaved edit of this memory, or null — what the Journal card's "Unfinished edit —
 * continue" and Edit ask. An unsaved edit of a *different* memory is not this one's.
 */
export async function getEditFor(entryLocalId) {
  const draft = await load(DraftSlot.EDIT);
  return draft && draft.entryLocalId === entryLocalId ? draft : null;
}

async function remove(slot) {
  cancelPendingWrite(slot);
  cache.delete(slot);
  unwritten.delete(slot);

  // Let a write already under way finish first. It finds no draft in hand and writes nothing,
  // and waiting means it cannot land behind the delete and resurrect the row.
  await (writeChains.get(slot) ?? Promise.resolve()).catch(() => {});
  writeChains.delete(slot);

  const db = await getDatabase();
  await db.runAsync('DELETE FROM capture_drafts WHERE id = ?', [slot]);

  try {
    await FileSystem.deleteAsync(slotDirectory(slot), { idempotent: true });
  } catch (error) {
    // The row is the record, and it has gone. Files nobody lists are unreachable rather than
    // harmful, whereas rejecting here would report an error for a save that succeeded — and the
    // person would save again and end up with the memory twice.
    console.warn('[CaptureDraftStore] Could not delete a draft folder:', error);
  }
}

/**
 * Throw the unsaved memory away, pieces and media together (FR-015). The caller confirms with
 * the person first — this does not ask.
 */
export async function discard(slot) {
  await remove(slot);
}

/**
 * Let go of the draft because the memory has been saved on the phone. Call it only once
 * `createEntry` / `updateEntry` has resolved: a save that failed must leave the draft exactly
 * where it was (FR-016).
 */
export async function clearAfterSave(slot) {
  await remove(slot);
}

export default {
  DraftSlot,
  TEXT_DEBOUNCE_MS,
  slotDirectory,
  load,
  addPiece,
  removePiece,
  updateText,
  flush,
  startEdit,
  getEditFor,
  discard,
  clearAfterSave,
};
