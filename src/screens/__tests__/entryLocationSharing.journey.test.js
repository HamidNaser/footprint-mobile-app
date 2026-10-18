/**
 * The per-memory location-sharing choice has to leave the phone.
 *
 * <p>
 * The compose screen offers a real control — <i>Only Me / Family / Everyone</i> — for who sees
 * a memory's exact coordinates, and defaults it to Only Me. Somebody whose account default is
 * Everyone can pick Only Me for one sensitive memory, and the tap was thrown away: the save
 * handler copied four fields out of the modal's payload and not this one, there was no column
 * to put it in, and the upload serialiser's `|| undefined` dropped the key. The server then
 * applied the account default, so the exact spot was shared with everyone who could already
 * see the memory, while the person believed they had narrowed it.
 * </p>
 *
 * <p>
 * This drives the <b>real journey</b>, hop by hop, with production code at every hop: the modal
 * is rendered and tapped, the screen's own save handler runs, the real service and repository
 * write through the real SQL, and the real serialiser produces the real request body. Only the
 * native modules are substituted, and `expo-sqlite` is replaced by Node's own SQLite running
 * production's schema — the same engine and the same statements, so a passing assertion here
 * means the value survived, not that a fake honoured the call it was written for.
 * </p>
 *
 * <p>
 * Deliberately not a source-text check. `entryDatePrecisionSchema.test.js` asserts its round trip
 * by grepping for a line, which stays green while the value is discarded on the wire — that is
 * exactly the failure being fixed here, so it is not a pattern to copy.
 * </p>
 */

// The first mount transforms the screen and everything React Native pulls in behind it, which
// on a CI runner comfortably exceeds jest's 5s default.
jest.setTimeout(30000);

// ---------------------------------------------------------------------------
// Native modules that cannot load under jest.
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
  return { __esModule: true, default: Stub, Marker: Stub, Callout: Stub, PROVIDER_GOOGLE: 'google' };
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

// ---------------------------------------------------------------------------
// The local database: a real SQLite engine running production's own schema.
//
// `expo-sqlite` is a native module, so the connection is Node's SQLite instead. Everything
// above it -- the CREATE TABLE statements, the migrations, DatabaseService's INSERT and its row
// mapping -- is the production code, unmodified.
// ---------------------------------------------------------------------------

jest.mock('../../database', () => {
  const { DatabaseSync } = require('node:sqlite');
  const { CREATE_TABLES, CREATE_INDEXES } = require('../../database/schema');
  const schema = require('../../database/schema');

  let db = null;

  const connection = {
    execAsync: async (sql) => db.exec(sql),
    runAsync: async (sql, params = []) => db.prepare(sql).run(...params),
    getFirstAsync: async (sql, params = []) => db.prepare(sql).get(...params) ?? null,
    getAllAsync: async (sql, params = []) => db.prepare(sql).all(...params),
    closeAsync: async () => db.close(),
  };

  return {
    ...schema,
    __rawDb: () => db,
    getDatabase: async () => connection,
    initializeDatabase: async () => {
      // A fresh install, built the way production builds one.
      db = new DatabaseSync(':memory:');
      for (const create of Object.values(CREATE_TABLES)) db.exec(create);
      for (const index of CREATE_INDEXES) db.exec(index);
      return connection;
    },
    clearDatabase: async () => {},
    closeDatabase: async () => {},
    getDatabaseStats: async () => ({}),
  };
});

// ---------------------------------------------------------------------------
// The network, and the screen's surroundings.
// ---------------------------------------------------------------------------

jest.mock('../../api/ApiClient', () => ({
  ApiClient: {
    post: jest.fn().mockResolvedValue({ id: 'server-1' }),
    patch: jest.fn().mockResolvedValue({ id: 'server-1' }),
    get: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock('../../sync/NetworkMonitor', () => ({
  NetworkMonitor: { isOnline: jest.fn().mockReturnValue(true), addListener: jest.fn(() => () => {}) },
}));

jest.mock('../../sync/SyncEngine', () => ({
  SyncEngine: { addListener: jest.fn(() => () => {}), syncNow: jest.fn().mockResolvedValue({}) },
  SyncEvent: { SYNC_COMPLETED: 'sync_completed' },
}));

jest.mock('../../services/SettingsService', () => ({
  SettingsService: {
    getOrCreateDefaultJournal: jest.fn().mockResolvedValue('journal-1'),
    getDefaultJournalId: jest.fn().mockResolvedValue('journal-1'),
    getStorageMode: jest.fn().mockResolvedValue('cloud_sync'),
    isSyncEnabled: jest.fn().mockResolvedValue(true),
    get: jest.fn().mockResolvedValue(null),
  },
  StorageMode: { LOCAL_ONLY: 'local_only', CLOUD_SYNC: 'cloud_sync' },
}));

jest.mock('../../services/FileService', () => ({
  FileService: {
    persist: jest.fn(async (uri) => uri),
    isPersisted: jest.fn(() => true),
    savePhoto: jest.fn(async (uri) => ({ localPath: uri })),
  },
  MediaType: { IMAGE: 'image', VIDEO: 'video', AUDIO: 'audio' },
}));

jest.mock('../../context', () => ({
  useRealtime: () => ({ isConnected: false, notifications: [], unreadCount: 0 }),
  useSync: () => ({
    isSyncing: false, lastSyncAt: null, pendingCount: 0, syncNow: jest.fn(),
    syncState: 'idle', isOnline: true,
  }),
  SyncState: { IDLE: 'idle', SYNCING: 'syncing', PAUSED: 'paused', ERROR: 'error', OFFLINE: 'offline', DISABLED: 'disabled' },
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1', name: 'Test' }, isAuthenticated: true }),
}));

jest.mock('../../hooks/useJournalRealtime', () => ({
  useJournalRealtime: () => ({}),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useFocusEffect: jest.fn(),
}));

// The phone already has location permission and knows where it is, which is what makes the
// compose screen show the sharing control at all.
jest.mock('../../services/LocationService', () => ({
  __esModule: true,
  default: {
    checkPermissions: jest.fn().mockResolvedValue({ foreground: 'granted' }),
    getCurrentLocation: jest.fn().mockResolvedValue({ latitude: 48.8809, longitude: 2.3553 }),
    reverseGeocode: jest.fn().mockResolvedValue({ formattedAddress: 'Gare du Nord' }),
    extractLocationFromExif: jest.fn(() => null),
  },
}));

import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text, TextInput, TouchableOpacity } from 'react-native';

import { JournalComposeModal } from '../../components/journal/JournalComposeModal';
import { JournalComposeModal as ModalInScreen } from '../../components/journal/JournalComposeModal';
import JournalScreen from '../JournalScreen';
import { JournalApi } from '../../api/JournalApi';
import { JournalService } from '../../services/JournalService';
import { DatabaseService } from '../../services/DatabaseService';
import { ApiClient } from '../../api/ApiClient';

/**
 * Everything mounted during a test, torn down afterwards. JournalScreen keeps timers and
 * in-flight reads going, which otherwise log after the test has finished.
 */
const mounted = [];

const mount = (element) => {
  const tree = create(element);
  mounted.push(tree);
  return tree;
};

afterEach(() => {
  while (mounted.length) {
    const tree = mounted.pop();
    try { act(() => { tree.unmount(); }); } catch { /* already gone */ }
  }
});

/** Every string a node currently renders, flattened. */
const textOf = (node) =>
  node.findAllByType(Text).flatMap((t) => {
    const children = Array.isArray(t.props.children) ? t.props.children.flat(3) : [t.props.children];
    return children.filter((c) => typeof c === 'string');
  });

/** The innermost pressable showing this label — a chip, not the row around it. */
function pressable(tree, label) {
  const matches = tree.root
    .findAllByType(TouchableOpacity)
    .filter((node) => textOf(node).some((s) => s === label));
  if (matches.length === 0) throw new Error(`No pressable showing "${label}"`);
  return matches[matches.length - 1];
}

/**
 * Hop 1 of the journey: somebody writes a memory, picks who may see its exact spot, and saves.
 * Returns the payload the compose screen emits.
 */
async function composeAndSave(level, { touching = [] } = {}) {
  const saved = [];
  let tree;

  await act(async () => {
    tree = mount(
      <JournalComposeModal visible onClose={() => {}} onSave={(payload) => { saved.push(payload); }} />
    );
  });

  // Something to save, so the Save button is live.
  await act(async () => {
    tree.root.findAllByType(TextInput)[0].props.onChangeText('the clinic on rue de Maubeuge');
  });

  // Levels passed through on the way, so that landing on the picker's own default is the
  // result of a tap rather than of nothing having happened.
  for (const passing of touching) {
    await act(async () => { pressable(tree, passing).props.onPress(); });
  }

  await act(async () => { pressable(tree, level).props.onPress(); });
  await act(async () => { pressable(tree, 'Save').props.onPress(); });

  expect(saved).toHaveLength(1);
  return saved[0];
}

describe('a per-memory location-sharing choice survives the whole journey', () => {
  beforeEach(async () => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    ApiClient.post.mockResolvedValue({ id: 'server-1' });
    // One database for the file, so each test starts from an empty table rather than reading
    // the row a previous test left behind.
    if (DatabaseService.initialized) {
      const db = await DatabaseService.getDb();
      await db.runAsync('DELETE FROM journal_entries');
    }
  });

  it('is picked in the modal, stored locally, and present in the upload payload', async () => {
    // --- Hop 1: the compose screen emits the choice. -----------------------------------
    const composed = await composeAndSave('Everyone');
    expect(composed.locationSharing).toBe('everyone');

    // --- Hop 2: the screen's own save handler carries it into createEntry. -------------
    // This is where the tap was discarded: handleSaveEntry copied contentBlocks,
    // visibility, location and date, and nothing else. Watched rather than replaced, so the
    // real service still runs underneath and the rest of the journey is real.
    const handedOver = jest.spyOn(JournalService, 'createEntry');

    let screen;
    await act(async () => { screen = mount(<JournalScreen />); });

    await act(async () => {
      await screen.root.findByType(ModalInScreen).props.onSave(composed);
    });

    expect(handedOver).toHaveBeenCalledTimes(1);
    expect(handedOver.mock.calls[0][0].locationSharing).toBe('everyone');

    // --- Hop 3: the real service, repository and SQL wrote it to the local database. ---
    const stored = await DatabaseService.getDb().then((db) =>
      db.getAllAsync('SELECT * FROM journal_entries')
    );
    expect(stored).toHaveLength(1);
    expect(stored[0].location_sharing).toBe('everyone');

    // --- Hop 4: read back out of SQLite, the entry still carries it. -------------------
    const readBack = await DatabaseService.getEntryByLocalId(stored[0].local_id);
    expect(readBack.locationSharing).toBe('everyone');

    // --- Hop 5: the serialiser puts it on the wire. ------------------------------------
    await JournalApi.createEntry(readBack);
    const [, body] = ApiClient.post.mock.calls[0];
    expect(body.locationSharing).toBe('everyone');
  });

  it('narrows to Only Me when that is what was picked, rather than leaving it to the account', async () => {
    // The harm this whole change exists for, run end to end: the account default is Everyone,
    // one memory is marked Only Me, and that memory must not be the one that leaks. 'private'
    // on the wire is what stops the server reaching for the account default at all.
    const composed = await composeAndSave('Only Me', { touching: ['Everyone'] });
    expect(composed.locationSharing).toBe('private');

    let screen;
    await act(async () => { screen = mount(<JournalScreen />); });
    await act(async () => {
      await screen.root.findByType(ModalInScreen).props.onSave(composed);
    });

    const [row] = await DatabaseService.getDb().then((db) =>
      db.getAllAsync('SELECT * FROM journal_entries')
    );
    const readBack = await DatabaseService.getEntryByLocalId(row.local_id);

    await JournalApi.createEntry(readBack);
    const [, body] = ApiClient.post.mock.calls[0];
    expect(body.locationSharing).toBe('private');
  });

  it('re-opens an edited memory on the level that was saved, not on the default', async () => {
    // The picker pre-fills from the entry. If the stored level does not come back out of
    // SQLite, re-opening a memory shared with Family silently shows Only Me -- and saving
    // from there would narrow it without anybody being told.
    const composed = await composeAndSave('Family');

    let screen;
    await act(async () => { screen = mount(<JournalScreen />); });
    await act(async () => {
      await screen.root.findByType(ModalInScreen).props.onSave(composed);
    });

    const [row] = await DatabaseService.getDb().then((db) =>
      db.getAllAsync('SELECT * FROM journal_entries')
    );
    const stored = await DatabaseService.getEntryByLocalId(row.local_id);
    expect(stored.locationSharing).toBe('family');

    // Re-opened on the real stored entry, and saved again untouched.
    const resaved = [];
    let reopened;
    await act(async () => {
      reopened = mount(
        <JournalComposeModal
          visible
          entry={stored}
          onClose={() => {}}
          onSave={(payload) => { resaved.push(payload); }}
        />
      );
    });

    await act(async () => { pressable(reopened, 'Save').props.onPress(); });

    expect(resaved).toHaveLength(1);
    expect(resaved[0].locationSharing).toBe('family');
  });

  it('writes a changed level on edit, rather than keeping the one it was created with', async () => {
    // The update path whitelists the fields it will write. A level that can be chosen but not
    // re-chosen would leave the control working once and never again.
    const composed = await composeAndSave('Family');

    let screen;
    await act(async () => { screen = mount(<JournalScreen />); });
    await act(async () => {
      await screen.root.findByType(ModalInScreen).props.onSave(composed);
    });

    const [row] = await DatabaseService.getDb().then((db) =>
      db.getAllAsync('SELECT * FROM journal_entries')
    );

    await JournalService.updateEntry(row.local_id, { locationSharing: 'private' });

    const after = await DatabaseService.getEntryByLocalId(row.local_id);
    expect(after.locationSharing).toBe('private');
  });
});

/**
 * Backward compatibility. The server reads an absent value as "use the account default", which
 * is what it has always done, so an entry that genuinely carries no choice must still send no
 * key — a serialiser that invented one would change the behaviour of every client path that
 * does not go through the local database.
 */
describe('an entry carrying no choice is sent exactly as it is today', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ApiClient.post.mockResolvedValue({ id: 'server-1' });
  });

  const base = {
    localId: 'local-1',
    journalId: 'j1',
    date: '2026-08-05',
    contentBlocks: [],
    visibility: 'private',
  };

  it('omits the key entirely rather than guessing a level', async () => {
    await JournalApi.createEntry(base);

    const [, body] = ApiClient.post.mock.calls[0];
    expect(body.locationSharing).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(body, 'locationSharing')).toBe(true);
    expect(JSON.parse(JSON.stringify(body))).not.toHaveProperty('locationSharing');
  });

  it('still carries a level that is there, in either spelling', async () => {
    // camelCase off the API and snake_case out of SQLite. Missing either half would lose the
    // choice on one path only.
    await JournalApi.createEntry({ ...base, locationSharing: 'family' });
    expect(ApiClient.post.mock.calls[0][1].locationSharing).toBe('family');

    ApiClient.post.mockClear();
    await JournalApi.createEntry({ ...base, location_sharing: 'everyone' });
    expect(ApiClient.post.mock.calls[0][1].locationSharing).toBe('everyone');
  });

  it('carries it through batch sync as well as the single-entry route', async () => {
    // The batch contract needs the paired backend change before the server reads this; the
    // single-entry route above honours it today. Pinned so the phone's half does not regress
    // in the meantime.
    ApiClient.post.mockResolvedValueOnce({ created: [], updated: [], deleted: [] });

    await JournalApi.batchSync({ creates: [{ ...base, locationSharing: 'family' }] });

    const [, body] = ApiClient.post.mock.calls[0];
    expect(body.creates[0].locationSharing).toBe('family');
  });
});
