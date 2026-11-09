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
 * **Edit mode is T057/T058.** The slot, the title, the status line and `performSave` are
 * already branched on it so that work is an extension rather than a rewrite, and nothing
 * here opens the audience sheet for an edit -- FR-010 forbids it there. Nothing navigates to
 * this screen with `mode: 'edit'` until T060.
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
 *     unsaved memory** (`draftsLeftAfterSave`).
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

import CaptureDraftStore, { DraftSlot } from '../../services/CaptureDraftStore';
import CaptureLocation from '../../services/CaptureLocation';
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

/** "Draft kept · n pieces" (UI contract), in English for one. */
const statusLineFor = (count) => `Draft kept · ${count} ${count === 1 ? 'piece' : 'pieces'}`;

/**
 * Which draft each slot was left holding by a save that worked: slot → its pieces' identity.
 *
 * Module state, deliberately: what it guards against happens on the **next** mount, so it has
 * to outlive this screen. `clearAfterSave` runs once `createEntry` has resolved and can fail
 * on its own account -- it opens the database and runs a `DELETE` -- and `performSave` will
 * not report that as a failed save, because reporting a successful save as a failure is how a
 * memory gets written twice. What it leaves behind is a draft row for a memory that is already
 * in the Journal, and without this the next tap on + would restore it as an unsaved memory and
 * offer Save for the second copy.
 *
 * **It records the draft, not just the slot**, and the next mount lets a draft go only when the
 * draft it actually found is piece-for-piece the one that was saved. Anything else in that slot
 * is somebody's unsaved memory, and the one thing worse than a phantom draft is letting go of a
 * real one. That covers a piece captured after the save by itself: the screen stays open after a
 * save whose tidying up failed, and a new piece changes the identity below.
 *
 * What it does not cover is **typing into a note that is already there**, which changes nothing
 * about the identity -- so `handleChangeText` forgets the slot outright. From the first
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

/**
 * A draft's pieces, as a value two drafts can be compared by -- or **null** if any piece
 * carries no id, because then there is nothing to compare and a guess would be a guess about
 * whether to delete somebody's memory. A null never matches, so an unidentifiable draft is
 * simply shown, which is the safe direction.
 */
const pieceIdentity = (pieces = []) =>
  pieces.length && pieces.every((piece) => piece?.localId)
    ? pieces.map((piece) => piece.localId).join('|')
    : null;

export default function CaptureScreen({ route, navigation }) {
  const isEditMode = route?.params?.mode === 'edit';
  const slot = isEditMode ? DraftSlot.EDIT : DraftSlot.NEW;

  const { user } = useAuth();
  const [journalId, setJournalId] = useState(null);
  const { createEntry } = useJournal(journalId, { autoFetch: false });

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

  const mountedRef = useRef(true);
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
   * leaves nothing behind (FR-013). That is T058.
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
      // Save for a memory that is already in the Journal. Compared piece for piece -- any
      // other draft in that slot is somebody's unsaved memory and is never let go unasked.
      const identity = pieceIdentity(draft.pieces);
      if (identity !== null && draftsLeftAfterSave.get(slot) === identity) {
        try {
          await CaptureDraftStore.clearAfterSave(slot);
          draftsLeftAfterSave.delete(slot);
        } catch (error) {
          // Still there, and still not an unsaved memory. The next + tries again.
          console.warn(
            '[CaptureScreen] the draft of an already-saved memory still could not be let go',
            error,
          );
        }
        return;
      }

      setPieces(draft.pieces);
    })();
    return () => {
      cancelled = true;
    };
  }, [isEditMode, slot]);

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
      try {
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
    [slot],
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

      try {
        CaptureDraftStore.updateText(slot, piece.localId, content);
      } catch (error) {
        console.error('[CaptureScreen] the typed text reached no draft', error);
        setCaptureError(TEXT_NOT_KEPT_MESSAGE);
      }
    },
    [slot],
  );

  /**
   * The keyboard has left a note: the person has stopped typing, so write it now rather than
   * waiting out the store's half-second debounce (FR-012, research R7). This is the caller
   * `PieceList`'s `onBlurText` has been waiting for since T030.
   */
  const handleBlurText = useCallback(() => {
    flushDraft('the keyboard left a note');
  }, [flushDraft]);

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
      await CaptureDraftStore.discard(slot);
    } catch (error) {
      console.warn('[CaptureScreen] the unsaved memory could not be discarded', error);
    }
    navigation?.goBack?.();
  }, [navigation, slot]);

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
        const contentBlocks = buildContentBlocks(pieces);
        await createEntry({
          userId: user?.id || 'local_user',
          contentBlocks,
          visibility,
          // No title, and no other field: FR-010 asks for the audience and nothing else. The
          // memory's date is left to default, as every memory saved on this phone does.
        });
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
        await CaptureDraftStore.clearAfterSave(slot);
        draftsLeftAfterSave.delete(slot);
      } catch (error) {
        console.warn(
          '[CaptureScreen] the memory saved, but the unsaved copy could not be let go',
          error,
        );
        // The draft row has outlived the memory it was a draft of. Remembered, piece for
        // piece, so the next tap on + lets this draft go instead of offering it as unsaved.
        draftsLeftAfterSave.set(slot, pieceIdentity(pieces));
        if (mountedRef.current) setSavedNotice(SAVED_MESSAGE);
      }

      try {
        navigation?.goBack?.();
      } catch (error) {
        console.warn('[CaptureScreen] the memory saved, but the screen could not close', error);
        if (mountedRef.current) setSavedNotice(SAVED_MESSAGE);
      }
    },
    [createEntry, navigation, pieces, slot, user?.id],
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
   * An edit saves straight away with the memory's existing audience and **no sheet** -- that
   * is T058's, and nothing navigates here with `mode: 'edit'` until T060, so Save on an edit
   * deliberately does nothing yet rather than opening a sheet FR-010 forbids there.
   */
  const handleSavePress = useCallback(() => {
    if (pieces.length === 0 || isSaving || isEditMode) return;
    setIsMenuOpen(false);

    const blocked = saveBlockedMessage();
    if (blocked) {
      setCaptureError(blocked);
      return;
    }

    setSaveError(null);
    setIsAudienceSheetOpen(true);
  }, [isEditMode, isSaving, pieces.length, saveBlockedMessage]);

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
   * who could see.
   */
  const handleRetrySave = useCallback(() => {
    if (isSaving || chosenAudience == null) return;

    const blocked = saveBlockedMessage();
    if (blocked) {
      setCaptureError(blocked);
      return;
    }

    setSaveError(null);
    void performSave(chosenAudience);
  }, [chosenAudience, isSaving, performSave, saveBlockedMessage]);

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

        {pieces.length > 0 && (
          <Text testID="capture-status-line" style={styles.status}>
            {statusLineFor(pieces.length)}
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
            focusRequest={focusRequest}
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
          />
        </View>
      )}

      <SaveAudienceSheet
        visible={isAudienceSheetOpen}
        onChoose={handleAudienceChosen}
        onDismiss={handleAudienceDismissed}
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
