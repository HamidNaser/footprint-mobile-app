/**
 * 016 T004 -- the calendar sheet, both variants, read as a person uses it.
 *
 * This is User Story 1, the MVP: the control the whole feature hangs off. Until now the
 * Journal's date bar opened the platform's own white picker (`CalendarPickerModal`, which stays
 * for the two other screens that use it, FR-015). This file is about what replaces it on the
 * Journal: a book-style sheet that slides up from the bottom with Date, Month and Year, a month
 * list and a twelve-year list, faded days that cannot be tapped, counts, today ringed in gold,
 * and -- the point of the whole design -- **no Apply and no Done**: a tap takes effect at once.
 *
 * Six things this file is deliberately careful about.
 *
 * 1. **Every behavioural test runs against both variants.** `CalendarSheet.js` and
 *    `CalendarSheet.web.js` are two files by the repository's platform convention (metro
 *    resolves `.web.js` itself -- see `CalendarPickerModal.js`'s header), and two files are two
 *    things to keep in step. So the suite is parameterised over both and asserts the same
 *    behaviour of each, which is what makes a change to one and not the other fail here rather
 *    than on somebody's phone. `npm test` runs one platform, so the web file is imported by its
 *    own path; nothing else in the suite knows which it has.
 *
 * 2. **The component reports upward exactly twice, and never both at once.** `onPick` when a
 *    day, a month or a year is really chosen; `onClose` when the sheet is dismissed with nothing
 *    chosen. Arrows, switching Date/Month/Year, and opening or closing a drop-down list are
 *    pure browsing: they call neither. Several tests below assert the *absence* of a call,
 *    because the defect that matters here is a sheet that quietly changes the Journal while
 *    somebody is still looking for the month they want.
 *
 * 3. **Who closes the sheet on a pick is stated, not assumed.** The sheet does not close itself:
 *    a pick calls `onPick` alone and `JournalScreen` (T005) is what stops rendering it. Spec
 *    scenario 5 ("a day with memories is tapped, then it closes") is therefore the parent's
 *    half, and the test below pins this side of the contract -- `onPick` yes, `onClose` no -- so
 *    T005 cannot double-close.
 *
 * 4. **A faded tile is tested as a person experiences it**, which is two separate facts: it
 *    looks faded (its own colour, not the ink colour) and a tap on it does nothing at all. A
 *    test that only read `disabled` would pass on a tile that was disabled and still fired.
 *
 * 5. **SC-001 is counted, not asserted to be "reachable".** Each of the twelve years in the
 *    window is reached, with the months at both ends of a year and in the middle of it, and the
 *    test counts the taps it took and requires four or fewer. A test that merely arrived would
 *    pass on a calendar that took nine taps to get there.
 *
 * 6. **Nothing here builds a `Date` from a date string.** The sheet is held to it by the grep
 *    guard in `src/utils/__tests__/calendarModel.test.js`, which this file's two subjects switch
 *    on by existing; this file holds itself to the same rule, and uses plain `'YYYY-MM-DD'`
 *    strings and numeric parts throughout.
 */

jest.setTimeout(60000);

import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import CalendarSheetNative, { CALENDAR_SHEET_COLOURS as NATIVE_COLOURS } from '../CalendarSheet';
import CalendarSheetWeb, { CALENDAR_SHEET_COLOURS as WEB_COLOURS } from '../CalendarSheet.web';
import { buildIndex, monthKey, windowStartFor } from '../../../utils/calendarModel';
import { monthName } from '../../../utils/periodDate';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Spec scenario 1's November: memories on the 5th and the 12th, and **nothing on the 6th**,
 * which is scenario 6's faded day. The month-only row is FR-011's: it counts towards November
 * but must not mark the 1st, because nobody said the 1st.
 */
const NOVEMBER_ROWS = [
  { day: '2026-11-05', precision: 'day', count: 2 },
  { day: '2026-11-12', precision: 'day', count: 1 },
  { day: '2026-11-01', precision: 'month', count: 3 },
  { day: '2026-07-04', precision: 'day', count: 1 },
  { day: '2024-03-09', precision: 'day', count: 5 },
];

const novemberIndex = () => buildIndex(NOVEMBER_ROWS);

/** One day-dated memory in every month of 2020-2031 -- the whole window, for SC-001. */
const fullWindowIndex = () => {
  const rows = [];
  for (let year = 2020; year <= 2031; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      rows.push({ day: `${monthKey(year, month)}-10`, precision: 'day', count: 1 });
    }
  }
  return buildIndex(rows);
};

const PICKED_DAY = { kind: 'day', date: '2026-11-05' };
const TODAY = '2026-11-18';

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const trees = [];

afterEach(() => {
  while (trees.length) {
    const tree = trees.pop();
    try {
      act(() => tree.unmount());
    } catch {
      /* already gone */
    }
  }
  jest.clearAllMocks();
});

/**
 * Awaited, because `@expo/vector-icons` resolves its font asynchronously and sets state when it
 * does -- outside `act` that lands as a warning in this suite's output, the way
 * `JournalEntryCard.map.test.js` describes.
 */
const mount = async (Component, props = {}) => {
  let tree;
  await act(async () => {
    tree = renderer.create(
      <Component
        visible
        picked={PICKED_DAY}
        index={novemberIndex()}
        today={TODAY}
        onPick={props.onPick || jest.fn()}
        onClose={props.onClose || jest.fn()}
        {...props}
      />,
    );
  });
  trees.push(tree);
  return tree;
};

/** The touchable carrying a test id -- the control itself, not the host view it renders. */
const control = (tree, testID) =>
  tree.root.findAllByType(TouchableOpacity).find((node) => node.props.testID === testID);

/**
 * Anything carrying a test id, touchable or not: Year view's "2020 - 2031" is a plain label,
 * because that view *is* the twelve years and there is nothing for it to open.
 */
const anyNode = (tree, testID) => tree.root.findAll((node) => node.props?.testID === testID)[0];

const exists = (tree, testID) => control(tree, testID) !== undefined;

/** A real tap: what a finger does, which a disabled control does not answer. */
const tap = (tree, testID) => {
  const node = control(tree, testID);
  if (!node) throw new Error(`no control with testID "${testID}"`);
  if (node.props.disabled) throw new Error(`"${testID}" is disabled and cannot be tapped`);
  act(() => node.props.onPress());
};

/** A tap pressed home regardless, so that "nothing happens" is proved rather than assumed. */
const tapAnyway = (tree, testID) => {
  const node = control(tree, testID);
  if (!node) throw new Error(`no control with testID "${testID}"`);
  act(() => node.props.onPress && node.props.onPress());
};

/** Every string a person reads inside a node, in render order. */
const textsIn = (node) =>
  node
    .findAllByType(Text)
    .map((element) =>
      Array.isArray(element.props.children)
        ? element.props.children.filter((child) => typeof child === 'string' || typeof child === 'number').join('')
        : element.props.children,
    )
    .filter((value) => typeof value === 'string' || typeof value === 'number')
    .map(String);

const textOf = (tree, testID) => textsIn(anyNode(tree, testID)).join(' ');

/** The flattened style of a control's own host view -- the colours a person sees. */
const styleOf = (tree, testID) => StyleSheet.flatten(control(tree, testID).props.style);

/**
 * The style of the text *inside* a tile, which is where a faded day's colour lives: the tile
 * keeps its shape and its number goes pale, rather than the whole circle washing out.
 */
const textStyleIn = (node) => node.findAllByType(Text)[0].props.style;

const dayId = (key) => `calendar-day-${key}`;
const monthTileId = (year, month) => `calendar-month-tile-${monthKey(year, month)}`;
const yearTileId = (year) => `calendar-year-tile-${year}`;

const dayTileIds = (tree) =>
  tree.root
    .findAllByType(TouchableOpacity)
    .map((node) => node.props.testID)
    .filter((id) => typeof id === 'string' && id.startsWith('calendar-day-'));

// ---------------------------------------------------------------------------
// The two variants, held to the same behaviour
// ---------------------------------------------------------------------------

const VARIANTS = [
  ['native', CalendarSheetNative, NATIVE_COLOURS],
  ['web', CalendarSheetWeb, WEB_COLOURS],
];

describe.each(VARIANTS)('CalendarSheet (%s)', (_name, Sheet, COLOURS) => {
  // -------------------------------------------------------------------------
  // Opening -- spec scenario 1, FR-001
  // -------------------------------------------------------------------------

  describe('opening', () => {
    it('renders nothing at all while it is not visible', async () => {
      const tree = await mount(Sheet, { visible: false });

      expect(tree.toJSON()).toBeNull();
    });

    it('opens in Date view on the picked day\'s month, with that day marked', async () => {
      const tree = await mount(Sheet);

      // Scenario 1: the Journal shows 5 November 2026, so the sheet opens on November 2026.
      expect(textOf(tree, 'calendar-month-header')).toContain('November');
      expect(textOf(tree, 'calendar-year-header')).toContain('2026');

      // Its thirty days, and nobody else's: a grid never borrows a neighbouring month's days.
      expect(dayTileIds(tree)).toHaveLength(30);
      expect(exists(tree, dayId('2026-11-30'))).toBe(true);
      expect(exists(tree, dayId('2026-12-01'))).toBe(false);

      // ...with the 5th marked, and its neighbour with memories not marked.
      expect(control(tree, dayId('2026-11-05')).props.accessibilityState.selected).toBe(true);
      expect(control(tree, dayId('2026-11-12')).props.accessibilityState.selected).toBe(false);
      expect(styleOf(tree, dayId('2026-11-05')).backgroundColor).toBe(COLOURS.picked);
      expect(styleOf(tree, dayId('2026-11-12')).backgroundColor)
        .not.toBe(COLOURS.picked);
    });

    it('opens in Month view on a picked month, and in Year view on a picked year', async () => {
      const onMonth = await mount(Sheet, { picked: { kind: 'month', year: 2024, month: 3 } });

      expect(exists(onMonth, monthTileId(2024, 3))).toBe(true);
      expect(control(onMonth, monthTileId(2024, 3)).props.accessibilityState.selected).toBe(true);
      expect(dayTileIds(onMonth)).toHaveLength(0);

      const onYear = await mount(Sheet, { picked: { kind: 'year', year: 2024 } });

      expect(exists(onYear, yearTileId(2024))).toBe(true);
      expect(control(onYear, yearTileId(2024)).props.accessibilityState.selected).toBe(true);
    });

    it('opens on today\'s month when nothing is picked yet', async () => {
      const tree = await mount(Sheet, { picked: null });

      expect(textOf(tree, 'calendar-month-header')).toContain('November');
      expect(textOf(tree, 'calendar-year-header')).toContain('2026');
    });

    it('marks today with a ring, on a day that is not the picked one', async () => {
      const tree = await mount(Sheet);

      // 18 November is `TODAY`; 5 November is the picked day. Two different marks, so that a
      // person can see where they are *and* where today is.
      expect(styleOf(tree, dayId('2026-11-18')).borderColor).toBe(COLOURS.today);
      expect(styleOf(tree, dayId('2026-11-05')).borderColor).not.toBe(COLOURS.today);
    });

    it('marks the right day and today when either date carries a time', async () => {
      // A stored date may carry a time -- an older row, or a value that came from the server.
      // Only the day part says which day it was, and a sheet that opened on the right month
      // with nothing marked on it would be the quietest possible version of this defect.
      const tree = await mount(Sheet, {
        picked: { kind: 'day', date: '2026-11-05T23:30:00Z' },
        today: '2026-11-18T01:15:00Z',
      });

      expect(textOf(tree, 'calendar-month-header')).toContain('November');
      expect(control(tree, dayId('2026-11-05')).props.accessibilityState.selected).toBe(true);
      expect(styleOf(tree, dayId('2026-11-18')).borderColor).toBe(COLOURS.today);
    });

    it('puts the body in a ScrollView, so it still scrolls at the largest text size', async () => {
      const tree = await mount(Sheet);

      expect(tree.root.findAllByType(ScrollView).length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // Faded days -- spec scenario 6, FR-002, FR-011
  // -------------------------------------------------------------------------

  describe('days with no memories', () => {
    it('fades 6 November and answers no tap on it', async () => {
      const onPick = jest.fn();
      const tree = await mount(Sheet, { onPick });

      const faded = control(tree, dayId('2026-11-06'));
      expect(faded.props.disabled).toBe(true);
      expect(StyleSheet.flatten(textStyleIn(faded)).color).toBe(COLOURS.faded);

      tapAnyway(tree, dayId('2026-11-06'));
      expect(onPick).not.toHaveBeenCalled();
    });

    it('does not mark the 1st for a memory known only to its month (FR-011)', async () => {
      const onPick = jest.fn();
      const tree = await mount(Sheet, { onPick });

      // November holds three month-only memories. The 1st is still a day with nothing on it.
      expect(control(tree, dayId('2026-11-01')).props.disabled).toBe(true);
      tapAnyway(tree, dayId('2026-11-01'));
      expect(onPick).not.toHaveBeenCalled();
    });

    it('fades every day when the journal holds nothing at all', async () => {
      const tree = await mount(Sheet, { index: buildIndex([]) });

      expect(dayTileIds(tree)).toHaveLength(30);
      dayTileIds(tree).forEach((id) => {
        expect(control(tree, id).props.disabled).toBe(true);
      });
    });

    it('fades every day when no index has arrived at all', async () => {
      const tree = await mount(Sheet, { index: null });

      dayTileIds(tree).forEach((id) => {
        expect(control(tree, id).props.disabled).toBe(true);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Picking -- spec scenario 5, FR-002's "no Apply or Done"
  // -------------------------------------------------------------------------

  describe('picking', () => {
    it('reports a tapped day at once, and leaves the closing to the Journal', async () => {
      const onPick = jest.fn();
      const onClose = jest.fn();
      const tree = await mount(Sheet, { onPick, onClose });

      tap(tree, dayId('2026-11-12'));

      expect(onPick).toHaveBeenCalledTimes(1);
      expect(onPick).toHaveBeenCalledWith({ kind: 'day', date: '2026-11-12' });
      // The other half of the contract, pinned so T005 does not close it twice.
      expect(onClose).not.toHaveBeenCalled();
    });

    it('reports a month tapped in Month view', async () => {
      const onPick = jest.fn();
      const onClose = jest.fn();
      const tree = await mount(Sheet, { onPick, onClose });

      tap(tree, 'calendar-view-month');
      tap(tree, monthTileId(2026, 11));

      expect(onPick).toHaveBeenCalledWith({ kind: 'month', year: 2026, month: 11 });
      expect(onClose).not.toHaveBeenCalled();
    });

    it('reports a year tapped in Year view', async () => {
      const onPick = jest.fn();
      const onClose = jest.fn();
      const tree = await mount(Sheet, { onPick, onClose });

      tap(tree, 'calendar-view-year');
      tap(tree, yearTileId(2026));

      expect(onPick).toHaveBeenCalledWith({ kind: 'year', year: 2026 });
      expect(onClose).not.toHaveBeenCalled();
    });

    it('answers no tap on a month or a year with no memories', async () => {
      const onPick = jest.fn();
      const tree = await mount(Sheet, { onPick });

      tap(tree, 'calendar-view-month');
      // Nothing was ever recorded in February 2026.
      expect(control(tree, monthTileId(2026, 2)).props.disabled).toBe(true);
      tapAnyway(tree, monthTileId(2026, 2));

      tap(tree, 'calendar-view-year');
      expect(control(tree, yearTileId(2021)).props.disabled).toBe(true);
      tapAnyway(tree, yearTileId(2021));

      expect(onPick).not.toHaveBeenCalled();
    });

    it('offers no Apply, Done, OK or Cancel -- a tap is the whole of it', async () => {
      const tree = await mount(Sheet);

      const words = textsIn(tree.root).map((text) => text.trim().toLowerCase());
      expect(words).not.toContain('apply');
      expect(words).not.toContain('done');
      expect(words).not.toContain('ok');
      expect(words).not.toContain('cancel');
      expect(words).not.toContain('save');
    });
  });

  // -------------------------------------------------------------------------
  // Counts -- FR-002
  // -------------------------------------------------------------------------

  describe('counts', () => {
    it('shows a month\'s count on its tile, and none on a month with nothing', async () => {
      const tree = await mount(Sheet);
      tap(tree, 'calendar-view-month');

      // Two memories on the 5th, one on the 12th, three known only to the month: six.
      expect(textOf(tree, monthTileId(2026, 11))).toContain('6');
      expect(textOf(tree, monthTileId(2026, 7))).toContain('1');
      expect(textOf(tree, monthTileId(2026, 2))).toBe('Feb');
    });

    it('shows a year\'s count on its tile', async () => {
      const tree = await mount(Sheet);
      tap(tree, 'calendar-view-year');

      expect(textOf(tree, yearTileId(2026))).toContain('7'); // six in November, one in July
      expect(textOf(tree, yearTileId(2024))).toContain('5');
      expect(textOf(tree, yearTileId(2021))).toBe('2021');
    });
  });

  // -------------------------------------------------------------------------
  // The two drop-down lists -- spec scenarios 2 and 3, FR-002, design §3
  // -------------------------------------------------------------------------

  describe('the month and year lists', () => {
    it('opens the twelve months from the month header, and closes them on a second tap', async () => {
      const onPick = jest.fn();
      const onClose = jest.fn();
      const tree = await mount(Sheet, { onPick, onClose });

      tap(tree, 'calendar-month-header');

      for (let month = 1; month <= 12; month += 1) {
        expect(exists(tree, monthTileId(2026, month))).toBe(true);
      }
      expect(dayTileIds(tree)).toHaveLength(0);

      // Design §3: tapping the open header again closes its list, with nothing chosen.
      tap(tree, 'calendar-month-header');
      expect(dayTileIds(tree)).toHaveLength(30);
      expect(onPick).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('opens 2020-2031 from the year header, and closes them on a second tap', async () => {
      const onPick = jest.fn();
      const onClose = jest.fn();
      const tree = await mount(Sheet, { onPick, onClose, index: fullWindowIndex() });

      tap(tree, 'calendar-year-header');

      // windowStartFor(2026) is 2020, so the picked year sits in the middle of the twelve.
      expect(windowStartFor(2026)).toBe(2020);
      for (let year = 2020; year <= 2031; year += 1) {
        expect(exists(tree, yearTileId(year))).toBe(true);
      }
      expect(exists(tree, yearTileId(2019))).toBe(false);
      expect(exists(tree, yearTileId(2032))).toBe(false);

      tap(tree, 'calendar-year-header');
      expect(dayTileIds(tree)).toHaveLength(30);
      expect(onPick).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('returns to the days on a month chosen from the list, telling the Journal nothing', async () => {
      const onPick = jest.fn();
      const onClose = jest.fn();
      const tree = await mount(Sheet, { onPick, onClose });

      tap(tree, 'calendar-month-header');
      tap(tree, monthTileId(2026, 7));

      // Scenario 2: "picking returns to the days" -- July's 31 of them.
      expect(textOf(tree, 'calendar-month-header')).toContain('July');
      expect(dayTileIds(tree)).toHaveLength(31);
      expect(exists(tree, dayId('2026-07-04'))).toBe(true);
      // Browsing, not choosing: the Journal has not been told anything.
      expect(onPick).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('returns to the days on a year chosen from the list, telling the Journal nothing', async () => {
      const onPick = jest.fn();
      const onClose = jest.fn();
      const tree = await mount(Sheet, { onPick, onClose, index: fullWindowIndex() });

      tap(tree, 'calendar-year-header');
      tap(tree, yearTileId(2023));

      expect(textOf(tree, 'calendar-year-header')).toContain('2023');
      expect(textOf(tree, 'calendar-month-header')).toContain('November');
      expect(exists(tree, dayId('2023-11-10'))).toBe(true);
      expect(onPick).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('opens the year list from Month view too (scenario 3)', async () => {
      const tree = await mount(Sheet, { index: fullWindowIndex() });

      tap(tree, 'calendar-view-month');
      expect(textOf(tree, 'calendar-year-header')).toContain('2026');

      tap(tree, 'calendar-year-header');
      for (let year = 2020; year <= 2031; year += 1) {
        expect(exists(tree, yearTileId(year))).toBe(true);
      }

      // And choosing one leaves Month view on that year, still having told nobody.
      tap(tree, yearTileId(2029));
      expect(textOf(tree, 'calendar-year-header')).toContain('2029');
      expect(exists(tree, monthTileId(2029, 1))).toBe(true);
    });

    it('offers no month header in Year view, which is already the twelve years', async () => {
      const tree = await mount(Sheet);

      tap(tree, 'calendar-view-year');
      expect(exists(tree, 'calendar-month-header')).toBe(false);
      expect(exists(tree, 'calendar-year-header')).toBe(false);
      expect(textOf(tree, 'calendar-window-label')).toBe('2020 - 2031');
    });

    it('keeps the month on screen tappable in the list, so an empty one can still be left', async () => {
      // An empty journal: every tile is faded (the spec's own edge case). The list must still
      // have a way out other than giving up on the sheet, so the month the calendar is
      // *showing* stays tappable and choosing it again closes the list.
      const tree = await mount(Sheet, { index: buildIndex([]) });

      tap(tree, 'calendar-month-header');
      expect(control(tree, monthTileId(2026, 11)).props.disabled).toBe(false);
      expect(control(tree, monthTileId(2026, 2)).props.disabled).toBe(true);

      tap(tree, monthTileId(2026, 11));
      expect(dayTileIds(tree)).toHaveLength(30);
    });
  });

  // -------------------------------------------------------------------------
  // The arrows -- FR-002 ("arrows by the next set"), FR-008
  // -------------------------------------------------------------------------

  describe('the arrows', () => {
    it('moves a month at a time in Date view, over the turn of the year', async () => {
      const onPick = jest.fn();
      const onClose = jest.fn();
      const tree = await mount(Sheet, { onPick, onClose });

      tap(tree, 'calendar-next');
      expect(textOf(tree, 'calendar-month-header')).toContain('December');
      expect(textOf(tree, 'calendar-year-header')).toContain('2026');

      // FR-008: next is always later in time, December to January and not back eleven months.
      tap(tree, 'calendar-next');
      expect(textOf(tree, 'calendar-month-header')).toContain('January');
      expect(textOf(tree, 'calendar-year-header')).toContain('2027');

      tap(tree, 'calendar-prev');
      expect(textOf(tree, 'calendar-month-header')).toContain('December');
      expect(textOf(tree, 'calendar-year-header')).toContain('2026');

      // Pure browsing throughout.
      expect(onPick).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('moves a year at a time with the month list open, and in Month view', async () => {
      const tree = await mount(Sheet, { index: fullWindowIndex() });

      tap(tree, 'calendar-month-header');
      tap(tree, 'calendar-next');
      expect(textOf(tree, 'calendar-year-header')).toContain('2027');
      expect(exists(tree, monthTileId(2027, 5))).toBe(true);

      tap(tree, 'calendar-month-header'); // close the list again
      tap(tree, 'calendar-view-month');
      tap(tree, 'calendar-prev');
      expect(textOf(tree, 'calendar-year-header')).toContain('2026');
    });

    it('moves twelve years at a time with the year list open, and in Year view', async () => {
      const tree = await mount(Sheet, { index: fullWindowIndex() });

      tap(tree, 'calendar-year-header');
      tap(tree, 'calendar-next');
      for (let year = 2032; year <= 2043; year += 1) {
        expect(exists(tree, yearTileId(year))).toBe(true);
      }
      expect(exists(tree, yearTileId(2031))).toBe(false);

      tap(tree, 'calendar-year-header'); // close the list
      tap(tree, 'calendar-view-year');
      tap(tree, 'calendar-prev');
      expect(textOf(tree, 'calendar-window-label')).toBe('2008 - 2019');
    });
  });

  // -------------------------------------------------------------------------
  // Switching views -- FR-002's Date, Month, Year
  // -------------------------------------------------------------------------

  describe('Date, Month and Year', () => {
    it('switches between the three without telling the Journal anything', async () => {
      const onPick = jest.fn();
      const onClose = jest.fn();
      const tree = await mount(Sheet, { onPick, onClose });

      tap(tree, 'calendar-view-month');
      expect(exists(tree, monthTileId(2026, 1))).toBe(true);
      expect(dayTileIds(tree)).toHaveLength(0);

      tap(tree, 'calendar-view-year');
      expect(exists(tree, yearTileId(2026))).toBe(true);

      tap(tree, 'calendar-view-date');
      expect(dayTileIds(tree)).toHaveLength(30);

      expect(onPick).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Closing -- spec scenario 4, FR-003
  // -------------------------------------------------------------------------

  describe('closing with nothing chosen', () => {
    it('closes on the cross', async () => {
      const onPick = jest.fn();
      const onClose = jest.fn();
      const tree = await mount(Sheet, { onPick, onClose });

      tap(tree, 'calendar-sheet-close');

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onPick).not.toHaveBeenCalled();
    });

    it('closes on a tap outside the sheet', async () => {
      const onPick = jest.fn();
      const onClose = jest.fn();
      const tree = await mount(Sheet, { onPick, onClose });

      tap(tree, 'calendar-sheet-backdrop');

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onPick).not.toHaveBeenCalled();
    });

    it('closes on Android back, through the modal\'s own onRequestClose', async () => {
      const onPick = jest.fn();
      const onClose = jest.fn();
      const tree = await mount(Sheet, { onPick, onClose });

      act(() => tree.root.findByType(Modal).props.onRequestClose());

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onPick).not.toHaveBeenCalled();
    });

    it('closes from a drop-down list too, having chosen nothing', async () => {
      const onPick = jest.fn();
      const onClose = jest.fn();
      const tree = await mount(Sheet, { onPick, onClose });

      tap(tree, 'calendar-month-header');
      tap(tree, 'calendar-next'); // browse to another year, then give up
      tap(tree, 'calendar-sheet-close');

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onPick).not.toHaveBeenCalled();
    });

    it('forgets where it had browsed to, and opens again on the picked day', async () => {
      // The sheet's view state is discarded on close (data-model.md), so a reader who wandered
      // off to 2029 last time is not dropped back there.
      let tree;
      const props = {
        visible: true,
        picked: PICKED_DAY,
        index: novemberIndex(),
        today: TODAY,
        onPick: jest.fn(),
        onClose: jest.fn(),
      };

      await act(async () => {
        tree = renderer.create(<Sheet {...props} />);
      });
      trees.push(tree);

      tap(tree, 'calendar-next');
      tap(tree, 'calendar-next');
      expect(textOf(tree, 'calendar-month-header')).toContain('January');

      await act(async () => tree.update(<Sheet {...props} visible={false} />));
      await act(async () => tree.update(<Sheet {...props} visible />));

      expect(textOf(tree, 'calendar-month-header')).toContain('November');
      expect(textOf(tree, 'calendar-year-header')).toContain('2026');
    });
  });

  // -------------------------------------------------------------------------
  // SC-001 -- counted, not assumed
  // -------------------------------------------------------------------------

  describe('SC-001: at most four taps to any month in the window', () => {
    /**
     * "Any month in the twelve-year window is reachable in at most four taps after opening the
     * sheet." Counted here, by a helper that tallies every tap it makes, over a route that is
     * the one a person finds: the year header, the year, the month header, the month.
     *
     * **Every one of the twelve years, and the months at both ends of a year and in the middle
     * of it.** The full cross product of 144 would be 144 near-identical paths: the year list and
     * the month list are two independent loops, and no month is treated differently from any
     * other month, so pairing every year with January, April, August and December exercises each
     * loop over its whole range and the year boundary -- which is the only place the arithmetic
     * could differ -- without putting half a minute on every future `npm test`.
     *
     * The index gives every one of those months a memory, which is the only reading of SC-001
     * consistent with FR-002: an empty tile is deliberately faded and untappable, so a month
     * with nothing in it is unreachable **by design**, and counting taps to it would be counting
     * taps to a control the feature says must not answer.
     */
    it('reaches every month of 2020-2031 in four taps or fewer', async () => {
      const onPick = jest.fn();
      const onClose = jest.fn();
      const index = fullWindowIndex();

      for (let year = 2020; year <= 2031; year += 1) {
        for (const month of [1, 4, 8, 12]) {
          /* eslint-disable no-await-in-loop */
          const tree = await mount(Sheet, { onPick, onClose, index });

          let taps = 0;
          const countedTap = (testID) => {
            tap(tree, testID);
            taps += 1;
          };

          countedTap('calendar-year-header');
          countedTap(yearTileId(year));
          countedTap('calendar-month-header');
          countedTap(monthTileId(year, month));

          expect(taps).toBeLessThanOrEqual(4);
          expect(textOf(tree, 'calendar-month-header')).toContain(monthName(month));
          expect(textOf(tree, 'calendar-year-header')).toContain(String(year));
          expect(exists(tree, dayId(`${monthKey(year, month)}-10`))).toBe(true);

          // Four taps of browsing, and the Journal still untouched until a day is chosen.
          expect(onPick).not.toHaveBeenCalled();
          expect(onClose).not.toHaveBeenCalled();
          /* eslint-enable no-await-in-loop */
        }
      }
    });
  });
});

// ---------------------------------------------------------------------------
// The two variants are two files, and this is what keeps them one design
// ---------------------------------------------------------------------------

describe('the native and web variants', () => {
  it('draw from the same palette', () => {
    expect(WEB_COLOURS).toEqual(NATIVE_COLOURS);
  });
});
