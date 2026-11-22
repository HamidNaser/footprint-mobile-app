/**
 * 019 T011 -- `FamilySummaryScreen` as **pages** (spec User Story 2; FR-002, FR-008, FR-009,
 * FR-010, FR-011, FR-013, FR-015, SC-003, SC-004).
 *
 * **These are the first tests this screen has ever had.** Until now the family book was one
 * continuous newest-first scroll of days, paged backwards by `onEndReached`: there was no way to
 * reach March without scrolling through everything since, and no calendar to reach it from. The
 * book is now a page at a time -- a day, a month or a year -- read through `usePeopleCalendar`,
 * exactly as the reader's own Journal tab works (016) and as `PersonJournalScreen` now does.
 *
 * ## How the server is stood in for
 *
 * The two routes this screen reads are mocked, and both are driven from **one list of visible
 * memories** -- `serve(visible, household)`:
 *
 * - `/journal/calendar` and `/journal/period` (`JournalCalendarService`), which answer the marks
 *   and a month or year page;
 * - `/journal/book` (`getJournalBook`), which answers the household and a single day (R5).
 *
 * Three deliberate properties of that stand-in, without which several cases below would be
 * passing on the fixture rather than on the screen:
 *
 * - **A day comes back in created-time order, not in household order.** The real endpoint
 *   returns a day in household position with no tie-break between one member's memories (R6), so
 *   the page has to sort it either way; a fixture already in the page's order could not tell a
 *   screen that sorts from one that does not.
 * - **`before` is exclusive and the book answers the newest day *before* it** -- so asking for a
 *   day with nothing on it answers an **earlier** day's memories, which is exactly the skew the
 *   `days[0].date === D` check exists for (R5).
 * - **Every memory arrives with a nameless author**, as `adaptEntry` builds one when the API
 *   sends none, which is the family book's own case. Every name and photo on screen below can
 *   therefore only have come from the household (R6a) -- which is what SC-004 is about.
 *
 * Everything else is the real thing: `CalendarSheet`, `JournalDateBar`, `FacesRow`,
 * `CalendarListHeading`, `calendarModel`, `usePeopleCalendar` and `usePinnedHeadingScroll`. Only
 * `JournalEntryCard` is a probe -- it draws nothing and carries its props, so which memory was
 * drawn, in what order and with which author can be read straight off it.
 *
 * ⚠ **The map-gating cases live in `memoryMapViewability.test.js`**, which pins 016 FR-017's lazy
 * map for this screen and `PersonJournalScreen` together.
 */

/**
 * ⚠ **This file runs west of Greenwich, deliberately** (FR-013, 016 FR-011).
 *
 * A civil date is a day, not an instant. The one piece of date arithmetic this screen does --
 * the `before` cursor, which is the day after the one being read -- is built from calendar parts
 * for that reason, and a zone at or east of UTC would let `new Date('2026-03-31')` pass the two
 * cases that exist to catch it. The zone is put back afterwards so no other suite sharing this
 * worker inherits it; `scripts/test-tz.mjs` (T014) runs the whole file in three zones later.
 */
const ORIGINAL_TZ = process.env.TZ;
process.env.TZ = 'America/Los_Angeles';
afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

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
 * to do with reading a family's journal.
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

jest.mock('../../services/SocialService', () => ({
  getJournalBook: jest.fn(),
  getUserEntries: jest.fn(async () => []),
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u-huda' }, accessToken: 'token-1' }),
}));

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { ActivityIndicator, Alert, FlatList, Text, TouchableOpacity } from 'react-native';

import FamilySummaryScreen from '../FamilySummaryScreen';
import { CalendarSheet } from '../../components/journal/CalendarSheet';
import CalendarListHeading from '../../components/journal/CalendarListHeading';
import { DateSwipeContainer } from '../../components/journal/DateSwipeContainer';
import { JournalDateBar } from '../../components/journal/JournalDateBar';
import { FacesRow } from '../../components/journal/FacesRow';
import { getCalendar, getPeriod } from '../../services/JournalCalendarService';
import { getJournalBook } from '../../services/SocialService';

global.IS_REACT_ACT_ENVIRONMENT = true;

const CardProbe = require('../../components/journal/JournalEntryCard').JournalEntryCard;

// ---------------------------------------------------------------------------
// The household and its memories
// ---------------------------------------------------------------------------

/** The household, in household order, as `/journal/book` answers it. */
const HOUSEHOLD = [
  { memberId: 'm-huda', userId: 'u-huda', relation: 'self', name: 'Huda', avatarUrl: 'huda.png', hasAccount: true },
  { memberId: 'm-karim', userId: 'u-karim', relation: 'spouse', name: 'Karim', avatarUrl: 'karim.png', hasAccount: true },
  { memberId: 'm-lina', userId: 'u-lina', relation: 'child', name: 'Lina', avatarUrl: 'lina.png', hasAccount: true },
];

/**
 * A memory as `adaptEntry` hands it over. Its `author` is the nameless one `adaptEntry` builds
 * when the API sends none -- the family book's own case (R6a), and what makes every name on
 * screen below an answer from the household rather than from the memory.
 */
const memory = (localId, date, createdAt, overrides = {}) => ({
  localId,
  serverId: `s-${localId}`,
  userId: overrides.userId || 'u-huda',
  date,
  datePrecision: 'day',
  createdAt,
  contentBlocks: [],
  author: { id: overrides.userId || 'u-huda', name: null, avatarUrl: null },
  ...overrides,
});

/**
 * One day holding all three people's memories, built so that **three orders differ**:
 *
 * - household order (position in the household, then created time): Huda, Karim, Lina
 * - newest first (a person's or a friend group's day, 016 FR-004): Huda, Lina, Karim
 * - oldest first by created time (the server's own day, and `buildRows`' default): Karim, Lina,
 *   Huda
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

const ROUTE = { memberId: 'node-head', title: "Huda's Family" };

// ---------------------------------------------------------------------------
// The server, stood in for from one list of visible memories
// ---------------------------------------------------------------------------

const dayOf = (item) => item.date.slice(0, 10);

/**
 * Which memories one `precision` asks for, as `/journal/period` reads the word: `'month'` is
 * day-dated and month-dated memories both, `'year'` the year-dated ones alone.
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
 * Point the marks, the period pages and `/journal/book` at one list of **visible** memories --
 * what the reader is allowed to see, which is the only thing the server ever answers with.
 */
function serve(visible, household = HOUSEHOLD) {
  const mine = (ids) => visible.filter((item) => ids.includes(item.userId));
  const inOrder = (items) => [...items].sort(
    (a, b) => (dayOf(a) < dayOf(b) ? -1 : dayOf(a) > dayOf(b) ? 1 : a.createdAt - b.createdAt),
  );

  getCalendar.mockImplementation(async (token, ids) => ({
    authorIds: ids,
    days: calendarRows(mine(ids)),
  }));

  getPeriod.mockImplementation(async (token, { authorIds, from, to, precision }) => inOrder(
    mine(authorIds).filter(
      (item) => dayOf(item) >= from && dayOf(item) <= to && atPrecision(item, precision),
    ),
  ));

  const householdIds = household.map((member) => member.userId).filter(Boolean);
  const memberOf = (userId) => household.find((m) => m.userId === userId)?.memberId ?? null;

  getJournalBook.mockImplementation(async (token, { before, days = 30 } = {}) => {
    const byDay = new Map();
    inOrder(mine(householdIds)).forEach((item) => {
      const key = dayOf(item);
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(item);
    });

    // Newest first, and `before` is **exclusive**: the book answers the newest day before it,
    // whatever day that turns out to be (R5).
    const candidates = [...byDay.keys()].sort().reverse()
      .filter((key) => (!before || key < before));
    const taken = candidates.slice(0, days);

    return {
      household,
      days: taken.map((key) => ({
        date: key,
        // Created time, which is **not** the page's order: the real endpoint has no tie-break
        // between one member's memories, so the page sorts it itself (R6).
        entries: byDay.get(key).map((item) => ({ ...item, memberId: memberOf(item.userId) })),
      })),
      oldestDate: taken[taken.length - 1] ?? null,
      hasMore: candidates.length > taken.length,
    };
  });
}

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

const mount = async (params = ROUTE) => {
  let tree;
  await act(async () => {
    tree = renderer.create(
      <FamilySummaryScreen
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
 * The page's rows in the order a person meets them going down the screen (FR-010): the date bar,
 * the faces, then the one list. `findAll` walks the tree in render order, so this is the
 * arrangement as it is drawn -- the only way "the date bar is the first row of the page and the
 * faces the second" can be asserted without measuring pixels.
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
 * A control by its `testID`.
 *
 * ⚠ **By `TouchableOpacity` and not by a bare `findAll` on the id.** A `TouchableOpacity` renders
 * a host `View` carrying the very same props, so searching on the id alone finds each control
 * twice.
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

const FACE_PREFIX = 'faces-row-face-';

/**
 * Every face in the row, in the order it is drawn, by the **person** it is of.
 *
 * Read from the faces' own test ids rather than from `FacesRow`'s props, so a person drawn twice
 * (two tree nodes linked to one account) is two entries here, which is what the de-duplication
 * case needs to be able to fail.
 */
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

/** The swipe container, which carries the other half of ◄ ► (FR-007). */
const swipe = (tree) => tree.root.findByType(DateSwipeContainer);

const tapDate = (tree) => tap(tree, 'date-bar-period');
const tapNext = (tree) => tap(tree, 'date-bar-next');
const tapPrevious = (tree) => tap(tree, 'date-bar-previous');

/** Every word on screen, so an empty or failure message can be asserted by what it says. */
const words = (tree) => tree.root
  .findAllByType(Text)
  .map((node) => (Array.isArray(node.props.children)
    ? node.props.children.filter((child) => typeof child === 'string').join('')
    : node.props.children))
  .filter((said) => typeof said === 'string');

const saysSomething = (tree, said) => words(tree).some((line) => line.includes(said));

const sheet = (tree) => tree.root.findByType(CalendarSheet);
const sheetIsOpen = (tree) => sheet(tree).props.visible === true;

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

/** The month headings a year list has drawn. */
const monthHeadings = (tree) => tree.root
  .findAllByType(CalendarListHeading)
  .filter((heading) => heading.props.kind === 'monthHeading');

const monthHeadingCounts = (tree) => Object.fromEntries(
  monthHeadings(tree).map((heading) => [heading.props.label, heading.props.count]),
);

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

/** Walk the open sheet to a month tile and pick it: Month view, then ◄ a year at a time. */
const pickMonthInSheet = async (tree, monthKey) => {
  await tap(tree, 'calendar-view-month');
  for (let step = 0; byTestID(tree, `calendar-month-tile-${monthKey}`).length === 0; step += 1) {
    if (step > 20) throw new Error(`the sheet never reached ${monthKey}`);
    // eslint-disable-next-line no-await-in-loop
    await tap(tree, 'calendar-prev');
  }
  await tap(tree, `calendar-month-tile-${monthKey}`);
};

const pickMarch = async (tree) => {
  await tapDate(tree);
  await pickMonthInSheet(tree, '2026-03');
};

const pick2026 = async (tree) => {
  await tapDate(tree);
  await tap(tree, 'calendar-view-year');
  await tap(tree, 'calendar-year-tile-2026');
};

/** The pull-to-refresh control's own props -- `refreshing` is what a reader sees spinning. */
const refreshControl = (tree) => list(tree).props.refreshControl.props;

const pullToRefresh = async (tree) => {
  await act(async () => {
    refreshControl(tree).onRefresh();
  });
  await settle();
};

/** A promise a case resolves when it chooses, so a read can be caught mid-flight. */
function deferred() {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
}

/** The cursors `/journal/book` was asked for a single day with, in order. */
const dayCursors = () => getJournalBook.mock.calls
  .map(([, options]) => options?.before)
  .filter(Boolean);

/** Which calls read the household -- the ones with no cursor at all. */
const householdReads = () => getJournalBook.mock.calls.filter(([, options]) => !options?.before);

// ===========================================================================
// User Story 2 -- the family book as pages
// ===========================================================================

describe('User Story 2: the family book is pages, not one long scroll', () => {
  beforeEach(() => serve(THE_FAMILY));

  /** Scenario 4, and FR-008. */
  it('opens on the newest day with memories, the bar first and the faces second (scenario 4)', async () => {
    const tree = await mount();

    expect(barWords(tree)).toContain('Tue, Mar 10');
    expect(pageOrder(tree)).toEqual(['date bar', 'faces', 'list']);
    // That one day, and nothing else: the older days are reached through the calendar now.
    expect([...cardIds(tree)].sort()).toEqual(['huda-10', 'karim-10', 'lina-10']);
    expect(cardIds(tree)).not.toContain('karim-05');
    expect(cardIds(tree)).not.toContain('lina-jan');
  });

  /** FR-008: the continuous newest-first scroll, and the paging that fed it, are gone. */
  it('has no older-page scroll left on it (FR-008)', async () => {
    const tree = await mount();

    expect(list(tree).props.onEndReached).toBeUndefined();
    // Every read is a one-day read: the household's, and the day on screen. Never a page of 30.
    expect(getJournalBook.mock.calls.every(([, options]) => options.days === 1)).toBe(true);
  });

  it('reads the household with the one-day call, then the day it opened on (R5)', async () => {
    await mount();

    expect(getJournalBook).toHaveBeenCalledWith('token-1', { memberId: 'node-head', days: 1 });
    expect(getJournalBook).toHaveBeenCalledWith(
      'token-1',
      { memberId: 'node-head', before: '2026-03-11', days: 1 },
    );
    expect(getCalendar).toHaveBeenCalledWith('token-1', ['u-huda', 'u-karim', 'u-lina']);
  });

  /** Scenario 5: a single day in the order the family book shows it today (FR-009, R6). */
  it('reads a single day in household order (scenario 5, FR-009)', async () => {
    const tree = await mount();

    // The book answered created-time order (Karim, Lina, Huda). Household position, then
    // created time, is Huda, Karim, Lina; newest first would be Huda, Lina, Karim.
    expect(cardIds(tree)).toEqual(['huda-10', 'karim-10', 'lina-10']);
  });

  /** Scenario 1, and SC-003. */
  it('lists all three people’s March memories in date order, each with its author (scenario 1)', async () => {
    const tree = await mount();

    await pickMarch(tree);

    expect(sheetIsOpen(tree)).toBe(false);
    expect(barWords(tree)).toEqual(['March 2026', '4 memories']);
    expect(rowsOnScreen(tree)).toEqual([
      'heading:Thu 5 March',
      'card:karim-05',
      'heading:Tue 10 March',
      // Household order within the day, not the created-time order the server answered in.
      'card:huda-10',
      'card:karim-10',
      'card:lina-10',
    ]);
    // SC-003: every member's visible March memory is there, named from the household.
    expect(cardProps(tree, 'karim-05').user).toEqual({ name: 'Karim', avatarUrl: 'karim.png' });
    expect(cardProps(tree, 'huda-10').user).toEqual({ name: 'Huda', avatarUrl: 'huda.png' });
    expect(cardProps(tree, 'lina-10').user).toEqual({ name: 'Lina', avatarUrl: 'lina.png' });
  });

  it('keeps household order within a day in a year list too, and counts every member (FR-009)', async () => {
    const tree = await mount();

    await pick2026(tree);
    await tapHeading(tree, 'March 2026');

    expect(rowsOnScreen(tree).filter((row) => row.startsWith('card:'))).toEqual([
      'card:lina-jan',
      'card:karim-05',
      'card:huda-10',
      'card:karim-10',
      'card:lina-10',
    ]);
    expect(monthHeadingCounts(tree)).toEqual({ 'January 2026': 1, 'March 2026': 4 });
  });

  /** SC-004. */
  it('gives a memory the same author name and photo in a month as on its day (SC-004)', async () => {
    const tree = await mount();

    const onItsDay = cardProps(tree, 'huda-10').user;
    expect(onItsDay).toEqual({ name: 'Huda', avatarUrl: 'huda.png' });
    expect(cardProps(tree, 'huda-10').showAuthor).toBe(true);

    await pickMarch(tree);

    expect(cardProps(tree, 'huda-10').user).toEqual(onItsDay);
    expect(cardProps(tree, 'huda-10').showAuthor).toBe(true);
    expect(cardProps(tree, 'karim-10').user).toEqual({ name: 'Karim', avatarUrl: 'karim.png' });
  });

  /** FR-004's marks, over the whole household. */
  it('fades a day only when nobody in the household has a memory on it', async () => {
    const tree = await mount();

    await tapDate(tree);

    expect(dayIsFaded(tree, '2026-03-10')).toBe(false); // all three
    expect(dayIsFaded(tree, '2026-03-05')).toBe(false); // Karim alone
    expect(dayIsFaded(tree, '2026-03-06')).toBe(true); // nobody
  });

  it('steps to the previous day with memories, not the previous calendar day', async () => {
    const tree = await mount();

    await tapPrevious(tree);

    expect(barWords(tree)).toContain('Thu, Mar 5');
    expect(cardIds(tree)).toEqual(['karim-05']);

    await tapNext(tree);
    expect(barWords(tree)).toContain('Tue, Mar 10');
  });

  it('moves the same way on a swipe, and says when there is nothing later (FR-014)', async () => {
    const tree = await mount();

    expect(swipe(tree).props.hasNext).toBe(false);
    expect(swipe(tree).props.hasPrevious).toBe(true);

    await act(async () => {
      swipe(tree).props.onPreviousDate();
    });
    await settle();

    expect(barWords(tree)).toContain('Thu, Mar 5');
    expect(swipe(tree).props.hasNext).toBe(true);
  });
});

// ===========================================================================
// FR-002 -- who the book covers
// ===========================================================================

describe('the book covers the household members with an account (FR-002)', () => {
  it('never draws a relative without an account, and draws a shared account once', async () => {
    const WITH_EXTRAS = [
      HOUSEHOLD[0],
      { memberId: 'm-nour', userId: null, relation: 'child', name: 'Nour', avatarUrl: null, hasAccount: false },
      HOUSEHOLD[1],
      { memberId: 'm-huda-2', userId: 'u-huda', relation: 'parent', name: 'Huda (mother)', avatarUrl: 'huda.png', hasAccount: true },
      HOUSEHOLD[2],
    ];
    serve(THE_FAMILY, WITH_EXTRAS);
    const tree = await mount();

    expect(faceIds(tree)).toEqual(['u-huda', 'u-karim', 'u-lina']);
    expect(getCalendar).toHaveBeenCalledWith('token-1', ['u-huda', 'u-karim', 'u-lina']);
    // A relative with no account is never asked about: their id is a tree node, and the
    // look-ups take account ids.
    expect(getCalendar.mock.calls.every(([, ids]) => ids.every((id) => !id.startsWith('m-'))))
      .toBe(true);

    // And the header counts the **book**, which is what the faces under it are: five tree nodes
    // here, three people. A number over the faces that disagreed with them would be the one
    // thing on this screen a reader could catch out by counting.
    expect(words(tree)).toContain('3 members');
    expect(words(tree)).not.toContain('5 members');
  });

  const many = Array.from({ length: 60 }, (_, i) => ({
    memberId: `m-${i}`, userId: `u-${i}`, name: `Cousin ${i}`, avatarUrl: null, hasAccount: true,
  }));

  it('covers the first 50 of a household larger than the look-ups allow', async () => {
    serve([memory('c-0', '2026-03-10', 900, { userId: 'u-0' })], many);
    const tree = await mount();

    const [, ids] = getCalendar.mock.calls[0];
    expect(ids).toHaveLength(50);
    expect(ids).not.toContain('u-50');
    expect(faceIds(tree)).toHaveLength(50);
    expect(faceIds(tree)).not.toContain('u-50');
  });

  /**
   * R6a's fallback, on the one path that really reaches it: `/journal/book` answers a **day** as
   * a whole, household and all, while the book's own people stop at the look-ups' 50. A memory
   * by the 56th is therefore on screen with nobody in the book to name it, and keeps the name
   * the server gave it rather than becoming "Unknown".
   */
  it('falls back to the memory’s own author for somebody beyond the 50, and sorts them last', async () => {
    serve([
      memory('c-0', '2026-03-10', 900, { userId: 'u-0' }),
      memory('c-55', '2026-03-10', 950, {
        userId: 'u-55',
        author: { id: 'u-55', name: 'Cousin 55', avatarUrl: 'c55.png' },
      }),
    ], many);
    const tree = await mount();

    expect(cardProps(tree, 'c-0').user).toEqual({ name: 'Cousin 0', avatarUrl: null });
    expect(cardProps(tree, 'c-55').user).toEqual({ name: 'Cousin 55', avatarUrl: 'c55.png' });
    // Nobody the book places sorts after everybody it does, rather than before them (FR-009).
    expect(cardIds(tree)).toEqual(['c-0', 'c-55']);
  });
});

// ===========================================================================
// FR-010 -- the row of faces
// ===========================================================================

describe('the household’s faces, under the date bar (FR-010)', () => {
  beforeEach(() => serve(THE_FAMILY));

  it('draws the faces on a day, a month and a year alike', async () => {
    const tree = await mount();

    expect(pageOrder(tree)).toEqual(['date bar', 'faces', 'list']);
    await pickMarch(tree);
    expect(pageOrder(tree)).toEqual(['date bar', 'faces', 'list']);
    await pick2026(tree);
    expect(pageOrder(tree)).toEqual(['date bar', 'faces', 'list']);
    expect(faceIds(tree)).toEqual(['u-huda', 'u-karim', 'u-lina']);
  });

  it('dims a face with nothing in the shown day, and leaves it choosable', async () => {
    const tree = await mount();

    expect(faceSays(tree, 'u-huda')).toBe('Huda');
    expect(faceSays(tree, 'u-lina')).toBe('Lina');

    await tapPrevious(tree);

    expect(barWords(tree)).toContain('Thu, Mar 5');
    expect(faceSays(tree, 'u-karim')).toBe('Karim');
    expect(faceSays(tree, 'u-huda')).toBe('Huda, nothing in this period');
    expect(faceSays(tree, 'u-lina')).toBe('Lina, nothing in this period');

    // Dimmed is not disabled: choosing does not care whether somebody has anything here.
    expect(typeof faceControl(tree, 'u-huda').props.onPress).toBe('function');
    expect(faceControl(tree, 'u-huda').props.disabled).not.toBe(true);
  });

  it('dims a face with nothing in the picked month, and nobody in a month they all share', async () => {
    const tree = await mount();

    await tapDate(tree);
    await pickMonthInSheet(tree, '2026-01');

    expect(barWords(tree)).toEqual(['January 2026', '1 memory']);
    expect(faceSays(tree, 'u-lina')).toBe('Lina');
    expect(faceSays(tree, 'u-huda')).toBe('Huda, nothing in this period');
    expect(faceSays(tree, 'u-karim')).toBe('Karim, nothing in this period');

    await pickMarch(tree);
    expect(faceSays(tree, 'u-huda')).toBe('Huda');
    expect(faceSays(tree, 'u-karim')).toBe('Karim');
    expect(faceSays(tree, 'u-lina')).toBe('Lina');
  });

  it('dims nobody while the day’s memories are still being read', async () => {
    const tree = await mount();
    const held = deferred();
    getJournalBook.mockReturnValueOnce(held.promise);

    // Step to 5 March, which is Karim's alone -- and catch it before the day lands.
    await act(async () => {
      byTestID(tree, 'date-bar-previous')[0].props.onPress();
    });
    await act(async () => {});

    expect(barWords(tree)).toContain('Thu, Mar 5');
    expect(cardIds(tree)).toEqual([]);
    expect(faceSays(tree, 'u-huda')).toBe('Huda');
    expect(faceSays(tree, 'u-karim')).toBe('Karim');
    expect(faceSays(tree, 'u-lina')).toBe('Lina');

    await act(async () => {
      held.resolve({ household: HOUSEHOLD, days: [], oldestDate: null, hasMore: false });
    });
    await settle();
  });

  it('shows no faces, no calendar and no empty message while the household is being read', async () => {
    serve(THE_FAMILY);
    const held = deferred();
    getJournalBook.mockReturnValueOnce(held.promise);

    let tree;
    await act(async () => {
      tree = renderer.create(
        <FamilySummaryScreen route={{ params: ROUTE }} navigation={{ goBack: jest.fn() }} />,
      );
    });
    trees.push(tree);
    await act(async () => {});

    // What a reader sees instead: the screen says it is loading, and turns a spinner. Asserted
    // positively, because every assertion below it is an absence -- and a blank screen would
    // satisfy those while telling somebody nothing at all.
    expect(saysSomething(tree, "Loading your family's journals")).toBe(true);
    expect(tree.root.findAllByType(ActivityIndicator).length).toBeGreaterThan(0);

    // A household that has not arrived is not a household with nobody in it (FR-010): no empty
    // message, no failure, and nothing asked of the calendar yet.
    expect(saysSomething(tree, 'Nobody in your family has recorded anything yet.')).toBe(false);
    expect(saysSomething(tree, 'No family recorded yet')).toBe(false);
    expect(saysSomething(tree, "Couldn't load the family summary.")).toBe(false);
    expect(tree.root.findAllByType(FacesRow)).toHaveLength(0);
    expect(byTestID(tree, 'date-bar-period')).toHaveLength(0);
    expect(getCalendar).not.toHaveBeenCalled();

    await act(async () => {
      held.resolve({ household: HOUSEHOLD, days: [], oldestDate: null, hasMore: false });
    });
    await settle();

    expect(faceIds(tree)).toEqual(['u-huda', 'u-karim', 'u-lina']);
  });
});

// ===========================================================================
// R5 -- a day the book answers with an older one
// ===========================================================================

describe('a day the book answers with an older one (R5)', () => {
  /**
   * The marks say 11 March holds a memory; `/journal/book` no longer has one there -- a memory
   * deleted between the two reads. `before` is exclusive, so the book answers **10 March**, and
   * a screen that took `days[0]` on trust would list 10 March's memories under 11 March's
   * heading.
   */
  it('treats an answer for another day as an empty day, never as this day’s memories', async () => {
    serve(THE_FAMILY);
    getCalendar.mockImplementation(async (token, ids) => ({
      authorIds: ids,
      days: [...calendarRows(THE_FAMILY), { date: '2026-03-11', precision: 'day', count: 1 }],
    }));

    const tree = await mount();

    expect(barWords(tree)).toContain('Wed, Mar 11');
    expect(cardIds(tree)).toEqual([]);
    expect(saysSomething(tree, 'No memories on this day')).toBe(true);
    // And it really did ask for the 11th.
    expect(dayCursors()).toContain('2026-03-12');
  });
});

// ===========================================================================
// FR-013 -- the day after D is built from calendar parts, never from an instant
// ===========================================================================

describe('the day cursor is a calendar day, not an instant (FR-013)', () => {
  it('runs west of Greenwich, so the arithmetic below is really at risk', () => {
    // `new Date('2026-03-31')` is UTC midnight, which is 30 March here -- and `before` would
    // then be 31 March, asking for the day that is already on screen.
    expect(new Date(2026, 2, 31).getTimezoneOffset()).toBeGreaterThan(0);
  });

  it('asks for 1 April when the day on screen is 31 March', async () => {
    serve([memory('mar-31', '2026-03-31', 900, { userId: 'u-huda' })]);
    const tree = await mount();

    expect(barWords(tree)).toContain('Tue, Mar 31');
    expect([...new Set(dayCursors())]).toEqual(['2026-04-01']);
    expect(cardIds(tree)).toEqual(['mar-31']);
  });

  it('asks for 1 January of the next year when the day on screen is 31 December', async () => {
    serve([memory('dec-31', '2026-12-31', 900, { userId: 'u-huda' })]);
    const tree = await mount();

    expect(barWords(tree)).toContain('Thu, Dec 31');
    expect([...new Set(dayCursors())]).toEqual(['2027-01-01']);
    expect(cardIds(tree)).toEqual(['dec-31']);
  });
});

// ===========================================================================
// FR-011 -- a failure is never drawn as emptiness
// ===========================================================================

describe('failures are never drawn as emptiness (FR-011)', () => {
  it('shows the family failure with Try again when the household cannot be read', async () => {
    // The screen says why in the log, as it always has. Silenced here so the suite's own output
    // stays clean, and asserted so that silencing it is not the same as losing it.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    getJournalBook.mockRejectedValue(new Error('no network'));
    const tree = await mount();

    expect(warn).toHaveBeenCalledWith(
      '[FamilySummaryScreen] failed to read the household:',
      'no network',
    );
    expect(saysSomething(tree, "Couldn't load the family summary.")).toBe(true);
    // Never an empty household, and never a calendar over a household nobody has read.
    expect(saysSomething(tree, 'No family recorded yet')).toBe(false);
    expect(saysSomething(tree, 'Nobody in your family has recorded anything yet.')).toBe(false);
    expect(byTestID(tree, 'date-bar-period')).toHaveLength(0);
    expect(tree.root.findAllByType(FacesRow)).toHaveLength(0);
    expect(getCalendar).not.toHaveBeenCalled();

    serve(THE_FAMILY);
    await tapTryAgain(tree);

    expect(barWords(tree)).toContain('Tue, Mar 10');
    expect(cardIds(tree)).toEqual(['huda-10', 'karim-10', 'lina-10']);
    warn.mockRestore();
  });

  it('shows the family failure with Try again when the marks fail as the book opens', async () => {
    serve(THE_FAMILY);
    getCalendar.mockRejectedValue(new Error('no network'));
    const tree = await mount();

    expect(saysSomething(tree, "Couldn't load the family summary.")).toBe(true);
    expect(saysSomething(tree, 'Nobody in your family has recorded anything yet.')).toBe(false);
    expect(byTestID(tree, 'date-bar-period')).toHaveLength(0);

    serve(THE_FAMILY);
    await tapTryAgain(tree);

    expect(cardIds(tree)).toEqual(['huda-10', 'karim-10', 'lina-10']);
  });

  it('shows the family failure with Try again when a page fails, and dims nobody', async () => {
    serve(THE_FAMILY);
    const book = await getJournalBook('token-1', { memberId: 'node-head', days: 1 });
    getJournalBook.mockImplementation(async (token, { before } = {}) => {
      if (!before) return book;
      throw new Error('no network');
    });
    const tree = await mount();

    // The book opened -- the date bar names the day -- and only its page failed.
    expect(barWords(tree)).toContain('Tue, Mar 10');
    expect(saysSomething(tree, "Couldn't load the family summary.")).toBe(true);
    expect(saysSomething(tree, 'No memories')).toBe(false);
    // "Could not load" is never drawn as "recorded nothing" (FR-010).
    expect(faceSays(tree, 'u-huda')).toBe('Huda');
    expect(faceSays(tree, 'u-karim')).toBe('Karim');
    expect(faceSays(tree, 'u-lina')).toBe('Lina');

    serve(THE_FAMILY);
    await tapTryAgain(tree);

    expect(cardIds(tree)).toEqual(['huda-10', 'karim-10', 'lina-10']);
  });

  it('refuses to open a half-read calendar, and says so with Try again', async () => {
    serve(THE_FAMILY);
    const tree = await mount();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    // The marks are re-read on a refresh, and this time they cannot be.
    getCalendar.mockRejectedValue(new Error('no network'));
    await pullToRefresh(tree);

    await tapDate(tree);

    expect(sheetIsOpen(tree)).toBe(false);
    expect(alert).toHaveBeenCalled();
    const [title, , buttons] = alert.mock.calls[0];
    expect(title).toBe("Couldn't load the calendar");

    const tryAgain = buttons.find((button) => button.text === 'Try again');
    expect(tryAgain).toBeDefined();
    serve(THE_FAMILY);
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
// A book with nothing in it (spec edge case) -- today's wording, kept
// ===========================================================================

describe('a family with nothing in the book says so', () => {
  it('says nobody has recorded anything when the household has people but no memories', async () => {
    serve([]);
    const tree = await mount();

    expect(getCalendar).toHaveBeenCalledWith('token-1', ['u-huda', 'u-karim', 'u-lina']);
    expect(saysSomething(tree, 'Nobody in your family has recorded anything yet.')).toBe(true);
    expect(byTestID(tree, 'date-bar-period')).toHaveLength(0);
    expect(tree.root.findAllByType(FacesRow)).toHaveLength(0);
  });

  it('keeps today’s guidance for a household with nobody in it, and asks the server nothing', async () => {
    serve([], []);
    const tree = await mount();

    expect(saysSomething(tree, 'No family recorded yet — add a spouse or child')).toBe(true);
    expect(saysSomething(tree, 'Nobody in your family has recorded anything yet.')).toBe(false);
    expect(byTestID(tree, 'date-bar-period')).toHaveLength(0);
    // An id-less look-up is a 400, and asking it would be asking about the reader themselves.
    expect(getCalendar).not.toHaveBeenCalled();
  });

  it('says nobody has recorded anything when no relative has an account', async () => {
    serve([], [
      { memberId: 'm-nour', userId: null, name: 'Nour', avatarUrl: null, hasAccount: false },
    ]);
    const tree = await mount();

    expect(saysSomething(tree, 'Nobody in your family has recorded anything yet.')).toBe(true);
    expect(getCalendar).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// FR-015 -- pull to refresh
// ===========================================================================

describe('pull to refresh (FR-015)', () => {
  it('re-reads the household, the marks and the shown page, without leaving the day', async () => {
    serve(THE_FAMILY);
    const tree = await mount();
    const marksRead = getCalendar.mock.calls.length;
    const daysRead = dayCursors().length;
    const householdsRead = householdReads().length;

    await pullToRefresh(tree);

    expect(householdReads().length).toBeGreaterThan(householdsRead);
    expect(getCalendar.mock.calls.length).toBeGreaterThan(marksRead);
    expect(dayCursors().length).toBeGreaterThan(daysRead);
    expect(barWords(tree)).toContain('Tue, Mar 10');
  });

  it('shows a member who joined since the book was opened', async () => {
    serve(THE_FAMILY);
    const tree = await mount();
    expect(faceIds(tree)).toEqual(['u-huda', 'u-karim', 'u-lina']);

    const SAMI = {
      memberId: 'm-sami', userId: 'u-sami', relation: 'child', name: 'Sami',
      avatarUrl: 'sami.png', hasAccount: true,
    };
    serve(
      [...THE_FAMILY, memory('sami-10', '2026-03-10', 980, { userId: 'u-sami' })],
      [...HOUSEHOLD, SAMI],
    );
    await pullToRefresh(tree);

    expect(faceIds(tree)).toEqual(['u-huda', 'u-karim', 'u-lina', 'u-sami']);
    expect(getCalendar)
      .toHaveBeenLastCalledWith('token-1', ['u-huda', 'u-karim', 'u-lina', 'u-sami']);
    // Last in the household, so last on the day (FR-009).
    expect(cardIds(tree)).toEqual(['huda-10', 'karim-10', 'lina-10', 'sami-10']);
    expect(cardProps(tree, 'sami-10').user).toEqual({ name: 'Sami', avatarUrl: 'sami.png' });
  });

  it('shows a memory recorded since, without leaving the day', async () => {
    serve(THE_FAMILY);
    const tree = await mount();

    serve([...THE_FAMILY, memory('huda-10-b', '2026-03-10', 990, { userId: 'u-huda' })]);
    await pullToRefresh(tree);

    expect(cardIds(tree)).toEqual(['huda-10', 'huda-10-b', 'karim-10', 'lina-10']);
  });

  it('turns the control while the re-read is in flight, and stops it when it lands', async () => {
    serve(THE_FAMILY);
    const tree = await mount();
    expect(refreshControl(tree).refreshing).toBe(false);

    const held = deferred();
    getJournalBook.mockReturnValueOnce(held.promise);
    await act(async () => {
      refreshControl(tree).onRefresh();
    });
    expect(refreshControl(tree).refreshing).toBe(true);

    await act(async () => {
      held.resolve({ household: HOUSEHOLD, days: [], oldestDate: null, hasMore: false });
    });
    await settle();

    expect(refreshControl(tree).refreshing).toBe(false);
  });

  /**
   * ⚠ **A book with no period has no page to wait for.** The hook's page effect answers
   * `'loading'` and nothing ever resolves it, so a control that waited on `pageStatus` here would
   * spin for ever -- on the screens where pulling to refresh is the obvious thing to try, because
   * there is nothing else on them.
   */
  it('stops the control on a family that has recorded nothing', async () => {
    serve([]);
    const tree = await mount();
    expect(saysSomething(tree, 'Nobody in your family has recorded anything yet.')).toBe(true);

    await pullToRefresh(tree);

    expect(refreshControl(tree).refreshing).toBe(false);
    expect(saysSomething(tree, 'Nobody in your family has recorded anything yet.')).toBe(true);
  });

  it('stops the control when the household is still failing, which is usually offline', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    getJournalBook.mockRejectedValue(new Error('no network'));
    const tree = await mount();
    expect(saysSomething(tree, "Couldn't load the family summary.")).toBe(true);

    await pullToRefresh(tree);

    expect(saysSomething(tree, "Couldn't load the family summary.")).toBe(true);
    expect(refreshControl(tree).refreshing).toBe(false);
    warn.mockRestore();
  });
});

// ===========================================================================
// 016 FR-017 -- sticky month headings, and a pressed pin's piece
// ===========================================================================

describe('a year list pins its month headings, and a pressed pin clears them (016 FR-017)', () => {
  const YEAR = [
    memory('y-01-05', '2026-01-05', 100, { userId: 'u-huda' }),
    memory('y-02-07', '2026-02-07', 200, { userId: 'u-karim' }),
    memory('y-02-18', '2026-02-18', 300, { userId: 'u-lina' }),
  ];

  const onYear2026 = async () => {
    serve(YEAR);
    const tree = await mount();
    await pick2026(tree);
    return tree;
  };

  it('pins the month headings of a year list and nothing else', async () => {
    const tree = await onYear2026();

    const { data, stickyHeaderIndices } = list(tree).props;
    const monthRows = data
      .map((row, index) => (row.kind === 'monthHeading' ? index : null))
      .filter((index) => index !== null);

    expect(monthRows).toHaveLength(2);
    expect(stickyHeaderIndices).toEqual(monthRows);
  });

  it('pins nothing in a month list, where a day heading is the only heading', async () => {
    serve(YEAR);
    const tree = await mount();
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
     * Row **7**: January's heading (open from the moment the year was picked, 016 FR-006), its
     * day heading and its card, then February's heading, its two day headings and its first
     * card. An implementation counting memories would say 2 and scroll to somebody else's.
     */
    await act(async () => {
      cardProps(tree, 'y-02-18').onRequestScrollTo(160);
    });
    expect(scrollToIndex)
      .toHaveBeenLastCalledWith({ index: 7, viewOffset: 72 - 160, animated: true });

    // A card in January clears **January's** heading, although February's measured last.
    await act(async () => {
      cardProps(tree, 'y-01-05').onRequestScrollTo(160);
    });
    expect(scrollToIndex)
      .toHaveBeenLastCalledWith({ index: 2, viewOffset: 44 - 160, animated: true });

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

    // ⚠ The spy above is not a blind one. The refused scroll says so in the log, naming this
    // screen and the row it could not reach -- and **nothing else is warned**, so a React or
    // `VirtualizedList` warning on this path would fail here rather than being swallowed.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      '[FamilySummaryScreen] could not scroll to a pressed pin’s piece',
      expect.objectContaining({ index: 7 }),
    );
    warn.mockRestore();
  });
});

// ===========================================================================
// 019 T012 -- User Story 3: the page rules (FR-007, FR-014)
// ===========================================================================

/**
 * The reader's own Journal tab's page rules, on the family book: next is always **later**, the
 * book opens on its newest day, and ◄ ►, the swipe and the date bar move only to a day, a month
 * or a year that **has** memories -- with each end of the book *announced* as unavailable rather
 * than silently doing nothing (FR-014).
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
describe('User Story 3: the page rules on the family book (FR-007, FR-014)', () => {
  beforeEach(() => serve(THE_FAMILY));

  const pickJanuary = async (tree) => {
    await tapDate(tree);
    await pickMonthInSheet(tree, '2026-01');
  };

  const pickYear = async (tree, year) => {
    await tapDate(tree);
    await tap(tree, 'calendar-view-year');
    await tap(tree, `calendar-year-tile-${year}`);
  };

  it('opens on the newest day, with nothing later to reach (FR-007, FR-014)', async () => {
    const tree = await mount();

    expect(barWords(tree)).toEqual(['Tue, Mar 10']);

    // ► is announced as unavailable, and the swipe is told the same thing, so a screen reader
    // and a thumb cannot disagree about which end of the book this is.
    expect(arrowSays(tree, 'next')).toEqual({ label: 'Next day', disabled: true });
    expect(arrowSays(tree, 'previous')).toEqual({ label: 'Previous day', disabled: false });
    expect(swipe(tree).props.hasNext).toBe(false);

    // And a swipe forward from there does nothing at all -- no wrap, and no empty day.
    await act(async () => {
      swipe(tree).props.onNextDate();
    });
    await settle();

    expect(barWords(tree)).toEqual(['Tue, Mar 10']);
    expect(cardIds(tree)).toEqual(['huda-10', 'karim-10', 'lina-10']);
  });

  it('reaches the oldest day with ◄ and then says there is nothing earlier (FR-014)', async () => {
    const tree = await mount();

    await tapPrevious(tree);
    expect(barWords(tree)).toEqual(['Thu, Mar 5']);
    await tapPrevious(tree);

    // 20 January, Lina's: every day in between holds nothing, and it is the oldest in the book.
    expect(barWords(tree)).toEqual(['Tue, Jan 20']);
    expect(cardIds(tree)).toEqual(['lina-jan']);
    expect(arrowSays(tree, 'previous')).toEqual({ label: 'Previous day', disabled: true });
    expect(arrowSays(tree, 'next')).toEqual({ label: 'Next day', disabled: false });
    expect(swipe(tree).props.hasPrevious).toBe(false);

    await act(async () => {
      swipe(tree).props.onPreviousDate();
    });
    await settle();

    expect(barWords(tree)).toEqual(['Tue, Jan 20']);
    expect(cardIds(tree)).toEqual(['lina-jan']);
  });

  /** Scenario 2, on the household's own book. */
  it('► shows the later month with any member’s memory, named and counted (scenario 2)', async () => {
    const tree = await mount();

    await pickJanuary(tree);
    expect(barWords(tree)).toEqual(['January 2026', '1 memory']);
    expect(cardIds(tree)).toEqual(['lina-jan']);

    await tapNext(tree);

    // February holds nothing. March is nobody's month in particular -- Karim's, Huda's and
    // Lina's together -- and the step finds it from a month that was Lina's alone.
    expect(barWords(tree)).toEqual(['March 2026', '4 memories']);
    expect(cardIds(tree)).toEqual(['karim-05', 'huda-10', 'karim-10', 'lina-10']);
    // The same two words, as one phrase, to a screen reader (FR-014).
    expect(barSays(tree)).toBe('March 2026, 4 memories');
    expect(arrowSays(tree, 'next')).toEqual({ label: 'Next month', disabled: true });
  });

  it('says there is nothing later on the newest month, nor earlier on the oldest (FR-014)', async () => {
    const tree = await mount();

    await pickMarch(tree);

    expect(arrowSays(tree, 'next')).toEqual({ label: 'Next month', disabled: true });
    expect(arrowSays(tree, 'previous')).toEqual({ label: 'Previous month', disabled: false });
    expect(swipe(tree).props.hasNext).toBe(false);

    await act(async () => {
      swipe(tree).props.onNextDate();
    });
    await settle();
    expect(barWords(tree)).toEqual(['March 2026', '4 memories']);

    await tapPrevious(tree);

    expect(barWords(tree)).toEqual(['January 2026', '1 memory']);
    expect(arrowSays(tree, 'previous')).toEqual({ label: 'Previous month', disabled: true });
    expect(swipe(tree).props.hasPrevious).toBe(false);

    await act(async () => {
      swipe(tree).props.onPreviousDate();
    });
    await settle();
    expect(barWords(tree)).toEqual(['January 2026', '1 memory']);
  });

  it('names a picked year and its count, and ► skips the years with nothing in them (FR-007)', async () => {
    // One older memory, two years back, so that a year step has an empty year to skip.
    serve([...THE_FAMILY, memory('huda-2024', '2024-07-04', 100)]);
    const tree = await mount();

    await pickYear(tree, 2024);
    expect(barWords(tree)).toEqual(['2024', '1 memory']);
    expect(barSays(tree)).toBe('2024, 1 memory');
    expect(arrowSays(tree, 'previous')).toEqual({ label: 'Previous year', disabled: true });
    expect(arrowSays(tree, 'next')).toEqual({ label: 'Next year', disabled: false });

    await tapNext(tree);

    // 2025 holds nothing, so 2026 is the next year -- and every member's memories are counted
    // in it, under their own month headings.
    expect(barWords(tree)).toEqual(['2026', '5 memories']);
    expect(monthHeadingCounts(tree)).toEqual({ 'January 2026': 1, 'March 2026': 4 });
    expect(arrowSays(tree, 'next').disabled).toBe(true);
  });
});
