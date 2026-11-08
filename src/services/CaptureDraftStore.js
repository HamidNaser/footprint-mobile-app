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
 * Two rules matter more than anything else here:
 *
 * 1. **Media is copied somewhere durable before the piece is recorded** (research R7). A piece
 *    pointing at a cache file the system may purge is worse than no piece: it reads as present
 *    and plays as missing. So the copy comes first, and if it fails — storage full — nothing is
 *    persisted, the call rejects, and the pieces already captured are untouched.
 * 2. **A draft is never visible to the sync machinery** (FR-014, SC-004). It lives in its own
 *    `capture_drafts` table; this file writes to that table and to nothing else, so nothing can
 *    upload a draft or turn it into a memory by itself. The entries table is *read* — only to
 *    know whether an edited memory still exists — and never written.
 *
 * A slot and its folder are deleted only **after** the save has succeeded on the phone
 * (FR-016), or when the person discards the draft (FR-015).
 *
 * There are two slots and no more (FR-013): the unsaved new memory and the unsaved edit. The
 * slot id is the table's primary key, so "at most one of each" is the schema's promise rather
 * than this file's.
 *
 * **Writes are the caller's cue, not this file's.** `addPiece` writes by itself; text goes
 * through `updateText`, which writes within half a second of the last keystroke; and the capture
 * screen calls `flush` on text blur and on `AppState` → `background`/`inactive`. Nothing here
 * subscribes to `AppState` — the screen that owns the session does.
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

/** The pending debounced write per slot, so the next keystroke can restart its clock. */
const timers = new Map();

const nowIso = () => new Date().toISOString();

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

/** The extension of a captured file, so a copied photo is still recognisably a photo. */
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

/**
 * Take a durable copy of a piece's media, before anything is recorded about it.
 *
 * Remote media — an existing server item in an edit — is neither copied nor re-uploaded, and a
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

function cancelPendingWrite(slot) {
  const pending = timers.get(slot);
  if (pending) {
    clearTimeout(pending);
    timers.delete(slot);
  }
}

/**
 * The unsaved memory in a slot, or null if there is none.
 *
 * An `edit` slot whose memory no longer exists — deleted here or on another device — is
 * discarded with its folder on the way past, rather than offered as an edit of nothing
 * (FR-013). That is the only cleanup this store does by itself.
 *
 * @param {'new'|'edit'} slot
 * @returns {Promise<{id: string, entryLocalId: string|null, createdAt: string,
 *   updatedAt: string, pieces: object[]}|null>}
 */
export async function load(slot) {
  const db = await getDatabase();
  const row = await db.getFirstAsync('SELECT * FROM capture_drafts WHERE id = ?', [slot]);
  if (!row) {
    cache.delete(slot);
    return null;
  }

  const draft = fromRow(row);
  if (slot === DraftSlot.EDIT && draft.entryLocalId) {
    const entry = await db.getFirstAsync(
      'SELECT local_id FROM journal_entries WHERE local_id = ? AND deleted_at IS NULL',
      [draft.entryLocalId]
    );
    if (!entry) {
      await discard(slot);
      return null;
    }
  }

  // A read must never undo keystrokes that have not reached the database yet: inside the
  // debounce the draft in hand is newer than the row, and handing back the row would lose the
  // typing to whoever happened to look.
  const current = timers.has(slot) ? cache.get(slot) ?? draft : draft;
  cache.set(slot, current);
  return current;
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

  const next = { ...draft, pieces: [...draft.pieces, stored], updatedAt: nowIso() };
  await persist(next);
  cache.set(slot, next);
  return stored;
}

/**
 * A text piece's content changed. The draft is written within half a second of the last
 * keystroke (FR-012); a keystroke before then restarts the clock.
 *
 * @returns {object|null} the draft as it now stands, or null if the slot holds none
 */
export function updateText(slot, localId, content) {
  const draft = cache.get(slot);
  if (!draft) {
    return null;
  }

  const next = {
    ...draft,
    pieces: draft.pieces.map((piece) => (piece.localId === localId ? { ...piece, content } : piece)),
    updatedAt: nowIso(),
  };
  cache.set(slot, next);

  cancelPendingWrite(slot);
  timers.set(
    slot,
    setTimeout(() => {
      timers.delete(slot);
      persist(next).catch((error) => {
        console.warn('[CaptureDraftStore] Debounced draft write failed:', error);
      });
    }, TEXT_DEBOUNCE_MS)
  );

  return next;
}

/**
 * Write the slot now, cancelling any pending debounced write. What text blur and `AppState` →
 * `background`/`inactive` call, so leaving the foreground loses nothing (FR-012).
 */
export async function flush(slot) {
  cancelPendingWrite(slot);
  const draft = cache.get(slot);
  if (draft) {
    await persist(draft);
  }
}

/**
 * Begin keeping an unsaved edit of a memory that is already saved.
 *
 * Call this on the **first change**, not when Edit opens: opening Edit and closing without
 * changing anything must leave nothing behind (FR-013).
 *
 * @param {string} entryLocalId - the memory being edited
 * @param {object[]} pieces - the memory's pieces as loaded; remote media is kept by its server
 *   `id`/`url` and is never copied or re-uploaded
 */
export async function startEdit(entryLocalId, pieces = []) {
  const draft = { ...emptyDraft(DraftSlot.EDIT, entryLocalId), pieces };
  await persist(draft);
  cache.set(DraftSlot.EDIT, draft);
  return draft;
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

  const db = await getDatabase();
  await db.runAsync('DELETE FROM capture_drafts WHERE id = ?', [slot]);
  await FileSystem.deleteAsync(slotDirectory(slot), { idempotent: true });
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
  updateText,
  flush,
  startEdit,
  getEditFor,
  discard,
  clearAfterSave,
};
