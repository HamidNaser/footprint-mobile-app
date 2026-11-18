/**
 * 016 T005 — the Journal's date bar opens the book-style calendar, and a day's memories come
 * from the phone's own database rather than from the paged feed.
 *
 * Two changes a person can see, and this file is about both.
 *
 * 1. **FR-001.** Tapping the date used to open the platform's own white date picker
 *    (`CalendarPickerModal`). It now opens `CalendarSheet`, the book-style sheet T004 built.
 *    `CalendarPickerModal` itself is untouched and stays exported — `PersonJournalScreen` and
 *    `DateTimeField` still use it (FR-015, research R6) — so what is asserted here is narrow:
 *    *this* screen no longer renders it, and the barrel still offers it to the two screens that do.
 *
 * 2. **FR-004 and FR-010, which is the point of the task.** The Journal's feed is paged, 20 at a
 *    time (`useJournal`), so until now a day could only ever show the memories that page happened
 *    to hold: `allEntries.filter(sameDay)`. A journal of 100 memories therefore had 80 of them
 *    unreachable from the date bar, and the days they were on were not even arrow stops. The day
 *    now reads `getEntriesInRange(day, day, every precision, 'DESC')` and the arrows step over the
 *    calendar index, both of which read the whole journal.
 *
 * Five things this file is deliberately careful about.
 *
 * - **The feed really is paged, and the fixture really is beyond it.** Nothing here stands in for
 *   `useJournal`, `JournalService`, the repository or `DatabaseService`: the whole stack is the
 *   production code, over a real SQLite engine running production's schema (as
 *   `entryLocationSharing.journey.test.js` does, and for the same reason — a fake that returns
 *   what it was asked for would prove nothing about paging). So the first assertion of the main
 *   case is the real feed query returning 20 of 100 **without** the oldest day in it. If that
 *   assertion ever stops holding, the tests under it stop meaning what they say, and they fail
 *   rather than quietly becoming tautologies.
 *
 * - **A card action is driven through the card's own prop.** Pressing the heart inside the card is
 *   `JournalEntryCard`'s own business and is covered by its own tests; what only this screen can
 *   get wrong is *resolving which memory the id belongs to*. It used to look in `allEntries` —
 *   the loaded page — so on a day beyond the feed the handler returned before reaching the API and
 *   a like silently did nothing (analyze round 3, finding G1). That is one `return` away from
 *   coming back, so it has a test of its own.
 *
 * - **The two queries are compared against each other, not described.** Finding F3: the calendar
 *   shows the Journal's own card unchanged, so `getEntriesInRange` has to hand over the entry the
 *   feed's own query would hand over, field for field — which it only does because both map
 *   through `_mapEntryRow`. The case below reads one memory both ways and compares the whole
 *   object, and first checks the comparison is not vacuous by confirming the row's media really
 *   did need normalising on the way out.
 *
 * - **The card is a probe**, drawing nothing and found by its type, so the props the screen hands
 *   it can be read straight off it. That is how "the day view looks exactly as today" (FR-004)
 *   becomes an assertion rather than a hope: the whole set of props is pinned, so none of the four
 *   tasks after this one can quietly add, drop or rename one. The real card is mounted for real by
 *   `JournalScreen.capture.test.js`; mounting it here would be a slower way of testing somebody
 *   else's file.
 *
 * - **No date string is ever parsed as an instant.** Every day in the fixture is derived with
 *   `parseDateKey` (numeric parts, local) and `toDateKey`, so the whole file is stable in any
 *   zone — `scripts/test-tz.mjs` runs it in three.
 *
 * `picked` — month and year modes — is T006 and T007. Nothing here asserts anything about them.
 */

// The first mount transforms this screen and everything React Native pulls in behind it, which
// on a CI runner comfortably exceeds jest's 5s default.
jest.setTimeout(30000);

// ---------------------------------------------------------------------------
// Native modules that cannot load under jest.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// The local database: a real SQLite engine running production's own schema.
//
// `expo-sqlite` is a native module, so the connection is Node's SQLite instead. Everything above
// it is production code — the CREATE TABLEs, `DatabaseService`'s INSERT, its row mapping, and
// both of the queries this task is about. One database for the whole file: it is seeded once and
// every case below only reads.
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
    getDatabase: async () => connection,
    initializeDatabase: async () => {
      if (!db) {
        db = new DatabaseSync(':memory:');
        for (const create of Object.values(CREATE_TABLES)) db.exec(create);
        for (const index of CREATE_INDEXES) db.exec(index);
      }
      return connection;
    },
    clearDatabase: async () => {},
    closeDatabase: async () => {},
    getDatabaseStats: async () => ({}),
  };
});

// ---------------------------------------------------------------------------
// The screen's surroundings. The journal stack itself is left real.
// ---------------------------------------------------------------------------

/**
 * The two APIs a card action reaches. Watched rather than replaced with the real client: "the
 * call reaches the API" (finding G1) is a statement about these being called at all.
 */
jest.mock('../../api', () => ({
  ReactionsApi: { likeEntry: jest.fn(async () => ({})), unlikeEntry: jest.fn(async () => ({})) },
  CommentsApi: { addComment: jest.fn(async () => ({})) },
}));

jest.mock('../../api/ApiClient', () => ({
  ApiClient: {
    post: jest.fn(async () => ({})),
    patch: jest.fn(async () => ({})),
    get: jest.fn(async () => ({})),
    delete: jest.fn(async () => ({})),
  },
}));

jest.mock('../../sync/NetworkMonitor', () => ({
  NetworkMonitor: { isOnline: jest.fn(() => true), addListener: jest.fn(() => () => {}) },
}));

jest.mock('../../sync/SyncEngine', () => ({
  SyncEngine: { addListener: jest.fn(() => () => {}), syncNow: jest.fn(async () => ({})) },
  SyncEvent: { SYNC_COMPLETED: 'sync_completed' },
}));

jest.mock('../../services/SettingsService', () => {
  const service = {
    getOrCreateDefaultJournal: jest.fn(async () => 'journal-calendar'),
    getDefaultJournalId: jest.fn(async () => 'journal-calendar'),
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

jest.mock('../../services/FileService', () => ({
  FileService: {
    persist: jest.fn(async (uri) => uri),
    isPersisted: jest.fn(() => true),
    savePhoto: jest.fn(async (uri) => ({ localPath: uri })),
  },
  MediaType: { IMAGE: 'image', VIDEO: 'video', AUDIO: 'audio' },
}));

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

jest.mock('../../services/CaptureDraftStore', () => {
  const store = {
    DraftSlot: { NEW: 'new', EDIT: 'edit' },
    TEXT_DEBOUNCE_MS: 500,
    slotDirectory: (slot) => `file:///documents/capture-drafts/${slot}/`,
    load: jest.fn(async () => null),
    addPiece: jest.fn(async (slot, piece) => piece),
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
  const api = {
    withLocation: jest.fn(async (capture) => capture),
    stampLocation: jest.fn(async () => null),
    setCaptureEnabled: jest.fn(),
    isCaptureEnabled: jest.fn(() => true),
    clearCachedLocation: jest.fn(),
  };
  return { __esModule: true, ...api, default: api };
});

/**
 * A probe in the card's place, which records every prop the screen hands it.
 *
 * `isOwnMemory` comes out of the same module and is the card's own rule for whose memory a card
 * shows, so the mock has to carry it too. It answers truthfully for this file's one author.
 */
jest.mock('../../components/journal/JournalEntryCard', () => {
  const React = require('react');
  const { View } = require('react-native');
  /*
   * It draws nothing and carries no `testID`, and the cases below find it **by its type**.
   *
   * ⚠ Not by a `testID` on a host view, which is what this was first: React Native's own `View`
   * renders a nested host view of its own under some prop combinations, and that inner view
   * inherits the id — so every card was found twice, and `toEqual` on the ids read as a
   * duplicated memory. One composite instance per card is exactly one per card.
   */
  const Card = () => React.createElement(View, null);
  Card.displayName = 'JournalEntryCardProbe';
  return {
    __esModule: true,
    JournalEntryCard: Card,
    default: Card,
    isOwnMemory: (entry, userId) => !!userId && entry?.userId === userId,
  };
});

import React from 'react';
import { act, create } from 'react-test-renderer';
import { Alert, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import JournalScreen from '../JournalScreen';
import { CalendarSheet } from '../../components/journal/CalendarSheet';
import { CalendarPickerModal, DateSwipeContainer } from '../../components/journal';
import { JournalEntryCard as CardProbe } from '../../components/journal/JournalEntryCard';
// Nothing on this screen opens the old composer any more, and its mount is kept deliberately
// (see `handleSaveEntry`'s comment). It is the one way a test can reach this screen's own save
// path, which is what the fix-round-1 case at the foot of this file needs.
import { JournalComposeModal as ComposeModal } from '../../components/journal/JournalComposeModal';
import { DatabaseService } from '../../services/DatabaseService';
import { SettingsService } from '../../services/SettingsService';
import { ReactionsApi } from '../../api';
import { parseDateKey, toDateKey } from '../../utils/journalDate';
import { buildIndex } from '../../utils/calendarModel';

// ---------------------------------------------------------------------------
// The journal on the phone: 100 memories, four months of them.
// ---------------------------------------------------------------------------

const JOURNAL = 'journal-calendar';

/** How many memories the feed asks for at a time. `useJournal`'s own `initialLimit`. */
const PAGE = 20;

/** `n` days from `key`. Numeric parts only, so the answer is the same in every zone. */
const shiftDay = (key, n) => {
  const day = parseDateKey(key);
  day.setDate(day.getDate() + n);
  return toDateKey(day);
};

/** How many months apart two days are, which is how many ◄ the sheet needs between them. */
const monthsBetween = (fromKey, toKey) =>
  (Number(fromKey.slice(0, 4)) - Number(toKey.slice(0, 4))) * 12
  + (Number(fromKey.slice(5, 7)) - Number(toKey.slice(5, 7)));

/** 98 consecutive days with one memory each, the last of them the newest in the journal. */
const DAYS = 98;
const NEWEST_DAY = '2026-10-31';
const OLDEST_DAY = shiftDay(NEWEST_DAY, -(DAYS - 1));

/**
 * A 1st inside that run which holds **two** memories: the day's own, and one known only to its
 * month, which the holding area stores on the 1st (FR-016). It is well beyond the loaded feed.
 */
const ROUGH_DAY = '2026-09-01';

/** A day holding *nothing but* a memory known only to its year — so it is no day at all. */
const YEAR_ONLY_DAY = '2026-01-01';

const dayEntryId = (key) => `day-${key}`;

/** A photograph as the server sends one, so the row's media really needs normalising (F3). */
const serverPhoto = () => [{
  type: 'photo',
  order: 0,
  media: [{ id: 'media-1', url: 'https://cdn/original.jpg', thumbnailUrl: 'https://cdn/thumb.jpg' }],
}];

const note = (words) => [{ type: 'text', content: words, order: 0 }];

async function store({ localId, date, datePrecision = 'day', createdAt, contentBlocks }) {
  await DatabaseService.insertEntry({
    localId,
    serverId: `server-${localId}`,
    journalId: JOURNAL,
    userId: 'user-1',
    date,
    datePrecision,
    createdAt,
    contentBlocks,
    visibility: 'private',
  });
}

/**
 * One hundred memories: 98 day-dated, one per day; one known only to its month, on a 1st that
 * already has a day-dated memory of its own; and one known only to its year, on a day nothing
 * else is on.
 *
 * `createdAt` ascends with the day, so "newest first" within a day is a definite order: on
 * `ROUGH_DAY` the day-dated memory was created after the month-dated one and so comes first.
 */
async function seed() {
  for (let i = 0; i < DAYS; i += 1) {
    const day = shiftDay(OLDEST_DAY, i);
    await store({
      localId: dayEntryId(day),
      date: day,
      createdAt: 1_000_000 + i,
      // The newest memory is a photograph with nothing said about it, which is what puts
      // something in the "No story yet" worklist.
      contentBlocks: day === NEWEST_DAY ? serverPhoto() : note(`a memory of ${day}`),
    });
  }

  await store({
    localId: 'rough-month',
    date: ROUGH_DAY,
    datePrecision: 'month',
    createdAt: 900_000,
    contentBlocks: serverPhoto(),
  });

  await store({
    localId: 'rough-year',
    date: YEAR_ONLY_DAY,
    datePrecision: 'year',
    createdAt: 800_000,
    contentBlocks: note('sometime in 2026'),
  });
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const mounted = [];

/** Every pending read resolved and every resulting render committed. */
const settle = async () => {
  for (let i = 0; i < 6; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {});
  }
};

async function render() {
  let tree;
  await act(async () => {
    tree = create(<JournalScreen navigation={{ navigate: jest.fn(), goBack: jest.fn() }} />);
  });
  mounted.push(tree);
  await settle();
  return tree;
}

/** The control carrying this `testID` — the sheet's tiles and arrows are all named. */
const control = (tree, testID) =>
  tree.root.findAllByType(TouchableOpacity).find((node) => node.props.testID === testID);

const tap = async (tree, testID) => {
  const node = control(tree, testID);
  if (!node) throw new Error(`no control with testID "${testID}"`);
  if (node.props.disabled) throw new Error(`"${testID}" is faded and cannot be tapped`);
  await act(async () => {
    node.props.onPress();
  });
  await settle();
};

const dayTileId = (key) => `calendar-day-${key}`;

/** Every string a node renders, flattened — children may be an array of fragments. */
const textsIn = (node) =>
  node.findAllByType(Text).flatMap((t) => {
    const children = Array.isArray(t.props.children) ? t.props.children.flat(3) : [t.props.children];
    return children.filter((c) => typeof c === 'string');
  });

/** The date bar's own label, as `DateSelector` formats it. */
const dateLabel = (key) =>
  parseDateKey(key).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

/** The day the date bar currently names. */
const barShows = (tree, key) =>
  tree.root.findAllByType(TouchableOpacity).some((node) => textsIn(node).includes(dateLabel(key)));

/** Tap the date itself — the one control FR-001 is about. */
const tapDateBar = async (tree, key) => {
  const node = tree.root
    .findAllByType(TouchableOpacity)
    .filter((candidate) => textsIn(candidate).includes(dateLabel(key)))
    .pop();
  if (!node) throw new Error(`the date bar does not show ${key}`);
  await act(async () => {
    node.props.onPress();
  });
  await settle();
};

/**
 * The date bar's ◄ or ►. Found by the icon inside it, and asserted to be the only one on
 * screen: with the sheet open there are two of each, and pressing the wrong one would browse
 * the calendar while this file believed it had moved the Journal.
 */
const tapDateArrow = async (tree, direction) => {
  const icon = direction === 1 ? 'chevron-forward' : 'chevron-back';
  const buttons = tree.root
    .findAllByType(TouchableOpacity)
    .filter((node) => node.findAllByType(Ionicons).some((i) => i.props.name === icon));
  expect(buttons).toHaveLength(1);
  await act(async () => {
    buttons[0].props.onPress();
  });
  await settle();
};

const SwipeContainer = DateSwipeContainer.type ?? DateSwipeContainer;
const swipe = (tree) => tree.root.findByType(SwipeContainer);

/**
 * The platform's own picker, as `findByType` needs it.
 *
 * ⚠ `CalendarPickerModal` is wrapped in `memo`, and React gives a simple memo component's fiber
 * the **inner** function as its type. Handed the wrapper, `findByType` finds nothing — which for
 * an assertion that the picker is *gone* is a pass for the wrong reason, and was one here until
 * the deprecation warning the real picker logs gave it away.
 */
const PlatformPicker = CalendarPickerModal.type ?? CalendarPickerModal;

/** Every card the screen has drawn, in order. */
const cards = (tree) => tree.root.findAllByType(CardProbe);

/** The memories on screen, in the order their cards are drawn. */
const cardIds = (tree) => cards(tree).map((card) => card.props.entry.localId);

/** The props the screen handed one memory's card. */
const cardProps = (tree, localId) =>
  cards(tree).find((card) => card.props.entry.localId === localId).props;

const sheet = (tree) => tree.root.findByType(CalendarSheet);

/**
 * The screen records a line of its own on each read it could not make. Deliberate, and kept —
 * but it belongs in a production console, not in this suite's output. Restored by `afterEach`.
 */
const silenceWarnings = () => jest.spyOn(console, 'warn').mockImplementation(() => {});

let rangeReads;
let indexReads;

beforeAll(async () => {
  // `useJournal`, `JournalService` and this screen all narrate what they are doing. Kept out of
  // this suite's output, where a real warning is what a reader should notice.
  jest.spyOn(console, 'log').mockImplementation(() => {});
  await seed();
});

afterAll(() => {
  console.log.mockRestore();
});

beforeEach(() => {
  // Called through, not replaced: the day and the index really are read from the database, and
  // the spies are only how "it is read again" becomes an assertion.
  rangeReads = jest.spyOn(DatabaseService, 'getEntriesInRange');
  indexReads = jest.spyOn(DatabaseService, 'getCalendarIndexRows');
});

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
  // The spies (the range read, `Alert`, the consoles) and then the module factories' own
  // `jest.fn()`s, which `restoreAllMocks` does not touch — a like counted in one case must not
  // still be counted in the next.
  jest.restoreAllMocks();
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

// ---------------------------------------------------------------------------
// The fixture itself, stated once so nothing below is a tautology.
// ---------------------------------------------------------------------------

describe('the journal this screen is reading', () => {
  it('holds 100 memories, and the feed can only hand over 20 of them', async () => {
    const all = await DatabaseService.getEntriesByJournalId(JOURNAL, {
      limit: 500,
      orderBy: 'date',
      order: 'DESC',
    });
    expect(all).toHaveLength(100);

    // The page the screen's own feed loads, through the very query `useJournal` drives.
    const page = await DatabaseService.getEntriesByJournalId(JOURNAL, {
      limit: PAGE,
      offset: 0,
      orderBy: 'date',
      order: 'DESC',
    });
    expect(page).toHaveLength(PAGE);

    const loaded = page.map((entry) => entry.localId);
    expect(loaded).toContain(dayEntryId(NEWEST_DAY));
    // The three days every case below depends on being out of reach of the feed.
    expect(loaded).not.toContain(dayEntryId(OLDEST_DAY));
    expect(loaded).not.toContain(dayEntryId(ROUGH_DAY));
    expect(loaded).not.toContain('rough-month');
  });

  it('runs from July to October, so the oldest day is three months back', () => {
    expect(OLDEST_DAY).toBe('2026-07-26');
    expect(monthsBetween(NEWEST_DAY, OLDEST_DAY)).toBe(3);
    expect(ROUGH_DAY > OLDEST_DAY && ROUGH_DAY < NEWEST_DAY).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// FR-001: the date bar opens the book calendar, and not the platform's picker.
// ---------------------------------------------------------------------------

describe('the date bar opens the book-style calendar (FR-001)', () => {
  it('opens CalendarSheet, closed until it is tapped', async () => {
    const tree = await render();

    expect(sheet(tree).props.visible).toBe(false);

    await tapDateBar(tree, NEWEST_DAY);

    expect(sheet(tree).props.visible).toBe(true);
    // The sheet is drawn, not merely handed a flag: its own grid is on screen.
    expect(control(tree, dayTileId(NEWEST_DAY))).toBeDefined();
  });

  it('never opens with no index, so no calendar is ever wholly faded', async () => {
    const tree = await render();
    await tapDateBar(tree, NEWEST_DAY);

    const open = sheet(tree);
    expect(open.props.visible).toBe(true);
    expect(open.props.index).not.toBeNull();
    expect(open.props.index.days.size).toBeGreaterThan(0);
  });

  it('refuses to open, and says so, when the calendar cannot be read at all', async () => {
    silenceWarnings();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest
      .spyOn(DatabaseService, 'getCalendarIndexRows')
      .mockRejectedValue(new Error('the database is unreadable'));

    const tree = await render();
    await tapDateBar(tree, NEWEST_DAY);

    expect(sheet(tree).props.visible).toBe(false);
    expect(alert).toHaveBeenCalled();
    expect(String(alert.mock.calls[0][0])).toMatch(/calendar/i);
  });

  it('tells the sheet which day the Journal is on', async () => {
    const tree = await render();
    await tapDateBar(tree, NEWEST_DAY);

    expect(sheet(tree).props.picked).toEqual({ kind: 'day', date: NEWEST_DAY });
  });

  it('closes itself when a day is picked, and only then', async () => {
    const tree = await render();
    await tapDateBar(tree, NEWEST_DAY);

    // Browsing the calendar leaves the Journal exactly where it was.
    await tap(tree, 'calendar-view-month');
    expect(sheet(tree).props.visible).toBe(true);
    expect(barShows(tree, NEWEST_DAY)).toBe(true);

    await tap(tree, 'calendar-view-date');
    await tap(tree, dayTileId(shiftDay(NEWEST_DAY, -1)));

    expect(sheet(tree).props.visible).toBe(false);
    expect(barShows(tree, shiftDay(NEWEST_DAY, -1))).toBe(true);
  });

  it('closes on ✕ with nothing chosen', async () => {
    const tree = await render();
    await tapDateBar(tree, NEWEST_DAY);
    await tap(tree, 'calendar-sheet-close');

    expect(sheet(tree).props.visible).toBe(false);
    expect(barShows(tree, NEWEST_DAY)).toBe(true);
  });

  it('no longer mounts the platform picker here, and leaves it for the screens that use it', async () => {
    const tree = await render();

    expect(tree.root.findAllByType(PlatformPicker)).toHaveLength(0);
    // FR-015: `PersonJournalScreen` and `DateTimeField` still import it from here.
    expect(CalendarPickerModal).toBeDefined();
    expect(typeof PlatformPicker).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// FR-004 / FR-010: the day comes from the phone, not from the loaded page.
// ---------------------------------------------------------------------------

describe('a day shows every memory the phone holds for it (FR-004, FR-010)', () => {
  it('picking the oldest day shows its memories, 80 pages beyond the feed', async () => {
    const tree = await render();
    await tapDateBar(tree, NEWEST_DAY);

    // Back to July, the sheet's own ◄ — three months, read off the fixture.
    for (let i = 0; i < monthsBetween(NEWEST_DAY, OLDEST_DAY); i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await tap(tree, 'calendar-prev');
    }

    // The tile is not faded: the index knows that day holds a memory, which the feed does not.
    await tap(tree, dayTileId(OLDEST_DAY));

    expect(barShows(tree, OLDEST_DAY)).toBe(true);
    expect(cardIds(tree)).toEqual([dayEntryId(OLDEST_DAY)]);
    expect(rangeReads).toHaveBeenCalledWith(JOURNAL, OLDEST_DAY, OLDEST_DAY, null, 'DESC');
  });

  it('◄ ► on the date bar step through days the feed has never loaded', async () => {
    const tree = await render();
    await tapDateBar(tree, NEWEST_DAY);
    for (let i = 0; i < monthsBetween(NEWEST_DAY, OLDEST_DAY); i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await tap(tree, 'calendar-prev');
    }
    await tap(tree, dayTileId(OLDEST_DAY));

    // There is nothing earlier with a day of its own, so ◄ stops here rather than wrapping.
    expect(swipe(tree).props.hasPrevious).toBe(false);
    expect(swipe(tree).props.hasNext).toBe(true);

    await tapDateArrow(tree, 1);
    expect(barShows(tree, shiftDay(OLDEST_DAY, 1))).toBe(true);
    expect(cardIds(tree)).toEqual([dayEntryId(shiftDay(OLDEST_DAY, 1))]);

    await tapDateArrow(tree, 1);
    expect(barShows(tree, shiftDay(OLDEST_DAY, 2))).toBe(true);
    expect(cardIds(tree)).toEqual([dayEntryId(shiftDay(OLDEST_DAY, 2))]);

    await tapDateArrow(tree, -1);
    expect(barShows(tree, shiftDay(OLDEST_DAY, 1))).toBe(true);
    expect(cardIds(tree)).toEqual([dayEntryId(shiftDay(OLDEST_DAY, 1))]);
  });

  it('keeps a memory known only to its month on the 1st, as today (FR-016)', async () => {
    const tree = await render();
    await tapDateBar(tree, NEWEST_DAY);
    for (let i = 0; i < monthsBetween(NEWEST_DAY, ROUGH_DAY); i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await tap(tree, 'calendar-prev');
    }
    await tap(tree, dayTileId(ROUGH_DAY));

    // Both of that 1st's memories, newest first: the day-dated one, then the month-dated one.
    expect(cardIds(tree)).toEqual([dayEntryId(ROUGH_DAY), 'rough-month']);
  });

  it('does not make a day out of a memory known only to its year (FR-016)', async () => {
    const tree = await render();
    await tapDateBar(tree, NEWEST_DAY);

    // January holds one memory, known only to its year. Its 1st is faded and inert, and the
    // date bar's ◄ does not stop there either — the oldest day is July's.
    for (let i = 0; i < monthsBetween(NEWEST_DAY, YEAR_ONLY_DAY); i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await tap(tree, 'calendar-prev');
    }
    expect(control(tree, dayTileId(YEAR_ONLY_DAY)).props.disabled).toBe(true);

    expect(sheet(tree).props.index.days.has(YEAR_ONLY_DAY)).toBe(false);
    expect(sheet(tree).props.index.years.get('2026')).toBe(100);
  });

  it('hands its cards exactly the props the day feed has always handed them (FR-004)', async () => {
    const tree = await render();

    expect(Object.keys(cardProps(tree, dayEntryId(NEWEST_DAY))).sort()).toEqual([
      'currentUserId',
      'entry',
      'hasUnfinishedEdit',
      'isVisible',
      'onAddResponse',
      'onContinueEdit',
      'onGalleryPress',
      'onMenuPress',
      'onPhotoPress',
      'onReact',
      'onRequestScrollTo',
      'onReshare',
      'onVideoPress',
      'primaryColor',
      'user',
    ]);
  });

  it('keeps the "No story yet" worklist exactly as it is', async () => {
    const tree = await render();

    // On the oldest day, where the worklist's own memory is not.
    await tapDateBar(tree, NEWEST_DAY);
    for (let i = 0; i < monthsBetween(NEWEST_DAY, OLDEST_DAY); i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await tap(tree, 'calendar-prev');
    }
    await tap(tree, dayTileId(OLDEST_DAY));
    expect(cardIds(tree)).toEqual([dayEntryId(OLDEST_DAY)]);

    const chip = tree.root
      .findAllByType(TouchableOpacity)
      .find((node) => textsIn(node).some((s) => s.startsWith('No story yet')));
    expect(chip).toBeDefined();

    await act(async () => {
      chip.props.onPress();
    });
    await settle();

    // The worklist ignores the selected day, as it always has.
    expect(cardIds(tree)).toEqual([dayEntryId(NEWEST_DAY)]);
  });
});

// ---------------------------------------------------------------------------
// Finding G1: a card action on a day beyond the feed.
// ---------------------------------------------------------------------------

describe('a card action reaches the API on a day beyond the loaded feed (G1)', () => {
  /** The screen on `ROUGH_DAY`, two cards, neither of them in the loaded page. */
  const onRoughDay = async () => {
    const tree = await render();
    await tapDateBar(tree, NEWEST_DAY);
    for (let i = 0; i < monthsBetween(NEWEST_DAY, ROUGH_DAY); i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await tap(tree, 'calendar-prev');
    }
    await tap(tree, dayTileId(ROUGH_DAY));
    return tree;
  };

  it('a like on such a card is sent, and the day is read again afterwards', async () => {
    const tree = await onRoughDay();

    const card = cardProps(tree, 'rough-month');
    const before = rangeReads.mock.calls.length;
    const indexBefore = indexReads.mock.calls.length;

    await act(async () => {
      await card.onReact('rough-month', 'heart');
    });
    await settle();

    // It used to be resolved out of `allEntries` — the loaded page — and this memory is not in
    // it, so the handler returned and the like went nowhere at all.
    expect(ReactionsApi.likeEntry).toHaveBeenCalledWith('server-rough-month');
    // And the open day is read again, so the card is not left showing what it showed before.
    expect(rangeReads.mock.calls.length).toBeGreaterThan(before);
    expect(rangeReads).toHaveBeenLastCalledWith(JOURNAL, ROUGH_DAY, ROUGH_DAY, null, 'DESC');
    // The index with it. A like changes no day's count, so this half is insurance — but the
    // two are one function precisely so they cannot drift apart (fix round 1, A).
    expect(indexReads.mock.calls.length).toBeGreaterThan(indexBefore);
  });

  it('a reply on such a card is sent too', async () => {
    const { CommentsApi } = require('../../api');
    const tree = await onRoughDay();

    const card = cardProps(tree, dayEntryId(ROUGH_DAY));
    await act(async () => {
      await card.onAddResponse(dayEntryId(ROUGH_DAY), 'I remember this');
    });
    await settle();

    expect(CommentsApi.addComment).toHaveBeenCalledWith(
      `server-${dayEntryId(ROUGH_DAY)}`,
      'I remember this',
    );
  });
});

// ---------------------------------------------------------------------------
// Finding F3: the two queries hand over the same entry.
// ---------------------------------------------------------------------------

describe('a day read is the same entry the feed would hand over (F3)', () => {
  it('matches field for field, media normalisation included', async () => {
    const viaRange = await DatabaseService.getEntriesInRange(JOURNAL, ROUGH_DAY, ROUGH_DAY, null, 'DESC');
    expect(viaRange).toHaveLength(2);

    const viaFeed = await DatabaseService.getEntriesByJournalId(JOURNAL, {
      limit: 500,
      orderBy: 'date',
      order: 'DESC',
    });
    const byId = new Map(viaFeed.map((entry) => [entry.localId, entry]));

    viaRange.forEach((entry) => {
      expect(byId.get(entry.localId)).toBeDefined();
      expect(entry).toEqual(byId.get(entry.localId));
    });

    // The comparison is not vacuous: this row's media was stored as the server sends it and
    // came out normalised, which is the work `JournalRepository`'s own mapper does not do.
    const rough = viaRange.find((entry) => entry.localId === 'rough-month');
    expect(rough.contentBlocks[0].media[0]).toMatchObject({
      serverUrl: 'https://cdn/original.jpg',
      thumbnailUri: 'https://cdn/thumb.jpg',
    });
  });

  it('is built from the same rows the calendar counts', async () => {
    const index = buildIndex(await DatabaseService.getCalendarIndexRows(JOURNAL));

    expect(index.days.size).toBe(DAYS);
    expect(index.days.get(ROUGH_DAY)).toBe(1);
    expect(index.months.get('2026-09')).toBe(31);
    expect(index.roughMonths.get('2026-09')).toBe(1);
    expect(index.years.get('2026')).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Fix round 1. Four things the first draft of this task got wrong, and two
// gaps in what it covered.
// ---------------------------------------------------------------------------

describe('what the screen does when a read does not answer (fix round 1)', () => {
  /**
   * **B.** The day's memories and the feed's are two different queries — this one has its own
   * `substr`, its own precision clause — so this one can fail on its own while the rest of the
   * screen looks perfectly healthy. When it does, the screen must not answer the question it
   * failed to ask.
   *
   * It used to set the day to `[]` in the `catch`, and `[]` is "read, and there are none": the
   * empty state drew *"No entries yet"* and *"Start journaling your thoughts, photos, and
   * memories"* over a day holding memories. Telling somebody their day is empty is a claim about
   * their own data, and a failed read is no basis for it.
   */
  it('says nothing about a day it could not read, rather than that it is empty', async () => {
    silenceWarnings();
    jest
      .spyOn(DatabaseService, 'getEntriesInRange')
      .mockRejectedValue(new Error('the day is unreadable'));

    const tree = await render();

    expect(cardIds(tree)).toEqual([]);
    const said = textsIn(tree.root);
    expect(said).not.toContain('No entries yet');
    expect(said).not.toContain('Start journaling your thoughts, photos, and memories');
  });

  /**
   * **C.** `initializeJournal` is asynchronous, so there is a moment on arrival when there is no
   * journal to read a calendar of. That is not a failure and must not be reported as one: a tap
   * then used to raise "Could not open the calendar", where the picker this replaces simply
   * opened. The body of the screen is showing "Loading journal…" at that point, so the honest
   * answer is to do nothing at all.
   */
  it('does not call a journal that has not loaded yet a failure', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    // The journal never arrives, which is the first frame held still.
    jest.spyOn(SettingsService, 'getOrCreateDefaultJournal').mockResolvedValueOnce(null);

    const tree = await render();
    const label = tree.root
      .findAllByType(TouchableOpacity)
      .filter((node) => textsIn(node).some((s) => s === dateLabel(toDateKey(new Date()))))
      .pop();
    expect(label).toBeDefined();

    await act(async () => {
      label.props.onPress();
    });
    await settle();

    expect(alert).not.toHaveBeenCalled();
    expect(sheet(tree).props.visible).toBe(false);
  });
});

describe('an empty journal (fix round 1, D)', () => {
  /**
   * The spec's own edge case: *"the calendar opens with everything faded"*. It still **opens** —
   * `buildIndex([])` is an index, so `openCalendar` has one and the constraint it guards is met —
   * and every day in it is faded and inert, because there is nothing to pick.
   *
   * And this is the other half of the case above: a day that really has been read and really has
   * nothing does get "No entries yet". Without this, that case could pass on an empty state that
   * never renders at all.
   */
  it('opens the calendar anyway, with every day faded, and says the day is empty', async () => {
    jest.spyOn(SettingsService, 'getOrCreateDefaultJournal').mockResolvedValueOnce('journal-none');

    const tree = await render();
    const today = toDateKey(new Date());

    expect(cardIds(tree)).toEqual([]);
    expect(textsIn(tree.root)).toContain('No entries yet');
    expect(swipe(tree).props.hasNext).toBe(false);
    expect(swipe(tree).props.hasPrevious).toBe(false);

    await tapDateBar(tree, today);

    expect(sheet(tree).props.visible).toBe(true);
    expect(sheet(tree).props.index).not.toBeNull();
    expect(sheet(tree).props.index.days.size).toBe(0);

    const tiles = tree.root
      .findAllByType(TouchableOpacity)
      .filter((node) => String(node.props.testID).startsWith('calendar-day-'));
    expect(tiles.length).toBeGreaterThan(27);
    expect(tiles.every((tile) => tile.props.disabled)).toBe(true);
  });
});

describe('the far end of the journal (fix round 1, D)', () => {
  /** The oldest day stops ◄; this is the other end, which nothing covered. */
  it('stops ► on the newest day', async () => {
    const tree = await render();

    expect(barShows(tree, NEWEST_DAY)).toBe(true);
    expect(swipe(tree).props.hasNext).toBe(false);
    expect(swipe(tree).props.hasPrevious).toBe(true);

    // And ► really does nothing, rather than the container alone refusing it.
    await tapDateArrow(tree, 1);
    expect(barShows(tree, NEWEST_DAY)).toBe(true);
    expect(cardIds(tree)).toEqual([dayEntryId(NEWEST_DAY)]);
  });
});

describe('a memory saved onto a day that had none (fix round 1, A)', () => {
  /**
   * **A.** The day's memories and "which days hold memories" are two answers to one question,
   * and only the first was re-read after a save. So the memory appeared, and then its day was
   * not a stop for ◄ ► and its tile in the calendar was faded and untappable until the sheet
   * next happened to be opened. Before this feature the arrows read the live feed, so a brand
   * new day became a stop at once — that was a loss, and this is it covered.
   *
   * The save goes through the screen's own handler and the real service, so the memory really is
   * written to the database this screen reads. The row is removed again afterwards: every other
   * case in this file counts on the journal holding exactly 100 memories.
   */
  it('makes that day a stop for the arrows, without the calendar being reopened', async () => {
    const NEW_DAY = shiftDay(NEWEST_DAY, 3);
    const tree = await render();

    try {
      // Before: the newest day is the end of the journal, and the new day is not in the index.
      expect(swipe(tree).props.hasNext).toBe(false);
      await tapDateBar(tree, NEWEST_DAY);
      expect(sheet(tree).props.index.days.has(NEW_DAY)).toBe(false);
      await tap(tree, 'calendar-sheet-close');

      await act(async () => {
        await tree.root.findByType(ComposeModal).props.onSave({
          contentBlocks: [{ type: 'text', content: 'a memory of a brand new day', order: 0 }],
          visibility: 'private',
          locationSharing: 'private',
          date: NEW_DAY,
        });
      });
      await settle();

      // The save is confirmed on screen, which is `revealEntry`'s whole job.
      expect(barShows(tree, NEW_DAY)).toBe(true);
      expect(cardIds(tree)).toHaveLength(1);

      // And the new day is a real day of the journal: ◄ steps off it, and ► comes back to it.
      expect(swipe(tree).props.hasPrevious).toBe(true);
      await tapDateArrow(tree, -1);
      expect(barShows(tree, NEWEST_DAY)).toBe(true);
      expect(swipe(tree).props.hasNext).toBe(true);
      await tapDateArrow(tree, 1);
      expect(barShows(tree, NEW_DAY)).toBe(true);
    } finally {
      const db = await DatabaseService.getDb();
      await db.runAsync('DELETE FROM journal_entries WHERE date = ?', [NEW_DAY]);
    }
  });
});
