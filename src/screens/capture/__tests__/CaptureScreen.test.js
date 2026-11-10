/**
 * 013 T029 / T039 -- `CaptureScreen`, new mode. The heart of User Stories 1 and 2.
 *
 * T039 adds User Story 2 -- **nothing captured is ever lost, and nothing unsaved ever
 * leaves the phone** -- in the four describes at the foot of this file:
 *
 *   - the unsaved memory is written whenever it may be taken away: `AppState` leaving the
 *     foreground, the keyboard leaving a note, and Close (FR-012);
 *   - tapping + reopens it with every piece, of every kind, text and all (FR-013);
 *   - a save that failed stays open, says the memory is still here, and can be **tried
 *     again** -- once, for a save that genuinely did not happen (FR-017, quickstart M5);
 *   - nothing is written as a memory or queued for sync before Save (FR-014, SC-004);
 *   - and a draft left behind by a save whose tidying up failed never comes back as a
 *     phantom unsaved memory.
 *
 * What jest cannot prove, and is not claimed anywhere below: the phone actually locking, a
 * real incoming call, and the operating system force-closing the app. Those are the owner's
 * device checks Q-D1, Q-D2, Q-D3 and Q-D6. What is driven here is the signal the screen sees
 * from each of them -- an `AppState` change -- and the state it has to come back to.
 *
 * This is the screen the whole feature is for: one memory, any number of notes, voice clips,
 * photos and videos, in any order, each switch one tap away, and nothing lost on the way
 * (FR-002, FR-003). What is pinned down here:
 *
 *   - Type, Voice and Camera are **always** on screen (FR-002), including while a recording
 *     is running and with nothing captured yet;
 *   - Type adds a note piece, or returns to the note already at the end of the list rather
 *     than stacking a second empty one;
 *   - **text typed before tapping Voice is exactly as typed afterwards** (FR-003) -- the
 *     defect this feature exists to remove is that today's composer throws typed text away
 *     when the microphone opens;
 *   - every captured thing becomes a piece **through `CaptureDraftStore.addPiece('new', …)`**
 *     and is stamped by `CaptureLocation.withLocation` first (FR-004);
 *   - rows read kind, local `HH:mm`, and the place or "No place" (FR-004/FR-005), in capture
 *     order;
 *   - the status line is "Draft kept · n pieces" (FR-012, UI contract);
 *   - Save is disabled with zero pieces, and asks only who can see it -- no title, no other
 *     field (FR-010);
 *   - **`clearAfterSave('new')` happens only once `createEntry` has resolved** (FR-016,
 *     quickstart M4); a save that fails leaves the draft alone, and a save that *succeeded*
 *     is never reported as a failure just because the tidying up after it did not finish --
 *     that story ends with the memory written twice;
 *   - **Save waits for a capture still on its way into the draft** (SC-002): stamping a photo
 *     with where it was taken can wait seconds on a cold GPS, and a save inside that window
 *     would commit the memory without it;
 *   - a capture that cannot be kept is reported on screen and leaves earlier pieces intact;
 *   - a permission refusal leaves the other controls working;
 *   - the header is Close (which never discards) · "New memory" · Save, with Discard behind
 *     the overflow and a confirmation (FR-015, UI contract);
 *   - **SC-001's tap count**, counted rather than asserted by hand -- see the last describe.
 *
 * ## Why these mocks, and what each one is faithful to
 *
 * `CaptureDraftStore`, `useJournal`, `CaptureLocation` and the three capture components are
 * mocked (tasks.md T029). Each mock is modelled on the real component's contract, because an
 * unfaithful stand-in here would pass against a screen that could not work:
 *
 *   - **`VoiceRecorderBar`** owns *both* its states -- idle it is the dock's "Voice" button,
 *     recording it is the bar with Stop -- so that FR-006's "one tap" really is one tap. The
 *     mock does the same, with the real component's two testIDs (`voice-record-button`,
 *     `voice-stop-button`), and calls `onRecordingChange(false)` before `onClip`, as the real
 *     `finishClip` does. **`onClip` is called, not awaited**, so a rejected promise from the
 *     screen's handler never reaches it: the "`addPiece` rejects" case below is the screen's
 *     own to catch, and the mock reproduces exactly that (it ignores the return value).
 *   - **`DualShutterCamera`** carries the real testIDs for its four controls, and its Video
 *     button starts on one tap and stops on the next -- so the tap count below is counted
 *     against the real control structure, not an invented one. It has no
 *     `onRecordingChange`: it is full screen and owns its own indicator.
 *   - **`SaveAudienceSheet`** is presentational with `{visible, onChoose, onDismiss}` and
 *     nothing else; the mock offers the same four values on one tap each.
 *   - **`CaptureDraftStore.addPiece`** returns the piece **as stored**, with its `uri` moved
 *     into `documentDirectory/capture-drafts/new/` -- that move is the store's first rule
 *     (`adoptMedia` before the piece is recorded), and both capture components hand up a raw
 *     *cache* uri by design. So the mock rewrites the uri, and the tests below assert that
 *     what reaches the entry is the durable path: a draft pointing at an evicted cache file
 *     is a piece that exists and points at nothing.
 *
 * `buildContentBlocks` is deliberately **not** mocked. It is the single funnel every piece
 * passes through on its way to the server, and its ordering (a run of photos in one block, a
 * note keeping its place) is half of FR-005; a mock would assert only that a function was
 * called.
 *
 * What jest cannot prove: that a real recording survives the phone locking, that the camera
 * behaves on a device, and the tap count as a thumb actually experiences it. Those are the
 * owner's device checks (quickstart Q-D1-Q-D6).
 */

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Alert, AppState, Linking, TextInput } from 'react-native';

// ============================================================
// Mocks
// ============================================================

jest.mock('../../../services/CaptureDraftStore', () => {
  const slotDirectory = (slot) => `file:///documents/capture-drafts/${slot}/`;

  /**
   * The store's rule 1: media is copied somewhere durable *before* the piece is recorded,
   * and the piece comes back pointing at the copy. A piece with no file comes back as it was.
   */
  const stored = (slot, piece) =>
    piece?.uri ? { ...piece, uri: `${slotDirectory(slot)}${piece.localId}` } : piece;

  const store = {
    DraftSlot: { NEW: 'new', EDIT: 'edit' },
    TEXT_DEBOUNCE_MS: 500,
    slotDirectory,
    /**
     * A pure function, so the real one is reproduced rather than stubbed: the screen compares
     * drafts with it, and a stub would make the comparison say whatever the mock felt like.
     * Null for anything unidentifiable, because a null must never match (see the store).
     */
    draftIdentity: (pieces = []) =>
      pieces.length && pieces.every((piece) => piece?.localId)
        ? pieces.map((piece) => piece.localId).join('|')
        : null,
    load: jest.fn(async () => null),
    addPiece: jest.fn(async (slot, piece) => stored(slot, piece)),
    removePiece: jest.fn(async () => null),
    updateText: jest.fn(() => null),
    flush: jest.fn(async () => {}),
    startEdit: jest.fn(async () => null),
    getEditFor: jest.fn(async () => null),
    discard: jest.fn(async () => {}),
    // Reports whether it let a draft go. `true` for the unconditional call the save makes;
    // the conditional call's own refusal is driven per-case where it matters.
    clearAfterSave: jest.fn(async () => true),
    __stored: stored,
  };

  return { __esModule: true, ...store, default: store };
});

/**
 * FR-014's negative half, kept honest by a mock rather than by a promise.
 *
 * Nothing in the capture path imports the sync machinery today -- `CaptureScreen`,
 * `CaptureDraftStore`, `PieceList`, `CaptureDock` and `journalBlocks` between them name
 * `SyncQueue` nowhere, and nothing but the schema and the store itself touches the
 * `capture_drafts` table, while the push reads `sync_queue` and `journal_entries` (both
 * searched; see the task report). This mock is what turns that from a fact about today into
 * a test: an import added later that enqueues a draft fails here instead of shipping.
 */
jest.mock('../../../sync/SyncQueue', () => {
  const queue = {
    enqueue: jest.fn(async () => {}),
    enqueueBatch: jest.fn(async () => {}),
    getPendingOperations: jest.fn(async () => []),
    hasPendingOperations: jest.fn(async () => false),
  };
  return {
    __esModule: true,
    SyncQueue: queue,
    default: queue,
    SyncOperationType: {
      CREATE_ENTRY: 'CREATE_ENTRY',
      UPDATE_ENTRY: 'UPDATE_ENTRY',
    },
    OperationStatus: { PENDING: 'pending' },
  };
});

jest.mock('../../../services/CaptureLocation', () => {
  /** What the next stamp finds, or null for "the satellites did not cooperate". */
  let place = null;

  // The real one adds `location` only when it has one, and returns the capture untouched
  // when it has not -- so a piece with no place has no `location` key at all.
  const withLocation = jest.fn(async (capture, existing = null) => {
    const found = existing?.lat != null ? existing : place;
    return found ? { ...capture, location: found } : capture;
  });
  const stampLocation = jest.fn(async () => place);

  const api = {
    withLocation,
    stampLocation,
    setCaptureEnabled: jest.fn(),
    isCaptureEnabled: jest.fn(() => true),
    clearCachedLocation: jest.fn(),
  };

  return {
    __esModule: true,
    ...api,
    default: api,
    __setPlace: (next) => {
      place = next;
    },
  };
});

jest.mock('../../../services/SettingsService', () => {
  const service = {
    getOrCreateDefaultJournal: jest.fn(async () => 'journal-1'),
    getDefaultJournalId: jest.fn(async () => 'journal-1'),
  };
  return { __esModule: true, SettingsService: service, default: service };
});

jest.mock('../../../context/AuthContext', () => ({
  __esModule: true,
  useAuth: jest.fn(() => ({ user: { id: 'user-1' }, isAuthenticated: true })),
}));

jest.mock('../../../hooks/useJournal', () => {
  const createEntry = jest.fn(async () => ({ localId: 'entry-1', date: '2026-11-08' }));
  const updateEntry = jest.fn(async () => ({ localId: 'entry-1' }));
  const useJournal = jest.fn(() => ({
    createEntry,
    updateEntry,
    entries: [],
    loading: false,
    error: null,
  }));
  return {
    __esModule: true,
    useJournal,
    __createEntry: createEntry,
    __updateEntry: updateEntry,
  };
});

jest.mock('../../../components/capture/VoiceRecorderBar', () => {
  const ReactLib = require('react');
  const { View, Text, TouchableOpacity } = require('react-native');

  let mounts = 0;
  let latest = null;
  let clips = 0;

  /**
   * Idle it is the dock's Voice button; recording it is the bar with Stop. One component,
   * both states, because a Voice tap that only revealed a bar would make FR-006's one tap
   * two. `onClip` is called and **not** awaited -- a rejected promise from the screen's
   * handler is invisible here, exactly as in the real component.
   */
  const Mock = (props) => {
    const [recording, setRecording] = ReactLib.useState(false);
    latest = props;

    ReactLib.useEffect(() => {
      mounts += 1;
    }, []);

    const start = () => {
      setRecording(true);
      props.onRecordingChange?.(true);
    };

    const stop = () => {
      clips += 1;
      setRecording(false);
      props.onRecordingChange?.(false);
      props.onClip?.({
        uri: `file:///cache/clip-${clips}.m4a`,
        duration: 30 + clips,
        waveform: [0.3, 0.6, 0.2],
        capturedAt: `2026-11-08T0${7 + clips}:00:00.000Z`,
      });
    };

    if (!recording) {
      return (
        <TouchableOpacity testID="voice-record-button" style={props.style} onPress={start}>
          <Text>Voice</Text>
        </TouchableOpacity>
      );
    }

    return (
      <View testID="voice-recorder-bar" style={props.style}>
        <TouchableOpacity testID="voice-stop-button" onPress={stop}>
          <Text>Stop</Text>
        </TouchableOpacity>
      </View>
    );
  };

  Mock.displayName = 'VoiceRecorderBarMock';

  return {
    __esModule: true,
    default: Mock,
    MAX_CLIP_MS: 5 * 60 * 1000,
    __props: () => latest,
    __mounts: () => mounts,
    __reset: () => {
      mounts = 0;
      latest = null;
      clips = 0;
    },
  };
});

jest.mock('../../../components/capture/DualShutterCamera', () => {
  const ReactLib = require('react');
  const { View, TouchableOpacity } = require('react-native');

  let mounts = 0;
  let latest = null;
  let shots = 0;

  /**
   * The real control structure: Close, Photo, Video, Done, no mode switch. Video starts on
   * one tap and stops on the next, so the tap count is counted against what the real
   * component asks for. There is no `onRecordingChange`: it is full screen and owns its own
   * indicator. `onShot` is called, not awaited.
   */
  const Mock = (props) => {
    const [recording, setRecording] = ReactLib.useState(false);
    latest = props;

    ReactLib.useEffect(() => {
      mounts += 1;
    }, []);

    const photo = () => {
      shots += 1;
      props.onShot?.({
        kind: 'photo',
        uri: `file:///cache/photo-${shots}.jpg`,
        width: 4032,
        height: 3024,
        capturedAt: '2026-11-08T08:57:00.000Z',
      });
    };

    const video = () => {
      if (!recording) {
        setRecording(true);
        return;
      }
      setRecording(false);
      shots += 1;
      // A video carries no width/height: `recordAsync` returns only `{ uri }`.
      props.onShot?.({
        kind: 'video',
        uri: `file:///cache/video-${shots}.mov`,
        duration: 12,
        capturedAt: '2026-11-08T09:00:00.000Z',
      });
    };

    return (
      <View testID="dual-shutter-camera" style={props.style}>
        <TouchableOpacity testID="camera-close-button" onPress={props.onClose} />
        <TouchableOpacity testID="camera-photo-button" onPress={photo} />
        <TouchableOpacity testID="camera-video-button" onPress={video} />
        <TouchableOpacity testID="camera-done-button" onPress={props.onDone} />
      </View>
    );
  };

  Mock.displayName = 'DualShutterCameraMock';

  return {
    __esModule: true,
    default: Mock,
    __props: () => latest,
    __mounts: () => mounts,
    __reset: () => {
      mounts = 0;
      latest = null;
      shots = 0;
    },
  };
});

jest.mock('../../../components/capture/SaveAudienceSheet', () => {
  const ReactLib = require('react');
  const { View, TouchableOpacity } = require('react-native');

  const AUDIENCE_OPTIONS = [
    { value: 'private', label: 'Only me' },
    { value: 'family', label: 'Family' },
    { value: 'friends', label: 'Friends' },
    { value: 'family_friends', label: 'Family & Friends' },
  ];

  /** `{visible, onChoose, onDismiss}` and nothing else; one tap on an option saves. */
  const Mock = ({ visible, onChoose, onDismiss }) => {
    if (!visible) return null;
    return (
      <View testID="audience-sheet">
        {AUDIENCE_OPTIONS.map(({ value }) => (
          <TouchableOpacity
            key={value}
            testID={`audience-option-${value}`}
            onPress={() => onChoose?.(value)}
          />
        ))}
        <TouchableOpacity testID="audience-sheet-cancel-button" onPress={onDismiss} />
      </View>
    );
  };

  Mock.displayName = 'SaveAudienceSheetMock';

  return { __esModule: true, default: Mock, SaveAudienceSheet: Mock, AUDIENCE_OPTIONS };
});

import CaptureDraftStore from '../../../services/CaptureDraftStore';
import { SyncQueue } from '../../../sync/SyncQueue';
import CaptureLocation from '../../../services/CaptureLocation';
import * as captureLocationModule from '../../../services/CaptureLocation';
import * as journalHook from '../../../hooks/useJournal';
import * as voiceBar from '../../../components/capture/VoiceRecorderBar';
import * as dualCamera from '../../../components/capture/DualShutterCamera';
import CaptureScreen from '../CaptureScreen';

global.IS_REACT_ACT_ENVIRONMENT = true;

// ============================================================
// Helpers
// ============================================================

/** A place with a name, as an edited memory's piece carries one. */
const ARCADE = { lat: 51.5074, lng: -0.1278, name: 'Old arcade, Bridge St', accuracy: 12 };

const createEntry = journalHook.__createEntry;

let trees = [];
let navigation;
let focusSpy;
let warnSpy;
let errorSpy;
/**
 * Every tap the test makes, counted. SC-001 is a budget on taps, so the only honest way to
 * check it is to count them as they are made rather than to re-derive the number by hand.
 */
let taps = 0;

const render = async (params = { mode: 'new' }) => {
  let tree;
  await act(async () => {
    // Awaited: `@expo/vector-icons` loads its font asynchronously and sets state when it
    // resolves, and the mount reads the draft store.
    tree = renderer.create(<CaptureScreen route={{ params }} navigation={navigation} />);
  });
  trees.push(tree);
  return tree;
};

const nodeAt = (tree, testID) => tree.root.findAll((n) => n.props?.testID === testID)[0];

const has = (tree, testID) => tree.root.findAll((n) => n.props?.testID === testID).length > 0;

const pressable = (tree, testID) =>
  tree.root.findAll((n) => n.props?.testID === testID && typeof n.props?.onPress === 'function')[0];

const textAt = (tree, testID) => {
  const node = nodeAt(tree, testID);
  if (!node) return undefined;
  const { children } = node.props;
  return Array.isArray(children) ? children.join('') : String(children);
};

/** One tap, counted. */
const tap = async (tree, testID) => {
  const target = pressable(tree, testID);
  expect(target).toBeDefined();
  taps += 1;
  await act(async () => {
    target.props.onPress();
  });
};

/** The keyboard leaving a note, which is one of FR-012's write triggers (research R7). */
const blur = async (tree, testID) => {
  const input = tree.root.findAll(
    (n) => n.props?.testID === testID && typeof n.props?.onBlur === 'function',
  )[0];
  expect(input).toBeDefined();
  await act(async () => {
    input.props.onBlur();
  });
};

const type = async (tree, testID, value) => {
  const input = tree.root.findAll(
    (n) => n.props?.testID === testID && typeof n.props?.onChangeText === 'function',
  )[0];
  expect(input).toBeDefined();
  await act(async () => {
    input.props.onChangeText(value);
  });
};

/**
 * Every text field on screen, by testID. De-duplicated, because a React Native composite
 * and the host element it renders both carry the props, so `findAll` sees each twice.
 */
const inputs = (tree) =>
  Array.from(
    new Set(
      tree.root
        .findAll((n) => typeof n.props?.testID === 'string' && n.props?.onChangeText)
        .map((n) => n.props.testID),
    ),
  );

const valueAt = (tree, testID) =>
  tree.root.findAll((n) => n.props?.testID === testID && n.props?.onChangeText)[0]?.props?.value;

/** Every row on screen, as `kind | time | place`, in order. */
const rows = (tree) =>
  Array.from(
    new Set(
      tree.root
        .findAll(
          (n) => typeof n.props?.testID === 'string' && /^piece-row-\d+$/.test(n.props.testID),
        )
        .map((n) => n.props.testID),
    ),
  )
    .map((testID) => Number(testID.replace('piece-row-', '')))
    .sort((a, b) => a - b)
    .map((index) =>
      [
        textAt(tree, `piece-kind-${index}`),
        textAt(tree, `piece-time-${index}`),
        textAt(tree, `piece-place-${index}`),
      ].join(' | '),
    );

/**
 * Every `AppState` listener the screen registered, and the subscription it was handed back.
 * The phone locking, a call arriving and the app switcher are all this one event, and it is
 * the only one of FR-012's triggers jest can drive at all (the lock screen itself is the
 * owner's device check Q-D1).
 */
let appStateListeners = [];
let appStateSubscriptions = [];

/** The app changes state, the way `AppState` delivers it. */
const appStateGoes = async (next) => {
  const listeners = appStateListeners.filter(({ type: event }) => event === 'change');
  expect(listeners.length).toBeGreaterThan(0);
  await act(async () => {
    listeners.forEach(({ listener }) => listener(next));
  });
};

/** A promise the test resolves or rejects when it chooses. */
const deferred = () => {
  let settle;
  let fail;
  const promise = new Promise((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  return { promise, settle, fail };
};

beforeEach(() => {
  jest.clearAllMocks();
  voiceBar.__reset();
  dualCamera.__reset();
  captureLocationModule.__setPlace(null);

  CaptureDraftStore.load.mockImplementation(async () => null);
  CaptureDraftStore.addPiece.mockImplementation(async (slot, piece) =>
    piece?.uri ? { ...piece, uri: `file:///documents/capture-drafts/${slot}/${piece.localId}` } : piece,
  );
  // Resolves `true`: the store reports whether it let a draft go, and the conditional form
  // (`onlyIfIdentity`) can answer `false` without that being a failure. A case that needs the
  // refusal says so itself.
  CaptureDraftStore.clearAfterSave.mockImplementation(async () => true);
  CaptureDraftStore.discard.mockImplementation(async () => {});
  createEntry.mockImplementation(async () => ({ localId: 'entry-1', date: '2026-11-08' }));

  navigation = { goBack: jest.fn(), navigate: jest.fn(), setOptions: jest.fn() };
  taps = 0;

  appStateListeners = [];
  appStateSubscriptions = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((event, listener) => {
    const subscription = { remove: jest.fn() };
    appStateListeners.push({ type: event, listener });
    appStateSubscriptions.push(subscription);
    return subscription;
  });

  // Real focus on a mocked native input does nothing useful, and this is how the test can
  // see *which* input the screen asked for (`spy.mock.instances[i].props.testID`).
  focusSpy = jest.spyOn(TextInput.prototype, 'focus').mockImplementation(() => {});
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(Linking, 'openSettings').mockImplementation(() => {});

  // A third of this suite drives a failure on purpose, and the screen logs each one, so a
  // plain run would bury the result in its own expected output. The screen's own lines are
  // captured and asserted on where they matter; **everything else still prints**, so React's
  // "not wrapped in act" warnings -- which arrive through `console.error` -- stay visible.
  const printWarn = console.warn;
  const printError = console.error;
  const mine = (args) => typeof args[0] === 'string' && args[0].startsWith('[CaptureScreen]');
  warnSpy = jest.spyOn(console, 'warn').mockImplementation((...args) => {
    if (!mine(args)) printWarn(...args);
  });
  errorSpy = jest.spyOn(console, 'error').mockImplementation((...args) => {
    if (!mine(args)) printError(...args);
  });
});

afterEach(() => {
  trees.forEach((tree) => {
    try {
      act(() => tree.unmount());
    } catch {
      // Already gone.
    }
  });
  trees = [];
  jest.restoreAllMocks();
});

// ============================================================
// FR-002 -- the dock is always there
// ============================================================

describe('CaptureScreen: Type, Voice and Camera are always visible (FR-002)', () => {
  it('shows all three with nothing captured yet', async () => {
    const tree = await render();

    expect(has(tree, 'capture-dock')).toBe(true);
    expect(pressable(tree, 'capture-type-button')).toBeDefined();
    expect(pressable(tree, 'voice-record-button')).toBeDefined();
    expect(pressable(tree, 'capture-camera-button')).toBeDefined();
  });

  it('keeps all three while a recording is running', async () => {
    const tree = await render();

    await tap(tree, 'voice-record-button');

    // The bar has taken the Voice slot, and Type and Camera are still there and still live.
    expect(has(tree, 'voice-recorder-bar')).toBe(true);
    expect(pressable(tree, 'capture-type-button').props.disabled).toBeFalsy();
    expect(pressable(tree, 'capture-camera-button').props.disabled).toBeFalsy();
  });

  /**
   * 013 T054 (fix round 1). A saved clip's row carries a play control, and playing asks the one
   * shared audio session for `allowsRecording: false` -- the very call `VoiceRecorderBar` uses
   * to *release* the session when a clip is finished. The rows sit in a plain `ScrollView`
   * directly above the dock, so a thumb reaches one easily while the bar is recording, and the
   * recording would end mid-sentence. FR-007 is about recording surviving the lock screen;
   * being stopped by a tap in the app's own UI is worse than that.
   */
  it('deadens a saved clip\'s play control while a recording is running (FR-007)', async () => {
    const tree = await render();

    // One clip recorded and kept, so there is a row with a player on it...
    await tap(tree, 'voice-record-button');
    await tap(tree, 'voice-stop-button');
    expect(pressable(tree, 'piece-player-0-toggle').props.disabled).toBeFalsy();

    // ...and now a second recording is running over it.
    await tap(tree, 'voice-record-button');

    expect(has(tree, 'voice-recorder-bar')).toBe(true);
    expect(pressable(tree, 'piece-player-0-toggle').props.disabled).toBe(true);

    // It comes back the moment the recording is over.
    await tap(tree, 'voice-stop-button');
    expect(pressable(tree, 'piece-player-0-toggle').props.disabled).toBeFalsy();
  });

  it('mounts the voice component once, and never remounts it', async () => {
    const tree = await render();

    expect(voiceBar.__mounts()).toBe(1);

    // A remount is not cosmetic: the recorder, the elapsed time and the audio session all
    // live inside that component, so moving it in the tree would end the recording it is in
    // the middle of. The recording bar is therefore a restyle of the same element, and the
    // camera is an overlay over this screen rather than a replacement for it.
    await tap(tree, 'voice-record-button');
    expect(voiceBar.__mounts()).toBe(1);

    await tap(tree, 'capture-camera-button');
    expect(voiceBar.__mounts()).toBe(1);

    await tap(tree, 'camera-close-button');
    expect(voiceBar.__mounts()).toBe(1);
  });
});

// ============================================================
// Type
// ============================================================

describe('CaptureScreen: Type adds a note, or goes back to the last one', () => {
  it('adds a text piece through the draft store, and focuses it', async () => {
    const tree = await render();

    await tap(tree, 'capture-type-button');

    expect(CaptureDraftStore.addPiece).toHaveBeenCalledTimes(1);
    const [slot, piece] = CaptureDraftStore.addPiece.mock.calls[0];
    expect(slot).toBe('new');
    expect(piece.kind).toBe('text');
    expect(piece.content).toBe('');
    expect(typeof piece.localId).toBe('string');
    expect(piece.localId.length).toBeGreaterThan(0);
    // An instant, never a civil date (FR-004, constitution).
    expect(piece.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    expect(valueAt(tree, 'piece-note-input-0')).toBe('');
    expect(focusSpy.mock.instances.map((i) => i?.props?.testID)).toContain('piece-note-input-0');
  });

  it('focuses the note already at the end instead of stacking a second empty one', async () => {
    const tree = await render();

    await tap(tree, 'capture-type-button');
    expect(CaptureDraftStore.addPiece).toHaveBeenCalledTimes(1);
    focusSpy.mockClear();

    await tap(tree, 'capture-type-button');

    // No second note, and the keyboard goes back to the one that is there.
    expect(CaptureDraftStore.addPiece).toHaveBeenCalledTimes(1);
    expect(rows(tree)).toHaveLength(1);
    expect(focusSpy.mock.instances.map((i) => i?.props?.testID)).toContain('piece-note-input-0');
  });

  it('adds a second note when the last piece is not a note, keeping capture order (FR-005)', async () => {
    const tree = await render();

    await tap(tree, 'capture-type-button');
    await type(tree, 'piece-note-input-0', 'On the 34 bus');
    await tap(tree, 'voice-record-button');
    await tap(tree, 'voice-stop-button');
    await tap(tree, 'capture-type-button');

    // note, clip, note -- the note keeps its place rather than being hoisted to the top.
    expect(
      CaptureDraftStore.addPiece.mock.calls.map(([, piece]) => piece.kind),
    ).toEqual(['text', 'audio', 'text']);
    expect(rows(tree)).toHaveLength(3);
    expect(textAt(tree, 'piece-kind-0')).toMatch(/note/i);
    expect(textAt(tree, 'piece-kind-1')).toMatch(/voice/i);
    expect(textAt(tree, 'piece-kind-2')).toMatch(/note/i);
  });

  it('leaves one note, not two, when Type is double-tapped', async () => {
    const tree = await render();
    const button = pressable(tree, 'capture-type-button');

    // Both presses land before the first `addPiece` has resolved, so neither can see the
    // note the other is adding. Not counted through `tap()`: this is one intent, mis-hit.
    await act(async () => {
      button.props.onPress();
      button.props.onPress();
    });

    expect(CaptureDraftStore.addPiece).toHaveBeenCalledTimes(1);
    expect(rows(tree)).toHaveLength(1);
  });

  it('keeps every keystroke in the draft store (FR-012)', async () => {
    const tree = await render();

    await tap(tree, 'capture-type-button');
    await type(tree, 'piece-note-input-0', 'On the 34 bus');

    const localId = CaptureDraftStore.addPiece.mock.calls[0][1].localId;
    expect(CaptureDraftStore.updateText).toHaveBeenLastCalledWith('new', localId, 'On the 34 bus');
    expect(valueAt(tree, 'piece-note-input-0')).toBe('On the 34 bus');
  });
});

// ============================================================
// FR-003 -- switching loses nothing
// ============================================================

describe('CaptureScreen: switching between typing, voice and camera loses nothing (FR-003)', () => {
  it('leaves text typed before Voice exactly as typed', async () => {
    const tree = await render();

    await tap(tree, 'capture-type-button');
    await type(tree, 'piece-note-input-0', 'On the 34 bus, almost at Market Sq');

    await tap(tree, 'voice-record-button');

    // The defect this feature removes: today's composer discards typed text when the
    // microphone opens. Recording has started and the note is untouched.
    expect(has(tree, 'voice-recorder-bar')).toBe(true);
    expect(valueAt(tree, 'piece-note-input-0')).toBe('On the 34 bus, almost at Market Sq');

    await tap(tree, 'voice-stop-button');

    expect(valueAt(tree, 'piece-note-input-0')).toBe('On the 34 bus, almost at Market Sq');
    expect(rows(tree)[0]).toMatch(/note/i);
  });

  it('leaves text typed before the camera exactly as typed, and the pieces in order', async () => {
    const tree = await render();

    await tap(tree, 'capture-type-button');
    await type(tree, 'piece-note-input-0', 'Street band by the fountain');

    await tap(tree, 'capture-camera-button');
    await tap(tree, 'camera-photo-button');
    await tap(tree, 'camera-done-button');

    expect(valueAt(tree, 'piece-note-input-0')).toBe('Street band by the fountain');
    expect(rows(tree)).toHaveLength(2);
    expect(textAt(tree, 'piece-kind-1')).toMatch(/photo/i);
    // Back on the capture screen: the camera is an overlay, not a replacement.
    expect(has(tree, 'dual-shutter-camera')).toBe(false);
    expect(has(tree, 'capture-dock')).toBe(true);
  });
});

// ============================================================
// FR-004 -- every piece goes through the store, stamped with its place
// ============================================================

describe('CaptureScreen: every capture becomes a piece through the store (FR-004)', () => {
  it('adds a clip through addPiece, stamped by CaptureLocation.withLocation', async () => {
    captureLocationModule.__setPlace(ARCADE);
    const tree = await render();

    await tap(tree, 'voice-record-button');
    await tap(tree, 'voice-stop-button');

    expect(CaptureLocation.withLocation).toHaveBeenCalledTimes(1);
    expect(CaptureDraftStore.addPiece).toHaveBeenCalledTimes(1);

    const [slot, piece] = CaptureDraftStore.addPiece.mock.calls[0];
    expect(slot).toBe('new');
    expect(piece.kind).toBe('audio');
    // The stamp reached the store, which can only be true if it happened first.
    expect(piece.location).toEqual(ARCADE);
    expect(piece.capturedAt).toBe('2026-11-08T08:00:00.000Z'); // the start instant, in seconds
    expect(piece.duration).toBe(31);
    expect(piece.waveform).toEqual([0.3, 0.6, 0.2]);
    expect(piece.uri).toBe('file:///cache/clip-1.m4a');
  });

  it('adds a photo and a video through addPiece, each stamped', async () => {
    captureLocationModule.__setPlace(ARCADE);
    const tree = await render();

    await tap(tree, 'capture-camera-button');
    await tap(tree, 'camera-photo-button');
    await tap(tree, 'camera-video-button');
    await tap(tree, 'camera-video-button');

    expect(CaptureLocation.withLocation).toHaveBeenCalledTimes(2);
    const added = CaptureDraftStore.addPiece.mock.calls.map(([, piece]) => piece);

    expect(added.map((piece) => piece.kind)).toEqual(['photo', 'video']);
    expect(added[0]).toMatchObject({
      uri: 'file:///cache/photo-1.jpg',
      width: 4032,
      height: 3024,
      capturedAt: '2026-11-08T08:57:00.000Z',
      location: ARCADE,
    });
    expect(added[1]).toMatchObject({
      uri: 'file:///cache/video-2.mov',
      duration: 12,
      capturedAt: '2026-11-08T09:00:00.000Z',
      location: ARCADE,
    });
    // `recordAsync` returns only `{uri}`, so a video piece carries no dimensions at all.
    expect(added[1].width).toBeUndefined();
    expect(added[1].height).toBeUndefined();
  });

  it('keeps the piece the store returns, so the memory never points at a cache file', async () => {
    const tree = await render();

    await tap(tree, 'capture-camera-button');
    await tap(tree, 'camera-photo-button');
    await tap(tree, 'camera-done-button');
    await tap(tree, 'capture-save-button');
    await tap(tree, 'audience-option-family');

    // `addPiece`'s `adoptMedia` copies the file somewhere durable *before* the piece is
    // recorded, and hands back the piece pointing at the copy. A screen that kept the raw
    // cache uri it handed in would store a piece that exists and points at nothing once the
    // system purges the cache.
    const localId = CaptureDraftStore.addPiece.mock.calls[0][1].localId;
    const blocks = createEntry.mock.calls[0][0].contentBlocks;
    expect(blocks[0].media[0].localPath).toBe(
      `file:///documents/capture-drafts/new/${localId}`,
    );
    expect(JSON.stringify(blocks)).not.toContain('file:///cache/');
  });

  it('keeps a piece with no place, with no location at all (edge case: no fix)', async () => {
    captureLocationModule.__setPlace(null);
    const tree = await render();

    await tap(tree, 'voice-record-button');
    await tap(tree, 'voice-stop-button');

    const [, piece] = CaptureDraftStore.addPiece.mock.calls[0];
    expect(piece.location).toBeUndefined();
    expect(rows(tree)).toHaveLength(1);
  });
});

// ============================================================
// FR-004/FR-005 -- the rows
// ============================================================

describe('CaptureScreen: rows read kind, local time and place (FR-004, FR-005)', () => {
  it('shows each kind, a zero-padded local HH:mm, and the place name', async () => {
    const tree = await render();

    // Built from local time, so the expected string holds in any zone the suite runs in.
    const morning = new Date(2026, 10, 8, 8, 41).toISOString();
    const evening = new Date(2026, 10, 8, 21, 7).toISOString();

    await act(async () => {
      voiceBar.__props().onClip({
        uri: 'file:///cache/clip-a.m4a',
        duration: 48,
        waveform: [],
        capturedAt: morning,
      });
    });
    captureLocationModule.__setPlace(ARCADE);
    await act(async () => {
      voiceBar.__props().onClip({
        uri: 'file:///cache/clip-b.m4a',
        duration: 31,
        waveform: [],
        capturedAt: evening,
      });
    });

    expect(textAt(tree, 'piece-time-0')).toBe('08:41');
    expect(textAt(tree, 'piece-time-1')).toBe('21:07');
    expect(textAt(tree, 'piece-place-0')).toBe('No place');
    expect(textAt(tree, 'piece-place-1')).toBe('Old arcade, Bridge St');
    expect(textAt(tree, 'piece-kind-0')).toMatch(/voice/i);
  });

  it('reads the instant, not a slice of the string: two spellings of one moment agree', async () => {
    const tree = await render();

    // The same instant, written two ways. A row built by slicing characters out of the
    // string would show 23:41 for the first and 18:11 for the second.
    await act(async () => {
      voiceBar.__props().onClip({
        uri: 'file:///cache/clip-a.m4a',
        duration: 1,
        waveform: [],
        capturedAt: '2026-11-08T23:41:00.000+05:30',
      });
    });
    await act(async () => {
      voiceBar.__props().onClip({
        uri: 'file:///cache/clip-b.m4a',
        duration: 1,
        waveform: [],
        capturedAt: '2026-11-08T18:11:00.000Z',
      });
    });

    expect(textAt(tree, 'piece-time-0')).toBe(textAt(tree, 'piece-time-1'));
  });

  it('says a place was recorded when there is a coordinate but no name yet', async () => {
    // Capture stamps `{lat, lng, accuracy}`; a name only arrives with a place that has one
    // (an edited memory's block). "No place" would be untrue here -- the place *was* kept.
    captureLocationModule.__setPlace({ lat: 51.5074, lng: -0.1278, accuracy: 9 });
    const tree = await render();

    await tap(tree, 'voice-record-button');
    await tap(tree, 'voice-stop-button');

    expect(textAt(tree, 'piece-place-0')).toBe('Place recorded');
    expect(textAt(tree, 'piece-place-0')).not.toBe('No place');
  });

  it('shows --:-- rather than a wrong time when a piece carries no usable instant', async () => {
    // A draft written by an older build, or by some other producer, can reach this list with
    // no `capturedAt` at all or with something a `Date` cannot read. Both are shown as "no
    // time known" rather than as the epoch, which would read as 1 January 1970 at 00:00 --
    // a time the row would present as fact.
    CaptureDraftStore.load.mockImplementation(async () => ({
      id: 'new',
      entryLocalId: null,
      createdAt: '2026-11-08T08:00:00.000Z',
      updatedAt: '2026-11-08T08:00:00.000Z',
      pieces: [
        { localId: 'p1', kind: 'photo', uri: 'file:///documents/capture-drafts/new/p1.jpg' },
        {
          localId: 'p2',
          kind: 'photo',
          uri: 'file:///documents/capture-drafts/new/p2.jpg',
          capturedAt: 'the afternoon',
        },
      ],
    }));

    const tree = await render();

    expect(textAt(tree, 'piece-time-0')).toBe('--:--');
    expect(textAt(tree, 'piece-time-1')).toBe('--:--');
  });

  it('lists pieces in capture order, with no kind grouping (FR-005)', async () => {
    const tree = await render();

    // Sam's walk: note, clip, photo, photo, video, clip.
    await tap(tree, 'capture-type-button');
    await tap(tree, 'voice-record-button');
    await tap(tree, 'voice-stop-button');
    await tap(tree, 'capture-camera-button');
    await tap(tree, 'camera-photo-button');
    await tap(tree, 'camera-photo-button');
    await tap(tree, 'camera-video-button');
    await tap(tree, 'camera-video-button');
    await tap(tree, 'camera-done-button');
    await tap(tree, 'voice-record-button');
    await tap(tree, 'voice-stop-button');

    expect(
      rows(tree).map((row) => row.split(' | ')[0].toLowerCase()),
    ).toEqual(['note', 'voice clip', 'photo', 'photo', 'video', 'voice clip']);
  });
});

// ============================================================
// FR-012 -- the status line
// ============================================================

describe('CaptureScreen: the status line says the draft is kept (FR-012)', () => {
  it('reads "Draft kept · n pieces", counting up with every piece', async () => {
    const tree = await render();

    // Nothing captured is no draft: the lifecycle in data-model.md starts at the first
    // piece, so there is nothing to reassure anyone about yet.
    expect(has(tree, 'capture-status-line')).toBe(false);

    await tap(tree, 'capture-type-button');
    expect(textAt(tree, 'capture-status-line')).toBe('Draft kept · 1 piece');

    await tap(tree, 'voice-record-button');
    await tap(tree, 'voice-stop-button');
    expect(textAt(tree, 'capture-status-line')).toBe('Draft kept · 2 pieces');

    await tap(tree, 'capture-camera-button');
    await tap(tree, 'camera-photo-button');
    await tap(tree, 'camera-done-button');
    expect(textAt(tree, 'capture-status-line')).toBe('Draft kept · 3 pieces');
  });
});

// ============================================================
// The header (UI contract)
// ============================================================

describe('CaptureScreen: the header (UI contract)', () => {
  it('is Close, "New memory" and Save', async () => {
    const tree = await render();

    expect(textAt(tree, 'capture-title')).toBe('New memory');
    expect(pressable(tree, 'capture-close-button')).toBeDefined();
    expect(pressable(tree, 'capture-save-button')).toBeDefined();
  });

  it('disables Save with zero pieces, and enables it with one', async () => {
    const tree = await render();

    expect(pressable(tree, 'capture-save-button').props.disabled).toBe(true);
    expect(nodeAt(tree, 'capture-save-button').props.accessibilityState).toMatchObject({
      disabled: true,
    });

    // And it really does nothing: the sheet is a save, and there is nothing to save.
    await tap(tree, 'capture-save-button');
    expect(has(tree, 'audience-sheet')).toBe(false);

    await tap(tree, 'capture-type-button');
    expect(pressable(tree, 'capture-save-button').props.disabled).toBe(false);
  });

  it('never discards on Close -- it only leaves', async () => {
    const tree = await render();

    await tap(tree, 'capture-type-button');
    await tap(tree, 'capture-close-button');

    expect(CaptureDraftStore.discard).not.toHaveBeenCalled();
    expect(CaptureDraftStore.clearAfterSave).not.toHaveBeenCalled();
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('offers Discard behind the overflow, and asks before throwing anything away (FR-015)', async () => {
    const tree = await render();

    await tap(tree, 'capture-type-button');
    await tap(tree, 'capture-overflow-button');
    await tap(tree, 'capture-discard-button');

    // Asked, not done.
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(CaptureDraftStore.discard).not.toHaveBeenCalled();

    const [, , buttons] = Alert.alert.mock.calls[0];
    const confirm = buttons.find((button) => button.style === 'destructive');
    expect(confirm).toBeDefined();
    await act(async () => {
      confirm.onPress();
    });

    expect(CaptureDraftStore.discard).toHaveBeenCalledWith('new');
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// FR-010 / FR-016 -- saving
// ============================================================

describe('CaptureScreen: Save asks only who can see it (FR-010)', () => {
  it('opens the sheet, and Family saves with the Family audience and no title', async () => {
    const tree = await render();

    await tap(tree, 'capture-type-button');
    await type(tree, 'piece-note-input-0', 'On the 34 bus');

    // No field anywhere but the note itself: no title is asked for, before or after Save.
    expect(inputs(tree)).toEqual(['piece-note-input-0']);

    await tap(tree, 'capture-save-button');
    expect(has(tree, 'audience-sheet')).toBe(true);
    expect(createEntry).not.toHaveBeenCalled();
    expect(inputs(tree)).toEqual(['piece-note-input-0']);

    await tap(tree, 'audience-option-family');

    expect(createEntry).toHaveBeenCalledTimes(1);
    const entryData = createEntry.mock.calls[0][0];
    expect(entryData.visibility).toBe('family');
    expect(entryData.title).toBeUndefined();
    expect(entryData.contentBlocks).toEqual([
      {
        type: 'text',
        content: 'On the 34 bus',
        location: undefined,
        capturedAt: CaptureDraftStore.addPiece.mock.calls[0][1].capturedAt,
      },
    ]);
  });

  it('sends exactly the blocks buildContentBlocks makes of the pieces, in capture order', async () => {
    captureLocationModule.__setPlace(ARCADE);
    const tree = await render();

    await tap(tree, 'capture-type-button');
    await type(tree, 'piece-note-input-0', 'On the 34 bus');
    await tap(tree, 'capture-camera-button');
    await tap(tree, 'camera-photo-button');
    await tap(tree, 'camera-photo-button');
    await tap(tree, 'camera-done-button');
    await tap(tree, 'voice-record-button');
    await tap(tree, 'voice-stop-button');
    await tap(tree, 'capture-save-button');
    await tap(tree, 'audience-option-family');

    const { contentBlocks } = createEntry.mock.calls[0][0];
    // The note keeps its place (never hoisted), the two photos become one block, the clip
    // follows -- and every media item carries its own capture time.
    expect(contentBlocks.map((block) => block.type)).toEqual(['text', 'photos', 'audio']);
    expect(contentBlocks[1].media).toHaveLength(2);
    expect(contentBlocks[1].media.every((item) => item.capturedAt)).toBe(true);
    expect(contentBlocks[2].capturedAt).toBeUndefined(); // a block with media carries none
  });

  it('passes the four audience values through untouched', async () => {
    for (const value of ['private', 'family', 'friends', 'family_friends']) {
      createEntry.mockClear();
      const tree = await render();
      await tap(tree, 'capture-type-button');
      await tap(tree, 'capture-save-button');
      await tap(tree, `audience-option-${value}`);
      expect(createEntry.mock.calls[0][0].visibility).toBe(value);
    }
  });

  it('will not start a save while a recording is still running', async () => {
    const tree = await render();

    await tap(tree, 'capture-type-button');
    await tap(tree, 'voice-record-button');

    // The clip does not exist until Stop, and a save that completed first would clear the
    // draft -- row and media folder together -- out from under the clip still being
    // recorded. SC-002 is zero pieces lost, so the screen says what to do instead of
    // racing. It costs no tap in the Sam scenario: she taps Stop before Save anyway.
    await tap(tree, 'capture-save-button');

    expect(has(tree, 'audience-sheet')).toBe(false);
    expect(createEntry).not.toHaveBeenCalled();
    expect(textAt(tree, 'capture-capture-error')).toMatch(/still recording|stop/i);

    await tap(tree, 'voice-stop-button');
    await tap(tree, 'capture-save-button');
    expect(has(tree, 'audience-sheet')).toBe(true);
  });

  it('will not start a save while a capture is still on its way into the draft', async () => {
    const tree = await render();

    // One note, so Save is live at all.
    await tap(tree, 'capture-type-button');

    // A cold GPS: `CaptureLocation.withLocation` waits up to its four-second fix timeout
    // before the piece is even offered to the store, so there is a window of seconds between
    // the shutter and the photo existing as a piece.
    const fix = deferred();
    CaptureLocation.withLocation.mockImplementationOnce(async (capture) => {
      await fix.promise;
      return capture;
    });

    await tap(tree, 'capture-camera-button');
    await tap(tree, 'camera-photo-button');
    await tap(tree, 'camera-done-button');

    // The photo has been taken and is in `pieces` nowhere.
    expect(rows(tree)).toHaveLength(1);

    // Photo -> Done -> Save -> Family is three taps, comfortably inside that window. A save
    // that went ahead here would build its blocks from a `pieces` without the photo, save the
    // memory without it, clear the draft the photo was about to be written into, and close
    // the screen -- and nothing would say a piece had been dropped. SC-002 is zero pieces
    // lost, so Save waits and says so, the same shape as the recording guard above.
    await tap(tree, 'capture-save-button');

    expect(has(tree, 'audience-sheet')).toBe(false);
    expect(createEntry).not.toHaveBeenCalled();
    expect(CaptureDraftStore.clearAfterSave).not.toHaveBeenCalled();
    expect(navigation.goBack).not.toHaveBeenCalled();
    expect(textAt(tree, 'capture-capture-error')).toMatch(/moment|still keeping/i);

    // And it costs no tap in the Sam walk: the moment the stamp lands the photo is a piece,
    // Save works as it always does, and the memory carries the photo.
    await act(async () => {
      fix.settle(null);
    });
    expect(rows(tree)).toHaveLength(2);

    await tap(tree, 'capture-save-button');
    await tap(tree, 'audience-option-family');

    expect(createEntry).toHaveBeenCalledTimes(1);
    expect(createEntry.mock.calls[0][0].contentBlocks.map((block) => block.type)).toEqual([
      'photos',
    ]);
  });

  it('saves nothing when the sheet is dismissed (FR-011, sharing fails closed)', async () => {
    const tree = await render();

    await tap(tree, 'capture-type-button');
    await tap(tree, 'capture-save-button');
    await tap(tree, 'audience-sheet-cancel-button');

    expect(createEntry).not.toHaveBeenCalled();
    expect(CaptureDraftStore.clearAfterSave).not.toHaveBeenCalled();
    expect(has(tree, 'audience-sheet')).toBe(false);
    // Still there, with everything on it.
    expect(rows(tree)).toHaveLength(1);
  });
});

describe('CaptureScreen: the draft is let go only after the memory is saved (FR-016, M4)', () => {
  it('does not clear the draft until createEntry has resolved', async () => {
    const save = deferred();
    createEntry.mockImplementation(() => save.promise);

    const tree = await render();
    await tap(tree, 'capture-type-button');
    await tap(tree, 'capture-save-button');
    await tap(tree, 'audience-option-family');

    // The save is in flight. FR-016 is an *ordering*: the unsaved memory is the only copy
    // there is until the phone has written the real one, so clearing it here -- or in
    // parallel with the write -- is the one move that can lose a memory outright.
    expect(createEntry).toHaveBeenCalledTimes(1);
    expect(CaptureDraftStore.clearAfterSave).not.toHaveBeenCalled();
    expect(navigation.goBack).not.toHaveBeenCalled();

    await act(async () => {
      save.settle({ localId: 'entry-1', date: '2026-11-08' });
    });

    expect(CaptureDraftStore.clearAfterSave).toHaveBeenCalledTimes(1);
    expect(CaptureDraftStore.clearAfterSave).toHaveBeenCalledWith('new');
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('leaves the draft alone when the save fails, and says the memory is still here', async () => {
    const save = deferred();
    createEntry.mockImplementation(() => save.promise);

    const tree = await render();
    await tap(tree, 'capture-type-button');
    await type(tree, 'piece-note-input-0', 'On the 34 bus');
    await tap(tree, 'capture-save-button');
    await tap(tree, 'audience-option-family');

    await act(async () => {
      save.fail(new Error('disk full'));
    });

    expect(CaptureDraftStore.clearAfterSave).not.toHaveBeenCalled();
    expect(CaptureDraftStore.discard).not.toHaveBeenCalled();
    expect(navigation.goBack).not.toHaveBeenCalled();
    // The screen stays, with everything on it, and says so (FR-017).
    expect(valueAt(tree, 'piece-note-input-0')).toBe('On the 34 bus');
    expect(textAt(tree, 'capture-save-error')).toMatch(/still here/i);
    expect(textAt(tree, 'capture-save-error')).not.toMatch(/lost|gone/i);
    // And a developer can see what actually went wrong, not only the person holding it.
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[CaptureScreen]'),
      expect.any(Error),
    );
  });

  it('does not claim the save failed when only letting the draft go failed', async () => {
    // `clearAfterSave` runs after the memory is on the phone, and it can still fail on its
    // own account -- opening the database, the `DELETE`. Reporting that as "Couldn't save"
    // would be false, and it would hand Save back for a memory that is already saved: the
    // next tap writes a second copy of it.
    CaptureDraftStore.clearAfterSave.mockRejectedValueOnce(new Error('database is locked'));

    const tree = await render();
    await tap(tree, 'capture-type-button');
    await type(tree, 'piece-note-input-0', 'On the 34 bus');
    await tap(tree, 'capture-save-button');
    await tap(tree, 'audience-option-family');

    expect(createEntry).toHaveBeenCalledTimes(1);
    // Nothing on screen says the save failed, because it did not.
    expect(has(tree, 'capture-save-error')).toBe(false);
    // Save is not re-armed: a second tap would be a second memory.
    expect(pressable(tree, 'capture-save-button').props.disabled).toBe(true);
    await tap(tree, 'capture-save-button');
    expect(createEntry).toHaveBeenCalledTimes(1);
    // They are told the memory is saved, rather than left looking at a Save that no longer
    // responds and nothing said -- which is indistinguishable from a save that did nothing.
    expect(textAt(tree, 'capture-saved-notice')).toMatch(/saved/i);
    expect(textAt(tree, 'capture-saved-notice')).toMatch(/no.{0,6} need to save again/i);
    // The person still leaves, because their memory really was saved.
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    // And a developer can see what was left behind.
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[CaptureScreen]'),
      expect.any(Error),
    );
  });

  it('does not claim the save failed when only closing the screen failed', async () => {
    navigation.goBack.mockImplementation(() => {
      throw new Error('no route to go back to');
    });

    const tree = await render();
    await tap(tree, 'capture-type-button');
    await type(tree, 'piece-note-input-0', 'On the 34 bus');
    await tap(tree, 'capture-save-button');
    await tap(tree, 'audience-option-family');

    expect(createEntry).toHaveBeenCalledTimes(1);
    expect(CaptureDraftStore.clearAfterSave).toHaveBeenCalledTimes(1);
    expect(has(tree, 'capture-save-error')).toBe(false);
    expect(pressable(tree, 'capture-save-button').props.disabled).toBe(true);
    await tap(tree, 'capture-save-button');
    expect(createEntry).toHaveBeenCalledTimes(1);
    // This is the one path that leaves the person on this screen with Save correctly down
    // for good, so it is the one that most needs to say what happened.
    expect(textAt(tree, 'capture-saved-notice')).toMatch(/saved/i);
  });

  it('says nothing about saving at all until a save has actually happened', async () => {
    const tree = await render();
    await tap(tree, 'capture-type-button');

    expect(has(tree, 'capture-saved-notice')).toBe(false);
    expect(has(tree, 'capture-save-error')).toBe(false);

    // And the ordinary save, where everything works, leaves without a banner at all.
    await tap(tree, 'capture-save-button');
    await tap(tree, 'audience-option-family');

    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(has(tree, 'capture-saved-notice')).toBe(false);
    expect(has(tree, 'capture-save-error')).toBe(false);
  });

  it('refuses the save rather than dropping a piece it cannot build, draft intact', async () => {
    // `buildContentBlocks` throws on a kind it does not recognise rather than dropping the
    // piece, because a silent drop is the one failure shape that makes a loss invisible.
    // The first caller has to let that refusal stand: catching it and saving anyway would
    // turn the throw into a drop with extra steps.
    CaptureDraftStore.load.mockImplementation(async () => ({
      id: 'new',
      entryLocalId: null,
      createdAt: '2026-11-08T08:00:00.000Z',
      updatedAt: '2026-11-08T08:00:00.000Z',
      pieces: [
        {
          localId: 'p1',
          kind: 'image', // not one of the four; a producer elsewhere called a photo this
          uri: 'file:///documents/capture-drafts/new/p1.jpg',
          capturedAt: '2026-11-08T08:41:00.000Z',
        },
      ],
    }));

    const tree = await render();
    expect(rows(tree)).toHaveLength(1);

    await tap(tree, 'capture-save-button');
    await tap(tree, 'audience-option-family');

    expect(createEntry).not.toHaveBeenCalled();
    expect(CaptureDraftStore.clearAfterSave).not.toHaveBeenCalled();
    expect(textAt(tree, 'capture-save-error')).toMatch(/still here/i);
    expect(rows(tree)).toHaveLength(1);
  });
});

// ============================================================
// A capture that could not be kept
// ============================================================

describe('CaptureScreen: a capture that could not be kept is reported, earlier pieces intact', () => {
  it('reports a clip the store could not keep (storage full), and keeps what came before', async () => {
    const tree = await render();

    await tap(tree, 'capture-type-button');
    await type(tree, 'piece-note-input-0', 'On the 34 bus');

    CaptureDraftStore.addPiece.mockRejectedValueOnce(new Error('ENOSPC: no space left'));

    // `onClip` is called, not awaited, so a rejected promise from the screen's handler never
    // reaches the recorder: this is the screen's own to catch, and it must not take the
    // screen down with it.
    await tap(tree, 'voice-record-button');
    await tap(tree, 'voice-stop-button');

    expect(textAt(tree, 'capture-capture-error')).toMatch(/voice clip/i);
    expect(textAt(tree, 'capture-capture-error')).toMatch(/not been added|wasn|couldn/i);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[CaptureScreen]'),
      expect.any(Error),
    );

    // Everything captured before is exactly where it was, and the screen still works.
    expect(valueAt(tree, 'piece-note-input-0')).toBe('On the 34 bus');
    expect(rows(tree)).toHaveLength(1);

    await tap(tree, 'voice-record-button');
    await tap(tree, 'voice-stop-button');
    expect(rows(tree)).toHaveLength(2);
    expect(has(tree, 'capture-capture-error')).toBe(false);
  });

  it('reports a photo the store could not keep, and leaves the earlier photo alone', async () => {
    const tree = await render();

    await tap(tree, 'capture-camera-button');
    await tap(tree, 'camera-photo-button');

    CaptureDraftStore.addPiece.mockRejectedValueOnce(new Error('ENOSPC: no space left'));
    await tap(tree, 'camera-photo-button');
    await tap(tree, 'camera-done-button');

    expect(rows(tree)).toHaveLength(1);
    expect(textAt(tree, 'capture-capture-error')).toMatch(/photo/i);
  });

  it('says so when typing reached no draft, rather than swallowing it', async () => {
    const tree = await render();
    await tap(tree, 'capture-type-button');

    // `updateText` throws on a cold cache by design, and this screen's mount `load` is what
    // makes that impossible -- but the branch is *said* rather than swallowed, because
    // swallowing it is precisely how typing that is not being kept would stay invisible.
    CaptureDraftStore.updateText.mockImplementationOnce(() => {
      throw new Error('no draft in hand for slot new');
    });

    await type(tree, 'piece-note-input-0', 'On the 34 bus');

    expect(textAt(tree, 'capture-capture-error')).toMatch(/isn.t being kept/i);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[CaptureScreen]'),
      expect.any(Error),
    );
    // What was typed is still on screen -- it is the draft it has not reached, not the field.
    expect(valueAt(tree, 'piece-note-input-0')).toBe('On the 34 bus');
  });

  it('does not let a successful capture wipe "your typing is not being kept"', async () => {
    const tree = await render();
    await tap(tree, 'capture-type-button');

    CaptureDraftStore.updateText.mockImplementationOnce(() => {
      throw new Error('no draft in hand for slot new');
    });
    await type(tree, 'piece-note-input-0', 'On the 34 bus');
    expect(textAt(tree, 'capture-capture-error')).toMatch(/isn.t being kept/i);

    // Of the three things this one line carries, typing that reached no draft is the
    // serious one: it is the only one that means something a person wrote is not being
    // kept. A clip recorded afterwards says nothing about the note, so it must not clear it.
    await tap(tree, 'voice-record-button');
    await tap(tree, 'voice-stop-button');

    expect(rows(tree)).toHaveLength(2);
    expect(textAt(tree, 'capture-capture-error')).toMatch(/isn.t being kept/i);
  });

  it('reports a capture the component itself lost, by kind', async () => {
    const tree = await render();

    // Every `onCaptureFailed` reason means no piece was added, so the screen treats them
    // alike; `reason` is for the message, not for a decision.
    await act(async () => {
      voiceBar.__props().onCaptureFailed({
        reason: 'no-file',
        error: null,
        capturedAt: '2026-11-08T08:52:00.000Z',
        duration: 12,
      });
    });

    expect(textAt(tree, 'capture-capture-error')).toMatch(/voice clip/i);
    expect(CaptureDraftStore.addPiece).not.toHaveBeenCalled();
    expect(rows(tree)).toHaveLength(0);

    await tap(tree, 'capture-camera-button');
    await act(async () => {
      dualCamera.__props().onCaptureFailed({
        kind: 'video',
        reason: 'capture-failed',
        error: new Error('no'),
        capturedAt: '2026-11-08T09:00:00.000Z',
        duration: 3,
      });
    });
    await tap(tree, 'camera-done-button');

    expect(textAt(tree, 'capture-capture-error')).toMatch(/video/i);
    expect(rows(tree)).toHaveLength(0);
  });
});

// ============================================================
// A refused permission
// ============================================================

describe('CaptureScreen: a refused permission leaves the other buttons working', () => {
  it('says the microphone was refused, and Type and Camera keep working', async () => {
    const tree = await render();

    // `VoiceRecorderBar` delegates the refusal upward (the inline message and Open Settings
    // belong to the screen). `DualShutterCamera` is full screen and handles its own camera
    // refusal inside the overlay, so there is no camera callback to answer here.
    await act(async () => {
      voiceBar.__props().onPermissionDenied();
    });

    expect(textAt(tree, 'capture-permission-notice')).toMatch(/microphone/i);
    await tap(tree, 'capture-open-settings-button');
    expect(Linking.openSettings).toHaveBeenCalledTimes(1);

    expect(pressable(tree, 'capture-type-button').props.disabled).toBeFalsy();
    expect(pressable(tree, 'capture-camera-button').props.disabled).toBeFalsy();
    expect(pressable(tree, 'voice-record-button').props.disabled).toBeFalsy();

    await tap(tree, 'capture-type-button');
    expect(CaptureDraftStore.addPiece).toHaveBeenCalledTimes(1);

    await tap(tree, 'capture-camera-button');
    await tap(tree, 'camera-photo-button');
    await tap(tree, 'camera-done-button');
    expect(rows(tree)).toHaveLength(2);
  });

  it('leaves the dock live after the camera overlay closes', async () => {
    const tree = await render();

    // The camera's own refusal is shown inside the overlay, which covers the dock while it
    // is up; what the screen owes is that closing it returns a working dock.
    await tap(tree, 'capture-camera-button');
    await tap(tree, 'camera-close-button');

    expect(has(tree, 'dual-shutter-camera')).toBe(false);
    await tap(tree, 'capture-type-button');
    await tap(tree, 'voice-record-button');
    await tap(tree, 'voice-stop-button');
    expect(rows(tree)).toHaveLength(2);
  });
});

// ============================================================
// SC-001 -- the tap count
// ============================================================

describe('CaptureScreen: the Sam scenario costs the taps SC-001 budgets', () => {
  /**
   * SC-001 is a countable requirement, so it is counted: `tap()` increments `taps` on every
   * press this suite makes, and this test asserts the total.
   *
   * The budget is **14 taps** -- "+ once; Voice and stop for each clip (4); Camera, Photo
   * twice, Video start and stop, Done (6); Type (1); Save and the audience (2)". The "+" is
   * `CaptureFab`, which is not on this screen (it is covered in
   * `src/navigation/__tests__/AppNavigator.capture.test.js`), so **13** of the 14 fall here.
   *
   * Every tap below is one tap on a real control: `voice-record-button` and
   * `voice-stop-button` are `VoiceRecorderBar`'s own two testIDs, and
   * `camera-photo-button`, `camera-video-button` and `camera-done-button` are
   * `DualShutterCamera`'s -- each a single `onPress`, with no `onPressIn`, `onPressOut` or
   * `onLongPress` anywhere (their own suites assert that).
   *
   * What this test can actually fail on, which is the point of it: a screen that asked for a
   * title, wanted a confirmation after choosing an audience, needed a mode switch between
   * typing and recording, made Voice a two-step (reveal the bar, then record), or sent the
   * person somewhere else and back for the camera. Any of those costs a tap, and the number
   * below goes up.
   */
  it('takes 13 taps on this screen -- 14 with the + that opened it -- for six pieces', async () => {
    const tree = await render();

    await tap(tree, 'capture-type-button'); // 1  Type
    await tap(tree, 'voice-record-button'); // 2  Voice
    await tap(tree, 'voice-stop-button'); //   3  stop
    await tap(tree, 'capture-camera-button'); // 4  Camera
    await tap(tree, 'camera-photo-button'); // 5  Photo
    await tap(tree, 'camera-photo-button'); // 6  Photo
    await tap(tree, 'camera-video-button'); // 7  Video start
    await tap(tree, 'camera-video-button'); // 8  Video stop
    await tap(tree, 'camera-done-button'); //  9  Done
    await tap(tree, 'voice-record-button'); // 10 Voice
    await tap(tree, 'voice-stop-button'); //   11 stop
    await tap(tree, 'capture-save-button'); // 12 Save
    await tap(tree, 'audience-option-family'); // 13 Family

    // SC-001's budget is 14 taps with the "+" that opened this screen included, and the "+"
    // is `CaptureFab`, so 13 of them fall here. An exact count rather than a ceiling: a walk
    // that got *cheaper* would mean one of these controls had gone missing, which is worth
    // failing on too.
    expect(taps).toBe(13);

    // And the taps bought what they were meant to: one memory, six pieces, in order.
    expect(createEntry).toHaveBeenCalledTimes(1);
    const { contentBlocks, visibility } = createEntry.mock.calls[0][0];
    expect(visibility).toBe('family');
    // The note was never typed into, so it is not saved blank; what is left is the first
    // clip, the two photos as one block, the video and the second clip -- in capture order.
    expect(contentBlocks.map((block) => block.type)).toEqual([
      'audio',
      'photos',
      'video',
      'audio',
    ]);
    expect(contentBlocks[1].media).toHaveLength(2);
    expect(CaptureDraftStore.addPiece).toHaveBeenCalledTimes(6);
    expect(
      CaptureDraftStore.addPiece.mock.calls.map(([, piece]) => piece.kind),
    ).toEqual(['text', 'audio', 'photo', 'photo', 'video', 'audio']);
  });

  it('needs no navigation and no mode switch in between', async () => {
    const tree = await render();

    await tap(tree, 'capture-type-button');
    await tap(tree, 'voice-record-button');
    await tap(tree, 'voice-stop-button');
    await tap(tree, 'capture-camera-button');
    await tap(tree, 'camera-photo-button');
    await tap(tree, 'camera-done-button');

    // The screen never sent anyone anywhere: one screen, three ways to capture.
    expect(navigation.navigate).not.toHaveBeenCalled();
    expect(navigation.goBack).not.toHaveBeenCalled();
  });
});

// ============================================================
// US2 (T039) -- nothing captured is ever lost, and nothing unsaved ever leaves
// ============================================================

/** A draft as the store hands one back, for the restore cases. */
const storedDraft = (pieces) => ({
  id: 'new',
  entryLocalId: null,
  createdAt: '2026-11-08T08:00:00.000Z',
  updatedAt: '2026-11-08T08:44:00.000Z',
  pieces,
});

/**
 * One of each kind, with the media already pointing where the store put it -- a restored
 * draft's media lives under `documentDirectory/capture-drafts/new/`, never the cache.
 * The instants are built from local time so the expected `HH:mm` holds in any zone.
 */
const FOUR_RESTORED_PIECES = [
  {
    localId: 'p1',
    kind: 'text',
    content: 'Rain on the bus window',
    capturedAt: new Date(2026, 10, 8, 8, 41).toISOString(),
    location: ARCADE,
  },
  {
    localId: 'p2',
    kind: 'audio',
    uri: 'file:///documents/capture-drafts/new/p2.m4a',
    duration: 31,
    waveform: [0.2, 0.7],
    capturedAt: new Date(2026, 10, 8, 8, 42).toISOString(),
  },
  {
    localId: 'p3',
    kind: 'photo',
    uri: 'file:///documents/capture-drafts/new/p3.jpg',
    width: 4032,
    height: 3024,
    capturedAt: new Date(2026, 10, 8, 8, 43).toISOString(),
  },
  {
    localId: 'p4',
    kind: 'video',
    uri: 'file:///documents/capture-drafts/new/p4.mov',
    duration: 12,
    capturedAt: new Date(2026, 10, 8, 8, 44).toISOString(),
  },
];

describe('CaptureScreen: the unsaved memory is written whenever it may be taken away (FR-012)', () => {
  /**
   * FR-012's third trigger: "immediately when the app leaves the foreground". It is the one
   * that covers the phone locking, a call arriving and the app being killed afterwards --
   * from this screen's side all three are the same `AppState` change, and after it the app
   * may never run again.
   *
   * `flush` rather than a write of its own: the store's `flush` cancels the pending debounce
   * and writes whatever the draft in hand is, which is exactly "write it now".
   */
  it('flushes the draft when the app goes to the background', async () => {
    const tree = await render();
    await tap(tree, 'capture-type-button');
    await type(tree, 'piece-note-input-0', 'Rain on the bus window');
    CaptureDraftStore.flush.mockClear();

    await appStateGoes('background');

    expect(CaptureDraftStore.flush).toHaveBeenCalledTimes(1);
    expect(CaptureDraftStore.flush).toHaveBeenCalledWith('new');
  });

  // iOS delivers `inactive` for an incoming call and for the app switcher, and a call is
  // US2-2's own scenario. R7 names both states for exactly this reason.
  it('flushes the draft when the app goes inactive (a call, the app switcher)', async () => {
    const tree = await render();
    await tap(tree, 'capture-type-button');
    CaptureDraftStore.flush.mockClear();

    await appStateGoes('inactive');

    expect(CaptureDraftStore.flush).toHaveBeenCalledTimes(1);
    expect(CaptureDraftStore.flush).toHaveBeenCalledWith('new');
  });

  // Not "on every AppState change". Coming *back* has nothing to save from, and a flush
  // there would be a database write for every unlock -- and would make the three cases above
  // pass on a listener that could not tell leaving from arriving.
  it('does not flush on the way back to the foreground', async () => {
    const tree = await render();
    await tap(tree, 'capture-type-button');
    CaptureDraftStore.flush.mockClear();

    await appStateGoes('active');

    expect(CaptureDraftStore.flush).not.toHaveBeenCalled();
  });

  it('stops listening when the screen goes', async () => {
    const tree = await render();
    expect(appStateSubscriptions).toHaveLength(1);

    await act(async () => {
      tree.unmount();
    });
    trees = trees.filter((t) => t !== tree);

    expect(appStateSubscriptions[0].remove).toHaveBeenCalledTimes(1);
  });

  /**
   * FR-012's second trigger is the debounce, which is the store's. Blur is the companion the
   * store asks its caller for: the keyboard leaving a note is the moment the person has
   * stopped typing, and `PieceList` has carried an unwired `onBlurText` since T030 waiting
   * for this.
   */
  it('flushes the draft when the keyboard leaves a note', async () => {
    const tree = await render();
    await tap(tree, 'capture-type-button');
    await type(tree, 'piece-note-input-0', 'Rain on the bus window');
    CaptureDraftStore.flush.mockClear();

    await blur(tree, 'piece-note-input-0');

    expect(CaptureDraftStore.flush).toHaveBeenCalledTimes(1);
    expect(CaptureDraftStore.flush).toHaveBeenCalledWith('new');
  });

  // FR-012 names the screen being closed. The debounced write would land by itself, but only
  // because the store is a module that outlives this screen -- which is not a thing the
  // screen should be relying on for the half second after the last keystroke.
  it('flushes the draft on the way out when Close is tapped', async () => {
    const tree = await render();
    await tap(tree, 'capture-type-button');
    await type(tree, 'piece-note-input-0', 'Rain on the bus window');
    CaptureDraftStore.flush.mockClear();

    await tap(tree, 'capture-close-button');

    expect(CaptureDraftStore.flush).toHaveBeenCalledWith('new');
    // And it is still only leaving: Close never discards (UI contract).
    expect(CaptureDraftStore.discard).not.toHaveBeenCalled();
    expect(CaptureDraftStore.clearAfterSave).not.toHaveBeenCalled();
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
  });
});

describe('CaptureScreen: tapping + reopens the unsaved memory with every piece (FR-013)', () => {
  // US2-3, and the independent test for this story: a note, a clip and the rest are all
  // back. One of each kind, because a restore that handled only the kinds with media -- or
  // only text -- would be the same loss with a narrower blast radius.
  it('restores every piece of a stored draft, in capture order, text and all', async () => {
    CaptureDraftStore.load.mockImplementation(async () => storedDraft(FOUR_RESTORED_PIECES));

    const tree = await render();

    expect(CaptureDraftStore.load).toHaveBeenCalledWith('new');
    expect(rows(tree)).toEqual([
      'Note | 08:41 | Old arcade, Bridge St',
      'Voice clip | 08:42 | No place',
      'Photo | 08:43 | No place',
      'Video | 08:44 | No place',
    ]);
    // The note's words, not just a note-shaped row.
    expect(valueAt(tree, 'piece-note-input-0')).toBe('Rain on the bus window');
    expect(textAt(tree, 'capture-status-line')).toBe('Draft kept · 4 pieces');
    // And it is a memory that can be saved, not a read-only ghost.
    expect(pressable(tree, 'capture-save-button').props.disabled).toBe(false);
  });

  // The store's rule 2: `updateText` throws on a cold cache, by design, because a keystroke
  // handler cannot wait for a read. The mount's `load` is what warms it -- so typing into a
  // *restored* note, with no capture in between, is the case that proves the slot is in the
  // store's hand before any keystroke can reach it.
  it('keeps a keystroke typed straight into a restored note', async () => {
    CaptureDraftStore.load.mockImplementation(async () => storedDraft(FOUR_RESTORED_PIECES));

    const tree = await render();
    await type(tree, 'piece-note-input-0', 'Rain on the bus window, still');

    expect(CaptureDraftStore.updateText).toHaveBeenCalledWith(
      'new',
      'p1',
      'Rain on the bus window, still',
    );
    expect(has(tree, 'capture-capture-error')).toBe(false);
  });

  it('shows no unsaved memory, and no status line, when there is none', async () => {
    const tree = await render();

    expect(rows(tree)).toHaveLength(0);
    expect(has(tree, 'capture-status-line')).toBe(false);
    expect(has(tree, 'capture-empty-hint')).toBe(true);
  });

  /**
   * The restore is a cold database read, and every capture button is live for the whole of it
   * (fix round 1).
   *
   * So a photograph or a note can land *while* the read is in flight, and the piece it adds is
   * one the read cannot know about -- the store appends it to the draft the read returned. A
   * restore that simply replaced what was on screen would take that piece off it, leaving a
   * piece that is in the slot and nowhere a person can see. The cost is not cosmetic: Save
   * builds the memory from what is on screen and then lets the whole slot go, so the piece and
   * its media would be deleted having never been saved. SC-002 is zero pieces lost.
   */
  it('keeps a piece captured while the stored draft was still being read', async () => {
    const loading = deferred();
    CaptureDraftStore.load.mockImplementation(() => loading.promise);

    const tree = await render();

    // A note, captured before the read comes back. It is the only piece on screen so far.
    await tap(tree, 'capture-type-button');
    await type(tree, 'piece-note-input-0', 'The arcade lights');

    await act(async () => {
      loading.settle(storedDraft(FOUR_RESTORED_PIECES));
    });

    // Every stored piece is back, and the one captured in the window is still here -- after
    // them, which is the order the slot itself holds them in: the store appended it to the
    // stored draft.
    expect(rows(tree)).toHaveLength(5);
    expect(rows(tree).slice(0, 4)).toEqual([
      'Note | 08:41 | Old arcade, Bridge St',
      'Voice clip | 08:42 | No place',
      'Photo | 08:43 | No place',
      'Video | 08:44 | No place',
    ]);
    expect(rows(tree)[4]).toMatch(/^Note \| \d{2}:\d{2} \| No place$/);
    expect(valueAt(tree, 'piece-note-input-0')).toBe('Rain on the bus window');
    expect(valueAt(tree, 'piece-note-input-4')).toBe('The arcade lights');
    expect(textAt(tree, 'capture-status-line')).toBe('Draft kept · 5 pieces');
  });
});

describe('CaptureScreen: discarding is the only thing that throws a memory away (FR-015)', () => {
  // The confirmed path is pinned in the header describe above ("offers Discard behind the
  // overflow, and asks before throwing anything away"). This is the branch it does not
  // cover: the person thought better of it, and nothing at all should have happened.
  it('keeps everything when the confirmation is declined', async () => {
    const tree = await render();
    await tap(tree, 'capture-type-button');
    await type(tree, 'piece-note-input-0', 'Rain on the bus window');

    await tap(tree, 'capture-overflow-button');
    await tap(tree, 'capture-discard-button');

    const [, , buttons] = Alert.alert.mock.calls[0];
    const keep = buttons.find((button) => button.style === 'cancel');
    expect(keep).toBeDefined();
    expect(keep.text).toMatch(/keep/i);
    await act(async () => {
      keep.onPress?.();
    });

    expect(CaptureDraftStore.discard).not.toHaveBeenCalled();
    expect(navigation.goBack).not.toHaveBeenCalled();
    expect(valueAt(tree, 'piece-note-input-0')).toBe('Rain on the bus window');
  });
});

describe('CaptureScreen: a save that failed can be tried again (FR-017, M5)', () => {
  /** Captures a note with words in it, chooses Family, and fails the save. */
  const failTheSave = async () => {
    const save = deferred();
    createEntry.mockImplementation(() => save.promise);

    const tree = await render();
    await tap(tree, 'capture-type-button');
    await type(tree, 'piece-note-input-0', 'Rain on the bus window');
    await tap(tree, 'capture-save-button');
    await tap(tree, 'audience-option-family');

    await act(async () => {
      save.fail(new Error('disk full'));
    });
    return tree;
  };

  it('stays open with every piece, says the memory is still here, and offers Try again', async () => {
    const tree = await failTheSave();

    expect(navigation.goBack).not.toHaveBeenCalled();
    expect(valueAt(tree, 'piece-note-input-0')).toBe('Rain on the bus window');
    expect(textAt(tree, 'capture-save-error')).toMatch(/couldn.t save/i);
    expect(textAt(tree, 'capture-save-error')).toMatch(/still here/i);
    expect(pressable(tree, 'capture-save-retry-button')).toBeDefined();
    // The draft is the only copy of this memory there is, and it is untouched.
    expect(CaptureDraftStore.clearAfterSave).not.toHaveBeenCalled();
    expect(CaptureDraftStore.discard).not.toHaveBeenCalled();
  });

  // The audience was already chosen, and asking for it again would be asking the same
  // question twice about the same memory -- and would let a dismissal strand a memory the
  // person had already said who could see.
  it('retries with the audience already chosen, without asking again', async () => {
    const tree = await failTheSave();
    createEntry.mockImplementation(async () => ({ localId: 'entry-1', date: '2026-11-08' }));

    await tap(tree, 'capture-save-retry-button');

    expect(has(tree, 'audience-sheet')).toBe(false);
    expect(createEntry).toHaveBeenCalledTimes(2);
    expect(createEntry.mock.calls[1][0].visibility).toBe('family');
    // Same memory, same pieces -- a retry, not a different save.
    expect(createEntry.mock.calls[1][0].contentBlocks).toEqual(
      createEntry.mock.calls[0][0].contentBlocks,
    );
    // And now that it worked, the draft goes and the person leaves.
    expect(CaptureDraftStore.clearAfterSave).toHaveBeenCalledTimes(1);
    expect(CaptureDraftStore.clearAfterSave).toHaveBeenCalledWith('new');
    expect(navigation.goBack).toHaveBeenCalledTimes(1);
    expect(has(tree, 'capture-save-error')).toBe(false);
  });

  it('can be tried again more than once, and the banner comes back each time', async () => {
    const tree = await failTheSave();

    createEntry.mockImplementation(async () => {
      throw new Error('still full');
    });
    await tap(tree, 'capture-save-retry-button');
    expect(createEntry).toHaveBeenCalledTimes(2);
    expect(textAt(tree, 'capture-save-error')).toMatch(/still here/i);

    createEntry.mockImplementation(async () => ({ localId: 'entry-1', date: '2026-11-08' }));
    await tap(tree, 'capture-save-retry-button');
    expect(createEntry).toHaveBeenCalledTimes(3);
    expect(CaptureDraftStore.clearAfterSave).toHaveBeenCalledTimes(1);
  });

  /**
   * The one way Try again could be worse than no Try again: writing the memory twice.
   *
   * Two taps in one tick is the realistic shape. The banner unmounts when the retry starts,
   * so a second tap cannot be *aimed* -- but the handler the first tap is bound to is still
   * live, and `isSaving` is state that no render has carried yet.
   */
  it('writes one memory, not two, when Try again is tapped twice in a tick', async () => {
    const tree = await failTheSave();

    const save = deferred();
    createEntry.mockImplementation(() => save.promise);
    const retry = pressable(tree, 'capture-save-retry-button').props.onPress;

    await act(async () => {
      retry();
      retry();
    });

    expect(createEntry).toHaveBeenCalledTimes(2); // the first attempt, and one retry

    await act(async () => {
      save.settle({ localId: 'entry-1', date: '2026-11-08' });
    });
    expect(CaptureDraftStore.clearAfterSave).toHaveBeenCalledTimes(1);
  });

  /**
   * Try again must retry only a save that genuinely did not happen. A `clearAfterSave` that
   * failed happens *after* the memory is on the phone, so offering Try again there would
   * write a second copy of a memory that saved perfectly well -- which is the defect the
   * save path was deliberately built to avoid.
   */
  it('is not offered when the save worked and only the tidying up did not', async () => {
    CaptureDraftStore.clearAfterSave.mockRejectedValueOnce(new Error('database is locked'));

    const tree = await render();
    await tap(tree, 'capture-type-button');
    await type(tree, 'piece-note-input-0', 'Rain on the bus window');
    await tap(tree, 'capture-save-button');
    await tap(tree, 'audience-option-family');

    expect(createEntry).toHaveBeenCalledTimes(1);
    expect(has(tree, 'capture-save-error')).toBe(false);
    expect(has(tree, 'capture-save-retry-button')).toBe(false);
    expect(textAt(tree, 'capture-saved-notice')).toMatch(/saved/i);
  });

  it('is not offered when only closing the screen failed', async () => {
    navigation.goBack.mockImplementation(() => {
      throw new Error('no route to go back to');
    });

    const tree = await render();
    await tap(tree, 'capture-type-button');
    await tap(tree, 'capture-save-button');
    await tap(tree, 'audience-option-family');

    expect(has(tree, 'capture-save-retry-button')).toBe(false);
    expect(textAt(tree, 'capture-saved-notice')).toMatch(/saved/i);
  });

  /**
   * A retry is the same write as the first attempt, so it has to wait for the same things.
   * This is the invisible one: a photograph taken while the banner was on screen can still
   * be inside `withLocation`'s four-second wait, and a retry that built its blocks now would
   * save the memory without it and then clear the draft the photo was about to land in.
   */
  it('waits for a capture still on its way into the draft, as Save does', async () => {
    const tree = await failTheSave();

    // A cold GPS, the same shape the Save guard's own case uses.
    const fix = deferred();
    CaptureLocation.withLocation.mockImplementationOnce(async (capture) => {
      await fix.promise;
      return capture;
    });
    createEntry.mockClear();

    await tap(tree, 'capture-camera-button');
    await tap(tree, 'camera-photo-button'); // in flight: inside withLocation
    await tap(tree, 'camera-done-button');

    await tap(tree, 'capture-save-retry-button');

    expect(createEntry).not.toHaveBeenCalled();
    expect(textAt(tree, 'capture-capture-error')).toMatch(/moment|still keeping/i);

    // Once the photo has landed, the retry goes through -- with the photo in it.
    await act(async () => {
      fix.settle(null);
    });
    createEntry.mockImplementation(async () => ({ localId: 'entry-1', date: '2026-11-08' }));
    await tap(tree, 'capture-save-retry-button');

    expect(createEntry).toHaveBeenCalledTimes(1);
    expect(createEntry.mock.calls[0][0].contentBlocks.map((block) => block.type)).toEqual([
      'text',
      'photos',
    ]);
  });

  it('will not retry while a recording is still running', async () => {
    const tree = await failTheSave();
    createEntry.mockClear();

    await tap(tree, 'voice-record-button');
    await tap(tree, 'capture-save-retry-button');

    expect(createEntry).not.toHaveBeenCalled();
    expect(textAt(tree, 'capture-capture-error')).toMatch(/tap stop/i);
  });
});

describe('CaptureScreen: an unsaved memory never leaves the phone (FR-014, SC-004)', () => {
  /**
   * SC-004 is **0** unsaved memories ever becoming visible to anyone else or appearing in
   * the Journal without the person choosing Save. FR-014 is the mechanism: an unsaved memory
   * is not uploaded, not shared, and not saved as a memory by itself, *at any time*.
   *
   * A whole session, including every moment that writes the draft -- the pieces, the typing,
   * the backgrounding, the blur, closing, and reopening it afterwards. None of it may write a
   * journal entry or queue anything for sync.
   */
  it('captures a whole memory, and nothing is written as a memory or queued for sync', async () => {
    captureLocationModule.__setPlace(ARCADE);
    const tree = await render();

    await tap(tree, 'capture-type-button');
    await type(tree, 'piece-note-input-0', 'Rain on the bus window');
    await tap(tree, 'voice-record-button');
    await tap(tree, 'voice-stop-button');
    await tap(tree, 'capture-camera-button');
    await tap(tree, 'camera-photo-button');
    await tap(tree, 'camera-done-button');
    await blur(tree, 'piece-note-input-0');
    await appStateGoes('background');
    await appStateGoes('active');
    await tap(tree, 'capture-close-button');

    // Three pieces are on the phone, and every one of them went into the draft slot.
    expect(CaptureDraftStore.addPiece).toHaveBeenCalledTimes(3);
    expect(CaptureDraftStore.addPiece.mock.calls.every(([slot]) => slot === 'new')).toBe(true);
    expect(CaptureDraftStore.flush.mock.calls.every(([slot]) => slot === 'new')).toBe(true);

    // And nothing has been saved as a memory or handed to the sync machinery.
    expect(createEntry).not.toHaveBeenCalled();
    expect(journalHook.__updateEntry).not.toHaveBeenCalled();
    expect(SyncQueue.enqueue).not.toHaveBeenCalled();
    expect(SyncQueue.enqueueBatch).not.toHaveBeenCalled();
  });

  it('reopens an unsaved memory without making it one', async () => {
    CaptureDraftStore.load.mockImplementation(async () => storedDraft(FOUR_RESTORED_PIECES));

    const tree = await render();
    expect(rows(tree)).toHaveLength(4);
    await appStateGoes('background');

    expect(createEntry).not.toHaveBeenCalled();
    expect(journalHook.__updateEntry).not.toHaveBeenCalled();
    expect(SyncQueue.enqueue).not.toHaveBeenCalled();
    expect(SyncQueue.enqueueBatch).not.toHaveBeenCalled();
  });

  it('writes the memory only once the person has chosen who can see it', async () => {
    const tree = await render();
    await tap(tree, 'capture-type-button');
    await type(tree, 'piece-note-input-0', 'Rain on the bus window');

    // Save opens the question, and opening the question saves nothing.
    await tap(tree, 'capture-save-button');
    expect(has(tree, 'audience-sheet')).toBe(true);
    expect(createEntry).not.toHaveBeenCalled();

    await tap(tree, 'audience-option-private');
    expect(createEntry).toHaveBeenCalledTimes(1);
    expect(createEntry.mock.calls[0][0].visibility).toBe('private');
  });
});

/**
 * Deliberately the last describe in this file.
 *
 * It is the only one that leaves anything behind between mounts -- the screen has to remember
 * across its own unmount which draft a save already wrote as a memory, because that is
 * precisely what the *next* mount needs to know. Being last means a case that did not tidy up
 * after itself could not reach anything. (It is remembered piece for piece rather than by
 * slot, so a later mount that finds a different draft -- or no draft -- is unaffected anyway;
 * that is the third case below.)
 */
describe('CaptureScreen: a draft left behind by a save that worked does not come back', () => {
  /**
   * Saves one note, with the clearing of the draft failing. Returns the note's `localId`,
   * which is the identity the screen has to recognise the leftover draft by.
   */
  const saveLeavingTheDraftBehind = async (tree) => {
    CaptureDraftStore.clearAfterSave.mockRejectedValueOnce(new Error('database is locked'));

    await tap(tree, 'capture-type-button');
    await type(tree, 'piece-note-input-0', 'Rain on the bus window');
    await tap(tree, 'capture-save-button');
    await tap(tree, 'audience-option-family');

    expect(createEntry).toHaveBeenCalledTimes(1);
    expect(textAt(tree, 'capture-saved-notice')).toMatch(/saved/i);
    return CaptureDraftStore.addPiece.mock.calls[0][1].localId;
  };

  /** The leftover row, as the store would hand it back on the next mount. */
  const leftoverNote = (localId, content = 'Rain on the bus window') => [
    {
      localId,
      kind: 'text',
      content,
      capturedAt: new Date(2026, 10, 8, 8, 41).toISOString(),
    },
  ];

  /**
   * The ghost. `clearAfterSave` runs after the memory is on the phone and can fail on its
   * own account, and when it does the draft row outlives the memory it was a draft of. The
   * next tap on + would restore it as an unsaved memory, offer Save, and write the memory a
   * second time -- the person's afternoon in their Journal twice, which is exactly the defect
   * the save path refuses to report a successful save as a failure in order to avoid.
   */
  it('lets it go the next time + is tapped, and offers no phantom unsaved memory', async () => {
    const first = await render();
    const localId = await saveLeavingTheDraftBehind(first);
    await tap(first, 'capture-close-button');

    // The row really is still there, and the store would happily hand it back.
    CaptureDraftStore.load.mockImplementation(async () =>
      storedDraft(leftoverNote(localId)),
    );
    CaptureDraftStore.clearAfterSave.mockClear();

    const second = await render();

    // It is let go rather than restored, and nothing is offered as unsaved. Named piece for
    // piece, and the store re-checks that name inside the slot's lock before it deletes
    // anything -- see the fourth case below, and the store's own suite.
    expect(CaptureDraftStore.clearAfterSave).toHaveBeenCalledWith('new', {
      onlyIfIdentity: localId,
    });
    expect(rows(second)).toHaveLength(0);
    expect(has(second, 'capture-status-line')).toBe(false);
    expect(pressable(second, 'capture-save-button').props.disabled).toBe(true);
  });

  /**
   * The first of the two sides that would lose a memory if they were wrong.
   *
   * The screen stays open after a save whose tidying up failed, so the person can go on
   * typing into the note that is still on it -- and the moment they do, that slot holds
   * something that was never saved. Typing is the shape the piece-for-piece check cannot see
   * on its own, because editing a note that is already there leaves every id exactly as it
   * was.
   */
  it('treats the slot as unsaved again once the person types into it', async () => {
    const first = await render();
    const localId = await saveLeavingTheDraftBehind(first);

    // They carry on writing in the note that is still on screen.
    await type(first, 'piece-note-input-0', 'Rain on the bus window, and the arcade lights');
    await tap(first, 'capture-close-button');

    CaptureDraftStore.load.mockImplementation(async () =>
      storedDraft(leftoverNote(localId, 'Rain on the bus window, and the arcade lights')),
    );
    CaptureDraftStore.clearAfterSave.mockClear();

    const second = await render();

    expect(CaptureDraftStore.clearAfterSave).not.toHaveBeenCalled();
    expect(rows(second)).toHaveLength(1);
    expect(valueAt(second, 'piece-note-input-0')).toBe(
      'Rain on the bus window, and the arcade lights',
    );
  });

  /**
   * The second side. Letting go of a draft is irreversible -- it takes the pieces and their
   * media with it -- so "a save left something behind in this slot" is never enough on its
   * own. It has to be *this* draft. Any other draft in that slot is somebody's unsaved
   * memory, and SC-002 is zero pieces lost.
   */
  it('leaves a draft that is not the one that was saved alone', async () => {
    const first = await render();
    await saveLeavingTheDraftBehind(first);
    await tap(first, 'capture-close-button');

    // A different memory in the slot by the time + is tapped again.
    CaptureDraftStore.load.mockImplementation(async () =>
      storedDraft([
        {
          localId: 'a-different-piece',
          kind: 'audio',
          uri: 'file:///documents/capture-drafts/new/p9.m4a',
          duration: 31,
          capturedAt: new Date(2026, 10, 8, 9, 10).toISOString(),
        },
      ]),
    );
    CaptureDraftStore.clearAfterSave.mockClear();

    const second = await render();

    expect(CaptureDraftStore.clearAfterSave).not.toHaveBeenCalled();
    expect(rows(second)).toEqual(['Voice clip | 09:10 | No place']);
  });

  /**
   * The window the first case cannot see, and the one that costs a piece (fix round 1).
   *
   * Reading the leftover draft is a cold database read on the way in, and every capture button
   * is live the whole time it is in flight. So: + is tapped, `load` goes out, and before it
   * comes back the person taps Type. That capture queues on the slot's lock, and a let-go
   * decided from what `load` returned would queue *behind* it -- deleting a piece, and any
   * media already copied into the slot's folder, that was captured after the draft the screen
   * was comparing. SC-002 is zero pieces lost.
   *
   * Two things stop it, and this case pins the first: nothing is let go at all once something
   * has been captured since the mount. The second is the store's, because only inside the
   * slot's lock can the comparison and the delete be one step -- "leaves the draft alone when a
   * piece was captured while it was being read" in `CaptureDraftStore.test.js`, which drives
   * the same race against the real database and the real folder.
   */
  it('lets go of nothing when something was captured while the draft was still loading', async () => {
    const first = await render();
    const localId = await saveLeavingTheDraftBehind(first);
    await tap(first, 'capture-close-button');

    // The next mount's read, held in flight: the screen is up and every button works.
    const loading = deferred();
    CaptureDraftStore.load.mockImplementation(() => loading.promise);
    CaptureDraftStore.clearAfterSave.mockClear();
    CaptureDraftStore.addPiece.mockClear();

    const second = await render();

    // A note, captured inside that window and really in the slot. Nothing is typed into it:
    // typing says "this slot holds something that was never saved" by itself, and this case
    // is about the window where nothing has said that.
    await tap(second, 'capture-type-button');
    expect(CaptureDraftStore.addPiece).toHaveBeenCalledTimes(1);
    const captured = CaptureDraftStore.addPiece.mock.calls[0][1].localId;
    expect(captured).not.toBe(localId);

    // Only now does the read come back, with the draft the save left behind -- piece for
    // piece the one it was comparing against.
    await act(async () => {
      loading.settle(storedDraft(leftoverNote(localId)));
    });

    // Nothing is deleted. The slot holds the saved note *and* the one just captured, and a
    // delete decided on what the read returned would have taken both.
    expect(CaptureDraftStore.clearAfterSave).not.toHaveBeenCalled();
    expect(CaptureDraftStore.discard).not.toHaveBeenCalled();

    // What is on screen is the piece captured in the window -- empty, not the saved note's
    // words -- and the already-saved pieces are neither restored nor offered for saving again.
    expect(rows(second)).toHaveLength(1);
    expect(valueAt(second, 'piece-note-input-0')).toBe('');
  });
});
