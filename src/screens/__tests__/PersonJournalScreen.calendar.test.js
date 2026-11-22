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
import { getCalendar, getDay, getPeriod } from '../../services/JournalCalendarService';
import { getUserEntries } from '../../services/SocialService';

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

const tapDate = (tree) => tap(tree, 'date-bar-period');
const tapNext = (tree) => tap(tree, 'date-bar-next');
const tapPrevious = (tree) => tap(tree, 'date-bar-previous');

/** Whether a day tile in the open sheet is faded -- which is also what makes it untappable. */
const dayIsFaded = (tree, key) => {
  const tiles = byTestID(tree, `calendar-day-${key}`);
  if (tiles.length !== 1) throw new Error(`no day tile for ${key} in the open sheet`);
  return tiles[0].props.accessibilityState.disabled === true;
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
