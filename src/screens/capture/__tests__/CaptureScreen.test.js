/**
 * 013 T029 -- `CaptureScreen`, new mode. The heart of User Story 1.
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
 *     quickstart M4); a save that fails leaves the draft alone;
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
import { Alert, Linking, TextInput } from 'react-native';

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
    load: jest.fn(async () => null),
    addPiece: jest.fn(async (slot, piece) => stored(slot, piece)),
    removePiece: jest.fn(async () => null),
    updateText: jest.fn(() => null),
    flush: jest.fn(async () => {}),
    startEdit: jest.fn(async () => null),
    getEditFor: jest.fn(async () => null),
    discard: jest.fn(async () => {}),
    clearAfterSave: jest.fn(async () => {}),
    __stored: stored,
  };

  return { __esModule: true, ...store, default: store };
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
  CaptureDraftStore.clearAfterSave.mockImplementation(async () => {});
  CaptureDraftStore.discard.mockImplementation(async () => {});
  createEntry.mockImplementation(async () => ({ localId: 'entry-1', date: '2026-11-08' }));

  navigation = { goBack: jest.fn(), navigate: jest.fn(), setOptions: jest.fn() };
  taps = 0;

  // Real focus on a mocked native input does nothing useful, and this is how the test can
  // see *which* input the screen asked for (`spy.mock.instances[i].props.testID`).
  focusSpy = jest.spyOn(TextInput.prototype, 'focus').mockImplementation(() => {});
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(Linking, 'openSettings').mockImplementation(() => {});
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

    expect(taps).toBe(13);
    expect(taps + 1).toBeLessThanOrEqual(14); // SC-001's budget, the "+" included

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
