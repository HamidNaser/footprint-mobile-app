/**
 * 019 T009 -- `PersonJournalScreen` on the calendar (spec User Story 1; FR-005, FR-009, FR-011,
 * FR-012, FR-015).
 *
 * **These are the first tests this screen has ever had.** Until now it loaded a person's newest
 * 50 memories with `getUserEntries` and filtered them by the day somebody had picked in the
 * platform's own date picker: a journal of 120 memories had 70 of them unreachable on the phone,
 * and the days they were on were not even arrow stops. The screen now reads the server's
 * calendar look-ups through `usePeopleCalendar`, so a day, a month or a year of that person's
 * memories is shown, and every one of them can be reached however old it is.
 *
 * ## How the server is stood in for
 *
 * `JournalCalendarService` is mocked, and the three mocks are driven from **one list of
 * memories** -- `serve(visible)` -- which answers `/journal/calendar`, `/journal/period` and a
 * single day exactly as the real service would from the same data. That matters for two of User
 * Story 1's scenarios:
 *
 * - a **private** memory is simply left out of the list handed to `serve`, which is what the
 *   server's own visibility filter does, so the index and the pages agree about it -- 5 March is
 *   faded *because* nothing visible is on it, rather than because a case said so;
 * - the day and period answers are returned in the **server's** order (date, then created time),
 *   which is not the order any page shows, so every ordering assertion below is about the
 *   screen's own sorting rather than about the fixture's.
 *
 * Everything else is the real thing: `CalendarSheet`, `JournalDateBar`, `CalendarListHeading`,
 * `calendarModel` and the hook. Only `JournalEntryCard` is a probe -- it draws nothing and is
 * found by its type, so the props the screen hands it can be read straight off it, which is how
 * "a memory is drawn exactly as today" (FR-006) becomes an assertion.
 *
 * ⚠ **The map-gating cases live in `memoryMapViewability.test.js`**, not here: that suite pins
 * 016 FR-017's lazy map for both screens at once, and splitting it would leave two half-answers.
 */

// The first mount transforms this screen and everything React Native pulls in behind it, which
// on a CI runner comfortably exceeds jest's 5s default.
jest.setTimeout(30000);

// ---------------------------------------------------------------------------
// Native modules that cannot load under jest.
// ---------------------------------------------------------------------------

jest.mock('expo-video', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  return {
    VideoView: (props) => ReactLib.createElement(View, props, props.children),
    useVideoPlayer: jest.fn(() => ({ play: jest.fn(), pause: jest.fn(), release: jest.fn() })),
  };
});

jest.mock('react-native-maps', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  const Stub = (props) => ReactLib.createElement(View, props, props.children);
  return {
    __esModule: true, default: Stub, Marker: Stub, Callout: Stub, Polyline: Stub,
    PROVIDER_GOOGLE: 'google',
  };
});

/*
 * The compose modal reaches the camera and the photo library through `components/journal`'s
 * barrel, which this screen imports from. Neither can load under jest, and neither has anything
 * to do with reading somebody else's journal.
 */
jest.mock('expo-camera', () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: true }, jest.fn()],
  useMicrophonePermissions: () => [{ granted: true }, jest.fn()],
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  MediaTypeOptions: { All: 'All', Images: 'Images', Videos: 'Videos' },
}));

jest.mock('expo-media-library', () => ({
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  getAssetInfoAsync: jest.fn(async () => ({})),
  getAssetsAsync: jest.fn(async () => ({ assets: [] })),
  MediaType: { photo: 'photo', video: 'video' },
  SortBy: { creationTime: 'creationTime' },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
    multiRemove: jest.fn(async () => undefined),
    getAllKeys: jest.fn(async () => []),
  },
}));

jest.mock('react-native-safe-area-context', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, ...rest }) => ReactLib.createElement(View, rest, children),
    SafeAreaProvider: ({ children }) => children,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('@expo/vector-icons', () => {
  const ReactLib = require('react');
  const { Text } = require('react-native');
  const Icon = ({ name }) => ReactLib.createElement(Text, null, name ?? '');
  return { Ionicons: Icon, MaterialIcons: Icon, FontAwesome: Icon };
});

/**
 * The card as a probe: it draws nothing and carries the props it was given, so a case can read
 * which memory was drawn, in what order, and with which author.
 */
jest.mock('../../components/journal/JournalEntryCard', () => {
  const ReactLib = require('react');
  const { View } = require('react-native');
  const Card = (props) => ReactLib.createElement(View, { testID: `card-${props.entry.localId}` });
  Card.displayName = 'JournalEntryCardProbe';
  return { __esModule: true, JournalEntryCard: Card, default: Card, isOwnMemory: () => false };
});

/**
 * `calendarModel`, **unchanged**, with `buildRows` counted (T010 fix round, finding B).
 *
 * Every other export is the real one and `buildRows` itself runs the real implementation -- this
 * is a tally, not a stand-in, so no case below is testing a mock. It exists because building a
 * period's rows is the expensive work this screen does (SC-005's 300-memory month), and the one
 * thing that makes it happen needlessly -- a `compareInDay` whose identity moves between renders --
 * is invisible in every other assertion.
 */
jest.mock('../../utils/calendarModel', () => {
  const actual = jest.requireActual('../../utils/calendarModel');
  return { __esModule: true, ...actual, buildRows: jest.fn(actual.buildRows) };
});

jest.mock('../../services/JournalCalendarService', () => ({
  getCalendar: jest.fn(),
  getPeriod: jest.fn(),
  getDay: jest.fn(),
}));

// The newest-50 load this task removes. Mocked so that a case can assert the screen never calls
// it again -- an import that came back would otherwise be invisible here.
jest.mock('../../services/SocialService', () => ({
  getUserEntries: jest.fn(async () => []),
  adaptEntry: (entry) => entry,
  authFetch: jest.fn(),
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me' }, accessToken: 'token-1' }),
}));

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Alert, FlatList, Text, TouchableOpacity } from 'react-native';

import PersonJournalScreen from '../PersonJournalScreen';
import { CalendarSheet } from '../../components/journal/CalendarSheet';
import { CalendarPickerModal } from '../../components/journal/CalendarPickerModal';
import CalendarListHeading from '../../components/journal/CalendarListHeading';
import { DateSwipeContainer } from '../../components/journal/DateSwipeContainer';
// The two rows the page opens with on a group book (T010): the bar first, the faces second.
import { JournalDateBar } from '../../components/journal/JournalDateBar';
import { FacesRow } from '../../components/journal/FacesRow';
import { getCalendar, getDay, getPeriod } from '../../services/JournalCalendarService';
import { getUserEntries } from '../../services/SocialService';
// The real row builder, counted rather than replaced (see the mock above).
import { buildRows } from '../../utils/calendarModel';

global.IS_REACT_ACT_ENVIRONMENT = true;

const CardProbe = require('../../components/journal/JournalEntryCard').JournalEntryCard;

// ---------------------------------------------------------------------------
// The server, stood in for from one list of visible memories
// ---------------------------------------------------------------------------

/** A memory as `adaptEntry` hands it over: `localId`, `date`, `datePrecision`, `createdAt`. */
const memory = (localId, date, createdAt, overrides = {}) => ({
  localId,
  serverId: `s-${localId}`,
  userId: 'u-sami',
  date,
  datePrecision: 'day',
  createdAt,
  contentBlocks: [],
  ...overrides,
});

const dayOf = (item) => item.date.slice(0, 10);

/**
 * Which memories one `precision` asks for, as `/journal/period` reads the word: `'month'` is
 * day-dated and month-dated memories both, `'year'` is the year-dated ones alone. Getting this
 * wrong in the fixture would quietly hide every rough-dated memory from the pages that list it.
 */
const atPrecision = (item, precision) => (precision === 'year'
  ? item.datePrecision === 'year'
  : item.datePrecision === 'day' || item.datePrecision === 'month');

/** `/journal/calendar`'s rows: one per civil day and precision, with a count. */
const calendarRows = (items) => {
  const counts = new Map();
  items.forEach((item) => {
    const key = `${dayOf(item)}|${item.datePrecision}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts.entries()].map(([key, count]) => {
    const [date, precision] = key.split('|');
    return { date, precision, count };
  });
};

/**
 * Point the three look-ups at one list of **visible** memories -- what the reader is allowed to
 * see, which is the only thing the server ever answers with.
 *
 * The order is the server's: date, then created time, at every precision. It is deliberately
 * *not* any page's order, so that a case asserting a day is newest first, or a month oldest
 * first, is asserting the screen sorted it.
 */
function serve(visible) {
  const mine = (ids) => visible.filter((item) => ids.includes(item.userId));
  const inOrder = (items) => [...items].sort(
    (a, b) => (dayOf(a) < dayOf(b) ? -1 : dayOf(a) > dayOf(b) ? 1 : a.createdAt - b.createdAt),
  );

  getCalendar.mockImplementation(async (token, ids) => ({
    authorIds: ids,
    days: calendarRows(mine(ids)),
  }));

  const period = (ids, from, to, precision) => inOrder(mine(ids).filter(
    (item) => dayOf(item) >= from && dayOf(item) <= to && atPrecision(item, precision),
  ));

  getPeriod.mockImplementation(async (token, { authorIds, from, to, precision }) => (
    period(authorIds, from, to, precision)
  ));

  // Exactly as the real `getDay` builds a day: the month call and the year call, concatenated.
  getDay.mockImplementation(async (token, ids, day) => [
    ...period(ids, day, day, 'month'),
    ...period(ids, day, day, 'year'),
  ]);
}

// ---------------------------------------------------------------------------
// The brother's journal (User Story 1's own fixture)
// ---------------------------------------------------------------------------

/**
 * A memory the reader may **not** see. It is never handed to `serve`, so neither the index nor
 * any page knows of it -- which is the server's own visibility filter, and is what makes
 * 5 March 2025 faded rather than a case saying so.
 */
const PRIVATE = memory('private-1', '2025-03-05', 300);

const BROTHER = [
  memory('mar-10-a', '2025-03-10', 310),
  memory('mar-10-b', '2025-03-10', 320),
  memory('mar-18', '2025-03-18', 330),
  memory('jun-02', '2025-06-02', 400),
  memory('nov-03', '2026-11-03', 800),
  memory('nov-10', '2026-11-10', 850),
  memory('nov-14-a', '2026-11-14', 900),
  memory('nov-14-b', '2026-11-14', 950),
];

/** Family sends a top-level `userId`; `person.id` is the tree node and is never asked about. */
const FAMILY_ROUTE = {
  person: { id: 'node-sami', name: 'Sami', avatar: null },
  isGroup: false,
  userId: 'u-sami',
};

/** Friends sends no `userId` key at all, so the screen falls back to `person.id` (R2). */
const FRIEND_ROUTE = {
  person: { id: 'u-sami', name: 'Sami', avatar: null },
  isGroup: false,
  sourceType: 'friend',
};

// ---------------------------------------------------------------------------
// Mounting, and reading what is on screen
// ---------------------------------------------------------------------------

let trees = [];

const settle = async (times = 6) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {});
  }
};

const mount = async (params) => {
  let tree;
  await act(async () => {
    tree = renderer.create(
      <PersonJournalScreen
        route={{ params }}
        navigation={{ goBack: jest.fn(), navigate: jest.fn() }}
      />,
    );
  });
  await settle();
  trees.push(tree);
  return tree;
};

afterEach(() => {
  trees.forEach((tree) => act(() => tree.unmount()));
  trees = [];
  jest.clearAllMocks();
});

/** Every memory drawn, in the order its card appears. */
const cardIds = (tree) => tree.root.findAllByType(CardProbe).map((c) => c.props.entry.localId);

/** The props one memory's card was handed. */
const cardProps = (tree, localId) => tree.root
  .findAllByType(CardProbe)
  .find((c) => c.props.entry.localId === localId)
  .props;

/** What a person reads down the list, a row at a time: `heading:<label>` or `card:<localId>`. */
const rowsOnScreen = (tree) => tree.root
  .findAll((node) => node.type === CalendarListHeading || node.type === CardProbe)
  .map((node) => (node.type === CardProbe
    ? `card:${node.props.entry.localId}`
    : `heading:${node.props.label}`));

const list = (tree) => tree.root.findByType(FlatList);

/**
 * The page's rows in the order a person meets them going down the screen (T010, FR-010): the date
 * bar, the faces, then the one list. `findAll` walks the tree in render order, so this is the
 * arrangement as it is drawn -- which is the only way the spec's "the date bar is the first row of
 * the page and the faces the second" can be asserted without measuring pixels.
 */
const pageOrder = (tree) => tree.root
  .findAll((node) => node.type === JournalDateBar
    || node.type === FacesRow
    || node.type === FlatList)
  .map((node) => {
    if (node.type === JournalDateBar) return 'date bar';
    if (node.type === FacesRow) return 'faces';
    return 'list';
  });

/**
 * Every face in the row, in the order it is drawn, by the **person** it is of.
 *
 * Read from the faces' own test ids rather than from `FacesRow`'s props, so a person drawn twice
 * (two family-tree nodes linked to one account) is two entries here, which is what the
 * de-duplication case needs to be able to fail.
 */
const FACE_PREFIX = 'faces-row-face-';

const faceIds = (tree) => tree.root
  .findAllByType(TouchableOpacity)
  .map((node) => node.props.testID)
  .filter((testID) => typeof testID === 'string' && testID.startsWith(FACE_PREFIX))
  .map((testID) => testID.slice(FACE_PREFIX.length));

/**
 * What a screen reader says of one face: the person's name alone, or "<name>, nothing in this
 * period" once it is dimmed (FR-010).
 */
const faceSays = (tree, id) => {
  const found = byTestID(tree, `${FACE_PREFIX}${id}`);
  if (found.length !== 1) throw new Error(`expected one face for ${id}, found ${found.length}`);
  return found[0].props.accessibilityLabel;
};

const faceControl = (tree, id) => byTestID(tree, `${FACE_PREFIX}${id}`)[0];

/**
 * Whether one face is marked as chosen **to a screen reader** (FR-016), which is the half of
 * "visibly marked and announced" a test can read: the tick beside it is a style, and
 * `accessibilityState.selected` is what a reader who cannot see it is told.
 */
const faceIsChosen = (tree, id) => {
  const found = byTestID(tree, `${FACE_PREFIX}${id}`);
  if (found.length !== 1) throw new Error(`expected one face for ${id}, found ${found.length}`);
  return found[0].props.accessibilityState.selected === true;
};

/** Tap one person's face: choose them, or un-choose them if they already are (FR-016). */
const tapFace = (tree, id) => tap(tree, `${FACE_PREFIX}${id}`);

/** Tap the row's own "Show everyone", which is only there once somebody is chosen. */
const showEveryone = (tree) => tap(tree, 'faces-row-show-everyone');

/** Each month heading of a year list, and the number of memories it counts. */
const monthHeadingCounts = (tree) => Object.fromEntries(
  monthHeadings(tree).map((heading) => [heading.props.label, heading.props.count]),
);

/** The pull-to-refresh control's own props -- `refreshing` is what a reader sees spinning. */
const refreshControl = (tree) => list(tree).props.refreshControl.props;

const pullToRefresh = async (tree) => {
  await act(async () => {
    refreshControl(tree).onRefresh();
  });
  await settle();
};

/** The swipe container, which carries the other half of ◄ ► (FR-007). */
const swipe = (tree) => tree.root.findByType(DateSwipeContainer);

/** A promise a case resolves when it chooses, so a read can be caught mid-flight. */
function deferred() {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
}

const sheet = (tree) => tree.root.findByType(CalendarSheet);
const sheetIsOpen = (tree) => sheet(tree).props.visible === true;

/** Every word on screen, so an empty or failure message can be asserted by what it says. */
const words = (tree) => tree.root
  .findAllByType(Text)
  .map((node) => (Array.isArray(node.props.children)
    ? node.props.children.filter((child) => typeof child === 'string').join('')
    : node.props.children))
  .filter((said) => typeof said === 'string');

const saysSomething = (tree, said) => words(tree).some((line) => line.includes(said));

/**
 * A control by its `testID`.
 *
 * ⚠ **By `TouchableOpacity` and not by a bare `findAll` on the id.** A `TouchableOpacity` renders
 * a host `View` carrying the very same props, so searching on the id alone finds each control
 * twice -- and "expected one, found 2" is the mild version of that; a helper that took the first
 * match would silently read each label twice.
 */
const byTestID = (tree, testID) => tree.root
  .findAllByType(TouchableOpacity)
  .filter((node) => node.props.testID === testID);

const tap = async (tree, testID) => {
  const controls = byTestID(tree, testID);
  if (controls.length !== 1) {
    throw new Error(`expected one control "${testID}" on screen, found ${controls.length}`);
  }
  await act(async () => {
    controls[0].props.onPress();
  });
  await settle();
};

/** The date bar itself -- the period it names, and the count under it. */
const barWords = (tree) => byTestID(tree, 'date-bar-period')
  .flatMap((node) => node.findAllByType(Text).map((t) => t.props.children))
  .filter((said) => typeof said === 'string');

/**
 * What a screen reader hears from the bar's middle: the period and its count as **one** phrase,
 * rather than two unrelated fragments (T012, FR-014).
 */
const barSays = (tree) => {
  const found = byTestID(tree, 'date-bar-period');
  if (found.length !== 1) throw new Error(`expected one date bar, found ${found.length}`);
  return found[0].props.accessibilityLabel;
};

/**
 * One arrow as a screen reader meets it: what it is called -- which is what names the period it
 * would step to -- and whether it is announced as unavailable, which is the whole of FR-014's
 * end-of-the-book rule.
 */
const arrowSays = (tree, which) => {
  const found = byTestID(tree, `date-bar-${which}`);
  if (found.length !== 1) throw new Error(`expected one ${which} arrow, found ${found.length}`);
  return {
    label: found[0].props.accessibilityLabel,
    disabled: found[0].props.accessibilityState.disabled,
  };
};

const tapDate = (tree) => tap(tree, 'date-bar-period');
const tapNext = (tree) => tap(tree, 'date-bar-next');
const tapPrevious = (tree) => tap(tree, 'date-bar-previous');

/** Whether a day tile in the open sheet is faded -- which is also what makes it untappable. */
const dayIsFaded = (tree, key) => {
  const tiles = byTestID(tree, `calendar-day-${key}`);
  if (tiles.length !== 1) throw new Error(`no day tile for ${key} in the open sheet`);
  return tiles[0].props.accessibilityState.disabled === true;
};

/**
 * What a screen reader is told by one tile of the open sheet -- "March 2026, 1 memory", or
 * "January 2026, unavailable" for a period the index has nothing in. It is the sheet's own
 * count, so it is how FR-017's "the calendar's counts cover only the chosen people" is read.
 */
const tileSays = (tree, testID) => {
  const tiles = byTestID(tree, testID);
  if (tiles.length !== 1) throw new Error(`expected one tile "${testID}", found ${tiles.length}`);
  return tiles[0].props.accessibilityLabel;
};

/** Press "Try again" wherever the screen offers it. */
const tapTryAgain = async (tree) => {
  const buttons = tree.root
    .findAllByType(TouchableOpacity)
    .filter((node) => node.findAllByType(Text).some((t) => t.props.children === 'Try again'));
  if (buttons.length !== 1) {
    throw new Error(`expected one "Try again" on screen, found ${buttons.length}`);
  }
  await act(async () => {
    buttons[0].props.onPress();
  });
  await settle();
};

/** The month headings a year list has drawn, newest measurement first. */
const monthHeadings = (tree) => tree.root
  .findAllByType(CalendarListHeading)
  .filter((heading) => heading.props.kind === 'monthHeading');

const measureHeading = async (tree, label, height) => {
  const heading = monthHeadings(tree).find((node) => node.props.label === label);
  if (!heading) throw new Error(`no month heading says "${label}"`);
  if (typeof heading.props.onLayout !== 'function') {
    throw new Error(`the heading "${label}" is never measured`);
  }
  await act(async () => {
    heading.props.onLayout({ nativeEvent: { layout: { height, width: 390, x: 0, y: 0 } } });
  });
  await settle();
};

const tapHeading = async (tree, label) => {
  const heading = monthHeadings(tree).find((node) => node.props.label === label);
  if (!heading) throw new Error(`no month heading says "${label}"`);
  const controls = heading.findAllByType(TouchableOpacity);
  if (controls.length !== 1) throw new Error(`the heading "${label}" cannot be opened`);
  await act(async () => {
    controls[0].props.onPress();
  });
  await settle();
};

/**
 * Walk the open sheet to a month tile and pick it: Month view, then ◄ a year at a time.
 *
 * In Month view the sheet's own ◄ ► step the **year**, which is what makes a month five years
 * back four taps rather than sixty.
 */
const pickMonthInSheet = async (tree, monthKey) => {
  await tap(tree, 'calendar-view-month');
  for (let step = 0; byTestID(tree, `calendar-month-tile-${monthKey}`).length === 0; step += 1) {
    if (step > 20) throw new Error(`the sheet never reached ${monthKey}`);
    // eslint-disable-next-line no-await-in-loop
    await tap(tree, 'calendar-prev');
  }
  await tap(tree, `calendar-month-tile-${monthKey}`);
};

// ===========================================================================
// User Story 1 -- the calendar on one person's journal
// ===========================================================================

describe('User Story 1: the calendar on one person’s journal', () => {
  beforeEach(() => serve(BROTHER));

  it('opens on the brother’s newest day with memories, newest first (FR-009, US3)', async () => {
    const tree = await mount(FAMILY_ROUTE);

    expect(barWords(tree)).toContain('Sat, Nov 14');
    // The server answered oldest first; the day is the Journal tab's own order, newest first.
    expect(cardIds(tree)).toEqual(['nov-14-b', 'nov-14-a']);
  });

  it('asks the server about the route’s userId, never the tree-node id (R2)', async () => {
    await mount(FAMILY_ROUTE);

    expect(getCalendar).toHaveBeenCalledWith('token-1', ['u-sami']);
    expect(getCalendar.mock.calls.every(([, ids]) => !ids.includes('node-sami'))).toBe(true);
  });

  it('falls back to person.id when the route has no userId key at all (Friends, R2)', async () => {
    await mount(FRIEND_ROUTE);

    expect(getCalendar).toHaveBeenCalledWith('token-1', ['u-sami']);
  });

  /** Scenario 1. */
  it('opens the calendar sheet from the date, marking only days the brother has (scenario 1)', async () => {
    const tree = await mount(FAMILY_ROUTE);
    expect(sheetIsOpen(tree)).toBe(false);

    await tapDate(tree);

    expect(sheetIsOpen(tree)).toBe(true);
    // November 2026: the three days he has, and nothing else.
    expect(dayIsFaded(tree, '2026-11-03')).toBe(false);
    expect(dayIsFaded(tree, '2026-11-10')).toBe(false);
    expect(dayIsFaded(tree, '2026-11-14')).toBe(false);
    expect(dayIsFaded(tree, '2026-11-11')).toBe(true);
    expect(dayIsFaded(tree, '2026-11-01')).toBe(true);
  });

  /** FR-012: the platform's own picker is gone from this screen. */
  it('no longer renders the old date picker (FR-012)', async () => {
    const tree = await mount(FAMILY_ROUTE);
    const Picker = CalendarPickerModal.type ?? CalendarPickerModal;

    expect(tree.root.findAllByType(Picker)).toHaveLength(0);
  });

  /** Scenario 2, and FR-009's month order. */
  it('lists a picked month under day headings, oldest first within a day (scenario 2, FR-009)', async () => {
    const tree = await mount(FAMILY_ROUTE);

    await tapDate(tree);
    await pickMonthInSheet(tree, '2025-03');

    expect(sheetIsOpen(tree)).toBe(false);
    expect(barWords(tree)).toEqual(['March 2025', '3 memories']);
    expect(rowsOnScreen(tree)).toEqual([
      'heading:Mon 10 March',
      'card:mar-10-a',
      'card:mar-10-b',
      'heading:Tue 18 March',
      'card:mar-18',
    ]);
  });

  /** Scenario 3. */
  it('skips empty months when ► is tapped on a month (scenario 3)', async () => {
    const tree = await mount(FAMILY_ROUTE);
    await tapDate(tree);
    await pickMonthInSheet(tree, '2025-03');

    await tapNext(tree);

    // April and May hold nothing, so June is the next month with memories.
    expect(barWords(tree)).toEqual(['June 2025', '1 memory']);
    expect(cardIds(tree)).toEqual(['jun-02']);
  });

  /**
   * Scenario 3's other half -- "**or swipe** to the next page". The container is handed the very
   * same move ► is, so what is at risk is the wiring rather than the stepping: a container given
   * nothing, or given the two directions the wrong way round, would be invisible until somebody
   * swiped on a phone.
   */
  it('moves the same way on a swipe, and refuses one at the end of the book (scenario 3)', async () => {
    const tree = await mount(FAMILY_ROUTE);
    await tapDate(tree);
    await pickMonthInSheet(tree, '2025-03');

    // Both ends are passed on, so the container can refuse a swipe rather than animating out to
    // an unchanged screen (FR-014). March 2025 is the brother's oldest month, so there is
    // nothing earlier to swipe back to and plenty later.
    expect(swipe(tree).props.hasNext).toBe(true);
    expect(swipe(tree).props.hasPrevious).toBe(false);

    await act(async () => {
      swipe(tree).props.onNextDate();
    });
    await settle();

    expect(barWords(tree)).toEqual(['June 2025', '1 memory']);
    expect(cardIds(tree)).toEqual(['jun-02']);

    // On the newest period of the book there is nothing later to swipe to.
    await act(async () => {
      swipe(tree).props.onNextDate();
    });
    await settle();
    expect(barWords(tree)).toEqual(['November 2026', '4 memories']);
    expect(swipe(tree).props.hasNext).toBe(false);
  });

  /** Scenario 4. */
  it('never lists a private memory, and fades the day it was on (scenario 4)', async () => {
    const tree = await mount(FAMILY_ROUTE);
    await tapDate(tree);
    await pickMonthInSheet(tree, '2025-03');

    expect(cardIds(tree)).not.toContain('private-1');

    await tapDate(tree);
    await tap(tree, 'calendar-view-date');

    expect(dayIsFaded(tree, '2025-03-05')).toBe(true);
    expect(dayIsFaded(tree, '2025-03-10')).toBe(false);
  });

  /** Scenario 6. */
  it('steps to the next day with memories, not the next calendar day (scenario 6)', async () => {
    const tree = await mount(FAMILY_ROUTE);

    await tapPrevious(tree);
    expect(barWords(tree)).toContain('Tue, Nov 10');
    await tapPrevious(tree);
    expect(barWords(tree)).toContain('Tue, Nov 3');

    await tapNext(tree);

    // The 4th to the 9th hold nothing, so ► lands on the 10th.
    expect(barWords(tree)).toContain('Tue, Nov 10');
    expect(cardIds(tree)).toEqual(['nov-10']);
  });

  it('says there is nothing later on the brother’s newest day (FR-014)', async () => {
    const tree = await mount(FAMILY_ROUTE);

    expect(byTestID(tree, 'date-bar-next')[0].props.accessibilityState.disabled).toBe(true);
    expect(byTestID(tree, 'date-bar-previous')[0].props.accessibilityState.disabled).toBe(false);
  });

  it('draws a memory in a month exactly as on its own day (FR-006)', async () => {
    const tree = await mount(FAMILY_ROUTE);
    await tapDate(tree);
    await pickMonthInSheet(tree, '2025-06');
    const inTheMonth = cardProps(tree, 'jun-02');

    const onItsDay = await mount(FAMILY_ROUTE);
    await tapDate(onItsDay);
    await pickMonthInSheet(onItsDay, '2025-06');
    await tapDate(onItsDay);
    await tap(onItsDay, 'calendar-view-date');
    await tap(onItsDay, 'calendar-day-2025-06-02');
    expect(cardIds(onItsDay)).toEqual(['jun-02']);

    const shape = (props) => Object.fromEntries(
      Object.entries(props)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([name, value]) => [name, typeof value === 'function' ? '[a handler]' : value]),
    );
    expect(shape(inTheMonth)).toEqual(shape(cardProps(onItsDay, 'jun-02')));
  });
});

// ===========================================================================
// Scenario 5 -- the newest 50 no longer applies (FR-005, SC-002)
// ===========================================================================

describe('every memory is reachable, however old (scenario 5, FR-005, SC-002)', () => {
  /** 120 visible memories, ten in each month of 2022. The oldest is the 120th newest. */
  const MANY = Array.from({ length: 120 }, (_, i) => {
    const month = String(Math.floor(i / 10) + 1).padStart(2, '0');
    const day = String((i % 10) + 1).padStart(2, '0');
    return memory(`m-${month}-${day}`, `2022-${month}-${day}`, 1000 + i);
  });

  beforeEach(() => serve(MANY));

  it('lists the oldest of 120 memories when its month is picked', async () => {
    // The fixture really is beyond the old limit: the oldest is the 120th newest, so a screen
    // that still loaded the newest 50 could not reach it at all.
    expect(MANY).toHaveLength(120);
    expect(MANY[0].localId).toBe('m-01-01');

    const tree = await mount(FAMILY_ROUTE);
    expect(barWords(tree)).toContain('Sat, Dec 10');

    await tapDate(tree);
    await pickMonthInSheet(tree, '2022-01');

    expect(barWords(tree)).toEqual(['January 2022', '10 memories']);
    expect(cardIds(tree)).toContain('m-01-01');
  });

  it('never calls the newest-50 load again (FR-005)', async () => {
    await mount(FAMILY_ROUTE);

    expect(getUserEntries).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// FR-011 -- a failure is never drawn as emptiness
// ===========================================================================

describe('failures are never drawn as emptiness (FR-011)', () => {
  it('shows the screen’s own failure with Try again when the index fails as the book opens', async () => {
    getCalendar.mockRejectedValue(new Error('no network'));
    const tree = await mount(FAMILY_ROUTE);

    expect(saysSomething(tree, "Couldn't load journal")).toBe(true);
    // Never the empty message: "could not load" is not "nobody has recorded anything".
    expect(saysSomething(tree, "hasn't shared any memories with you yet")).toBe(false);
    // And no calendar is offered over a book that never opened.
    expect(byTestID(tree, 'date-bar-period')).toHaveLength(0);

    serve(BROTHER);
    await tapTryAgain(tree);

    expect(cardIds(tree)).toEqual(['nov-14-b', 'nov-14-a']);
  });

  it('shows the screen’s own failure with Try again when a page fails', async () => {
    serve(BROTHER);
    getDay.mockRejectedValue(new Error('no network'));
    const tree = await mount(FAMILY_ROUTE);

    // The book opened -- the date bar names the day -- and only its page failed.
    expect(barWords(tree)).toContain('Sat, Nov 14');
    expect(saysSomething(tree, "Couldn't load journal")).toBe(true);
    expect(saysSomething(tree, 'No memories')).toBe(false);

    serve(BROTHER);
    await tapTryAgain(tree);

    expect(cardIds(tree)).toEqual(['nov-14-b', 'nov-14-a']);
  });

  it('refuses to open a half-read calendar, and says so with Try again', async () => {
    serve(BROTHER);
    const tree = await mount(FAMILY_ROUTE);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    // The marks are re-read on a refresh, and this time they cannot be.
    getCalendar.mockRejectedValue(new Error('no network'));
    await act(async () => {
      list(tree).props.refreshControl.props.onRefresh();
    });
    await settle();

    await tapDate(tree);

    expect(sheetIsOpen(tree)).toBe(false);
    expect(alert).toHaveBeenCalled();
    const [title, , buttons] = alert.mock.calls[0];
    expect(title).toBe("Couldn't load the calendar");

    const tryAgain = buttons.find((button) => button.text === 'Try again');
    expect(tryAgain).toBeDefined();
    serve(BROTHER);
    await act(async () => {
      tryAgain.onPress();
    });
    await settle();

    await tapDate(tree);
    expect(sheetIsOpen(tree)).toBe(true);
    alert.mockRestore();
  });
});

// ===========================================================================
// The whole-book message (spec edge case, R2)
// ===========================================================================

describe('a book with nothing in it says so about the whole book', () => {
  it('names the person, and offers no calendar, when they have no account (userId: null)', async () => {
    serve(BROTHER);
    const tree = await mount({ ...FAMILY_ROUTE, userId: null });

    expect(saysSomething(tree, "Sami hasn't shared any memories with you yet")).toBe(true);
    expect(saysSomething(tree, 'No entries for this day')).toBe(false);
    expect(byTestID(tree, 'date-bar-period')).toHaveLength(0);
    // A relative with no account is never asked about: an id-less look-up is a 400.
    expect(getCalendar).not.toHaveBeenCalled();
  });

  it('names the person when they have an account but nothing visible', async () => {
    serve([]);
    const tree = await mount(FAMILY_ROUTE);

    expect(getCalendar).toHaveBeenCalledWith('token-1', ['u-sami']);
    expect(saysSomething(tree, "Sami hasn't shared any memories with you yet")).toBe(true);
    expect(byTestID(tree, 'date-bar-period')).toHaveLength(0);
  });

  /**
   * Fix round 1, Minor 3. A route that arrives without a name used to fall through to the
   * **group's** wording, telling somebody looking at one person's journal that "nobody here" has
   * shared anything. It is worded from `displayName`, which is the one fallback this screen has
   * and the one its header already says.
   */
  it('never gives one person the group’s wording, even with no name to use', async () => {
    serve([]);
    const tree = await mount({ person: { id: 'u-sami' }, isGroup: false, sourceType: 'friend' });

    expect(saysSomething(tree, 'Nobody here has shared any memories with you yet')).toBe(false);
    expect(saysSomething(tree, "hasn't shared any memories with you yet")).toBe(true);
  });

  it('speaks of the group, not of a person, on a friend group with nothing in it', async () => {
    serve([]);
    const tree = await mount({
      persons: [{ id: 'u-1', name: 'Huda' }, { id: 'u-2', name: 'Karim' }],
      isGroup: true,
      groupName: 'Work Friends',
      sourceType: 'friend',
    });

    expect(saysSomething(tree, 'Nobody here has shared any memories with you yet')).toBe(true);
    expect(saysSomething(tree, 'No entries for this day')).toBe(false);
    expect(byTestID(tree, 'date-bar-period')).toHaveLength(0);
  });
});

// ===========================================================================
// FR-015 -- pull to refresh reloads the marks and the page
// ===========================================================================

describe('pull to refresh (FR-015)', () => {
  it('re-reads both the calendar’s marks and the shown page', async () => {
    serve(BROTHER);
    const tree = await mount(FAMILY_ROUTE);
    expect(getCalendar).toHaveBeenCalledTimes(1);
    const daysRead = getDay.mock.calls.length;

    await act(async () => {
      list(tree).props.refreshControl.props.onRefresh();
    });
    await settle();

    expect(getCalendar).toHaveBeenCalledTimes(2);
    expect(getDay.mock.calls.length).toBeGreaterThan(daysRead);
    // And the reader is left on the day they were reading.
    expect(barWords(tree)).toContain('Sat, Nov 14');
  });

  /**
   * Fix round 1, Important 1 -- and the half that proves the three cases under it are not passing
   * for the trivial reason that the control never turns at all.
   */
  it('turns the control while the re-read is in flight, and stops it when it lands', async () => {
    serve(BROTHER);
    const tree = await mount(FAMILY_ROUTE);
    expect(refreshControl(tree).refreshing).toBe(false);

    const marks = deferred();
    getCalendar.mockReturnValueOnce(marks.promise);
    await pullToRefresh(tree);
    expect(refreshControl(tree).refreshing).toBe(true);

    await act(async () => {
      marks.resolve({ authorIds: ['u-sami'], days: calendarRows(BROTHER) });
    });
    await settle();

    expect(refreshControl(tree).refreshing).toBe(false);
  });

  /**
   * ⚠ **A book with no period has no page to wait for.** The hook's page effect answers
   * `'loading'` and nothing ever resolves it, so a screen that waited on `pageStatus` here left
   * the control spinning for ever -- on the one screen where pulling to refresh is the obvious
   * thing to try, because there is nothing else on it.
   */
  it('stops the control on a book with nobody in it (userId: null)', async () => {
    serve(BROTHER);
    const tree = await mount({ ...FAMILY_ROUTE, userId: null });
    expect(saysSomething(tree, "hasn't shared any memories with you yet")).toBe(true);

    await pullToRefresh(tree);

    expect(refreshControl(tree).refreshing).toBe(false);
  });

  it('stops the control on a book whose owner has shared nothing', async () => {
    serve([]);
    const tree = await mount(FAMILY_ROUTE);
    expect(saysSomething(tree, "hasn't shared any memories with you yet")).toBe(true);

    await pullToRefresh(tree);

    expect(refreshControl(tree).refreshing).toBe(false);
    // The marks really were re-read -- the control stopped because the read finished, not
    // because nothing was asked.
    expect(getCalendar).toHaveBeenCalledTimes(2);
  });

  it('stops the control when the marks are still failing, which is usually offline', async () => {
    getCalendar.mockRejectedValue(new Error('no network'));
    const tree = await mount(FAMILY_ROUTE);
    expect(saysSomething(tree, "Couldn't load journal")).toBe(true);

    await pullToRefresh(tree);

    expect(saysSomething(tree, "Couldn't load journal")).toBe(true);
    expect(refreshControl(tree).refreshing).toBe(false);
  });

  it('shows a memory recorded since, without leaving the day', async () => {
    serve(BROTHER);
    const tree = await mount(FAMILY_ROUTE);
    expect(cardIds(tree)).toEqual(['nov-14-b', 'nov-14-a']);

    serve([...BROTHER, memory('nov-14-c', '2026-11-14', 999)]);
    await act(async () => {
      list(tree).props.refreshControl.props.onRefresh();
    });
    await settle();

    expect(cardIds(tree)).toEqual(['nov-14-c', 'nov-14-b', 'nov-14-a']);
  });
});

// ===========================================================================
// The data path for a group book (T010 adds its faces row and household order)
// ===========================================================================

describe('a group book reads through the same calendar data path', () => {
  const GROUP = [
    memory('h-1', '2026-11-14', 900, { userId: 'u-huda' }),
    memory('k-1', '2026-11-14', 950, { userId: 'u-karim' }),
  ];

  it('asks about every friend in the group and names each memory’s author', async () => {
    serve(GROUP);
    const tree = await mount({
      persons: [
        { id: 'u-huda', name: 'Huda', avatar: 'huda.png' },
        { id: 'u-karim', name: 'Karim', avatar: 'karim.png' },
      ],
      isGroup: true,
      groupName: 'Work Friends',
      sourceType: 'friend',
    });

    expect(getCalendar).toHaveBeenCalledWith('token-1', ['u-huda', 'u-karim']);
    expect(cardIds(tree)).toEqual(['k-1', 'h-1']);
    expect(cardProps(tree, 'h-1').user).toEqual({ name: 'Huda', avatarUrl: 'huda.png' });
    expect(cardProps(tree, 'k-1').showAuthor).toBe(true);
  });

  /**
   * A household opened from the family tree's head card. Its people carry a `userId` key: the
   * one that is `null` has no account and is dropped, and a `userId ?? id` fallback would send
   * that person's **tree-node** id to the server as though it were an account (R2).
   */
  it('drops a relative with no account, and never sends their tree-node id (R2)', async () => {
    serve(GROUP);
    await mount({
      persons: [
        { id: 'u-huda', name: 'Huda', userId: 'u-huda' },
        { id: 'node-lina', name: 'Lina', userId: null },
        { id: 'u-karim', name: 'Karim', userId: 'u-karim' },
      ],
      isGroup: true,
      groupName: "Huda's Family",
      bookKind: 'household',
    });

    expect(getCalendar).toHaveBeenCalledWith('token-1', ['u-huda', 'u-karim']);
  });

  it('asks about one account once when two tree nodes share it', async () => {
    serve(GROUP);
    await mount({
      persons: [
        { id: 'u-huda', name: 'Huda', userId: 'u-huda' },
        { id: 'u-huda', name: 'Huda (mother)', userId: 'u-huda' },
      ],
      isGroup: true,
      groupName: "Huda's Family",
      bookKind: 'household',
    });

    expect(getCalendar).toHaveBeenCalledWith('token-1', ['u-huda']);
  });

  it('covers the first 50 of a group larger than the look-ups allow', async () => {
    serve([]);
    const many = Array.from({ length: 60 }, (_, i) => ({ id: `u-${i}`, name: `Friend ${i}` }));
    await mount({
      persons: many,
      isGroup: true,
      groupName: 'Everyone',
      sourceType: 'friend',
    });

    const [, ids] = getCalendar.mock.calls[0];
    expect(ids).toHaveLength(50);
    expect(ids[0]).toBe('u-0');
    expect(ids[49]).toBe('u-49');
  });
});

// ===========================================================================
// 016 FR-017 -- a pressed pin finds its piece in a month and a year list
// ===========================================================================

describe('a pressed map pin brings its piece into view (016 FR-017)', () => {
  const YEAR = [
    memory('y-01-05', '2026-01-05', 100),
    memory('y-02-07', '2026-02-07', 200),
    memory('y-02-18', '2026-02-18', 300),
  ];

  const onYear2026 = async () => {
    serve(YEAR);
    const tree = await mount(FAMILY_ROUTE);
    await tapDate(tree);
    await tap(tree, 'calendar-view-year');
    await tap(tree, 'calendar-year-tile-2026');
    return tree;
  };

  it('pins the month headings of a year list and nothing else (016 FR-006)', async () => {
    const tree = await onYear2026();

    const { data, stickyHeaderIndices } = list(tree).props;
    const monthRows = data
      .map((row, index) => (row.kind === 'monthHeading' ? index : null))
      .filter((index) => index !== null);

    expect(monthRows).toHaveLength(2);
    expect(stickyHeaderIndices).toEqual(monthRows);
    data.forEach((row, index) => {
      if (row.kind !== 'monthHeading') expect(stickyHeaderIndices).not.toContain(index);
    });
  });

  it('pins nothing in a month list, where a day heading is the only heading', async () => {
    serve(YEAR);
    const tree = await mount(FAMILY_ROUTE);
    await tapDate(tree);
    await pickMonthInSheet(tree, '2026-02');

    expect(list(tree).props.stickyHeaderIndices).toEqual([]);
  });

  it('scrolls a pressed pin clear of the heading pinned above it, by its measured height', async () => {
    const scrollToIndex = jest
      .spyOn(FlatList.prototype, 'scrollToIndex')
      .mockImplementation(() => {});
    const tree = await onYear2026();
    await tapHeading(tree, 'February 2026');
    await measureHeading(tree, 'January 2026', 44);
    await measureHeading(tree, 'February 2026', 72);

    /*
     * Row **7** of the list: January's heading (open from the moment the year was picked, 016
     * FR-006), its day heading and its card, then February's heading, its two day headings and
     * its first card. An implementation counting memories would say 2 and scroll to somebody
     * else's memory.
     */
    await act(async () => {
      cardProps(tree, 'y-02-18').onRequestScrollTo(160);
    });
    expect(scrollToIndex).toHaveBeenLastCalledWith({ index: 7, viewOffset: 72 - 160, animated: true });

    // And a card in January clears **January's** heading, although February's measured last --
    // the headings are not all the same height, so one shared number would be a line out here.
    await act(async () => {
      cardProps(tree, 'y-01-05').onRequestScrollTo(160);
    });
    expect(scrollToIndex).toHaveBeenLastCalledWith({ index: 2, viewOffset: 44 - 160, animated: true });

    scrollToIndex.mockRestore();
  });

  it('leaves a month list’s pin where it was, after a year has been measured', async () => {
    const scrollToIndex = jest
      .spyOn(FlatList.prototype, 'scrollToIndex')
      .mockImplementation(() => {});
    const tree = await onYear2026();
    await tapHeading(tree, 'February 2026');
    await measureHeading(tree, 'February 2026', 72);

    await tapDate(tree);
    await pickMonthInSheet(tree, '2026-02');
    expect(rowsOnScreen(tree)).toEqual([
      'heading:Sat 7 February',
      'card:y-02-07',
      'heading:Wed 18 February',
      'card:y-02-18',
    ]);

    await act(async () => {
      cardProps(tree, 'y-02-18').onRequestScrollTo(160);
    });
    expect(scrollToIndex).toHaveBeenLastCalledWith({ index: 3, viewOffset: -160, animated: true });

    scrollToIndex.mockRestore();
  });

  it('does not throw when a pin is pressed on the last row of the list', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const tree = await onYear2026();
    await tapHeading(tree, 'February 2026');
    await measureHeading(tree, 'February 2026', 44);

    // The real `scrollToIndex`: `VirtualizedList` throws an invariant for a row past the end of
    // its own data, so this is what proves the row index and the list are one list.
    expect(() => cardProps(tree, 'y-02-18').onRequestScrollTo(80)).not.toThrow();
    expect(typeof list(tree).props.onScrollToIndexFailed).toBe('function');
    warn.mockRestore();
  });
});

// ===========================================================================
// 019 T010 -- group mode: the faces row (FR-010), household order (FR-009) and
// a group's calendar (User Story 2, FR-002, FR-004, SC-004)
// ===========================================================================

describe('User Story 2: a group book’s faces and its order', () => {
  /**
   * A household opened from the family tree's **head card**: every person carries a `userId`
   * key, the tree-node id lives in `id`, and the route marks the book `bookKind: 'household'`,
   * which is what gives it household order (research R2, R6; owner, 2026-11-21).
   */
  const HOUSEHOLD = [
    { id: 'node-huda', name: 'Huda', avatar: 'huda.png', userId: 'u-huda' },
    { id: 'node-karim', name: 'Karim', avatar: 'karim.png', userId: 'u-karim' },
    { id: 'node-lina', name: 'Lina', avatar: 'lina.png', userId: 'u-lina' },
  ];

  const HOUSEHOLD_ROUTE = {
    persons: HOUSEHOLD,
    isGroup: true,
    groupName: "Huda's Family",
    bookKind: 'household',
  };

  /**
   * The very same three people as a **friend group**: real user ids, no `userId` key and no
   * `bookKind`, so the book keeps the Journal tab's own order (FR-009). The order cases below
   * are run on both routes, which is what makes "household order" an assertion about the book
   * rather than about the fixture.
   */
  const FRIEND_GROUP_ROUTE = {
    persons: [
      { id: 'u-huda', name: 'Huda', avatar: 'huda.png' },
      { id: 'u-karim', name: 'Karim', avatar: 'karim.png' },
      { id: 'u-lina', name: 'Lina', avatar: 'lina.png' },
    ],
    isGroup: true,
    groupName: 'Work Friends',
    sourceType: 'friend',
  };

  /**
   * One day holding all three people's memories, built so that **three orders differ**:
   *
   * - household order (position in the household, then created time): Huda, Karim, Lina
   * - newest first (a person's or a friend group's day, 016 FR-004): Huda, Lina, Karim
   * - oldest first by created time (`buildRows`' default in a month list): Karim, Lina, Huda
   *
   * A fixture where any two of those agreed would pass whatever the screen did.
   */
  const THE_FAMILY = [
    memory('lina-jan', '2026-01-20', 700, { userId: 'u-lina' }),
    memory('karim-05', '2026-03-05', 800, { userId: 'u-karim' }),
    memory('karim-10', '2026-03-10', 900, { userId: 'u-karim' }),
    memory('lina-10', '2026-03-10', 920, { userId: 'u-lina' }),
    memory('huda-10', '2026-03-10', 950, { userId: 'u-huda' }),
  ];

  beforeEach(() => serve(THE_FAMILY));

  const pickMarch = async (tree) => {
    await tapDate(tree);
    await pickMonthInSheet(tree, '2026-03');
  };

  const pick2026 = async (tree) => {
    await tapDate(tree);
    await tap(tree, 'calendar-view-year');
    await tap(tree, 'calendar-year-tile-2026');
  };

  // -------------------------------------------------------------------------
  // FR-010 -- the row of faces, and where it sits
  // -------------------------------------------------------------------------

  it('draws the faces directly under the date bar, on a day, a month and a year (FR-010)', async () => {
    const tree = await mount(HOUSEHOLD_ROUTE);

    expect(barWords(tree)).toContain('Tue, Mar 10');
    expect(pageOrder(tree)).toEqual(['date bar', 'faces', 'list']);

    await pickMarch(tree);
    expect(pageOrder(tree)).toEqual(['date bar', 'faces', 'list']);

    await pick2026(tree);
    expect(pageOrder(tree)).toEqual(['date bar', 'faces', 'list']);
  });

  it('shows every person the book covers, once, in book order (FR-002, FR-010)', async () => {
    const tree = await mount(HOUSEHOLD_ROUTE);

    expect(faceIds(tree)).toEqual(['u-huda', 'u-karim', 'u-lina']);
  });

  /**
   * The two people who must never reach the row, together: a relative with **no account**
   * (`userId: null`, whose `id` is a tree node) and a second tree node linked to an account that
   * is already in the book. `userId ?? id` would draw the first as a face and ask the server
   * about a node id (research R2); keeping both nodes would draw Huda twice.
   */
  it('never draws a relative without an account, and draws a shared account once (R2)', async () => {
    const tree = await mount({
      ...HOUSEHOLD_ROUTE,
      persons: [
        HOUSEHOLD[0],
        { id: 'node-lina-step', name: 'Lina (step)', avatar: null, userId: null },
        HOUSEHOLD[1],
        { id: 'node-huda-mother', name: 'Huda (mother)', avatar: 'huda.png', userId: 'u-huda' },
        HOUSEHOLD[2],
      ],
    });

    expect(faceIds(tree)).toEqual(['u-huda', 'u-karim', 'u-lina']);
    expect(getCalendar).toHaveBeenCalledWith('token-1', ['u-huda', 'u-karim', 'u-lina']);
    expect(
      getCalendar.mock.calls.every(([, ids]) => ids.every((id) => !id.startsWith('node-'))),
    ).toBe(true);
  });

  /** The look-ups take 50 people, so a 51st friend is neither asked about nor drawn. */
  it('covers the first 50 of a larger group, and never asks about the 51st', async () => {
    serve([memory('f-0', '2026-03-10', 900, { userId: 'u-0' })]);
    const tree = await mount({
      persons: Array.from({ length: 60 }, (_, i) => ({ id: `u-${i}`, name: `Friend ${i}` })),
      isGroup: true,
      groupName: 'Everyone',
      sourceType: 'friend',
    });

    expect(faceIds(tree)).toHaveLength(50);
    expect(faceIds(tree)[49]).toBe('u-49');
    expect(faceIds(tree)).not.toContain('u-50');
    const [, ids] = getCalendar.mock.calls[0];
    expect(ids).toHaveLength(50);
    expect(ids).not.toContain('u-50');
  });

  it('dims a face with nothing in the shown period, and leaves it choosable (FR-010)', async () => {
    const tree = await mount(HOUSEHOLD_ROUTE);

    // 10 March: all three recorded something, so nobody is dimmed.
    expect(faceSays(tree, 'u-huda')).toBe('Huda');
    expect(faceSays(tree, 'u-lina')).toBe('Lina');

    await tapPrevious(tree);

    // 5 March: Karim alone.
    expect(barWords(tree)).toContain('Thu, Mar 5');
    expect(faceSays(tree, 'u-karim')).toBe('Karim');
    expect(faceSays(tree, 'u-huda')).toBe('Huda, nothing in this period');
    expect(faceSays(tree, 'u-lina')).toBe('Lina, nothing in this period');

    // Dimmed is not disabled: FR-016's choosing does not care whether somebody has anything here.
    expect(typeof faceControl(tree, 'u-huda').props.onPress).toBe('function');
    expect(faceControl(tree, 'u-huda').props.disabled).not.toBe(true);
  });

  it('dims nobody while the day’s memories are still being read (FR-010)', async () => {
    const held = deferred();
    getDay.mockReturnValueOnce(held.promise);
    const tree = await mount(HOUSEHOLD_ROUTE);

    // The book has opened on its newest day; its memories have not landed.
    expect(barWords(tree)).toContain('Tue, Mar 10');
    expect(cardIds(tree)).toEqual([]);
    expect(faceSays(tree, 'u-huda')).toBe('Huda');
    expect(faceSays(tree, 'u-karim')).toBe('Karim');
    expect(faceSays(tree, 'u-lina')).toBe('Lina');

    await act(async () => {
      held.resolve([]);
    });
    await settle();
  });

  /**
   * FR-010 binds the row "on a day, a month and a year alike", and dimming with it. The two cases
   * below are that half of it: the day cases above cannot tell a row that dims by the period on
   * screen from one that only ever looks at a day.
   */
  it('dims a face with nothing in the picked month, and leaves it choosable (FR-010)', async () => {
    const tree = await mount(HOUSEHOLD_ROUTE);

    await tapDate(tree);
    await pickMonthInSheet(tree, '2026-01');

    // January 2026 is Lina's alone.
    expect(barWords(tree)).toEqual(['January 2026', '1 memory']);
    expect(faceSays(tree, 'u-lina')).toBe('Lina');
    expect(faceSays(tree, 'u-huda')).toBe('Huda, nothing in this period');
    expect(faceSays(tree, 'u-karim')).toBe('Karim, nothing in this period');

    expect(typeof faceControl(tree, 'u-karim').props.onPress).toBe('function');
    expect(faceControl(tree, 'u-karim').props.disabled).not.toBe(true);

    // And March, where all three recorded something, dims nobody -- so the month case above is
    // about who is in the month rather than about the row having gone dim everywhere.
    await pickMarch(tree);
    expect(faceSays(tree, 'u-huda')).toBe('Huda');
    expect(faceSays(tree, 'u-karim')).toBe('Karim');
    expect(faceSays(tree, 'u-lina')).toBe('Lina');
  });

  it('dims a face with nothing in the picked year, and leaves it choosable (FR-010)', async () => {
    // A year of Karim's own, before the one the others recorded in.
    serve([...THE_FAMILY, memory('karim-2025', '2025-07-04', 500, { userId: 'u-karim' })]);
    const tree = await mount(HOUSEHOLD_ROUTE);

    await tapDate(tree);
    await tap(tree, 'calendar-view-year');
    await tap(tree, 'calendar-year-tile-2025');

    expect(barWords(tree)).toEqual(['2025', '1 memory']);
    expect(faceSays(tree, 'u-karim')).toBe('Karim');
    expect(faceSays(tree, 'u-huda')).toBe('Huda, nothing in this period');
    expect(faceSays(tree, 'u-lina')).toBe('Lina, nothing in this period');

    expect(typeof faceControl(tree, 'u-huda').props.onPress).toBe('function');
    expect(faceControl(tree, 'u-huda').props.disabled).not.toBe(true);
  });

  /** "Could not load" must never be drawn as "recorded nothing" (FR-010, fails closed). */
  it('dims nobody after the day’s memories fail to load (FR-010)', async () => {
    getDay.mockRejectedValue(new Error('no network'));
    const tree = await mount(HOUSEHOLD_ROUTE);

    expect(saysSomething(tree, "Couldn't load journal")).toBe(true);
    expect(faceSays(tree, 'u-huda')).toBe('Huda');
    expect(faceSays(tree, 'u-karim')).toBe('Karim');
    expect(faceSays(tree, 'u-lina')).toBe('Lina');
  });

  it('shows no faces on a group book with nothing in it, and none on one person’s book', async () => {
    serve([]);
    const empty = await mount(FRIEND_GROUP_ROUTE);

    expect(saysSomething(empty, 'Nobody here has shared any memories with you yet')).toBe(true);
    expect(empty.root.findAllByType(FacesRow)).toHaveLength(0);

    // One person's journal is not a group book: there is nobody to choose between.
    serve(BROTHER);
    const onePerson = await mount(FAMILY_ROUTE);

    expect(barWords(onePerson)).toContain('Sat, Nov 14');
    expect(onePerson.root.findAllByType(FacesRow)).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // FR-004 and the counts -- the calendar covers everyone (US2 scenarios 2-3)
  // -------------------------------------------------------------------------

  /** Scenario 2. */
  it('fades a day only when nobody in the group has a memory on it (scenario 2, FR-004)', async () => {
    const tree = await mount(FRIEND_GROUP_ROUTE);

    await tapDate(tree);

    expect(dayIsFaded(tree, '2026-03-10')).toBe(false); // all three
    expect(dayIsFaded(tree, '2026-03-05')).toBe(false); // Karim alone
    expect(dayIsFaded(tree, '2026-03-06')).toBe(true); // nobody
  });

  /** Scenario 3. */
  it('counts every member’s memories in a year’s month headings (scenario 3, FR-002)', async () => {
    const tree = await mount(HOUSEHOLD_ROUTE);

    await pick2026(tree);

    // January is Lina's alone, and March holds all three people's four memories.
    expect(monthHeadingCounts(tree)).toEqual({ 'January 2026': 1, 'March 2026': 4 });
  });

  // -------------------------------------------------------------------------
  // FR-009 -- household order, and the Journal tab's order everywhere else
  // -------------------------------------------------------------------------

  it('reads a head-card household’s day in household order (FR-009)', async () => {
    const tree = await mount(HOUSEHOLD_ROUTE);

    // Position in the household, then created time. Newest first would be Huda, Lina, Karim.
    expect(cardIds(tree)).toEqual(['huda-10', 'karim-10', 'lina-10']);
  });

  it('keeps that household order within a day in a month list, days oldest first (FR-009)', async () => {
    const tree = await mount(HOUSEHOLD_ROUTE);

    await pickMarch(tree);

    expect(rowsOnScreen(tree)).toEqual([
      'heading:Thu 5 March',
      'card:karim-05',
      'heading:Tue 10 March',
      // Household order, not `buildRows`' created-time default, which is Karim, Lina, Huda.
      'card:huda-10',
      'card:karim-10',
      'card:lina-10',
    ]);
  });

  it('keeps household order within a day in a year list too (FR-009)', async () => {
    const tree = await mount(HOUSEHOLD_ROUTE);

    await pick2026(tree);
    await tapHeading(tree, 'March 2026');

    expect(rowsOnScreen(tree).filter((row) => row.startsWith('card:'))).toEqual([
      'card:lina-jan',
      'card:karim-05',
      'card:huda-10',
      'card:karim-10',
      'card:lina-10',
    ]);
  });

  /**
   * The comparator's **identity** has to hold still between renders, and nothing else here would
   * notice if it stopped (T010 fix round, finding B).
   *
   * `buildRows` can be keyed on nothing but the comparator's own identity, so an inlined arrow --
   * which every other case in this file would pass -- rebuilds every row of the period on every
   * render: SC-005's 300-memory month, rebuilt for nothing. This asserts the work rather than the
   * identity, because the hook here is the real one and there is no honest way to read the
   * argument it was handed without standing in for it.
   *
   * The re-render hands back the **same** route params object, which is what a screen sitting on
   * the navigation stack gets: nothing about the book has changed, so nothing should be rebuilt.
   */
  it('rebuilds no rows when nothing has changed, on a book with a comparator (SC-005)', async () => {
    const navigation = { goBack: jest.fn(), navigate: jest.fn() };
    const tree = await mount(HOUSEHOLD_ROUTE);
    await pickMarch(tree);

    // The month really was built, so an unchanged count below is not a count of nothing.
    const built = buildRows.mock.calls.length;
    expect(built).toBeGreaterThan(0);

    await act(async () => {
      tree.update(
        <PersonJournalScreen route={{ params: HOUSEHOLD_ROUTE }} navigation={navigation} />,
      );
    });
    await settle();

    expect(buildRows.mock.calls.length).toBe(built);
    // And the re-render really happened -- the month is still on screen, drawn from the same rows.
    expect(rowsOnScreen(tree)).toContain('card:huda-10');
  });

  /**
   * The other half of FR-009, and what keeps the cases above honest: a **friend group** has no
   * household order to keep, and reads exactly as one person's journal does.
   */
  it('leaves a friend group on the Journal tab’s own order (FR-009)', async () => {
    const tree = await mount(FRIEND_GROUP_ROUTE);

    // A day: newest first.
    expect(cardIds(tree)).toEqual(['huda-10', 'lina-10', 'karim-10']);

    await pickMarch(tree);

    // A month: oldest first, within a day too.
    expect(rowsOnScreen(tree)).toEqual([
      'heading:Thu 5 March',
      'card:karim-05',
      'heading:Tue 10 March',
      'card:karim-10',
      'card:lina-10',
      'card:huda-10',
    ]);
  });

  // -------------------------------------------------------------------------
  // SC-004 -- a memory is drawn the same way wherever it is read
  // -------------------------------------------------------------------------

  it('gives a memory the same author name and photo in a month as on its day (SC-004)', async () => {
    const tree = await mount(HOUSEHOLD_ROUTE);

    const onItsDay = cardProps(tree, 'huda-10').user;
    expect(onItsDay).toEqual({ name: 'Huda', avatarUrl: 'huda.png' });
    expect(cardProps(tree, 'huda-10').showAuthor).toBe(true);

    await pickMarch(tree);

    expect(cardProps(tree, 'huda-10').user).toEqual(onItsDay);
    expect(cardProps(tree, 'karim-10').user).toEqual({ name: 'Karim', avatarUrl: 'karim.png' });
    expect(cardProps(tree, 'huda-10').showAuthor).toBe(true);
  });
});

// ===========================================================================
// 019 T012 -- User Story 3: the page rules (FR-007, FR-014)
// ===========================================================================

/**
 * The reader's own Journal tab's page rules, on somebody else's book: next is always **later**,
 * the book opens on its newest day, and ◄ ►, the swipe and the date bar move only to a day, a
 * month or a year that **has** memories -- with each end of the book *announced* as unavailable
 * rather than silently doing nothing (FR-014).
 *
 * Nothing here stands in for the stepping. The index is the real one, built by `calendarModel`
 * from the very same list of memories every other case in this file is served from, and the hook
 * is the real hook; what these cases pin is that the screen asks for the step, draws the period
 * it lands on, and passes **both** ends on -- to the bar, where a screen reader meets them, and
 * to the swipe container, which is the half of FR-007 a person meets with their thumb.
 *
 * ⚠ The step is **±1 and nothing else** (`usePeopleCalendar`'s own contract): the two underlying
 * answers disagree about a bigger one, so no case here passes anything but the two arrows' own
 * directions.
 */
describe('User Story 3: the page rules on a friend’s journal (FR-007, FR-014)', () => {
  beforeEach(() => serve(BROTHER));

  /**
   * The oldest day in the book, reached **without ◄** -- through the sheet, by way of its month.
   * A case about what ► does must not have walked there on the thing it is testing.
   */
  const goToOldestDay = async (tree) => {
    await tapDate(tree);
    await pickMonthInSheet(tree, '2025-03');
    await tapDate(tree);
    await tap(tree, 'calendar-view-date');
    await tap(tree, 'calendar-day-2025-03-10');
  };

  /** Scenario 1, first half: it opens on the newest day, and there is nothing later than it. */
  it('opens on the friend’s newest day, with nothing later to reach (scenario 1, FR-014)', async () => {
    const tree = await mount(FRIEND_ROUTE);

    expect(barWords(tree)).toEqual(['Sat, Nov 14']);
    expect(cardIds(tree)).toEqual(['nov-14-b', 'nov-14-a']);

    // ► is announced as unavailable, and the swipe is told the same thing, so a screen reader
    // and a thumb cannot disagree about which end of the book this is.
    expect(arrowSays(tree, 'next')).toEqual({ label: 'Next day', disabled: true });
    expect(arrowSays(tree, 'previous')).toEqual({ label: 'Previous day', disabled: false });
    expect(swipe(tree).props.hasNext).toBe(false);
    expect(swipe(tree).props.hasPrevious).toBe(true);
  });

  /** Scenario 1, second half: "► goes to a later day" -- every time, to the end of the book. */
  it('► goes to a later day every time, in date order (scenario 1, 016 FR-008)', async () => {
    const tree = await mount(FRIEND_ROUTE);
    await goToOldestDay(tree);
    expect(barWords(tree)).toEqual(['Mon, Mar 10']);

    const visited = [];
    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await tapNext(tree);
      visited.push(barWords(tree)[0]);
    }

    // Every day the friend has and no other: later each time, never back, and never a day in
    // between that he recorded nothing on.
    expect(visited).toEqual([
      'Tue, Mar 18', 'Mon, Jun 2', 'Tue, Nov 3', 'Tue, Nov 10', 'Sat, Nov 14',
    ]);
    // And the book really is at its end again, on the day it opened on.
    expect(cardIds(tree)).toEqual(['nov-14-b', 'nov-14-a']);
    expect(arrowSays(tree, 'next').disabled).toBe(true);
  });

  it('reaches the oldest day with ◄ and then says there is nothing earlier (FR-014)', async () => {
    const tree = await mount(FRIEND_ROUTE);

    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await tapPrevious(tree);
    }

    expect(barWords(tree)).toEqual(['Mon, Mar 10']);
    expect(cardIds(tree)).toEqual(['mar-10-b', 'mar-10-a']);
    expect(arrowSays(tree, 'previous')).toEqual({ label: 'Previous day', disabled: true });
    expect(arrowSays(tree, 'next')).toEqual({ label: 'Next day', disabled: false });
    expect(swipe(tree).props.hasPrevious).toBe(false);
  });

  /**
   * A swipe at either end does nothing at all -- not a wrap to the other end, and not a page of
   * a day the friend has nothing on. The container is told to refuse it; this asserts the move
   * itself is a no-op as well, which is what stops a swipe the container let through.
   */
  it('does nothing on a swipe at either end of the book (FR-007, FR-014)', async () => {
    const tree = await mount(FRIEND_ROUTE);

    await act(async () => {
      swipe(tree).props.onNextDate();
    });
    await settle();

    expect(barWords(tree)).toEqual(['Sat, Nov 14']);
    expect(cardIds(tree)).toEqual(['nov-14-b', 'nov-14-a']);

    await goToOldestDay(tree);

    await act(async () => {
      swipe(tree).props.onPreviousDate();
    });
    await settle();

    expect(barWords(tree)).toEqual(['Mon, Mar 10']);
    expect(cardIds(tree)).toEqual(['mar-10-b', 'mar-10-a']);
  });
});

describe('User Story 3: the page rules on a group book (FR-007, FR-014)', () => {
  const GROUP_ROUTE = {
    persons: [
      { id: 'u-huda', name: 'Huda', avatar: 'huda.png' },
      { id: 'u-karim', name: 'Karim', avatar: 'karim.png' },
      { id: 'u-lina', name: 'Lina', avatar: 'lina.png' },
    ],
    isGroup: true,
    groupName: 'Work Friends',
    sourceType: 'friend',
  };

  /**
   * A group whose periods belong to **different people**, with empty ones between them:
   *
   *   Karim    4 May 2023          the oldest month, and a year of its own
   *   (2024 and 2025 hold nothing)
   *   Karim    8 January 2026
   *   (February and March hold nothing)
   *   Lina     21 April 2026
   *   Huda     2 November 2026     the newest day, where the book opens
   *
   * So a step by month and a step by year each have to skip an empty period **and** land on
   * somebody else's memory: a book that stepped to the next calendar period, or that only looked
   * at the person whose period it was on, would land somewhere else and be caught here.
   */
  const THE_GROUP = [
    memory('karim-2023', '2023-05-04', 100, { userId: 'u-karim' }),
    memory('karim-jan', '2026-01-08', 200, { userId: 'u-karim' }),
    memory('lina-apr', '2026-04-21', 300, { userId: 'u-lina' }),
    memory('huda-nov', '2026-11-02', 400, { userId: 'u-huda' }),
  ];

  beforeEach(() => serve(THE_GROUP));

  const pickMonth = async (tree, key) => {
    await tapDate(tree);
    await pickMonthInSheet(tree, key);
  };

  const pickYear = async (tree, year) => {
    await tapDate(tree);
    await tap(tree, 'calendar-view-year');
    await tap(tree, `calendar-year-tile-${year}`);
  };

  /** Scenario 2. */
  it('► shows the later month with any member’s memory, named and counted (scenario 2)', async () => {
    const tree = await mount(GROUP_ROUTE);

    await pickMonth(tree, '2026-01');
    expect(barWords(tree)).toEqual(['January 2026', '1 memory']);

    await tapNext(tree);

    // February and March hold nothing; April is Lina's alone, and it is hers the step finds --
    // not Karim's next month, and not the next month on the calendar.
    expect(barWords(tree)).toEqual(['April 2026', '1 memory']);
    expect(cardIds(tree)).toEqual(['lina-apr']);
    // The same two words, as one phrase, to a screen reader (FR-014).
    expect(barSays(tree)).toBe('April 2026, 1 memory');
    expect(arrowSays(tree, 'next')).toEqual({ label: 'Next month', disabled: false });
  });

  it('names a picked year and its count, and ► skips the years with nothing in them (FR-007)', async () => {
    const tree = await mount(GROUP_ROUTE);

    await pickYear(tree, 2023);
    expect(barWords(tree)).toEqual(['2023', '1 memory']);
    expect(barSays(tree)).toBe('2023, 1 memory');
    expect(arrowSays(tree, 'next')).toEqual({ label: 'Next year', disabled: false });
    expect(arrowSays(tree, 'previous')).toEqual({ label: 'Previous year', disabled: true });

    await tapNext(tree);

    // 2024 and 2025 hold nothing, so 2026 -- three people's three memories -- is the next year,
    // and every one of them is counted under its own month heading.
    expect(barWords(tree)).toEqual(['2026', '3 memories']);
    expect(monthHeadingCounts(tree)).toEqual({
      'January 2026': 1, 'April 2026': 1, 'November 2026': 1,
    });
    expect(arrowSays(tree, 'next').disabled).toBe(true);
  });

  it('says there is nothing later on the newest month, nor earlier on the oldest (FR-014)', async () => {
    const tree = await mount(GROUP_ROUTE);

    await pickMonth(tree, '2026-11');

    expect(barWords(tree)).toEqual(['November 2026', '1 memory']);
    expect(arrowSays(tree, 'next')).toEqual({ label: 'Next month', disabled: true });
    expect(arrowSays(tree, 'previous')).toEqual({ label: 'Previous month', disabled: false });
    expect(swipe(tree).props.hasNext).toBe(false);

    // A swipe forward from the newest month changes nothing.
    await act(async () => {
      swipe(tree).props.onNextDate();
    });
    await settle();
    expect(barWords(tree)).toEqual(['November 2026', '1 memory']);

    await pickMonth(tree, '2023-05');

    expect(barWords(tree)).toEqual(['May 2023', '1 memory']);
    expect(arrowSays(tree, 'previous')).toEqual({ label: 'Previous month', disabled: true });
    expect(swipe(tree).props.hasPrevious).toBe(false);

    await act(async () => {
      swipe(tree).props.onPreviousDate();
    });
    await settle();
    expect(barWords(tree)).toEqual(['May 2023', '1 memory']);
  });
});

// ===========================================================================
// 019 T013 -- User Story 4: choosing faces on a group book (FR-016, FR-017,
// FR-018, SC-008)
// ===========================================================================

/**
 * The reader taps one face, or several, and the book shows only those people's memories -- the
 * list, the date bar's count, the sheet's marks and counts, and where ◄ ► step (FR-016, FR-017).
 * The choice lives as long as the book is open and no longer (FR-018).
 *
 * ⚠ **Nothing here stands in for the choosing.** The row is the real `FacesRow`, the calendar the
 * real `CalendarSheet`, the index the real one built by `calendarModel` from the same list of
 * memories every other case in this file is served from, and the hook is the real hook -- only
 * the three look-ups are the server's stand-in. So a case that taps a face presses the control a
 * reader presses, and what it then asserts is what the screen really draws.
 *
 * ## The two "nothing here" states, which must never be confused
 *
 * - **`choiceEmpty`** -- the book has memories, the chosen people have none at all. The faces
 *   **stay** (so the choice can be changed), the sheet opens with every day faded, and the page
 *   says "Nothing from <names> yet".
 * - **`bookEmpty`** -- nobody in the book has anything. No calendar, no faces, and the book's own
 *   whole-book message.
 *
 * Telling a reader the second when the first is true says the family has written nothing when in
 * truth they have only picked a face. Two cases below hold them apart, in both directions.
 */
describe('User Story 4: choosing whose memories a group book shows', () => {
  /** A household opened from the family tree's head card (research R2; household order, R6). */
  const HOUSEHOLD = [
    { id: 'node-huda', name: 'Huda', avatar: 'huda.png', userId: 'u-huda' },
    { id: 'node-karim', name: 'Karim', avatar: 'karim.png', userId: 'u-karim' },
    { id: 'node-lina', name: 'Lina', avatar: 'lina.png', userId: 'u-lina' },
  ];

  const HOUSEHOLD_ROUTE = {
    persons: HOUSEHOLD,
    isGroup: true,
    groupName: "Huda's Family",
    bookKind: 'household',
  };

  /** The same three people as a friend group, which chooses exactly the same way (FR-010). */
  const FRIEND_GROUP_ROUTE = {
    persons: [
      { id: 'u-huda', name: 'Huda', avatar: 'huda.png' },
      { id: 'u-karim', name: 'Karim', avatar: 'karim.png' },
      { id: 'u-lina', name: 'Lina', avatar: 'lina.png' },
    ],
    isGroup: true,
    groupName: 'Work Friends',
    sourceType: 'friend',
  };

  /**
   * A book whose **days, months and years belong to different people**, with somebody else's
   * period in between each of theirs:
   *
   *   Lina    1 June 2024        a year nobody else has
   *   Huda    4 July 2025
   *   Lina    20 January 2026
   *   Huda    14 February 2026
   *   Karim   5 March 2026
   *   all three              10 March 2026 -- the newest day, where the book opens
   *
   * So with Huda chosen, ◄ from 10 March must skip Karim's 5 March for her 14 February; ◄ from
   * March must skip Lina's January for Huda's February; and ◄ from 2025 must stop, because 2024
   * is Lina's. A book still stepping over everyone's index lands on the other person's period
   * every time, and is caught on each of the three.
   */
  const THE_BOOK = [
    memory('lina-2024', '2024-06-01', 100, { userId: 'u-lina' }),
    memory('huda-2025', '2025-07-04', 200, { userId: 'u-huda' }),
    memory('lina-jan', '2026-01-20', 300, { userId: 'u-lina' }),
    memory('huda-feb', '2026-02-14', 400, { userId: 'u-huda' }),
    memory('karim-05', '2026-03-05', 500, { userId: 'u-karim' }),
    memory('karim-10', '2026-03-10', 600, { userId: 'u-karim' }),
    memory('lina-10', '2026-03-10', 620, { userId: 'u-lina' }),
    memory('huda-10', '2026-03-10', 650, { userId: 'u-huda' }),
  ];

  beforeEach(() => serve(THE_BOOK));

  const pickMonth = async (tree, key) => {
    await tapDate(tree);
    await pickMonthInSheet(tree, key);
  };

  const pickYear = async (tree, year) => {
    await tapDate(tree);
    await tap(tree, 'calendar-view-year');
    await tap(tree, `calendar-year-tile-${year}`);
  };

  /** Every day of a month the open sheet marks -- the days a reader is invited to tap. */
  const markedDaysIn = (tree, month) => {
    const marked = [];
    for (let day = 1; day <= 31; day += 1) {
      const key = `${month}-${String(day).padStart(2, '0')}`;
      if (byTestID(tree, `calendar-day-${key}`).length === 1 && !dayIsFaded(tree, key)) {
        marked.push(key);
      }
    }
    return marked;
  };

  // -------------------------------------------------------------------------
  // Scenarios 1-5 -- choosing, adding a second face, and un-choosing
  // -------------------------------------------------------------------------

  it('opens with every face once, nobody chosen, and everyone’s memories (scenario 1)', async () => {
    const tree = await mount(HOUSEHOLD_ROUTE);

    expect(pageOrder(tree)).toEqual(['date bar', 'faces', 'list']);
    expect(faceIds(tree)).toEqual(['u-huda', 'u-karim', 'u-lina']);
    expect(faceIsChosen(tree, 'u-huda')).toBe(false);
    expect(faceIsChosen(tree, 'u-karim')).toBe(false);
    expect(faceIsChosen(tree, 'u-lina')).toBe(false);
    expect(saysSomething(tree, 'Showing everyone · tap a face to choose')).toBe(true);
    // Nothing to clear, so the row offers no way to clear it.
    expect(byTestID(tree, 'faces-row-show-everyone')).toHaveLength(0);

    // Everyone's: the whole household's newest day, in household order.
    expect(cardIds(tree)).toEqual(['huda-10', 'karim-10', 'lina-10']);
    expect(getCalendar).toHaveBeenCalledTimes(1);
    expect(getCalendar).toHaveBeenCalledWith('token-1', ['u-huda', 'u-karim', 'u-lina']);
  });

  it('shows only the chosen person’s memories, with the date bar’s count hers (scenario 2)', async () => {
    const tree = await mount(HOUSEHOLD_ROUTE);
    await pickMonth(tree, '2026-03');
    expect(barWords(tree)).toEqual(['March 2026', '4 memories']);

    await tapFace(tree, 'u-huda');

    expect(cardIds(tree)).toEqual(['huda-10']);
    expect(barWords(tree)).toEqual(['March 2026', '1 memory']);
    expect(barSays(tree)).toBe('March 2026, 1 memory');
    // Marked as chosen, and said to be (FR-016).
    expect(faceIsChosen(tree, 'u-huda')).toBe(true);
    expect(faceIsChosen(tree, 'u-karim')).toBe(false);
    expect(faceSays(tree, 'u-huda')).toBe('Huda, chosen');
    expect(saysSomething(tree, 'Showing Huda')).toBe(true);
  });

  /**
   * R7's division of labour, which nothing a reader can see would catch: the **index** is asked
   * again for the chosen people, and the page is not re-read at all. A screen that re-fetched the
   * period would look right and cost a round trip on every tap; one that did not re-ask the index
   * would leave the calendar marking everyone's days.
   */
  it('asks the index again for the chosen person, and re-reads no page (FR-017, R7)', async () => {
    const tree = await mount(HOUSEHOLD_ROUTE);
    const daysRead = getDay.mock.calls.length;
    const periodsRead = getPeriod.mock.calls.length;

    await tapFace(tree, 'u-huda');

    expect(getCalendar).toHaveBeenLastCalledWith('token-1', ['u-huda']);
    expect(getDay.mock.calls.length).toBe(daysRead);
    expect(getPeriod.mock.calls.length).toBe(periodsRead);
  });

  it('lists two chosen people’s memories together, in date order (scenario 3)', async () => {
    const tree = await mount(HOUSEHOLD_ROUTE);
    await pickMonth(tree, '2026-03');

    await tapFace(tree, 'u-huda');
    await tapFace(tree, 'u-karim');

    expect(rowsOnScreen(tree)).toEqual([
      'heading:Thu 5 March',
      'card:karim-05',
      'heading:Tue 10 March',
      // Household order within the day, as every other list on this book keeps it (FR-009).
      'card:huda-10',
      'card:karim-10',
    ]);
    expect(barWords(tree)).toEqual(['March 2026', '3 memories']);
    expect(saysSomething(tree, 'Showing Huda and Karim')).toBe(true);
    expect(getCalendar).toHaveBeenLastCalledWith('token-1', ['u-huda', 'u-karim']);
  });

  /** Scenario 4: Karim alone wrote on 5 March, and Huda is the one chosen. */
  it('fades a day the chosen person has nothing on, and counts only hers (scenario 4, FR-017)', async () => {
    const tree = await mount(HOUSEHOLD_ROUTE);
    await tapFace(tree, 'u-huda');

    await tapDate(tree);

    expect(dayIsFaded(tree, '2026-03-10')).toBe(false);
    // Karim's day, and he is not chosen -- so it is faded, and cannot be tapped into.
    expect(dayIsFaded(tree, '2026-03-05')).toBe(true);

    await tap(tree, 'calendar-view-month');
    expect(tileSays(tree, 'calendar-month-tile-2026-03')).toBe('March 2026, 1 memory');
    expect(tileSays(tree, 'calendar-month-tile-2026-02')).toBe('February 2026, 1 memory');
    // Lina's month: nothing of Huda's in it at all.
    expect(tileSays(tree, 'calendar-month-tile-2026-01')).toBe('January 2026, unavailable');

    await tap(tree, 'calendar-view-year');
    expect(tileSays(tree, 'calendar-year-tile-2026')).toBe('2026, 2 memories');
    expect(tileSays(tree, 'calendar-year-tile-2025')).toBe('2025, 1 memory');
    expect(tileSays(tree, 'calendar-year-tile-2024')).toBe('2024, unavailable');
  });

  it('shows everyone again when the chosen faces are un-tapped (scenario 5)', async () => {
    const tree = await mount(HOUSEHOLD_ROUTE);
    await pickMonth(tree, '2026-03');
    await tapFace(tree, 'u-huda');
    await tapFace(tree, 'u-karim');
    expect(cardIds(tree)).toEqual(['karim-05', 'huda-10', 'karim-10']);

    await tapFace(tree, 'u-huda');
    expect(cardIds(tree)).toEqual(['karim-05', 'karim-10']);

    const asked = getCalendar.mock.calls.length;
    await tapFace(tree, 'u-karim');

    expect(cardIds(tree)).toEqual(['karim-05', 'huda-10', 'karim-10', 'lina-10']);
    expect(barWords(tree)).toEqual(['March 2026', '4 memories']);
    expect(faceIsChosen(tree, 'u-karim')).toBe(false);
    expect(saysSomething(tree, 'Showing everyone · tap a face to choose')).toBe(true);
    // Nobody chosen is the book's own index again, so the last un-tap costs no second look-up.
    expect(getCalendar.mock.calls.length).toBe(asked);
  });

  it('shows everyone again from the row’s own Show everyone (FR-016)', async () => {
    const tree = await mount(HOUSEHOLD_ROUTE);
    await pickMonth(tree, '2026-03');
    await tapFace(tree, 'u-huda');
    await tapFace(tree, 'u-lina');
    expect(cardIds(tree)).toEqual(['huda-10', 'lina-10']);

    await showEveryone(tree);

    expect(cardIds(tree)).toEqual(['karim-05', 'huda-10', 'karim-10', 'lina-10']);
    expect(faceIsChosen(tree, 'u-huda')).toBe(false);
    expect(faceIsChosen(tree, 'u-lina')).toBe(false);
    expect(byTestID(tree, 'faces-row-show-everyone')).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Scenario 6 -- the choice survives the page, and the page follows the choice
  // -------------------------------------------------------------------------

  it('keeps the choice through a day, a month and a year step (scenario 6, FR-018)', async () => {
    const tree = await mount(HOUSEHOLD_ROUTE);
    await tapFace(tree, 'u-huda');

    await tapPrevious(tree);
    expect(faceIsChosen(tree, 'u-huda')).toBe(true);

    await pickMonth(tree, '2026-03');
    expect(faceIsChosen(tree, 'u-huda')).toBe(true);
    expect(cardIds(tree)).toEqual(['huda-10']);

    await tapPrevious(tree);
    expect(faceIsChosen(tree, 'u-huda')).toBe(true);

    await pickYear(tree, 2026);
    expect(faceIsChosen(tree, 'u-huda')).toBe(true);
    expect(saysSomething(tree, 'Showing Huda')).toBe(true);
    expect(monthHeadingCounts(tree)).toEqual({ 'February 2026': 1, 'March 2026': 1 });
  });

  it('steps only to the chosen person’s days, months and years (scenario 6, FR-017)', async () => {
    const tree = await mount(HOUSEHOLD_ROUTE);
    await tapFace(tree, 'u-huda');

    // A day: 5 March is Karim's, so ◄ passes it for Huda's 14 February.
    await tapPrevious(tree);
    expect(barWords(tree)).toEqual(['Sat, Feb 14']);
    expect(cardIds(tree)).toEqual(['huda-feb']);

    // A month: January is Lina's, so ◄ from March passes it for February.
    await pickMonth(tree, '2026-03');
    await tapPrevious(tree);
    expect(barWords(tree)).toEqual(['February 2026', '1 memory']);
    expect(arrowSays(tree, 'next')).toEqual({ label: 'Next month', disabled: false });

    // A year: 2024 is Lina's, so 2025 is as far back as Huda's book goes.
    await pickYear(tree, 2025);
    expect(barWords(tree)).toEqual(['2025', '1 memory']);
    expect(arrowSays(tree, 'previous')).toEqual({ label: 'Previous year', disabled: true });
    expect(swipe(tree).props.hasPrevious).toBe(false);

    // And with nobody chosen the very same step reaches Lina's 2024, so the stop above is the
    // choice's doing rather than the end of the book.
    await showEveryone(tree);
    expect(arrowSays(tree, 'previous')).toEqual({ label: 'Previous year', disabled: false });
    await tapPrevious(tree);
    expect(barWords(tree)).toEqual(['2024', '1 memory']);
  });

  // -------------------------------------------------------------------------
  // Scenario 7 and the edge case it runs into
  // -------------------------------------------------------------------------

  it('lets a dimmed face be chosen, and then says nothing is here from them (scenario 7)', async () => {
    const tree = await mount(HOUSEHOLD_ROUTE);

    // 5 March is Karim's alone, so Huda's face is dimmed there.
    await tapPrevious(tree);
    expect(barWords(tree)).toEqual(['Thu, Mar 5']);
    expect(faceSays(tree, 'u-huda')).toBe('Huda, nothing in this period');

    await tapFace(tree, 'u-huda');

    expect(faceIsChosen(tree, 'u-huda')).toBe(true);
    expect(faceSays(tree, 'u-huda')).toBe('Huda, chosen, nothing in this period');
    // The page names her, rather than saying nothing is here at all (spec edge case).
    expect(cardIds(tree)).toEqual([]);
    expect(saysSomething(tree, 'Nothing from Huda on this day')).toBe(true);
    expect(saysSomething(tree, 'Nobody here has shared any memories with you yet')).toBe(false);

    // ◄ ► step to her own next memories, which is what the message tells the reader to do.
    expect(arrowSays(tree, 'next')).toEqual({ label: 'Next day', disabled: false });
    await tapNext(tree);
    expect(barWords(tree)).toEqual(['Tue, Mar 10']);
    expect(cardIds(tree)).toEqual(['huda-10']);
  });

  it('names the period the chosen person has nothing in, on a month too (edge case)', async () => {
    const tree = await mount(HOUSEHOLD_ROUTE);
    await pickMonth(tree, '2026-01');

    await tapFace(tree, 'u-huda');

    // January 2026 is Lina's alone. The month is still the one on screen, and it says so.
    expect(barWords(tree)).toEqual(['January 2026', '0 memories']);
    expect(saysSomething(tree, 'Nothing from Huda in this month')).toBe(true);
    expect(saysSomething(tree, 'No memories in this month')).toBe(false);
  });

  // -------------------------------------------------------------------------
  // choiceEmpty, and the message it must never borrow (spec edge case, analyze I2)
  // -------------------------------------------------------------------------

  describe('the chosen person has nothing in the book at all (choiceEmpty)', () => {
    /** Karim and Lina have written; Huda, who is in the book, has not. */
    const WITHOUT_HUDA = THE_BOOK.filter((item) => item.userId !== 'u-huda');

    beforeEach(() => serve(WITHOUT_HUDA));

    it('keeps the faces, fades the whole calendar and says nothing from her yet', async () => {
      const tree = await mount(HOUSEHOLD_ROUTE);
      expect(cardIds(tree)).toEqual(['karim-10', 'lina-10']);

      await tapFace(tree, 'u-huda');

      // The faces stay, so the choice can be changed -- which is the whole difference from a
      // book nobody has written in.
      expect(faceIds(tree)).toEqual(['u-huda', 'u-karim', 'u-lina']);
      expect(saysSomething(tree, 'Nothing from Huda yet')).toBe(true);
      expect(cardIds(tree)).toEqual([]);
      // Both ends of the book are reached at once: there is no period of hers to step to.
      expect(arrowSays(tree, 'next').disabled).toBe(true);
      expect(arrowSays(tree, 'previous').disabled).toBe(true);

      // The sheet opens -- unchanged -- with every day of the month faded.
      await tapDate(tree);
      expect(sheetIsOpen(tree)).toBe(true);
      expect(markedDaysIn(tree, '2026-03')).toEqual([]);
      expect(dayIsFaded(tree, '2026-03-10')).toBe(true);
    });

    it('never borrows the words of a book nobody has written in (choiceEmpty vs bookEmpty)', async () => {
      const tree = await mount(HOUSEHOLD_ROUTE);
      await tapFace(tree, 'u-huda');

      expect(saysSomething(tree, 'Nobody here has shared any memories with you yet')).toBe(false);
      expect(saysSomething(tree, "Couldn't load journal")).toBe(false);

      // And the other way round: a book nobody has written in has no faces and no calendar to
      // choose with, and says so about the whole book.
      serve([]);
      const nobody = await mount(HOUSEHOLD_ROUTE);

      expect(saysSomething(nobody, 'Nobody here has shared any memories with you yet')).toBe(true);
      expect(saysSomething(nobody, 'Nothing from')).toBe(false);
      expect(nobody.root.findAllByType(FacesRow)).toHaveLength(0);
      expect(byTestID(nobody, 'date-bar-period')).toHaveLength(0);
    });

    /**
     * Fails closed (`CLAUDE.md`): the chosen person's marks could not be read, so the calendar
     * refuses to open and says why. What must never happen is the screen drawing that silence as
     * "she has written nothing" -- the two look identical from the outside and mean the opposite.
     */
    it('refuses a half-read calendar for the chosen person, and never calls it empty', async () => {
      serve(THE_BOOK);
      const everyone = getCalendar.getMockImplementation();
      getCalendar.mockImplementation(async (token, ids) => {
        if (ids.length === 1) throw new Error('no network');
        return everyone(token, ids);
      });
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      const tree = await mount(HOUSEHOLD_ROUTE);

      await tapFace(tree, 'u-huda');

      expect(saysSomething(tree, 'Nothing from Huda yet')).toBe(false);
      await tapDate(tree);
      expect(sheetIsOpen(tree)).toBe(false);
      expect(alert.mock.calls[0][0]).toBe("Couldn't load the calendar");
      alert.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // FR-018 -- how long the choice lasts
  // -------------------------------------------------------------------------

  it('keeps the choice when a memory is opened on top, and forgets it when the book is left', async () => {
    const tree = await mount(HOUSEHOLD_ROUTE);
    await tapFace(tree, 'u-huda');
    expect(cardIds(tree)).toEqual(['huda-10']);

    // A memory's gallery, opened **on top** of the book: the book is still open behind it.
    // `EntryGalleryModal` draws nothing at all until it has a memory, so its own header is what
    // says it is really open.
    expect(saysSomething(tree, 'Gallery')).toBe(false);
    await act(async () => {
      cardProps(tree, 'huda-10').onGalleryPress(cardProps(tree, 'huda-10').entry);
    });
    await settle();

    expect(saysSomething(tree, 'Gallery')).toBe(true);
    expect(faceIsChosen(tree, 'u-huda')).toBe(true);
    expect(cardIds(tree)).toEqual(['huda-10']);

    // Pull to refresh keeps it too (FR-015 and FR-018 together).
    await pullToRefresh(tree);
    expect(faceIsChosen(tree, 'u-huda')).toBe(true);
    expect(cardIds(tree)).toEqual(['huda-10']);

    // Leaving the book is going back out of its screen. Opened again, nobody is chosen.
    await act(() => tree.unmount());
    trees = trees.filter((other) => other !== tree);

    const reopened = await mount(HOUSEHOLD_ROUTE);
    expect(faceIsChosen(reopened, 'u-huda')).toBe(false);
    expect(saysSomething(reopened, 'Showing everyone · tap a face to choose')).toBe(true);
    expect(cardIds(reopened)).toEqual(['huda-10', 'karim-10', 'lina-10']);
  });

  // -------------------------------------------------------------------------
  // SC-008
  // -------------------------------------------------------------------------

  it('lists all of one person’s month and nobody else’s, and marks no empty day (SC-008)', async () => {
    const tree = await mount(HOUSEHOLD_ROUTE);
    await tapFace(tree, 'u-lina');
    await pickMonth(tree, '2026-03');

    // 100% of Lina's visible March memories, and zero of anybody else's.
    expect(cardIds(tree)).toEqual(['lina-10']);
    THE_BOOK
      .filter((item) => item.userId !== 'u-lina')
      .forEach((item) => expect(cardIds(tree)).not.toContain(item.localId));

    // Every day the calendar marks for her leads to a page with something on it.
    await tapDate(tree);
    await tap(tree, 'calendar-view-date');
    const marked = markedDaysIn(tree, '2026-03');
    expect(marked).toEqual(['2026-03-10']);

    await tap(tree, `calendar-day-${marked[0]}`);
    expect(cardIds(tree)).toEqual(['lina-10']);
  });

  // -------------------------------------------------------------------------
  // The other group book -- a friend group chooses the same way
  // -------------------------------------------------------------------------

  it('chooses the same way on a friend group’s book (FR-010, FR-016)', async () => {
    const tree = await mount(FRIEND_GROUP_ROUTE);

    expect(faceIds(tree)).toEqual(['u-huda', 'u-karim', 'u-lina']);
    // A friend group keeps the Journal tab's own order: a day newest first (FR-009).
    expect(cardIds(tree)).toEqual(['huda-10', 'lina-10', 'karim-10']);

    await tapFace(tree, 'u-lina');

    expect(faceIsChosen(tree, 'u-lina')).toBe(true);
    expect(cardIds(tree)).toEqual(['lina-10']);
    expect(getCalendar).toHaveBeenLastCalledWith('token-1', ['u-lina']);
    expect(saysSomething(tree, 'Showing Lina')).toBe(true);
  });

  /** One person's journal has nobody to choose between, so it has no row at all (FR-010). */
  it('offers no choosing on one person’s journal', async () => {
    serve(BROTHER);
    const tree = await mount(FAMILY_ROUTE);

    expect(tree.root.findAllByType(FacesRow)).toHaveLength(0);
    expect(faceIds(tree)).toEqual([]);
  });
});
