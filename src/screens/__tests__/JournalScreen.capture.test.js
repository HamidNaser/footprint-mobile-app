/**
 * 013 T031 — the Journal tab's own quick bar is a way *into* the capture screen, not a second,
 * lossy composer beside it.
 *
 * FR-001 is "a + on every one of the six tabs that opens the capture screen in one tap". The +
 * itself is T012/T013's and is covered by `src/navigation/__tests__/AppNavigator.capture.test.js`.
 * What is pinned here is the Journal screen's *other* way in — the WhatsApp-style bar along the
 * bottom, whose three actions (type, mic, camera) each opened the old `JournalComposeModal` or
 * saved a memory outright. After T032 all three are one tap into `Capture` with `{ mode: 'new' }`,
 * the same route and the same parameters the + uses, so there is one capture screen and not two.
 *
 * FR-017 is "a save failure is never silent". Its *Try again* button belongs to T039/T040 on
 * `CaptureScreen`; what it means **here** is narrower, and is the second half of T032: the old
 * `handleSaveEntry` on this screen caught a failed `createEntry`, logged it to the console and
 * left the person looking at a screen that showed no memory and said nothing. A new memory must
 * no longer be saved by this screen at all, and nothing left on it may swallow a save failure.
 *
 * Three things this file is deliberately careful about:
 *
 *   1. **"The compose modal is not opened" has to be an assertion about something.** A test that
 *      only checks `visible === false` would keep passing if the modal were deleted from the
 *      screen outright, or renamed, or never rendered — it would assert nothing. So the first
 *      case in that block finds the modal in the tree and checks it is *closed*, and every
 *      later case finds it the same way: `findByType` throws when it is gone, so this file fails
 *      loudly rather than quietly if T060 or T068 removes it without revisiting these
 *      expectations.
 *   2. **Nothing typed may be thrown away.** `QuickCaptureBar` clears its input the moment it
 *      calls `onSend`, so routing that action to `Capture` and ignoring its argument would lose
 *      the note — the very defect this feature exists to remove (`JournalComposeModal` threw
 *      typed text away when the microphone opened). The typed note therefore has to reach the
 *      unsaved memory, through the same `CaptureDraftStore.addPiece` + `CaptureLocation`
 *      stamping every piece on `CaptureScreen` goes through (FR-004, FR-012), and a note that
 *      *cannot* be kept has to be said rather than logged.
 *   3. **The bar's audience is not carried.** `onSend` hands up the audience its little picker
 *      was left on, and FR-011 forbids a memory being saved on anything but an explicit choice
 *      from the save sheet. So the navigation parameters are asserted with `toEqual` — exactly
 *      `{ mode: 'new' }`, nothing smuggled alongside it.
 *
 * `JournalComposeModal` is **not** removed by T032 and is not expected to be gone here. plan.md's
 * Structure Decision keeps it "only for any remaining non-capture callers"; its one remaining
 * opener on this screen is the detail view's Edit (`JournalScreen.js`'s `JournalEntryDetail`
 * block), which T060 re-points at `Capture` and T068 retires. So the last block below pins that
 * its remaining save path still carries every field it is handed — `locationSharing` above all,
 * which `entryLocationSharing.journey.test.js` exists because it was once dropped — and that it
 * now *reports* a failure instead of swallowing it.
 *
 * The first mount transforms this screen and everything React Native pulls in behind it.
 */

jest.setTimeout(30000);

// ---------------------------------------------------------------------------
// Native modules that cannot load under jest (the set `entryLocationSharing.journey.test.js`
// needs, for the same screen).
// ---------------------------------------------------------------------------

jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(() => ({ remove: jest.fn(), play: jest.fn(), pause: jest.fn() })),
  setAudioModeAsync: jest.fn(),
  useAudioRecorder: jest.fn(() => ({})),
  useAudioRecorderState: jest.fn(() => ({})),
  requestRecordingPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  AudioModule: { requestRecordingPermissionsAsync: jest.fn() },
  IOSOutputFormat: { MPEG4AAC: 'aac' },
  AudioQuality: { LOW: 0, MEDIUM: 1, HIGH: 2, MAX: 3 },
  RecordingPresets: { HIGH_QUALITY: {}, LOW_QUALITY: {} },
}));

jest.mock('expo-video', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    VideoView: (props) => React.createElement(View, props, props.children),
    useVideoPlayer: jest.fn(() => ({ play: jest.fn(), pause: jest.fn(), release: jest.fn() })),
  };
});

jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Stub = (props) => React.createElement(View, props, props.children);
  // `Polyline` since 013 T050: the card now renders `MemoryRouteMap`, which draws the dashed
  // route between two or more places (FR-024), and an unexported name renders as undefined.
  return {
    __esModule: true,
    default: Stub,
    Marker: Stub,
    Callout: Stub,
    Polyline: Stub,
    PROVIDER_GOOGLE: 'google',
  };
});

jest.mock('expo-media-library', () => ({
  requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  getAssetInfoAsync: jest.fn().mockResolvedValue({}),
  getAssetsAsync: jest.fn().mockResolvedValue({ assets: [] }),
  MediaType: { photo: 'photo', video: 'video' },
  SortBy: { creationTime: 'creationTime' },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
    multiRemove: jest.fn().mockResolvedValue(undefined),
    getAllKeys: jest.fn().mockResolvedValue([]),
  },
}));

// The local database is never reached in this file: the journal hook and the draft store are
// both stand-ins. Stubbed so that nothing behind the screen opens a real connection.
jest.mock('../../database', () => {
  const schema = require('../../database/schema');
  const connection = {
    execAsync: jest.fn(async () => {}),
    runAsync: jest.fn(async () => {}),
    getFirstAsync: jest.fn(async () => null),
    getAllAsync: jest.fn(async () => []),
    closeAsync: jest.fn(async () => {}),
  };
  return {
    ...schema,
    getDatabase: jest.fn(async () => connection),
    initializeDatabase: jest.fn(async () => connection),
    clearDatabase: jest.fn(async () => {}),
    closeDatabase: jest.fn(async () => {}),
    getDatabaseStats: jest.fn(async () => ({})),
  };
});

// ---------------------------------------------------------------------------
// The screen's surroundings.
// ---------------------------------------------------------------------------

jest.mock('../../api', () => ({
  ReactionsApi: { likeEntry: jest.fn(async () => ({})), unlikeEntry: jest.fn(async () => ({})) },
  CommentsApi: { addComment: jest.fn(async () => ({})) },
}));

jest.mock('../../sync/SyncEngine', () => ({
  SyncEngine: { addListener: jest.fn(() => () => {}), syncNow: jest.fn(async () => ({})) },
  SyncEvent: { SYNC_COMPLETED: 'sync_completed' },
}));

jest.mock('../../services/SettingsService', () => {
  const service = {
    getOrCreateDefaultJournal: jest.fn(async () => 'journal-1'),
    getDefaultJournalId: jest.fn(async () => 'journal-1'),
    getStorageMode: jest.fn(async () => 'cloud_sync'),
    isSyncEnabled: jest.fn(async () => true),
    get: jest.fn(async () => null),
  };
  return {
    __esModule: true,
    SettingsService: service,
    StorageMode: { LOCAL_ONLY: 'local_only', CLOUD_SYNC: 'cloud_sync' },
    default: service,
  };
});

jest.mock('../../context', () => ({
  useRealtime: () => ({ isConnected: true, unreadNotificationCount: 0, notifications: [] }),
  useSync: () => ({ pendingCount: 0, failedCount: 0, isSyncing: false, isOnline: true }),
  SyncState: { IDLE: 'idle' },
}));

jest.mock('../../context/AuthContext', () => ({
  __esModule: true,
  useAuth: () => ({ user: { id: 'user-1', name: 'Sam' }, isAuthenticated: true }),
}));

jest.mock('../../hooks/useJournalRealtime', () => ({
  useJournalRealtime: () => ({}),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useFocusEffect: jest.fn(),
}));

jest.mock('../../services/LocationService', () => ({
  __esModule: true,
  default: {
    checkPermissions: jest.fn(async () => ({ foreground: 'granted' })),
    getCurrentLocation: jest.fn(async () => ({ latitude: 48.8809, longitude: 2.3553 })),
    reverseGeocode: jest.fn(async () => ({ formattedAddress: 'Gare du Nord' })),
    extractLocationFromExif: jest.fn(() => null),
  },
}));

/**
 * The journal hook, with `createEntry` watchable. It is the one route by which this screen can
 * save a memory, so "a new memory no longer saves through JournalScreen" is a statement about
 * this mock not being called.
 */
jest.mock('../../hooks/useJournal', () => {
  const createEntry = jest.fn(async () => ({ localId: 'entry-1', date: '2026-11-08' }));
  const refresh = jest.fn(async () => {});
  // The feed the screen is given. Held in a box rather than closed over as a constant so a
  // test can put a memory in it (T036's re-share needs a card on screen) and the harness can
  // empty it again afterwards.
  const feed = { entries: [] };
  return {
    __esModule: true,
    useJournal: jest.fn(() => ({
      entries: feed.entries,
      loading: false,
      error: null,
      refreshing: false,
      hasMore: false,
      refresh,
      loadMore: jest.fn(async () => {}),
      createEntry,
      deleteEntry: jest.fn(async () => {}),
    })),
    __createEntry: createEntry,
    __refresh: refresh,
    __setEntries: (entries) => {
      feed.entries = entries;
    },
  };
});

/**
 * The service behind the card's re-share (T036). Mocked so that "the Journal screen re-shares
 * the memory" is a statement about `reshareEntry` being called with the person's choice, and
 * so no database is reached from here.
 */
jest.mock('../../services/JournalService', () => {
  const service = {
    reshareEntry: jest.fn(async () => ({ localId: 'local-refused', shareState: null })),
    on: jest.fn(() => () => {}),
  };
  return { __esModule: true, JournalService: service, default: service };
});

/**
 * The draft store, modelled on its own contract: `addPiece` returns the piece **as stored**,
 * with any media moved somewhere durable first (rule 1). A note has no file, so it comes back
 * as it went in.
 */
jest.mock('../../services/CaptureDraftStore', () => {
  const slotDirectory = (slot) => `file:///documents/capture-drafts/${slot}/`;
  const store = {
    DraftSlot: { NEW: 'new', EDIT: 'edit' },
    TEXT_DEBOUNCE_MS: 500,
    slotDirectory,
    load: jest.fn(async () => null),
    addPiece: jest.fn(async (slot, piece) =>
      piece?.uri ? { ...piece, uri: `${slotDirectory(slot)}${piece.localId}` } : piece,
    ),
    removePiece: jest.fn(async () => null),
    updateText: jest.fn(() => null),
    flush: jest.fn(async () => {}),
    startEdit: jest.fn(async () => null),
    getEditFor: jest.fn(async () => null),
    discard: jest.fn(async () => {}),
    clearAfterSave: jest.fn(async () => {}),
  };
  return { __esModule: true, ...store, default: store };
});

jest.mock('../../services/CaptureLocation', () => {
  /** Where the phone thinks it is. The real one adds no `location` key when it has none. */
  const place = { lat: 51.5308, lng: -0.1238, accuracy: 12 };
  const api = {
    withLocation: jest.fn(async (capture, existing = null) =>
      existing?.lat != null
        ? { ...capture, location: existing }
        : { ...capture, location: place },
    ),
    stampLocation: jest.fn(async () => place),
    setCaptureEnabled: jest.fn(),
    isCaptureEnabled: jest.fn(() => true),
    clearCachedLocation: jest.fn(),
  };
  return { __esModule: true, ...api, default: api };
});

import React from 'react';
import { act, create } from 'react-test-renderer';
import { Alert, FlatList, Text, TextInput, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import JournalScreen from '../JournalScreen';
import { QuickCaptureBar } from '../../components/journal';
import { JournalComposeModal } from '../../components/journal/JournalComposeModal';
import CaptureDraftStore from '../../services/CaptureDraftStore';
import CaptureLocation from '../../services/CaptureLocation';
import {
  __createEntry as createEntry,
  __refresh as refreshFeed,
  __setEntries as setFeedEntries,
} from '../../hooks/useJournal';
import { JournalService } from '../../services/JournalService';
import { JournalEntryCard } from '../../components/journal/JournalEntryCard';
import SaveAudienceSheet from '../../components/capture/SaveAudienceSheet';
import { toDateKey } from '../../utils/journalDate';
import { ShareState } from '../../database/schema';

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const mounted = [];

/** The screen, with a watchable navigator. Mounted inside `act`: the icon font resolves late. */
async function render() {
  const navigate = jest.fn();
  let tree;
  await act(async () => {
    tree = create(<JournalScreen navigation={{ navigate, goBack: jest.fn() }} />);
  });
  mounted.push(tree);
  return { tree, navigate };
}

/**
 * The screen logs a line of its own on each failure path it alerts about. Deliberate, and kept
 * — but it belongs in a production console, not in this suite's output, where a real warning
 * is what a reader should notice. Silenced per test, and the spy is handed back so a test can
 * still assert the failure was recorded rather than swallowed.
 */
/** Every string the screen renders, flattened — children may be an array of fragments. */
const textsAnywhere = (node) =>
  node
    .findAllByType(Text)
    .map((t) => (Array.isArray(t.props.children) ? t.props.children.join('') : t.props.children))
    .filter((value) => typeof value === 'string');

const silencedWarnings = [];
const silenceWarnings = () => {
  const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  silencedWarnings.push(spy);
  return spy;
};

afterEach(() => {
  while (mounted.length) {
    const tree = mounted.pop();
    try {
      act(() => {
        tree.unmount();
      });
    } catch {
      /* already gone */
    }
  }
  while (silencedWarnings.length) {
    silencedWarnings.pop().mockRestore();
  }
  // Back to an empty feed, so a test that puts a memory on screen cannot leak it into the
  // next one (`jest.clearAllMocks` does not touch the box it is held in).
  setFeedEntries([]);
  jest.clearAllMocks();
});

/**
 * `QuickCaptureBar` is wrapped in `memo`, and React gives a simple memo component's fiber the
 * *inner* function as its type — so `findByType` has to be handed that, not the wrapper.
 */
const QuickBarComponent = QuickCaptureBar.type ?? QuickCaptureBar;

const quickBar = (tree) => tree.root.findByType(QuickBarComponent);

/** The compose modal as the screen renders it. Throws if the screen stopped rendering it. */
const composeModal = (tree) => tree.root.findByType(JournalComposeModal);

const iconsIn = (node) => node.findAllByType(Ionicons).map((icon) => icon.props.name);

/**
 * The innermost control in the quick bar carrying this icon — the button itself, not a row
 * around it. A real tap, so what is proven is that the control a thumb reaches is wired, and
 * that reaching the capture screen from it costs **one** of them.
 */
function barControl(tree, icon) {
  const matches = quickBar(tree)
    .findAllByType(TouchableOpacity)
    .filter((node) => iconsIn(node).includes(icon));
  if (matches.length === 0) {
    throw new Error(`No control in the quick capture bar carries the "${icon}" icon`);
  }
  return matches[matches.length - 1];
}

const tap = async (control) => {
  await act(async () => {
    control.props.onPress();
  });
};

/** Type into the bar. Its Send button exists only once there is something to send. */
const typeInBar = async (tree, text) => {
  await act(async () => {
    quickBar(tree).findByType(TextInput).props.onChangeText(text);
  });
};

/** The three ways in, each as the tap that reaches it. */
const tapCamera = async (tree) => tap(barControl(tree, 'camera-outline'));
const tapMic = async (tree) => tap(barControl(tree, 'mic-outline'));
const tapSend = async (tree, note) => {
  await typeInBar(tree, note);
  await tap(barControl(tree, 'send'));
};

const NOTE = 'on the 34 bus, 8:41';

// ---------------------------------------------------------------------------
// FR-001 — the quick bar is a way into the capture screen, in one tap
// ---------------------------------------------------------------------------

describe('the Journal quick bar opens the capture screen in one tap (FR-001)', () => {
  it('opens Capture with { mode: "new" } when the camera control is tapped', async () => {
    const { tree, navigate } = await render();

    await tapCamera(tree);

    expect(navigate).toHaveBeenCalledWith('Capture', { mode: 'new' });
  });

  it('opens Capture with { mode: "new" } when the mic control is tapped', async () => {
    const { tree, navigate } = await render();

    await tapMic(tree);

    expect(navigate).toHaveBeenCalledWith('Capture', { mode: 'new' });
  });

  it('opens Capture with { mode: "new" } when a typed note is sent', async () => {
    const { tree, navigate } = await render();

    await tapSend(tree, NOTE);

    expect(navigate).toHaveBeenCalledWith('Capture', { mode: 'new' });
  });

  it('costs one tap and goes nowhere else — the same route and parameters as the + (FR-001)', async () => {
    // `toEqual`, not `objectContaining`: the bar's own audience picker hands its value up with
    // the text, and FR-011 forbids a memory being saved on anything but an explicit choice in
    // the save sheet. Carrying it here as a parameter would pre-empt that sheet, so exactly
    // `{ mode: 'new' }` must arrive — the same parameters `CaptureFab` sends.
    for (const [name, action] of [
      ['camera', tapCamera],
      ['mic', tapMic],
      ['text', (tree) => tapSend(tree, NOTE)],
    ]) {
      const { tree, navigate } = await render();

      await action(tree);

      // One assertion carrying the action's name, so a failure says which of the three it
      // was, and `toEqual` on the whole call list so an extra hop or an extra parameter
      // fails here.
      expect({ action: name, navigated: navigate.mock.calls }).toEqual({
        action: name,
        navigated: [['Capture', { mode: 'new' }]],
      });
    }
  });
});

// ---------------------------------------------------------------------------
// The old composer is no longer opened for a new memory
// ---------------------------------------------------------------------------

describe('JournalComposeModal is no longer opened for a new memory', () => {
  it('is still mounted by the screen, and closed, before anything is tapped', async () => {
    // The guard that stops the three cases below asserting nothing. `findByType` throws if the
    // screen no longer renders the modal at all, so if T060 or T068 removes it, this file
    // fails here and is revisited rather than passing vacuously. plan.md keeps the modal for
    // "any remaining non-capture callers" — on this screen, the detail view's Edit.
    const { tree } = await render();

    expect(composeModal(tree).props.visible).toBe(false);
  });

  it('stays closed when the camera control is tapped', async () => {
    const { tree } = await render();

    await tapCamera(tree);

    expect(composeModal(tree).props.visible).toBe(false);
  });

  it('stays closed when the mic control is tapped', async () => {
    const { tree } = await render();

    await tapMic(tree);

    expect(composeModal(tree).props.visible).toBe(false);
  });

  it('stays closed when a typed note is sent', async () => {
    // This one already holds before T032 — the old text action saved the note outright instead
    // of opening the composer. It is kept because the composer is the *other* thing this action
    // could be pointed at, and pointing it there would be a two-step route into capture with a
    // composer that throws typed text away the moment the microphone opens. Read with the case
    // above (the modal is really there) and the block below (the note is really kept), it says
    // something: the text action goes to `Capture` and to nothing else.
    const { tree } = await render();

    await tapSend(tree, NOTE);

    expect(composeModal(tree).props.visible).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// FR-017 (narrow) — this screen no longer saves a new memory, and swallows nothing
// ---------------------------------------------------------------------------

describe('a new memory is no longer saved by the Journal screen (FR-017)', () => {
  it('saves nothing when a typed note is sent', async () => {
    // The old path called `createEntry` here and caught its rejection with a `console.error`:
    // a memory that never arrived, on a screen that said nothing. Saving is the capture
    // screen's, behind the audience sheet, where a failure is shown and retried (T039/T040).
    const { tree } = await render();

    await tapSend(tree, NOTE);

    expect(createEntry).not.toHaveBeenCalled();
  });

  it('saves nothing when the camera or the mic control is tapped', async () => {
    // Already true before T032 (both only opened the composer), and it has to stay true: the
    // obvious wrong way to "route the quick bar" is to save a stub memory and then open the
    // capture screen on it, which would publish a memory nobody had chosen an audience for.
    for (const action of [tapCamera, tapMic]) {
      const { tree } = await render();

      await action(tree);

      expect(createEntry).not.toHaveBeenCalled();
    }
  });

  it('keeps the typed note in the unsaved memory rather than throwing it away', async () => {
    // `QuickCaptureBar` clears its input as it calls `onSend`, so the note exists nowhere else
    // by the time this runs. It goes into the `new` draft slot, through the same `addPiece` the
    // capture screen uses — which is what makes it survive the app being closed (FR-012) and
    // what the capture screen's own mount then reads back.
    const { tree } = await render();

    await tapSend(tree, NOTE);

    expect(CaptureDraftStore.addPiece).toHaveBeenCalledTimes(1);
    const [slot, piece] = CaptureDraftStore.addPiece.mock.calls[0];
    expect(slot).toBe('new');
    expect(piece).toEqual(
      expect.objectContaining({
        kind: 'text',
        content: NOTE,
        localId: expect.any(String),
        capturedAt: expect.any(String),
      }),
    );
    expect(piece.localId.length).toBeGreaterThan(0);
    // An instant, exactly as the phone's clock reads it (research R8, Principle III) — never a
    // civil date.
    expect(piece.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(Number.isNaN(Date.parse(piece.capturedAt))).toBe(false);
  });

  it('stamps the typed note with where it was written, before recording it (FR-004)', async () => {
    const { tree } = await render();

    await tapSend(tree, NOTE);

    expect(CaptureLocation.withLocation).toHaveBeenCalledTimes(1);
    const [stamped] = CaptureDraftStore.addPiece.mock.calls[0].slice(1);
    expect(stamped.location).toEqual({ lat: 51.5308, lng: -0.1238, accuracy: 12 });
  });

  it('keeps the note the person wrote, not a trimmed-to-nothing stand-in', async () => {
    // Whitespace around a note is trimmed by the bar itself before `onSend`; what must not
    // happen is the content being dropped, or replaced by a placeholder, on the way to the
    // draft.
    const { tree } = await render();

    await tapSend(tree, 'the arcade on the corner');

    expect(CaptureDraftStore.addPiece.mock.calls[0][1].content).toBe('the arcade on the corner');
  });

  it('says so when a typed note cannot be kept, and opens nothing (FR-017)', async () => {
    // The one way this route can lose words: the draft write fails (a full disk), and the bar
    // has already cleared the input. Silence here would be the old defect in a new place, so
    // the note is said back to the person and the screen does not move on as though it had
    // been kept.
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const warned = silenceWarnings();
    CaptureDraftStore.addPiece.mockRejectedValueOnce(new Error('no space left on device'));

    const { tree, navigate } = await render();

    await tapSend(tree, NOTE);

    expect(alert).toHaveBeenCalledTimes(1);
    const said = alert.mock.calls[0].slice(0, 2).join(' ');
    expect(said).toContain(NOTE);
    expect(navigate).not.toHaveBeenCalled();
    expect(createEntry).not.toHaveBeenCalled();
    expect(warned).toHaveBeenCalled();

    alert.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// What is left of the compose path, which T060 re-points and T068 retires
// ---------------------------------------------------------------------------

describe('the compose modal’s remaining save path', () => {
  const composed = {
    contentBlocks: [{ type: 'text', content: 'the clinic on rue de Maubeuge' }],
    visibility: 'private',
    location: { latitude: 48.8809, longitude: 2.3553 },
    locationSharing: 'private',
    date: new Date('2026-11-08T09:07:00.000Z'),
  };

  it('still carries every field it is handed, locationSharing included', async () => {
    // Already true before T032, and the reason it is pinned here rather than left to
    // `entryLocationSharing.journey.test.js` alone: that file's hop 2 runs through this very
    // handler, and this is the task that rewrites it. `locationSharing` was once the one field
    // this handler dropped, which shared an exact location with everyone who could see the
    // memory while the person believed they had narrowed it.
    const { tree } = await render();

    await act(async () => {
      await composeModal(tree).props.onSave(composed);
    });

    expect(createEntry).toHaveBeenCalledTimes(1);
    expect(createEntry.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        userId: 'user-1',
        contentBlocks: composed.contentBlocks,
        visibility: 'private',
        location: composed.location,
        locationSharing: 'private',
        date: composed.date,
      }),
    );
  });

  it('reports a failed save instead of swallowing it (FR-017)', async () => {
    // What `:594-621` did: `catch (error) { console.error(...) }`. Nothing on screen, nothing
    // saved, and the comment said the hook's error state would show it — it does not reach
    // this screen. Whatever is left of this path, a failure has to be said.
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const warned = silenceWarnings();
    createEntry.mockRejectedValueOnce(new Error('disk full'));

    const { tree } = await render();

    await act(async () => {
      await composeModal(tree).props.onSave(composed);
    });

    expect(alert).toHaveBeenCalledTimes(1);
    expect(warned).toHaveBeenCalled();

    alert.mockRestore();
  });

  // Deliberately not asserted here: which outcomes leave the modal open. This harness calls
  // `onSave` on a modal it never opened, so `visible` is false whatever the handler does —
  // measured, by deleting the handler's `setShowComposeModal(false)` and watching all of this
  // file stay green. Opening the modal for real means an entry in the feed, a card tap and the
  // detail view's Edit; that is the journey T060 rewrites, and it is where the expectation
  // belongs. Until then the handler's own shape is the guarantee: it closes the modal only
  // after a resolved `createEntry`, and says so on a rejected one.
});

// ---------------------------------------------------------------------------
// FR-011, US1-8 — a memory the server would not share is shared again from the Journal
// ---------------------------------------------------------------------------

/**
 * T036 wires the card's `onReshare` on this screen. What the card does on its own — the two
 * lines, "Not shared yet" in place of the audience label, and opening `SaveAudienceSheet` — is
 * `JournalEntryCard.share.test.js`. What is here is the one thing only the screen can do:
 * turn the person's choice into a re-share, and say so if that fails.
 *
 * It is driven through a real card in the real list, by tapping, because that is the last
 * stretch of US1 and the checkpoint is "US1 works end to end in jest". The memory is dated
 * today so the screen's own day filter shows it without relying on its jump-to-the-newest
 * effect.
 */
describe('a refused memory is shared again from the Journal screen (US1-8)', () => {
  const refused = {
    localId: 'local-refused',
    id: 'local-refused',
    userId: 'user-1',
    journalId: 'journal-1',
    date: toDateKey(new Date()),
    createdAt: Date.now(),
    visibility: 'family',
    syncStatus: 'pending',
    shareState: ShareState.REFUSED,
    contentBlocks: [{ type: 'text', content: 'the arcade on the corner' }],
  };

  const REFUSED_LINE = 'Not shared — tap to choose who can see it';

  const CardComponent = JournalEntryCard.type ?? JournalEntryCard;

  const textsIn = (node) =>
    node
      .findAllByType(Text)
      .map((t) => (Array.isArray(t.props.children) ? t.props.children.join('') : t.props.children))
      .filter((value) => typeof value === 'string');

  /** The card for the refused memory, as the list really renders it. */
  const card = (tree) => tree.root.findByType(CardComponent);

  const refusedLine = (tree) => {
    const matches = card(tree)
      .findAllByType(TouchableOpacity)
      .filter((node) => typeof node.props?.onPress === 'function' && textsIn(node).includes(REFUSED_LINE));
    if (matches.length === 0) {
      throw new Error('No control on the card carries the refused-share line');
    }
    return matches[matches.length - 1];
  };

  const audienceOption = (tree, value) =>
    tree.root.findAll(
      (node) =>
        node.props?.testID === `audience-option-${value}` &&
        typeof node.props?.onPress === 'function',
    )[0];

  const chooseFriends = async (tree) => {
    await tap(refusedLine(tree));
    await tap(audienceOption(tree, 'friends'));
  };

  beforeEach(() => {
    setFeedEntries([refused]);
  });

  it('shows the memory with its refusal, and no audience label (SC-010)', async () => {
    // The guard that stops the cases below asserting nothing: if the card were not on screen,
    // `refusedLine` would throw, and this says why.
    const { tree } = await render();

    expect(textsIn(card(tree))).toContain(REFUSED_LINE);
    expect(textsIn(card(tree))).toContain('Not shared yet');
    expect(textsIn(card(tree))).not.toContain('Family');
  });

  it('re-shares the memory with the audience the person chose', async () => {
    const { tree } = await render();

    await chooseFriends(tree);

    expect(JournalService.reshareEntry).toHaveBeenCalledTimes(1);
    expect(JournalService.reshareEntry).toHaveBeenCalledWith('local-refused', 'friends');
  });

  it('reloads the day so the card stops saying the memory is not shared', async () => {
    const { tree } = await render();
    refreshFeed.mockClear();

    await chooseFriends(tree);

    expect(refreshFeed).toHaveBeenCalled();
  });

  it('shares nothing when the sheet is dismissed', async () => {
    const { tree } = await render();

    await tap(refusedLine(tree));
    await act(async () => {
      tree.root.findByType(SaveAudienceSheet).props.onDismiss();
    });

    expect(JournalService.reshareEntry).not.toHaveBeenCalled();
  });

  it('says so when the re-share fails, rather than leaving it looking shared (FR-017)', async () => {
    // The refusal is still on the card — `reshareEntry` clears it only once the memory is
    // queued — so silence here would leave the person tapping a line that does nothing.
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const warned = silenceWarnings();
    JournalService.reshareEntry.mockRejectedValueOnce(new Error('queue is unavailable'));

    const { tree } = await render();

    await chooseFriends(tree);

    expect(alert).toHaveBeenCalledTimes(1);
    expect(textsIn(card(tree))).toContain(REFUSED_LINE);
    expect(warned).toHaveBeenCalled();

    alert.mockRestore();
  });

  it('says what Local Only means for this memory, rather than "try again"', async () => {
    // `reshareEntry` refuses outright while storage is Local Only: nothing drains the queue
    // there, so clearing the refusal would leave the card looking shared over a memory that
    // can never be sent. The person tapped an explicit choice, so they are told — and told
    // something they can act on, because trying again changes nothing until cloud sync is
    // back on.
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    silenceWarnings();
    JournalService.reshareEntry.mockRejectedValueOnce(
      Object.assign(new Error('Storage is Local Only'), { code: 'local_only_storage' }),
    );

    const { tree } = await render();

    await chooseFriends(tree);

    expect(alert).toHaveBeenCalledTimes(1);
    const said = alert.mock.calls[0].slice(0, 2).join(' ');
    expect(said).toContain('Local Only');
    expect(said).not.toMatch(/try again/i);
    // And the memory still says what is true of it.
    expect(textsIn(card(tree))).toContain(REFUSED_LINE);

    alert.mockRestore();
  });

  it('says so when a choice arrives with no audience in it, rather than doing nothing', async () => {
    // Unreachable from the Journal list today — `SaveAudienceSheet` reports a value or nothing
    // at all — so this is the handler's own guard, which until now was a bare `return`: a
    // silent no-op immediately after the person made an explicit choice, which is the one
    // thing FR-011 says a refusal must never be. Nothing is shared either way.
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const { tree } = await render();

    for (const [entry, visibility] of [
      [refused, undefined],
      [{ ...refused, localId: null }, 'friends'],
    ]) {
      await act(async () => {
        await card(tree).props.onReshare(entry, visibility);
      });
    }

    expect(alert).toHaveBeenCalledTimes(2);
    expect(JournalService.reshareEntry).not.toHaveBeenCalled();

    alert.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// The seconds between sending a typed note and the capture screen (round-1 finding 4)
// ---------------------------------------------------------------------------

/**
 * A regression this feature introduces, and the only one on this path. Before it,
 * `handleSendMessage` awaited `createEntry` — a local database write, tens of milliseconds —
 * and the feedback was the memory appearing in the list. Now the bar clears the input and
 * dismisses the keyboard the moment Send is tapped (`QuickCaptureBar.handleSend` calls
 * `onSend` and then `setText('')` synchronously), and this screen then awaits
 * `CaptureLocation.withLocation` before anything moves. On a cold fix that is up to about four
 * seconds in which the words are gone from the input, the keyboard is gone, and nothing has
 * happened — which reads as "my note vanished".
 *
 * It is not every send: `stampLocation` caches a fix for two minutes, so this is the first
 * send after the app has been idle. And nothing is lost in any case — the note reaches the
 * draft, and a note that cannot be kept is said back with its words in it. What was missing is
 * any sign that the phone is still working on it.
 *
 * The indication lives on **this** screen, not in the bar: the Send button exists only while
 * there is text (`{hasText ? <send> : <mic>}`), so by the time this screen is awaiting
 * anything the control to disable is already gone and the input is already empty. This screen
 * owns the await and renders the bar, so it is the one that can say so — and `QuickCaptureBar`
 * keeps its contract exactly as it is.
 */
describe('a typed note that takes a moment to keep says so', () => {
  const KEEPING_NOTE = 'Keeping that note…';

  /** A stamping that has not finished yet, and the handle that finishes it. */
  const deferStamping = () => {
    let release;
    CaptureLocation.withLocation.mockImplementationOnce(
      (capture) =>
        new Promise((resolve, reject) => {
          release = { resolve: () => resolve({ ...capture, location: null }), reject };
        }),
    );
    return {
      finish: async () => {
        await act(async () => {
          release.resolve();
        });
      },
      fail: async () => {
        await act(async () => {
          release.reject(new Error('no fix, and no draft'));
        });
      },
    };
  };

  const allTexts = (tree) => textsAnywhere(tree.root);

  it('says nothing until something is sent', async () => {
    const { tree } = await render();

    expect(allTexts(tree)).not.toContain(KEEPING_NOTE);
  });

  it('says it is keeping the note while the note is still being kept', async () => {
    const stamping = deferStamping();

    const { tree, navigate } = await render();
    await tapSend(tree, NOTE);

    expect(allTexts(tree)).toContain(KEEPING_NOTE);
    // The honesty of the line: the capture screen has not opened yet, which is exactly the
    // stretch the person was looking at nothing.
    expect(navigate).not.toHaveBeenCalled();

    await stamping.finish();
  });

  it('stops saying it once the note is kept', async () => {
    const stamping = deferStamping();

    const { tree } = await render();
    await tapSend(tree, NOTE);
    await stamping.finish();

    expect(allTexts(tree)).not.toContain(KEEPING_NOTE);
  });

  it('stops saying it when the note could not be kept either', async () => {
    // The line must not outlive the attempt. The alert says what happened; a spinner left
    // spinning under it would say the opposite.
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    silenceWarnings();
    const stamping = deferStamping();

    const { tree } = await render();
    await tapSend(tree, NOTE);
    await stamping.fail();

    expect(allTexts(tree)).not.toContain(KEEPING_NOTE);
    expect(alert).toHaveBeenCalledTimes(1);

    alert.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// FR-022, FR-025, research R10 — the list tells each card whether it is on screen, and
// scrolls when a pin asks it to
// ---------------------------------------------------------------------------

/**
 * T051 wires the Journal's own half of the map on a card. The card's half — the badges, the
 * placeholder, the highlight and the measurement — is `JournalEntryCard.map.test.js`. What only
 * the screen can do is the two things here.
 *
 * **Which cards are on screen.** `MemoryRouteMap` mounts a native map view, and the Journal is a
 * list of cards; mounting one per card would cost a map for every memory in a day whether or not
 * anybody can see it. So the list reports its viewable rows and each card is told, and a card
 * that is not told anything shows its map as before (research R10 *Lazy rendering*, round-2 M10).
 * The assertion is on the map view itself, not on the heading: a mounted-but-hidden map would
 * still cost one.
 *
 * **Scrolling to a piece.** Only a list can scroll, and only the card knows where a piece sits
 * inside itself, so the two halves meet here: the card reports the piece's offset from its own
 * top and the list supplies the row (FR-025). `scrollToIndex` is spied on `FlatList`'s own
 * prototype, so what is proven is that the real list was really asked to move — not that a
 * handler of ours was called.
 *
 * Driven through a real card, a real map and a real pin in the real list, because the checkpoint
 * for this story is that the map works in jest end to end. This file already mocks
 * `react-native-maps` to views, so a marker's props — its coordinate and its press — are
 * readable on the tree.
 */
describe('the Journal list drives the map on its cards (FR-022, FR-025)', () => {
  // Two spots on the same street, about 100 m apart, which the 5-decimal merging grid keeps as
  // two places — so the first memory has two pins to tell apart.
  const BUS = { lat: 51.5001, lng: -0.1401 };
  const PLATFORM = { lat: 51.501, lng: -0.1401 };

  const note = (content, location) => ({ type: 'text', content, location, capturedAt: null });

  const memory = (localId, contentBlocks) => ({
    localId,
    id: localId,
    userId: 'user-1',
    journalId: 'journal-1',
    date: toDateKey(new Date()),
    createdAt: Date.now(),
    visibility: 'private',
    syncStatus: 'synced',
    contentBlocks,
  });

  const WALK = memory('local-walk', [
    note('on the 34 bus', BUS),
    note('on the platform', PLATFORM),
  ]);
  const KIOSK = memory('local-kiosk', [note('the kiosk', BUS)]);

  const CardComponent = JournalEntryCard.type ?? JournalEntryCard;

  /** The cards the list rendered, in the order it rendered them — so index 1 is the second row. */
  const cards = (tree) => tree.root.findAllByType(CardComponent);

  /**
   * React Native's `View` is itself a component that passes `testID` straight through to a host
   * `View`, so a single test id matches two instances. Only the host element is taken.
   */
  const isHost = (node) => typeof node.type === 'string';

  const hostsWithTestId = (node, testID) =>
    node.findAll((candidate) => isHost(candidate) && candidate.props?.testID === testID);

  /** The list, as the screen really renders it. */
  const list = (tree) => tree.root.findByType(FlatList);

  /** Tell the list which rows are on screen, as React Native's viewability checker would. */
  const reportViewable = async (tree, entries) => {
    await act(async () => {
      list(tree).props.onViewableItemsChanged({
        viewableItems: entries.map((entry, index) => ({ key: entry.localId, item: entry, index })),
        changed: [],
      });
    });
  };

  /** Every marker on this card's map, with the digits on it and its press. */
  const pins = (card) =>
    card
      .findAll((node) => node.props?.coordinate && typeof node.props?.onPress === 'function')
      .map((marker) => ({
        label: hostsWithTestId(marker, 'numbered-pin-label')[0]?.props?.children,
        press: marker.props.onPress,
      }));

  /** Report a layout, as React Native would once the view is measured. */
  const layout = async (node, y) => {
    await act(async () => {
      node.props.onLayout({ nativeEvent: { layout: { x: 0, y, width: 320, height: 100 } } });
    });
  };

  let scrollToIndex;

  beforeEach(() => {
    setFeedEntries([WALK, KIOSK]);
    scrollToIndex = jest.spyOn(FlatList.prototype, 'scrollToIndex').mockImplementation(() => {});
  });

  afterEach(() => {
    scrollToIndex.mockRestore();
  });

  it('renders both memories, so the cases below are about something', async () => {
    const { tree } = await render();

    expect(cards(tree).map((card) => card.props.entry.localId)).toEqual([
      'local-walk',
      'local-kiosk',
    ]);
  });

  it('shows every card its map until the list has reported anything', async () => {
    // `isVisible` defaults to true and the list has measured nothing yet, so nothing is held
    // back before React Native has said what is on screen.
    const { tree } = await render();

    expect(cards(tree).map((card) => card.props.isVisible)).toEqual([true, true]);
    expect(hostsWithTestId(tree.root, 'memory-route-map')).toHaveLength(2);
  });

  it('passes isVisible from onViewableItemsChanged, card by card', async () => {
    const { tree } = await render();

    await reportViewable(tree, [WALK]);

    expect(cards(tree).map((card) => card.props.isVisible)).toEqual([true, false]);
  });

  it('mounts no map at all on the card that scrolled off, and holds its height open', async () => {
    const { tree } = await render();

    await reportViewable(tree, [WALK]);

    expect(hostsWithTestId(tree.root, 'memory-route-map')).toHaveLength(1);
    expect(hostsWithTestId(tree.root, 'memory-route-map-placeholder')).toHaveLength(1);
    // The map view itself: `MemoryRouteMap` is the only thing on this screen that renders one,
    // and it is the cost the placeholder exists to avoid.
    expect(tree.root.findAll((node) => node.props?.scrollEnabled === false)).toHaveLength(1);
  });

  it('shows the map again when the card comes back into view', async () => {
    const { tree } = await render();

    await reportViewable(tree, [WALK]);
    await reportViewable(tree, [WALK, KIOSK]);

    expect(cards(tree).map((card) => card.props.isVisible)).toEqual([true, true]);
    expect(hostsWithTestId(tree.root, 'memory-route-map')).toHaveLength(2);
  });

  it('scrolls the list to the offset a card asks for, on that card’s row', async () => {
    // The narrow contract: the card reports an offset from its own top, and the row it is in
    // supplies the rest. A positive offset moves the piece up to the top of the screen, so the
    // row is placed that far above it.
    const { tree } = await render();

    await act(async () => {
      cards(tree)[1].props.onRequestScrollTo(160);
    });

    expect(scrollToIndex).toHaveBeenCalledTimes(1);
    expect(scrollToIndex).toHaveBeenCalledWith({ index: 1, viewOffset: -160, animated: true });
  });

  it('brings a piece into view when its pin is pressed, end to end (FR-025, SC-006)', async () => {
    const { tree } = await render();
    const walk = cards(tree)[0];

    // The card as React Native would have measured it: the piece list 40 points down the card,
    // the note on the platform 120 points down the list.
    await layout(hostsWithTestId(walk, 'memory-pieces')[0], 40);
    await layout(hostsWithTestId(walk, 'memory-piece-2')[0], 120);

    const pin = pins(walk).find((candidate) => candidate.label === '2');
    expect(pin).toBeDefined();
    await act(async () => {
      pin.press();
    });

    expect(scrollToIndex).toHaveBeenCalledWith({ index: 0, viewOffset: -160, animated: true });
    // And the piece the pin points at is lit while the list moves.
    expect(hostsWithTestId(walk, 'piece-highlight-2')).toHaveLength(1);
  });

  it('scrolls nowhere when a pin is pressed on a card nothing has measured', async () => {
    // A guessed offset would move the memory away from the person who just pressed a pin on it.
    const { tree } = await render();
    const pin = pins(cards(tree)[0]).find((candidate) => candidate.label === '2');

    await act(async () => {
      pin.press();
    });

    expect(scrollToIndex).not.toHaveBeenCalled();
  });
});
