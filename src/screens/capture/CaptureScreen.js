/**
 * CaptureScreen (013 T030) -- one memory, captured on the move.
 *
 * This is User Story 1: a note, voice clips, photos and videos in one memory, in any order,
 * each switch one tap away, and nothing lost on the way (FR-002, FR-003). It replaces the
 * new-memory path of `JournalComposeModal`, which threw typed text away when the microphone
 * opened, needed the microphone held down, and made the camera choose between photo and
 * video before the shutter.
 *
 * It owns the *session* and almost no mechanism. The four pieces of mechanism it composes
 * were each built and reviewed on their own, and the contracts it has to honour are theirs:
 *
 *   - **`CaptureDraftStore`** keeps the unsaved memory. Three of its rules land here:
 *     1. **Every captured piece goes through `addPiece`**, because `addPiece`'s `adoptMedia`
 *        is what copies media somewhere durable *before* the piece is recorded. Both capture
 *        components hand up a raw **cache** uri by design, and a draft pointing at an evicted
 *        cache file is a piece that exists and points at nothing. So the piece this screen
 *        keeps is the one `addPiece` hands back, never the one it handed in.
 *     2. **`updateText` throws on a cold cache**, deliberately, because a keystroke handler
 *        cannot wait for a read. This screen guarantees the slot is in the store's hand
 *        before any keystroke can reach it: a note exists only because `addPiece` or the
 *        mount's `load` put it there.
 *     3. **A failed `persist` leaves the slot unwritten on purpose**, so the draft survives
 *        in hand and the next write retries it. Nothing here may therefore tell anybody a
 *        memory was *lost*: the honest words are that it is **not saved yet**.
 *   - **`VoiceRecorderBar`** is the dock's Voice slot rather than something a Voice tap
 *     reveals -- one tap, not two (FR-006). `onClip` is called and **not awaited**, so a
 *     rejected promise from `handleClip` would vanish: `addCapturedPiece` catches its own
 *     failures. `onRecordingChange(false)` also arrives *during an unmount*, so it must be
 *     safe to receive when the bar is already going.
 *   - **`DualShutterCamera`** is full screen and handles its own camera/microphone refusal
 *     inside the overlay, so it gives this screen no permission callback; the microphone
 *     refusal that *is* this screen's to show comes from the voice bar. The camera is
 *     mounted **over** this screen rather than instead of it, so opening it cannot unmount a
 *     running recording.
 *   - **`SaveAudienceSheet`** is presentational. FR-010's "an edit saves straight away,
 *     keeping its audience, no sheet" is this screen's rule, not the sheet's.
 *
 * **Edit mode is T058**, and it is User Story 4: Edit opens the memory here and Save updates
 * that same memory, never a second one (FR-018, SC-005). It is the same screen with four
 * rules of its own, and each of them is a way of losing something if it is got wrong:
 *
 *   - **A piece the server already holds carries `remote: {id, url}` and no `uri`, and keeps
 *     every address the memory had.** The missing `uri` is the load-bearing half: a second
 *     upload takes a new media id, and the server carries a piece's capture moment across an
 *     edit by matching first on that id and then on its url, so re-uploading a photograph
 *     nobody touched loses the moment and the place it was taken (FR-019, research R3, R7) --
 *     and `buildContentBlocks` turns a piece's `uri` into exactly the `localPath` the upload
 *     path picks up. Keeping the addresses is the other half, and it is just as load-bearing:
 *     an item saved back as `{id, url}` alone has no thumbnail, no display copy and no device
 *     copy, so every tile in that memory draws the grey "Preparing photo…" plate -- for ever,
 *     if the phone is offline. See `pieceFromMediaItem`.
 *   - **The `edit` slot is written on the first change and not before** (FR-013, round-2 M5).
 *     Opening Edit and closing again leaves *nothing*: no draft, and so nothing on the
 *     memory's card claiming an unfinished edit nobody started. `startEdit` is what begins it,
 *     and it is given the memory's own pieces, so the draft starts as the memory is.
 *   - **Save saves at once, keeping the memory's audience, with no sheet** (FR-010, the
 *     owner's round-2 answer). The sheet is for choosing an audience a memory does not have
 *     yet; asking again about one that has one is a question with a wrong answer available.
 *   - **Everything that is not a piece is carried through, where it was.** A memory can hold a
 *     `location` block -- `entry.location` written out again by the old composer -- which is
 *     not a captured piece and which `JournalEntryDetail` reads as where the memory happened
 *     (`:239`). Rebuilding the memory from its pieces alone would quietly drop it, so blocks
 *     this screen does not turn into pieces are kept, and `blocksForSave` puts them back
 *     between the same pieces they were stored between.
 *
 * Leaving is still leaving (Close keeps the edit), and Discard changes throws away the changes
 * and not the memory (FR-015) -- and **only ever this memory's changes**: there is one `edit`
 * slot, so a Discard that did not check whose edit is in it would delete another memory's
 * unsaved work, media and all. See `handleDiscardConfirmed`.
 *
 * **Durability is T040**, and it is User Story 2: whatever happens mid-capture, what was
 * captured is still here afterwards, private, until the person saves or discards it.
 *
 *   - **The unsaved memory is written whenever it may be taken away** (FR-012). The store
 *     writes after every piece and half a second after the last keystroke by itself; the two
 *     moments it asks its caller for are the keyboard leaving a note and the app leaving the
 *     foreground -- `background` or `inactive`, which is the phone locking, an incoming call
 *     and the app switcher, and the last moment before the operating system may close the app.
 *     Close is a third, for the half second after the last keystroke.
 *   - **A failed save can be tried again** (FR-017), for exactly one failure: a `createEntry`
 *     that rejected. Everything after `createEntry` resolves reports a *saved* memory and
 *     never arms it, because a retry there writes the memory twice -- which is the defect the
 *     save path below is shaped around.
 *   - **A draft left behind by a save whose tidying up failed never comes back as a phantom
 *     unsaved memory** (`draftsLeftAfterSave`) -- and letting one go can never take a piece
 *     captured while the mount was still reading it, because the mount's read and that capture
 *     are both queued on the slot's lock and the capture lands in between. Nothing is let go
 *     once anything has been captured since the screen opened, and the store re-reads and
 *     compares the draft **inside** that lock before it deletes anything.
 *   - **None of it ever leaves the phone** (FR-014, SC-004). Everything captured goes into the
 *     `capture_drafts` slot and nowhere else, and nothing here reaches the sync machinery; the
 *     only write of a memory is `createEntry`, after the person has chosen who can see it.
 *
 * What jest cannot prove, and what is therefore nowhere claimed: the phone actually locking,
 * a real incoming call, and the operating system force-closing the app. Those are the owner's
 * device checks Q-D1, Q-D2, Q-D3 and Q-D6.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  AppState,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { v4 as uuidv4 } from 'uuid';

import CaptureDraftStore, {
  DraftSlot,
  draftIdentity,
} from '../../services/CaptureDraftStore';
import CaptureLocation from '../../services/CaptureLocation';
import { JournalService } from '../../services/JournalService';
import { SettingsService } from '../../services/SettingsService';
import { useAuth } from '../../context/AuthContext';
import { useJournal } from '../../hooks/useJournal';
import { buildContentBlocks } from '../../utils/journalBlocks';
import CaptureDock from '../../components/capture/CaptureDock';
import PieceList, { kindLabel } from '../../components/capture/PieceList';
import VoiceRecorderBar from '../../components/capture/VoiceRecorderBar';
import DualShutterCamera from '../../components/capture/DualShutterCamera';
import SaveAudienceSheet from '../../components/capture/SaveAudienceSheet';

/**
 * A capture that produced nothing, in words that say what was lost and what was not.
 *
 * Every `onCaptureFailed` reason from either component means *no piece was added*, and so
 * does a rejected `addPiece` (a full disk), so one message covers them all -- `reason` is for
 * the person, not for a decision. It names the kind, because "a capture failed" leaves
 * somebody wondering which of the six things they just did is missing.
 */
const lostCaptureMessage = (kind) =>
  `That ${kindLabel(kind).toLowerCase()} wasn’t saved, so it hasn’t been added to this ` +
  'memory. Everything else is still here — try again.';

/**
 * FR-017, and the draft store's deliberate behaviour: a failed write leaves the slot
 * unwritten so the next one retries it, which means the memory **is still on the phone**.
 * Saying it was lost would be false as well as frightening.
 *
 * The instruction to try again is the Try again button beside it rather than words in the
 * sentence, which is what the UI contract asks for ("banner … + Try again").
 */
const SAVE_FAILED_MESSAGE = 'Couldn’t save — your memory is still here.';

/** The microphone refusal the voice bar delegates upward (UI contract). */
const MICROPHONE_DENIED_MESSAGE =
  'Footprint can’t use the microphone, so it can’t record a voice clip. Turn it on in ' +
  'Settings. Typing and the camera still work.';

/**
 * The one outcome FR-012 forbids is typing that reaches no draft. It cannot happen -- a note
 * exists only because the slot was already loaded -- but it is said rather than swallowed,
 * because swallowing it is precisely how it would become invisible.
 */
const TEXT_NOT_KEPT_MESSAGE =
  'What you just typed isn’t being kept yet. Close this screen and open it again, and ' +
  'nothing already captured is lost.';

/**
 * Saving while a recording runs would clear the draft -- its row **and its media folder** --
 * out from under a clip that does not exist yet, and the clip would land in a slot that had
 * just been deleted. SC-002 is zero pieces lost, so the screen asks for the Stop tap rather
 * than racing it. It costs no tap in SC-001's scenario, where Stop comes before Save anyway.
 */
const STOP_RECORDING_FIRST_MESSAGE =
  'You’re still recording. Tap Stop to keep that clip, then save — nothing is lost by ' +
  'waiting.';

/**
 * The same hazard one step earlier, and the one with no visible cue at all.
 *
 * A capture is not a piece until the store has it, and `CaptureLocation.withLocation` waits
 * on a fix first -- up to its four-second timeout on a cold GPS. Photo, Done, Save, Family
 * is three taps, comfortably inside that: `performSave` would build its blocks from a
 * `pieces` the photo is not in yet, save the memory without it, clear the draft the photo was
 * about to be written into, and `goBack()`. The photo is then either deleted with the slot or
 * resurfaces later as a ghost one-piece draft, and nothing says a piece was dropped. SC-002
 * is zero pieces lost, so Save waits a moment and says so.
 */
const CAPTURE_IN_FLIGHT_MESSAGE =
  'Still keeping what you just captured — give it a moment, then save. Nothing is lost by ' +
  'waiting.';

/**
 * Said only when the memory saved and the tidying up after it did not, which is the one way
 * this screen can still be on screen with Save correctly down for good. Without it a person
 * is looking at a screen where Save no longer responds and nothing has been said -- which is
 * indistinguishable from a save that did nothing, and would invite the second tap that
 * `performSave` has just worked to prevent.
 */
const SAVED_MESSAGE =
  'Saved — your memory is on this phone. You can close this screen; there’s no need to ' +
  'save again.';

/**
 * The memory being edited could not be read at all.
 *
 * Said rather than left blank, because an empty capture screen under the title "Edit memory"
 * is indistinguishable from a memory whose pieces have vanished -- and it would invite a Save
 * that replaced the memory with nothing. Nothing has been written, so nothing has been lost,
 * and the sentence says so.
 */
const EDIT_LOAD_FAILED_MESSAGE =
  'Couldn’t open this memory to edit it. Nothing has been changed — close this screen and ' +
  'try again.';

/**
 * FR-036's one failure: the removal could not be **recorded**, so the piece is still part of
 * this memory and the row stays. A row that vanished from the screen but not from the draft
 * would come back on the next open, which is the one outcome worse than a refusal.
 *
 * A removal that *was* recorded and whose media file then could not be deleted is **not** a
 * failure and says nothing: the piece is out, which is what was asked for, and the store logs
 * the orphan rather than reporting it (`CaptureDraftStore.removePiece`).
 */
const REMOVE_FAILED_MESSAGE =
  'Couldn’t remove that piece — it is still part of this memory.';

/**
 * What the confirmation says about **this** piece, because one wording cannot be true of all
 * three (UI contract, *Remove, on every row*). ⚠ **Origin wins over kind**, and the three are
 * checked in the contract's own order, so no piece falls between two of them.
 *
 * The first turns on `fromSavedMemory`, the mark both piece builders stamp: of a piece the
 * memory already holds nothing is deleted and nothing is irreversible, because the memory
 * itself is unchanged until Save and Discard changes would put the piece back. It is checked
 * first because a photograph and a clip the memory holds *have* media, so the second body's
 * words would fit them on kind alone -- and would be false.
 *
 * The second turns on the store's own `ownsMedia` predicate (`CaptureDraftStore.js:168`),
 * reproduced here because it is private to the store: it is exactly the test the store applies
 * when it decides whether to delete the file, so the sentence promises what the removal will
 * actually do rather than what its kind suggests.
 *
 * The third is the rest, and it is where a note lands: there is no media to delete, and
 * promising to delete one is a promise about something that does not exist.
 */
const removalBodyFor = (slot, piece) => {
  if (piece?.fromSavedMemory) {
    return 'It is taken out of this memory when you save. Nothing is deleted from this phone.';
  }
  const storeOwnsTheFile =
    !!piece?.uri && !piece.remote && piece.uri.startsWith(CaptureDraftStore.slotDirectory(slot));
  if (storeOwnsTheFile) {
    return (
      'It is taken out of this memory, and its photo, video or recording is deleted from ' +
      'this phone. This cannot be undone.'
    );
  }
  return 'It is taken out of this memory. This cannot be undone.';
};

/** "Draft kept · n pieces" (UI contract), in English for one. */
const statusLineFor = (count) => `Draft kept · ${count} ${count === 1 ? 'piece' : 'pieces'}`;

/** "Changes kept" (UI contract): an edit, once anything in it has changed. */
const EDIT_STATUS_LINE = 'Changes kept';

/**
 * The block types that carry media, and the kind each of their media items is.
 *
 * A `Map` rather than an object literal for the reason `memoryPieces.js` gives: a plain
 * `KINDS[block.type]` is a prototype-chain lookup, so a block whose type is `'constructor'`
 * would resolve to a truthy *function*, be read as a media block, and travel on as the
 * piece's kind.
 */
const MEDIA_BLOCK_KINDS = new Map([
  ['photos', 'photo'],
  ['video', 'video'],
  ['audio', 'audio'],
]);

/**
 * One piece from one media item of one block (FR-018, FR-019).
 *
 * **`remote: {id, url}` is the signal, and `savedItem` is the item.** The signal is what says
 * "the server holds this file": `CaptureDraftStore.adoptMedia` refuses to copy it,
 * `buildContentBlocks` writes it out by its server id and url, and nothing turns it into an
 * upload. The piece's own `uri` must stay unset for that -- `adoptMedia` copies `piece.uri`,
 * and `buildContentBlocks`' *local* branch writes it out as the item's `localPath` -- because a
 * second upload takes a new media id, and the server carries a piece's capture moment across an
 * edit by matching on that id and then on its url, so the moment and the place of a piece
 * nobody touched would be lost (research R3, R7).
 *
 * **But the signal is not the whole item, and reducing it to the signal breaks the render**
 * (fix round 1, Critical 2). An uploaded item carries two rendition addresses and the device's
 * own copy as well as its url (`SyncEngine._applyUploadedMediaToEntry`), and every tile reads
 * those: `thumbnailSource` reads `localPath, thumbnailUrl, thumbnailUri`, `fullSizeSource`
 * reads `localPath, displayUrl, displayUri`. Saved back as `{id, url}` alone, a photograph has
 * none of them -- and `DatabaseService._normalizeContentBlocks` deliberately leaves
 * `thumbnailUrl` null for an item that has a media id and no thumbnail, so the tile draws the
 * grey "Preparing photo…" plate and waits for the poller. Offline the poller stays quiet, so
 * the plate never resolves; and the lost `localPath` cannot be restored by any pull, so a
 * memory that rendered instantly from this phone's own copy becomes network-dependent. So the
 * whole item is carried in `savedItem` and written back out underneath the piece's own values.
 *
 * **Carrying `localPath` is safe, and it is what fixes the offline case.** Both upload gates
 * read a server address as proof the server holds the file and decline on it *before* they look
 * at a path -- `JournalService._queueMediaBlockForUpload` (`:884`, `if (item?.serverUrl ||
 * item?.url) continue;`) and `SyncEngine._isUnuploadedItem` (`:658`,
 * `(localPath || uri) && !mediaId && !(serverUrl || url)`) -- so an item carrying both signals
 * is skipped by both, and `SyncEngine._planEntryMedia` (`:699`) strips `localPath` from what
 * goes on the wire. `JournalService._persistMediaBlocks` does read `item.localPath`, but
 * through `FileService.persist`, which returns a path already inside `documentDirectory/media/`
 * untouched (`FileService.js:240-244`, `:228-230`) -- so there is no copy either.
 *
 * `sourceUri` is **display only**: the address this piece can be read from now, for the rows'
 * voice player (FR-020), which cannot use `uri` for the reason above. Nothing that uploads,
 * copies or deletes reads it, and `buildContentBlocks` never writes it out.
 *
 * `location` falls back to the block's, as `memoryPieces.expand` does: a photos or video block
 * written before this feature carries the place on the block alone, and reading the item only
 * would turn a piece that has a place into one that has none.
 */
function pieceFromMediaItem(kind, block, item) {
  const heldByTheServer = !!(item.id || item.mediaId || item.url || item.serverUrl);

  return {
    localId: item.localId ?? uuidv4(),
    kind,
    // Which block this piece came out of, so the rebuilt block keeps its id (see
    // `blocksFromPieces`). `ConflictResolver._mergeContentBlocks` keys on `block.id`.
    ...(block.id ? { blockId: block.id } : {}),
    // Contract C3: a media item's time is its own, and a block with media carries none.
    capturedAt: item.capturedAt ?? null,
    location: item.location ?? block.location ?? null,
    ...(item.width != null ? { width: item.width } : {}),
    ...(item.height != null ? { height: item.height } : {}),
    // A clip's length and levels sit on the block (`journalBlocks.js`); a video's are on the
    // item, with the block as the fallback the old composer's shape needs.
    ...(kind === 'audio'
      ? { duration: block.duration ?? item.duration, waveform: block.waveform }
      : {}),
    ...(kind === 'video' ? { duration: item.duration ?? block.duration } : {}),
    // The item as the memory already has it, carried back on save so an edit cannot erase an
    // address or a flag the phone put there -- `uploadFailed`/`missingFile` included, which is
    // what makes a tile say "Photo couldn't be uploaded" (`SyncEngine._planEntryMedia:710`).
    savedItem: { ...item },
    // Where this piece came from, which is what FR-036's confirmation says something different
    // about: nothing of it is deleted from the phone, and Discard changes would put it back, so
    // "this cannot be undone" is false of it. Stamped unconditionally here and in
    // `piecesOfEntry`'s text branch -- which is the branch that needs it, and says why.
    //
    // ⚠ A carrier, like `savedItem` and `blockId`, and **it never goes on the wire**:
    // `buildContentBlocks` names the fields it writes out one by one and this is not one of
    // them. It must stay that way, because `mediaItemFor` spreads `savedItem` back out
    // underneath the piece's own values -- so a mark that reached the server once would be read
    // back into `savedItem` on the next edit and re-sent for ever, on this memory and on every
    // other one edited after it.
    fromSavedMemory: true,
    ...(heldByTheServer
      ? {
        remote: {
          id: item.id ?? item.mediaId ?? null,
          url: item.url ?? item.serverUrl ?? null,
        },
        ...(item.localPath || item.serverUrl || item.url
          ? { sourceUri: item.localPath || item.serverUrl || item.url }
          : {}),
      }
      : { uri: item.localPath ?? item.uri }),
  };
}

/**
 * A saved memory, as the pieces this screen edits plus the blocks that are not pieces.
 *
 * **Both halves are returned, and both are needed.** A `location` block is `entry.location`
 * written out again: the card draws nothing for it, it is not something anybody captured, and
 * `memoryPieces` deliberately leaves it out of the numbering -- but `JournalEntryDetail` reads
 * it as where the memory happened (`:239`), so rebuilding the memory from its pieces alone
 * would quietly delete the only record of that for a memory whose `location` column is empty.
 * The same goes for a block of a type this app has never heard of, and for a media block whose
 * `media` is not a usable list: part of somebody's memory, and not this screen's to drop.
 *
 * Each carried block is kept with **how many pieces stood before it**, so `blocksForSave` can
 * put it back where the memory had it rather than at the end (fix round 1, Minor 7).
 *
 * @param {object} entry the saved memory, as `JournalRepository.getByLocalId` hands it back
 * @returns {{pieces: object[], carried: {block: object, piecesBefore: number}[]}} the pieces in
 *   stored order, and the blocks that are not pieces, in stored order
 */
function piecesOfEntry(entry) {
  const pieces = [];
  const carried = [];

  (Array.isArray(entry?.contentBlocks) ? entry.contentBlocks : []).forEach((block) => {
    if (!block) return;

    if (block.type === 'text') {
      pieces.push({
        // A text block carries no `localId` of its own (`journalBlocks.js` emits none), and
        // every reader here needs one -- the list's key, `updateText`, `draftIdentity`. It is
        // never sent anywhere: the text builder does not write it out.
        localId: block.localId ?? uuidv4(),
        kind: 'text',
        ...(block.id ? { blockId: block.id } : {}),
        content: block.content ?? '',
        // A block with no media is where its own capture time is a recorded fact (contract C3).
        capturedAt: block.capturedAt ?? null,
        location: block.location ?? null,
        // The same mark `pieceFromMediaItem` stamps, and this is the branch that needs it:
        // `remote`, `savedItem` and `sourceUri` are media-only, so a note rebuilt from a
        // stored text block carries none of them and is indistinguishable by its own fields
        // from one typed a moment ago -- and `blockId` is written only where the stored block
        // had an id, so it is nearly but not quite the same predicate. It sits on the piece
        // rather than being worked out when Remove is tapped because the `edit` slot is
        // persisted: an unfinished edit reopened after a force-close is restored from the
        // draft row, with no entry to re-derive anything from (data-model, *Piece*).
        fromSavedMemory: true,
      });
      return;
    }

    const kind = MEDIA_BLOCK_KINDS.get(block.type);
    const media = kind && Array.isArray(block.media) ? block.media.filter(Boolean) : [];

    if (!media.length) {
      carried.push({ block, piecesBefore: pieces.length });
      return;
    }

    media.forEach((item) => pieces.push(pieceFromMediaItem(kind, block, item)));
  });

  return { pieces, carried };
}

/**
 * The memory as it will be saved: its pieces, as blocks, with the blocks that are not pieces
 * back in their places.
 *
 * Built in segments rather than appended at the end, because a block that is not a piece is
 * still *somewhere* in the memory, and moving it is a change nobody asked for. Each carried
 * block was recorded with the number of pieces that stood before it, so the pieces split there
 * and the block goes between the two halves. Splitting also keeps a run of photographs from
 * merging *across* a block that was stored between them.
 *
 * `buildContentBlocks` is called per segment rather than once over everything: it is pure, and
 * it is the only thing that knows how a run of pieces becomes blocks -- counting that out here
 * would get it wrong for a note left blank, which it drops.
 */
function blocksForSave(pieces, carried) {
  const blocks = [];
  let from = 0;

  carried.forEach(({ block, piecesBefore }) => {
    // Clamped and monotonic, which is what keeps this safe against a stale `piecesBefore`: the
    // carried blocks come in stored order, so `from` never goes backwards, and `pieces.length`
    // is the far end.
    //
    // ⚠ **A `piecesBefore` can now be stale in both directions.** Until T073 pieces were only
    // ever added, and always at the end; FR-036's Remove takes them out as well, and nothing
    // adjusts `carriedBlocksRef` when one goes. The clamp still cannot throw and cannot drop a
    // piece -- a count larger than the list is pulled back to the end of it -- but a carried
    // block stored *between* two pieces slides later in the memory when a piece before it is
    // removed: the count it was stored with now reaches past a piece that used to follow it,
    // so that piece ends up before it. A block stored last, which is where the old composer
    // writes its `location`, is unaffected: the clamp puts it after whatever is left.
    const upto = Math.min(Math.max(piecesBefore, from), pieces.length);
    blocks.push(...buildContentBlocks(pieces.slice(from, upto)), block);
    from = upto;
  });

  blocks.push(...buildContentBlocks(pieces.slice(from)));
  return blocks;
}

/**
 * Put a stored list of pieces *underneath* whatever has been captured since it was asked for,
 * never over the top of it.
 *
 * Both mounts read from somewhere slow -- the draft store's table, or the memory's row -- and
 * every capture button is live for the whole of that read. The store appends a capture to the
 * draft it finds, so the slot's order is the stored pieces and then the new one; a plain
 * replacement would take that piece off the screen while leaving it in the slot, where Save
 * would build the memory without it and then let the whole slot go, deleting it (fix round 1).
 */
function restoreUnderCaptures(setPieces, stored) {
  setPieces((previous) => {
    const restored = new Set(stored.map((piece) => piece.localId));
    return [...stored, ...previous.filter((piece) => !restored.has(piece.localId))];
  });
}

/**
 * Which draft each slot was left holding by a save that worked: slot → `draftIdentity` of the
 * pieces that were saved.
 *
 * Module state, deliberately: what it guards against happens on the **next** mount, so it has
 * to outlive this screen. `clearAfterSave` runs once `createEntry` has resolved and can fail
 * on its own account -- it opens the database and runs a `DELETE` -- and `performSave` will
 * not report that as a failed save, because reporting a successful save as a failure is how a
 * memory gets written twice. What it leaves behind is a draft row for a memory that is already
 * in the Journal, and without this the next tap on + would restore it as an unsaved memory and
 * offer Save for the second copy.
 *
 * **It records the draft, not just the slot**, so that a draft can only ever be let go for being
 * the very one that was saved. Anything else in that slot is somebody's unsaved memory, and the
 * one thing worse than a phantom draft is letting go of a real one.
 *
 * **The comparison itself is not made here.** This is a name to ask by, not a decision: the name
 * goes to `CaptureDraftStore.clearAfterSave(slot, { onlyIfIdentity })`, which re-reads the slot
 * and compares it **inside the slot's lock**, the only place the comparison and the delete are
 * one step. Deciding it out here, from what the mount's `load` returned, would be decided before
 * a capture that queues behind that read and lands before the delete -- and the delete would
 * then take that piece and its media with it. Fix round 1; the race is driven in both suites.
 *
 * What the identity cannot see is **typing into a note that is already there**, which leaves
 * every id exactly as it was -- so `handleChangeText` forgets the slot outright. From the first
 * keystroke after that save, the slot holds something that was never saved.
 *
 * **Its limit, said rather than hidden:** it lives in memory, so it does not survive the app
 * being force-closed between the failed clear and the next +. There the leftover draft comes
 * back, indistinguishable from a genuine unsaved memory, and so it is shown -- the safe
 * direction, since SC-002 is zero pieces lost. Surviving that would mean recording the fact
 * *in* the draft row, which is a change to `CaptureDraftStore`'s slot model that the plan did
 * not anticipate, so it is reported rather than taken.
 */
const draftsLeftAfterSave = new Map();

export default function CaptureScreen({ route, navigation }) {
  const isEditMode = route?.params?.mode === 'edit';
  const entryLocalId = route?.params?.entryLocalId ?? null;
  const slot = isEditMode ? DraftSlot.EDIT : DraftSlot.NEW;
  /**
   * An audience the person has **already** chosen somewhere else, for the save sheet to open on.
   *
   * The Journal's quick bar carries its own "Who can see this?" picker, and every one of its
   * three controls sends what the picker was left on (`JournalScreen.openCapture`). Without
   * this, somebody who picked **Only me** there and then tapped Send -- or the camera, or the
   * microphone -- reached a sheet pre-selecting **Family**: their choice discarded, and the
   * replacement *wider* than what they asked for, which is the unsafe direction of this
   * project's "sharing fails closed" rule (fix round 1 after the whole-branch review,
   * Important 2; the camera and microphone in round 2, item 3).
   *
   * `undefined` when nothing carried one -- the + over every tab, for instance -- and then the
   * sheet uses FR-010's own Family. Deliberately not defaulted to `'family'` here: the
   * pre-selection is the sheet's rule, and stating it in two places is how the two drift apart.
   *
   * It is a pre-selection and nothing more. FR-011 still holds: nothing is saved without a tap,
   * and this value is never sent anywhere by itself -- `performSave` is only ever reached from
   * `handleAudienceChosen` (or, on an edit, from the memory's own audience).
   */
  const carriedAudience = route?.params?.audience;

  const { user } = useAuth();
  const [journalId, setJournalId] = useState(null);
  const { createEntry, updateEntry } = useJournal(journalId, { autoFetch: false });

  /** The memory being captured, in capture order. The array *is* the order (FR-005). */
  const [pieces, setPieces] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isAudienceSheetOpen, setIsAudienceSheetOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [captureError, setCaptureError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  /** SAVED_MESSAGE, once the memory is saved and something after it did not finish. */
  const [savedNotice, setSavedNotice] = useState(null);
  /**
   * The audience already chosen for this memory, so Try again does not ask again (FR-017).
   * Null until the sheet has been answered, which is also the only time a save can fail.
   */
  const [chosenAudience, setChosenAudience] = useState(null);
  const [permissionNotice, setPermissionNotice] = useState(null);
  /** Which note should take the keyboard, and a nonce so the same one can be asked twice. */
  const [focusRequest, setFocusRequest] = useState(null);
  /**
   * Whether this edit has become an unsaved edit -- which is what the status line says, and
   * which is true only once a change has reached the draft store (FR-013). Set when the slot
   * is written, not when the keystroke arrives: "Changes kept" is a claim about the phone.
   */
  const [hasEditChanges, setHasEditChanges] = useState(false);

  const mountedRef = useRef(true);
  /**
   * The memory being edited, as a promise, so that **the first change can wait for it**.
   *
   * `startEdit` replaces the slot with the pieces it is given, and every capture button is
   * live while the memory is still being read. A Type tap inside that window, answered with
   * the pieces as they stood (none), would write an edit draft holding the new note and not
   * one of the memory's own -- and reopening that draft later would find every existing piece
   * missing from it. A promise rather than state because what reads it is an event handler
   * that has to wait, not a render.
   */
  const savedPiecesRef = useRef(null);
  /**
   * The memory's blocks that are **not** pieces, re-emitted after the pieces on save, so an
   * edit cannot quietly drop part of the memory. See `piecesOfEntry`. Always empty for a new
   * memory, which has nothing to carry.
   */
  const carriedBlocksRef = useRef([]);
  /** The audience the memory already has, which an edit keeps (FR-010). */
  const entryVisibilityRef = useRef(undefined);
  /**
   * Whether the `edit` slot exists and is in the draft store's hand. Until it is, `updateText`
   * has nothing to write into -- it is synchronous and throws on a cold cache, by design -- so
   * a keystroke has to queue behind `startEdit` rather than be thrown away for arriving half a
   * tick early.
   */
  const editDraftLiveRef = useRef(false);
  /** The one `startEdit` for this session, so a second change does not begin a second edit. */
  const editStartRef = useRef(null);
  /** A note being added, as a second tap can see it before any render has happened. */
  const typeInFlightRef = useRef(false);
  /**
   * How many captures are between the shutter and the draft store. Above zero means a piece
   * has been captured that `pieces` does not have yet, so there is nothing safe to build a
   * memory from. A ref rather than state because Save has to see the increment in the same
   * tick as the capture that made it, before any render.
   */
  const capturesInFlightRef = useRef(0);
  /**
   * Whether anything at all has been captured since this screen opened. Set before the first
   * await of the first capture and never cleared, because what reads it is asking "could this
   * slot be holding something the mount's read did not know about?" and once the answer is yes
   * it stays yes. A ref for the same reason as the counter above: the mount's read resolves in
   * a closure that was made with `pieces` empty, so state cannot answer it (fix round 1).
   */
  const capturedSinceMountRef = useRef(false);
  /**
   * Whether a save is between its first line and its outcome. A ref rather than `isSaving`
   * for the same reason as the two above: both of Save's callers are taps, and Try again's
   * second tap in a tick cannot wait for a render -- and two of them would be two memories.
   * Released only where nothing was written (see `performSave`).
   */
  const saveInFlightRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /** Which journal a saved memory belongs to, as `JournalScreen` resolves it. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const id = await SettingsService.getOrCreateDefaultJournal(user?.id ?? null);
        if (!cancelled) setJournalId(id);
      } catch (error) {
        // Nothing is shown here: it costs nothing until Save, and Save reports its own
        // failure with the draft left intact rather than guessing at a journal.
        console.warn('[CaptureScreen] could not resolve the default journal', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  /**
   * Write the unsaved memory now (FR-012).
   *
   * Fire-and-forget, and the rejection is caught here, because every caller is a synchronous
   * one with nowhere to await: an `AppState` handler, a `TextInput`'s `onBlur`, and Close.
   *
   * A failure says nothing on screen on purpose. The store leaves the slot unwritten when a
   * write fails, precisely so the next flush retries it, so the memory **is** still on the
   * phone -- and the one thing this screen may never do is tell somebody a memory was lost
   * when it was not.
   */
  const flushDraft = useCallback(
    (reason) => {
      (async () => {
        try {
          await CaptureDraftStore.flush(slot);
        } catch (error) {
          console.warn(
            `[CaptureScreen] the unsaved memory could not be written (${reason}); it is still ` +
              'in the draft store and the next write will retry it',
            error,
          );
        }
      })();
    },
    [slot],
  );

  /**
   * FR-012's "immediately when the app leaves the foreground", which is the trigger that
   * covers the phone locking, an incoming call and the app being closed by the system
   * afterwards: from this screen all three arrive as one `AppState` change, and after it the
   * app may never run again.
   *
   * **Leaving, not arriving.** `active` is the way back, has nothing to save from, and a
   * flush there would be a database write on every unlock. `inactive` is iOS's incoming call
   * and app switcher; `background` is the lock and the switch away (research R7).
   *
   * Not branched on the mode: an edit slot that has had no change is not unwritten, and the
   * store's `flush` does nothing for a slot with nothing to write.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'background' || next === 'inactive') {
        flushDraft(`AppState → ${next}`);
      }
    });
    return () => subscription?.remove?.();
  }, [flushDraft]);

  /**
   * The unsaved memory, if there is one (FR-013: tapping + reopens it).
   *
   * It is also what puts this slot in the draft store's hand before anything can type into
   * it -- `updateText` is synchronous and throws on a cold cache, by design.
   *
   * Edit mode does **not** load here: an edit's pieces come from the memory itself, and its
   * slot is written only on the first change, so that opening Edit and closing unchanged
   * leaves nothing behind (FR-013). The effect below is its mount.
   */
  useEffect(() => {
    if (isEditMode) return undefined;

    let cancelled = false;
    (async () => {
      let draft;
      try {
        draft = await CaptureDraftStore.load(slot);
      } catch (error) {
        console.warn('[CaptureScreen] could not read the unsaved memory', error);
        return;
      }
      if (cancelled || !draft?.pieces?.length) return;

      // Is this the very draft the last save already wrote as a memory, left behind only
      // because letting it go failed (see `draftsLeftAfterSave`)? If it is, it is not an
      // unsaved memory: it is let go rather than restored, because restoring it would offer
      // Save for a memory that is already in the Journal.
      //
      // **Not if anything has been captured since this screen opened.** The read above is a
      // cold database read and every capture button is live throughout it, so a photograph or
      // a note can land while it is in flight -- queued on the slot's lock, and so *before*
      // any delete issued from here. Letting go then deletes that piece and the media already
      // copied into the slot's folder, and SC-002 is zero pieces lost. Nothing is deleted and
      // nothing is restored in that case: the already-saved pieces stay in the slot, unoffered
      // and unsaveable from here, and the next mount that opens on a quiet window lets them
      // go. The store re-checks the identity inside the slot's lock as well, which is the only
      // place the comparison and the delete are one step -- so the two guards are independent.
      const identity = draftIdentity(draft.pieces);
      if (identity !== null && draftsLeftAfterSave.get(slot) === identity) {
        if (capturedSinceMountRef.current) {
          // Neither let go nor restored. Not let go, because the slot is no longer only what
          // was read -- it also holds the capture, which a delete would take. Not restored
          // either, because these pieces *are* a memory already in the Journal and putting
          // them back on screen would offer Save for a second copy of it; the person is
          // looking at the piece they have just captured, which is the unsaved memory here.
          // The marker stays, so a later mount with a quiet window still lets them go.
          console.warn(
            '[CaptureScreen] an already-saved draft was found after something was captured ' +
              'in the same window; it is left in the slot rather than deleted under the capture',
          );
          return;
        }
        try {
          const letGo = await CaptureDraftStore.clearAfterSave(slot, {
            onlyIfIdentity: identity,
          });
          if (letGo) {
            draftsLeftAfterSave.delete(slot);
            return;
          }
          // The store found something else in the slot, so this is not the draft that was
          // saved after all. It is restored below, like any other unsaved memory, and the
          // marker is left alone so a later mount can still recognise it.
          //
          // Re-checked after this await like every other one in this effect: the screen can
          // have gone while the store was deciding, and nothing below should then run.
          if (cancelled) return;
        } catch (error) {
          // Still there, and still not an unsaved memory. The next + tries again.
          console.warn(
            '[CaptureScreen] the draft of an already-saved memory still could not be let go',
            error,
          );
          return;
        }
      }

      // Restored *underneath* anything captured while the read was in flight, never over the
      // top of it -- see `restoreUnderCaptures`.
      restoreUnderCaptures(setPieces, draft.pieces);
    })();
    return () => {
      cancelled = true;
    };
  }, [isEditMode, slot]);

  /**
   * Edit mode's mount: the memory, and the unsaved edit of it if there is one (FR-018).
   *
   * Two reads, in this order, and both matter:
   *
   *   1. **`getEditFor`**, which is also the lifecycle's own cleanup: the store discards an
   *      `edit` slot whose memory has gone, folder and all, on its way past (FR-013,
   *      round-2 L2). An unsaved edit of a *different* memory is not this one's and is left
   *      exactly where it is -- asking whether to discard it is the Journal's, not this
   *      screen's (T060) -- and the first change here takes it away, which is `startEdit`'s
   *      documented behaviour.
   *   2. **`JournalService.getEntry`**, for the pieces, for the audience Save keeps, and for
   *      the blocks that are not pieces.
   *
   * **Nothing is written.** No `load`, no `startEdit`: opening Edit and closing again leaves
   * no `edit` slot at all (round-2 M5). The first change is what begins one.
   */
  useEffect(() => {
    if (!isEditMode) return undefined;

    let cancelled = false;

    const reading = (async () => {
      const existing = await CaptureDraftStore.getEditFor(entryLocalId);
      const entry = await JournalService.getEntry(entryLocalId);
      if (!entry) {
        throw new Error(`[CaptureScreen] there is no memory ${entryLocalId} to edit`);
      }
      return { entry, existing, ...piecesOfEntry(entry) };
    })();

    // The memory's own pieces, for the first change to be answered with (see
    // `savedPiecesRef`). The `catch` is not the error handling -- that is below, on the read
    // itself -- it is there so a failed read is not also an unhandled rejection.
    const savedPieces = reading.then(({ pieces: saved }) => saved);
    savedPieces.catch(() => {});
    savedPiecesRef.current = savedPieces;

    (async () => {
      let memory;
      try {
        memory = await reading;
      } catch (error) {
        console.warn('[CaptureScreen] the memory being edited could not be read', error);
        // Nothing was written and nothing was changed, and the banner says exactly that.
        // `pieces` stays empty, so Save is down and cannot replace the memory with nothing.
        if (!cancelled && mountedRef.current) setCaptureError(EDIT_LOAD_FAILED_MESSAGE);
        return;
      }
      if (cancelled) return;

      entryVisibilityRef.current = memory.entry.visibility;
      carriedBlocksRef.current = memory.carried;

      if (memory.existing?.pieces?.length) {
        // An unsaved edit of this very memory (US2-7): it is the newer of the two, and the
        // slot is already in the store's hand, so there is nothing to start.
        editDraftLiveRef.current = true;
        editStartRef.current = Promise.resolve();
        setHasEditChanges(true);
        restoreUnderCaptures(setPieces, memory.existing.pieces);
        return;
      }

      restoreUnderCaptures(setPieces, memory.pieces);
    })();

    return () => {
      cancelled = true;
    };
  }, [entryLocalId, isEditMode]);

  /**
   * Begin keeping this edit on the phone, once, on the first change (FR-013).
   *
   * Everything about it is shaped by one thing: `startEdit` *replaces* the slot's pieces with
   * what it is given, so it must be given the memory's own pieces, and it must therefore wait
   * for them. See `savedPiecesRef`.
   *
   * @returns {Promise<void>} resolved once the slot exists, rejected if it could not be made
   */
  const startEditDraft = useCallback(() => {
    if (!editStartRef.current) {
      const starting = (async () => {
        const saved = await savedPiecesRef.current;
        if (!Array.isArray(saved)) {
          // Refused rather than started empty. `startEdit` replaces the slot with what it is
          // given, so starting one here without the memory's pieces would write an edit that
          // is missing every piece the memory has -- a loss, where a refusal is only a change
          // that was not kept, and said so.
          throw new Error(
            '[CaptureScreen] the memory being edited has not been read yet, so there is ' +
              'nothing to start this edit from',
          );
        }
        await CaptureDraftStore.startEdit(entryLocalId, saved);
        // Before anything else is told: from here on a keystroke can be written straight.
        editDraftLiveRef.current = true;
        if (mountedRef.current) setHasEditChanges(true);
      })();
      editStartRef.current = starting;
      // Whoever asked for the change reports the failure -- it is their message to show. This
      // only stops an unhandled rejection, and lets the next change try again.
      starting.catch(() => {
        if (editStartRef.current === starting) editStartRef.current = null;
      });
    }
    return editStartRef.current;
  }, [entryLocalId]);

  // ============================================================
  // Capturing
  // ============================================================

  /**
   * Stamp a capture with where it happened and record it, in that order (FR-004).
   *
   * The piece kept on screen is the one the **store** hands back, pointing at the durable
   * copy under `documentDirectory/capture-drafts/<slot>/`, not the cache uri the camera or
   * the recorder handed up.
   *
   * It never rejects. `onClip` and `onShot` are called and not awaited, so a rejection here
   * would reach nobody at all; and the one thing FR-002's "any number of pieces" cannot
   * survive is a lost capture that looks like nothing having happened. A failure leaves every
   * earlier piece untouched, because nothing is appended until the store has it.
   */
  const addCapturedPiece = useCallback(
    async (piece) => {
      // Counted before the first await, released however this ends, so that Save can tell
      // "nothing captured" from "captured, not recorded yet" (CAPTURE_IN_FLIGHT_MESSAGE).
      capturesInFlightRef.current += 1;
      // Before the first await as well, and never unset: from here on this slot may hold
      // something the mount's read did not see, so no draft may be let go for being the one a
      // previous save wrote (see `draftsLeftAfterSave`).
      capturedSinceMountRef.current = true;
      try {
        // A new piece is a change, and an edit becomes an unsaved edit on its first change and
        // not before (FR-013). Before the stamp rather than after it: `withLocation` waits on
        // a fix, up to four seconds on a cold GPS, and the slot has to exist before `addPiece`
        // can put anything in it either way.
        if (isEditMode) await startEditDraft();

        const stamped = await CaptureLocation.withLocation(piece);
        const stored = await CaptureDraftStore.addPiece(slot, stamped);
        if (!mountedRef.current) return null;
        setPieces((previous) => [...previous, stored]);
        // This one line carries three unrelated things, and a success is honest evidence
        // about only two of them. A clip that recorded says nothing about a note whose
        // keystrokes reached no draft, so TEXT_NOT_KEPT_MESSAGE -- the one of the three that
        // means something a person wrote is not being kept -- outlives it. The transient
        // instructions clear, which is what they are for.
        setCaptureError((previous) =>
          previous === TEXT_NOT_KEPT_MESSAGE ? previous : null,
        );
        return stored;
      } catch (error) {
        console.warn('[CaptureScreen] a capture could not be kept', error);
        if (mountedRef.current) setCaptureError(lostCaptureMessage(piece?.kind));
        return null;
      } finally {
        capturesInFlightRef.current -= 1;
      }
    },
    [isEditMode, slot, startEditDraft],
  );

  /**
   * Type: a new note, or back to the note already at the end.
   *
   * Tapping Type twice must not leave an empty note behind the one being written in, and a
   * note is *not* hoisted to the top of the memory (FR-005) -- it is added where the person
   * is, at the end.
   */
  const handleType = useCallback(async () => {
    const last = pieces[pieces.length - 1];
    if (last?.kind === 'text') {
      setFocusRequest((previous) => ({
        localId: last.localId,
        nonce: (previous?.nonce ?? 0) + 1,
      }));
      return;
    }

    // A ref, written synchronously, because a second tap cannot wait for a render: the check
    // above reads `pieces`, which does not contain the note the first tap is still adding, so
    // without this an ordinary double-tap leaves two empty notes -- one of them behind the
    // keyboard. The same guard the capture components keep on their own shutters.
    if (typeInFlightRef.current) return;
    typeInFlightRef.current = true;

    let stored;
    try {
      stored = await addCapturedPiece({
        localId: uuidv4(),
        kind: 'text',
        content: '',
        // An instant, exactly as the phone's clock reads it (research R8, Principle III).
        capturedAt: new Date().toISOString(),
      });
    } finally {
      typeInFlightRef.current = false;
    }

    if (stored) {
      setFocusRequest((previous) => ({
        localId: stored.localId,
        nonce: (previous?.nonce ?? 0) + 1,
      }));
    }
  }, [addCapturedPiece, pieces]);

  /**
   * Write some typed words into the slot the store is holding.
   *
   * Never allowed to throw past here: `updateText`'s refusal is the one outcome FR-012
   * forbids being quiet about, and the message for it is the same wherever it comes from.
   */
  const keepTypedText = useCallback(
    (localId, content) => {
      try {
        CaptureDraftStore.updateText(slot, localId, content);
      } catch (error) {
        console.error('[CaptureScreen] the typed text reached no draft', error);
        if (mountedRef.current) setCaptureError(TEXT_NOT_KEPT_MESSAGE);
      }
    },
    [slot],
  );

  /** A keystroke. Synchronous all the way down: typing never waits for a copy. */
  const handleChangeText = useCallback(
    (piece, content) => {
      // A keystroke is the one change a draft's piece identity cannot see, so it is said here
      // outright: from now on this slot holds something that was never saved. See
      // `draftsLeftAfterSave`.
      draftsLeftAfterSave.delete(slot);

      setPieces((previous) =>
        previous.map((candidate) =>
          candidate.localId === piece.localId ? { ...candidate, content } : candidate,
        ),
      );

      if (isEditMode && !editDraftLiveRef.current) {
        // The first keystroke of an edit is what makes it an unsaved edit (FR-013), and there
        // is no slot to write into until `startEdit` has made one. So this one keystroke -- and
        // any that land while that is in flight -- queue behind it, in the order they arrived,
        // rather than being dropped for being half a tick early. The slot is written with the
        // memory's pieces and the words are applied over the top, which is why both calls
        // happen and in that order.
        startEditDraft().then(
          () => keepTypedText(piece.localId, content),
          (error) => {
            console.error('[CaptureScreen] the edit could not be started, so the typed text ' +
              'reached no draft', error);
            if (mountedRef.current) setCaptureError(TEXT_NOT_KEPT_MESSAGE);
          },
        );
        return;
      }

      keepTypedText(piece.localId, content);
    },
    [isEditMode, keepTypedText, slot, startEditDraft],
  );

  /**
   * The keyboard has left a note: the person has stopped typing, so write it now rather than
   * waiting out the store's half-second debounce (FR-012, research R7). This is the caller
   * `PieceList`'s `onBlurText` has been waiting for since T030.
   */
  const handleBlurText = useCallback(() => {
    flushDraft('the keyboard left a note');
  }, [flushDraft]);

  /**
   * Take one piece back out of this memory, once the question has been answered (FR-036).
   *
   * Two orderings carry the whole of it:
   *
   *   - **In an edit, the draft is started first**, exactly as a capture does it. `startEdit`
   *     *replaces* the slot with the memory's own pieces, so there is nothing to remove from
   *     until it has run -- and a removal that ran before it would be undone by it, putting
   *     the piece back. A removal is a change like any other, and in an edit it is usually the
   *     first one, which is what makes the edit unsaved (FR-013).
   *   - **The row goes only once the draft no longer lists it.** A row that vanished from the
   *     screen but not from the draft would be back on the next open, so a failure keeps the
   *     row and says so (FR-017) -- and in an edit it leaves the draft `startEdit` had to make
   *     exactly where it is, holding the memory's own pieces, because that draft is the one a
   *     second attempt removes from and this screen does not delete on the way out of an error
   *     (FR-012, SC-002).
   *
   * The piece is taken out of `pieces` **by its `localId`**, never by re-reading the slot: a
   * capture still in flight is in the store's draft and not yet on screen, and replacing the
   * list with what the store hands back would put it on screen a render early -- or, worse,
   * take a piece off the screen that the list had and the store's answer did not.
   *
   * `draftsLeftAfterSave` needs nothing here, unlike a keystroke: a removal changes which
   * pieces the slot lists, so the draft's identity no longer matches the saved one and
   * `clearAfterSave` would refuse it anyway.
   */
  const handleRemoveConfirmed = useCallback(
    async (piece) => {
      try {
        if (isEditMode) await startEditDraft();
        const draft = await CaptureDraftStore.removePiece(slot, piece.localId);
        if (!draft) {
          // `null` is the store saying the slot holds no draft at all, so nothing was written
          // and the removal was **not** recorded (data-model, *Removing a piece*). It is the
          // same outcome as a failed write and gets the same words: the row stays rather than
          // vanishing from a screen while the store still lists it. A `localId` the draft does
          // not list is a different answer -- the draft, unchanged -- so a double tap still
          // succeeds quietly.
          throw new Error(
            `[CaptureScreen] the draft store holds no ${slot} draft, so the removal was not ` +
              'recorded',
          );
        }
        if (!mountedRef.current) return;
        setPieces((previous) =>
          previous.filter((candidate) => candidate.localId !== piece.localId),
        );
        // The banner this screen may have put up for an earlier attempt at this very removal
        // says the piece is still part of the memory; it has just stopped being true, and a
        // false sentence beside a list that contradicts it is worse than no sentence. Cleared
        // the way `addCapturedPiece` clears it, `TEXT_NOT_KEPT_MESSAGE` excepted: that one is
        // about words of somebody's that are not being kept, which a removal says nothing
        // about (T073 review, Important 1).
        setCaptureError((previous) => (previous === TEXT_NOT_KEPT_MESSAGE ? previous : null));
      } catch (error) {
        console.warn('[CaptureScreen] a piece could not be removed', error);
        if (mountedRef.current) setCaptureError(REMOVE_FAILED_MESSAGE);
      }
    },
    [isEditMode, slot, startEditDraft],
  );

  /**
   * FR-036: removing asks first, because nothing brings a removed piece back -- the same shape
   * as the discard confirmation below, down to the cancel and destructive buttons.
   *
   * The body is chosen from the **piece**, not from the mode: one edit holds pieces the memory
   * already had and pieces captured into that same edit, and the two are true of different
   * things. See `removalBodyFor`.
   */
  const handleRemovePress = useCallback(
    (piece) => {
      Alert.alert(
        `Remove this ${kindLabel(piece?.kind)}?`,
        removalBodyFor(slot, piece),
        [
          { text: 'Keep it', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              void handleRemoveConfirmed(piece);
            },
          },
        ],
      );
    },
    [handleRemoveConfirmed, slot],
  );

  /** One clip per recording. `capturedAt` is when recording **started** (research R8). */
  const handleClip = useCallback(
    (clip) => {
      // Not returned: `onClip` ignores it, and `addCapturedPiece` never rejects anyway. An
      // `async` function also cannot throw synchronously, so the bar's 'handler-failed'
      // path -- which exists for a parent that threw -- cannot fire from here.
      void addCapturedPiece({
        localId: uuidv4(),
        kind: 'audio',
        uri: clip?.uri,
        capturedAt: clip?.capturedAt,
        duration: clip?.duration,
        waveform: clip?.waveform,
      });
    },
    [addCapturedPiece],
  );

  /** One piece per photo and per video (FR-008). A video carries no width or height. */
  const handleShot = useCallback(
    (shot) => {
      void addCapturedPiece({
        localId: uuidv4(),
        kind: shot?.kind,
        uri: shot?.uri,
        capturedAt: shot?.capturedAt,
        ...(shot?.width != null ? { width: shot.width } : {}),
        ...(shot?.height != null ? { height: shot.height } : {}),
        ...(shot?.kind === 'video' ? { duration: shot?.duration } : {}),
      });
    },
    [addCapturedPiece],
  );

  const handleCaptureFailed = useCallback((failure) => {
    // Reported, never swallowed: the capture is over and no piece was added, whichever
    // reason it carries. The camera's failure always names its `kind`; a failure that
    // somehow did not would rather say "piece" than guess at the wrong one.
    setCaptureError(lostCaptureMessage(failure?.kind));
  }, []);

  const handleVoiceCaptureFailed = useCallback(() => {
    // The voice bar's failure carries no `kind` -- it only records voice.
    setCaptureError(lostCaptureMessage('audio'));
  }, []);

  const handleRecordingChange = useCallback((recording) => {
    // `false` also arrives from the bar's unmount cleanup, so this has to be safe to receive
    // when the bar, or this screen, is already going away.
    if (mountedRef.current) setIsRecording(!!recording);
  }, []);

  const handleMicrophoneDenied = useCallback(() => {
    setPermissionNotice(MICROPHONE_DENIED_MESSAGE);
  }, []);

  const openSettings = useCallback(() => {
    Linking.openSettings?.();
  }, []);

  const openCamera = useCallback(() => {
    setIsMenuOpen(false);
    setIsCameraOpen(true);
  }, []);

  const closeCamera = useCallback(() => {
    setIsCameraOpen(false);
  }, []);

  // ============================================================
  // Leaving, discarding, saving
  // ============================================================

  /** Close never discards, in either mode (FR-015, UI contract). Leaving is just leaving. */
  const handleClose = useCallback(() => {
    setIsMenuOpen(false);
    // FR-012 names the screen being closed. The store's debounced write would land by itself
    // -- but only because the store is a module that outlives this screen, which is not a
    // thing to be relying on for the half second after the last keystroke.
    flushDraft('the screen was closed');
    navigation?.goBack?.();
  }, [flushDraft, navigation]);

  const handleDiscardConfirmed = useCallback(async () => {
    try {
      // ⚠ **Only ever this memory's own unsaved edit.** `discard` is not a row delete:
      // `CaptureDraftStore.removeHeld` also deletes the slot's whole media folder. There is
      // one `edit` slot, so opening Edit on one memory while another memory has an unsaved
      // edit puts somebody else's work in it -- and "Discard changes", whose dialog promises
      // the memory itself is untouched, would delete that edit and every photograph and clip
      // in it. This screen never wrote that slot and it is not ours to throw away.
      //
      // Two independent checks, because the cost of being wrong is somebody's unsaved memory:
      // this session wrote the slot, **and** the slot still names this memory. The second
      // matters because the first is a claim this screen made earlier and the slot is a single
      // row that anything may have moved since. It is the same reasoning `performSave` applies
      // before `clearAfterSave`, which is where it was first written down.
      const ours =
        !isEditMode ||
        (editDraftLiveRef.current && !!(await CaptureDraftStore.getEditFor(entryLocalId)));

      if (ours) {
        await CaptureDraftStore.discard(slot);
      } else {
        // Not an error, and nothing to say on screen: there were no changes of ours to throw
        // away, so leaving is exactly what the person asked for and exactly what happens.
        console.warn(
          '[CaptureScreen] nothing of this edit is in the draft store, so nothing was ' +
            'discarded; the edit slot holds another memory or no memory at all',
        );
      }
    } catch (error) {
      console.warn('[CaptureScreen] the unsaved memory could not be discarded', error);
    }
    navigation?.goBack?.();
  }, [entryLocalId, isEditMode, navigation, slot]);

  /** FR-015: discarding asks first, and the question says what goes. */
  const handleDiscardPress = useCallback(() => {
    setIsMenuOpen(false);
    Alert.alert(
      isEditMode ? 'Discard your changes?' : 'Discard this memory?',
      isEditMode
        ? 'The changes you have made will be removed from this phone. The memory itself ' +
            'stays exactly as it was.'
        : 'Everything you have captured here will be removed from this phone, media and ' +
            'all. This cannot be undone.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: isEditMode ? 'Discard changes' : 'Discard',
          style: 'destructive',
          onPress: () => {
            void handleDiscardConfirmed();
          },
        },
      ],
    );
  }, [handleDiscardConfirmed, isEditMode]);

  const canSave = pieces.length > 0 && !isSaving;

  /**
   * Save the memory on the phone, then -- and only then -- let the draft go.
   *
   * Two orderings in here are load-bearing, and both are ways of losing a memory outright if
   * they are the other way round:
   *
   *   - **`clearAfterSave` comes after `createEntry` has resolved** (FR-016, quickstart M4).
   *     Until the phone has written the real memory, the draft is the only copy there is.
   *   - **`buildContentBlocks`' refusal is allowed to surface.** It throws on a piece whose
   *     kind it cannot build rather than dropping it, because a silent drop is the one
   *     failure shape that makes a loss invisible -- the entry saves, the draft is cleared,
   *     nothing logs, and the piece is gone. Catching it here and saving the rest would turn
   *     that throw back into a drop with extra steps, so it lands in the same place as a
   *     failed write: nothing saved, nothing cleared, every piece still on the phone
   *     (data-model's `Save + local write fails → active (unchanged, error shown)`).
   *   - **`createEntry` resolving ends the part that may report a failure.** What follows is
   *     tidying up after a memory that is already on the phone: letting the draft go, and
   *     leaving. Either can fail on its own account -- `clearAfterSave` opens the database
   *     and runs a `DELETE`, and `goBack` depends on there being somewhere to go back to --
   *     and neither failure says anything about the save. Reported as "Couldn't save" it
   *     would be false, it would hand Save back for a memory that is already saved, and the
   *     next tap (or T040's Try again) would write a **second copy** of it. So it is logged
   *     where a developer can see it, Save stays down, and the person leaves, because their
   *     memory really was saved. The draft store already swallows its own file-deletion
   *     failure for exactly this reason.
   */
  const performSave = useCallback(
    async (visibility) => {
      // Synchronous, before any render can carry `isSaving`: both callers are taps, and Try
      // again's second tap in a tick would otherwise be a second memory.
      if (saveInFlightRef.current) return;
      saveInFlightRef.current = true;
      setIsSaving(true);

      try {
        // Everything that is not a piece, back where the memory had it: a `location` block is
        // part of the memory and is not this screen's to drop or to move (see `piecesOfEntry`
        // and `blocksForSave`). Nothing is carried for a new memory, so this is
        // `buildContentBlocks(pieces)` there.
        const contentBlocks = blocksForSave(pieces, carriedBlocksRef.current);

        if (isEditMode) {
          // The same memory, updated (FR-018, SC-005) -- and **only** its content and the
          // audience it already had. Nothing here touches its server id or its `shareState`,
          // so a memory whose share the server refused stays "Not shared" and queues no
          // orphan UPDATE: with no server id the repository queues nothing, and the pending
          // CREATE or a later re-share carries this content (research R15, round-3 L4).
          await updateEntry(entryLocalId, { contentBlocks, visibility });
        } else {
          await createEntry({
            userId: user?.id || 'local_user',
            contentBlocks,
            visibility,
            // No title, and no other field: FR-010 asks for the audience and nothing else. The
            // memory's date is left to default, as every memory saved on this phone does.
          });
        }
      } catch (error) {
        console.error('[CaptureScreen] the memory could not be saved', error);
        // Save is handed back here and only here: nothing was written, so a second tap -- or
        // Try again, which is armed by this same banner -- is a retry rather than a duplicate.
        saveInFlightRef.current = false;
        if (mountedRef.current) {
          setSaveError(SAVE_FAILED_MESSAGE);
          setIsSaving(false);
        }
        return;
      }

      // The memory is on the phone. Nothing below may claim otherwise, re-arm Save, or offer
      // Try again -- a retry from here would write the memory a second time.
      try {
        // An edit that changed nothing has no slot, and letting go of a slot this session
        // never wrote would mean deleting whatever is in it -- which, if it is an unsaved edit
        // of another memory, is somebody's unsaved work.
        if (!isEditMode || editDraftLiveRef.current) {
          await CaptureDraftStore.clearAfterSave(slot);
          draftsLeftAfterSave.delete(slot);
        }
      } catch (error) {
        console.warn(
          '[CaptureScreen] the memory saved, but the unsaved copy could not be let go',
          error,
        );
        // The draft row has outlived the memory it was a draft of. Remembered, piece for
        // piece, so the next tap on + lets this draft go instead of offering it as unsaved.
        // An identity of null is not remembered at all: it could never match anything, and a
        // marker that cannot match is a line of state that says nothing.
        const saved = draftIdentity(pieces);
        if (saved !== null) draftsLeftAfterSave.set(slot, saved);
        if (mountedRef.current) setSavedNotice(SAVED_MESSAGE);
      }

      try {
        navigation?.goBack?.();
      } catch (error) {
        console.warn('[CaptureScreen] the memory saved, but the screen could not close', error);
        if (mountedRef.current) setSavedNotice(SAVED_MESSAGE);
      }
    },
    [createEntry, entryLocalId, isEditMode, navigation, pieces, slot, updateEntry, user?.id],
  );

  /**
   * What stops a save this instant, in words, or null.
   *
   * Shared by Save and Try again, because a retry runs the very same write from the very same
   * `pieces` and so has to wait for the very same things. Both are said rather than ignored: a
   * button that does nothing is indistinguishable from a button that is broken -- and the
   * capture-in-flight one has no visible cue at all.
   */
  const saveBlockedMessage = useCallback(() => {
    if (isRecording) return STOP_RECORDING_FIRST_MESSAGE;
    // Neither `isRecording` nor `pieces.length` can see a capture already taken and still on
    // its way into the draft, and that is the one this screen could lose silently.
    if (capturesInFlightRef.current > 0) return CAPTURE_IN_FLIGHT_MESSAGE;
    return null;
  }, [isRecording]);

  /**
   * FR-010: a new memory asks who can see it, in one sheet, and nothing else.
   *
   * **An edit saves straight away, keeping the memory's audience, with no sheet** (the owner's
   * round-2 answer). The sheet exists to choose an audience for a memory that does not have
   * one; a memory being edited has one already, and asking again is a question with a wrong
   * answer available -- including a dismissal, which saves nothing and would make Save on an
   * edit a button that sometimes does nothing.
   */
  const handleSavePress = useCallback(() => {
    if (pieces.length === 0 || isSaving) return;
    setIsMenuOpen(false);

    const blocked = saveBlockedMessage();
    if (blocked) {
      setCaptureError(blocked);
      return;
    }

    setSaveError(null);

    if (isEditMode) {
      void performSave(entryVisibilityRef.current);
      return;
    }

    setIsAudienceSheetOpen(true);
  }, [isEditMode, isSaving, performSave, pieces.length, saveBlockedMessage]);

  /** FR-011: a choice saves; a dismissal saves nothing and defaults to nothing. */
  const handleAudienceChosen = useCallback(
    (visibility) => {
      setIsAudienceSheetOpen(false);
      // Kept so that Try again does not ask the same question about the same memory twice.
      setChosenAudience(visibility);
      void performSave(visibility);
    },
    [performSave],
  );

  /**
   * FR-017's "offer to try again".
   *
   * **It is offered for one failure and one only**: a `createEntry` that rejected, which is
   * the only thing in this file that sets `saveError`. Letting the draft go and closing the
   * screen both happen *after* the memory is on the phone, and both report a saved memory
   * instead -- so a Try again can never be reached for a save that actually happened, and can
   * never write the memory a second time.
   *
   * It does not ask for the audience again: the person has already answered that about this
   * memory, and asking twice would also let a dismissal strand a memory they had already said
   * who could see. On an edit there was never a question -- the memory's own audience is what
   * the first attempt used and what the retry uses, so the gate is the mode and not an answer
   * that was never given.
   */
  const handleRetrySave = useCallback(() => {
    if (isSaving) return;
    if (!isEditMode && chosenAudience == null) return;

    const blocked = saveBlockedMessage();
    if (blocked) {
      setCaptureError(blocked);
      return;
    }

    setSaveError(null);
    void performSave(isEditMode ? entryVisibilityRef.current : chosenAudience);
  }, [chosenAudience, isEditMode, isSaving, performSave, saveBlockedMessage]);

  const handleAudienceDismissed = useCallback(() => {
    setIsAudienceSheetOpen(false);
  }, []);

  // ============================================================
  // Render
  // ============================================================

  return (
    // The safe area wraps the *content*, not the screen, so that the camera overlay below
    // can be genuinely full screen: an overlay inside the inset box would leave a white band
    // under the notch and over the home indicator.
    <View style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity
            testID="capture-close-button"
            accessibilityRole="button"
            accessibilityLabel="Close without discarding"
            style={styles.headerButton}
            onPress={handleClose}
          >
            <Ionicons name="close" size={26} color="#1C1C1E" />
          </TouchableOpacity>

          <Text testID="capture-title" style={styles.title}>
            {isEditMode ? 'Edit memory' : 'New memory'}
          </Text>

          <View style={styles.headerRight}>
            <TouchableOpacity
              testID="capture-overflow-button"
              accessibilityRole="button"
              accessibilityLabel="More"
              style={styles.headerButton}
              onPress={() => setIsMenuOpen((open) => !open)}
            >
              <Ionicons name="ellipsis-horizontal" size={22} color="#1C1C1E" />
            </TouchableOpacity>

            <TouchableOpacity
              testID="capture-save-button"
              accessibilityRole="button"
              accessibilityLabel="Save this memory"
              accessibilityState={{ disabled: !canSave }}
              disabled={!canSave}
              style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
              onPress={handleSavePress}
            >
              <Text style={[styles.saveLabel, !canSave && styles.saveLabelDisabled]}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>

        {isMenuOpen && (
          <View testID="capture-overflow-menu" style={styles.menu}>
            <TouchableOpacity
              testID="capture-discard-button"
              accessibilityRole="button"
              accessibilityLabel={isEditMode ? 'Discard changes' : 'Discard this memory'}
              style={styles.menuItem}
              onPress={handleDiscardPress}
            >
              <Ionicons name="trash-outline" size={18} color="#E5484D" />
              <Text style={styles.menuItemLabel}>
                {isEditMode ? 'Discard changes' : 'Discard'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/*
          The status line is the screen's claim that what is on it is being kept. On an edit
          that is true only once something has changed -- before then there is no draft at all,
          and saying "Changes kept" would promise an unsaved edit that does not exist.
        */}
        {pieces.length > 0 && (!isEditMode || hasEditChanges) && (
          <Text testID="capture-status-line" style={styles.status}>
            {isEditMode ? EDIT_STATUS_LINE : statusLineFor(pieces.length)}
          </Text>
        )}

        {savedNotice && (
          <View testID="capture-saved-notice-banner" style={[styles.notice, styles.noticeGood]}>
            <Ionicons name="checkmark-circle-outline" size={18} color="#1F7A45" />
            <Text testID="capture-saved-notice" style={styles.noticeText}>
              {savedNotice}
            </Text>
          </View>
        )}

        {saveError && (
          <View testID="capture-save-error-banner" style={[styles.notice, styles.noticeBad]}>
            <Ionicons name="alert-circle-outline" size={18} color="#8A2A2D" />
            <Text testID="capture-save-error" style={styles.noticeText}>
              {saveError}
            </Text>
            <TouchableOpacity
              testID="capture-save-retry-button"
              accessibilityRole="button"
              accessibilityLabel="Try saving again"
              style={styles.noticeButton}
              onPress={handleRetrySave}
            >
              <Text style={styles.noticeButtonText}>Try again</Text>
            </TouchableOpacity>
          </View>
        )}

        {captureError && (
          <View testID="capture-capture-error-banner" style={[styles.notice, styles.noticeBad]}>
            <Ionicons name="alert-circle-outline" size={18} color="#8A2A2D" />
            <Text testID="capture-capture-error" style={styles.noticeText}>
              {captureError}
            </Text>
          </View>
        )}

        {permissionNotice && (
          <View testID="capture-permission-notice-banner" style={styles.notice}>
            <Ionicons name="mic-off-outline" size={18} color="#8A6D00" />
            <Text testID="capture-permission-notice" style={styles.noticeText}>
              {permissionNotice}
            </Text>
            <TouchableOpacity
              testID="capture-open-settings-button"
              accessibilityRole="button"
              accessibilityLabel="Open Settings"
              style={styles.noticeButton}
              onPress={openSettings}
            >
              <Text style={styles.noticeButtonText}>Open Settings</Text>
            </TouchableOpacity>
          </View>
        )}

        <ScrollView
          testID="capture-piece-scroll"
          style={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          {pieces.length === 0 && (
            <Text testID="capture-empty-hint" style={styles.emptyHint}>
              Type, record or photograph whatever is happening. Add as many pieces as you like,
              in any order — nothing is shared until you save.
            </Text>
          )}

          <PieceList
            pieces={pieces}
            onChangeText={handleChangeText}
            onBlurText={handleBlurText}
            onRemove={handleRemovePress}
            focusRequest={focusRequest}
            // ⚠ FR-007. A saved clip's row carries a play control, and playing it would ask the
            // one shared audio session for `allowsRecording: false` -- which is how
            // `VoiceRecorderBar` *releases* the session once a clip is done. Tapping it while
            // the bar below is recording would therefore end that recording mid-sentence, and
            // the bar would read it as an interruption. The rows are in a plain ScrollView
            // right above the dock, so the tap is an easy one to make.
            isRecording={isRecording}
          />
        </ScrollView>

        <CaptureDock
          onType={handleType}
          onCamera={openCamera}
          isRecording={isRecording}
          voice={
            <VoiceRecorderBar
              onClip={handleClip}
              onPermissionDenied={handleMicrophoneDenied}
              onCaptureFailed={handleVoiceCaptureFailed}
              onRecordingChange={handleRecordingChange}
              style={isRecording ? styles.recordingBar : undefined}
            />
          }
        />
      </SafeAreaView>

      {isCameraOpen && (
        // Over this screen, not instead of it: a replacement would unmount the voice bar and
        // end a recording that is still running (FR-007).
        <View testID="capture-camera-overlay" style={styles.cameraOverlay}>
          <DualShutterCamera
            onShot={handleShot}
            onDone={closeCamera}
            onClose={closeCamera}
            onCaptureFailed={handleCaptureFailed}
            // ⚠ FR-007, the same hazard as `PieceList`'s `isRecording` one level out. Video
            // asks `recordAsync` for the microphone, and the one audio session is already held
            // by the bar below, so a Video tap over a running clip interrupts it: the clip is
            // finalised with the part already recorded (US2-2), so nothing is lost -- but it is
            // a silent truncation caused by a tap in our own interface. Only Video is taken
            // away; Photo needs no microphone, and FR-008 makes two quick taps of it the
            // designed use of this camera (review fix, Important 5).
            voiceRecording={isRecording}
          />
        </View>
      )}

      <SaveAudienceSheet
        visible={isAudienceSheetOpen}
        onChoose={handleAudienceChosen}
        onDismiss={handleAudienceDismissed}
        // What the person already chose on the Journal quick bar, if they came that way. See
        // `carriedAudience`.
        preSelected={carriedAudience}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  headerButton: {
    padding: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  title: {
    flex: 1,
    marginHorizontal: 8,
    fontSize: 17,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  saveButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#2B7DE9',
  },
  saveButtonDisabled: {
    backgroundColor: '#E5E5EA',
  },
  saveLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  saveLabelDisabled: {
    color: '#8E8E93',
  },
  menu: {
    alignSelf: 'flex-end',
    marginRight: 12,
    marginTop: 4,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E5EA',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  menuItemLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#E5484D',
  },
  status: {
    paddingHorizontal: 16,
    paddingTop: 8,
    fontSize: 13,
    color: '#8E8E93',
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#FFF7E0',
  },
  noticeBad: {
    backgroundColor: '#FDECEC',
  },
  noticeGood: {
    backgroundColor: '#E8F6EE',
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    color: '#1C1C1E',
  },
  noticeButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: '#1C1C1E',
  },
  noticeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  body: {
    flex: 1,
  },
  emptyHint: {
    padding: 24,
    fontSize: 15,
    lineHeight: 22,
    color: '#8E8E93',
  },
  recordingBar: {
    marginHorizontal: 12,
    marginBottom: 8,
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    elevation: 10,
    backgroundColor: '#000000',
  },
});
