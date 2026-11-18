/**
 * 016 T009 -- the calendar sheet read by a screen reader (FR-014, SC-006).
 *
 * `CalendarSheet.test.js` (T004) swept the sheet's look and its behaviour; this file is about
 * the one thing it deliberately left for last: every control's spoken name. Written before any
 * of `CalendarSheetBody.js`'s labels and roles exist, so the first run of this file is meant to
 * fail -- each failing case names the control it expected to speak and did not.
 *
 * What "in full" means for each kind of control, read off FR-014 and the task itself:
 *
 *   a day tile      "Thursday 5 November 2026, 2 memories" -- the full weekday and the full
 *                   month, because a screen reader has no three-letter column head to lean on
 *                   the way a sighted reader does; a faded day says "unavailable" instead of a
 *                   count it does not have.
 *   a month tile     "November 2026, 6 memories" in Month or Year view's own grid; inside a
 *                   drop-down list the count is dropped too, matching what the tile shows on
 *                   screen there (`CalendarSheetBody`'s own rule: "a tile in a drop-down list
 *                   never shows a count").
 *   a year tile      the same, with the bare year standing in for the month's words.
 *   the ✕, the
 *   Date/Month/Year
 *   switch, and the
 *   month/year
 *   list headers     named and given a role too, per the task's own list -- not covered by
 *                   FR-014's examples, but asked for in `tasks.md`.
 *   the sheet's own
 *   ◄ ►              T009 fix round 1 (item 2): ruled in by the owner, against the first
 *                   round's own disclosure, over FR-014's opening clause rather than its
 *                   enumerated list -- named by what `step` would actually move ("Previous
 *                   month", "Previous year", "Earlier years"), never by a guess at a
 *                   destination this component cannot compute.
 *
 * Nothing here duplicates `CalendarSheet.test.js`'s own ground beyond what the sheet's own
 * ◄ ► need: no colours, no picking. `accessibilityState.disabled` on a tile already existed
 * before this task (T004); this file only adds the label and the role sitting beside it.
 */

import React from 'react';
import { ScrollView, Text, TouchableOpacity } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import CalendarSheetBody from '../CalendarSheetBody';
import { buildIndex, monthKey } from '../../../utils/calendarModel';

// ---------------------------------------------------------------------------
// Fixtures -- a small slice of November 2026, chosen so a day with two memories, a day with
// one, and a faded day all exist at once, and so the month and the year carry a real count
// (2 + 1 + 3 = 6) that is not any of its parts.
// ---------------------------------------------------------------------------

const NOVEMBER_ROWS = [
  { day: '2026-11-05', precision: 'day', count: 2 },
  { day: '2026-11-12', precision: 'day', count: 1 },
  { day: '2026-11-01', precision: 'month', count: 3 },
];

const novemberIndex = () => buildIndex(NOVEMBER_ROWS);

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
});

const mount = async (props = {}) => {
  let tree;
  await act(async () => {
    tree = renderer.create(
      <CalendarSheetBody
        visible
        picked={PICKED_DAY}
        index={novemberIndex()}
        today={TODAY}
        onPick={jest.fn()}
        onClose={jest.fn()}
        {...props}
      />,
    );
  });
  trees.push(tree);
  return tree;
};

/** The touchable carrying this test id -- the control itself. */
const control = (tree, testID) =>
  tree.root.findAllByType(TouchableOpacity).find((node) => node.props.testID === testID);

const monthTileId = (year, month) => `calendar-month-tile-${monthKey(year, month)}`;
const yearTileId = (year) => `calendar-year-tile-${year}`;

// ---------------------------------------------------------------------------
// Day tiles (FR-014)
// ---------------------------------------------------------------------------

describe('a day tile names itself in full, for a screen reader (FR-014)', () => {
  it('is a button, named by its weekday, day, month and year, and its count', async () => {
    const tree = await mount();
    const tile = control(tree, 'calendar-day-2026-11-05');

    expect(tile.props.accessibilityRole).toBe('button');
    expect(tile.props.accessibilityLabel).toBe('Thursday 5 November 2026, 2 memories');
  });

  it('says "1 memory", not "1 memories"', async () => {
    const tree = await mount();
    const tile = control(tree, 'calendar-day-2026-11-12');

    expect(tile.props.accessibilityLabel).toBe('Thursday 12 November 2026, 1 memory');
  });

  it('announces a faded day as unavailable, rather than a count it does not have', async () => {
    const tree = await mount();
    const tile = control(tree, 'calendar-day-2026-11-06');

    // `disabled` already existed before this task; this file is only about the label beside it.
    expect(tile.props.accessibilityState.disabled).toBe(true);
    expect(tile.props.accessibilityLabel).toBe('Friday 6 November 2026, unavailable');
  });
});

// ---------------------------------------------------------------------------
// Month tiles (FR-014)
// ---------------------------------------------------------------------------

describe('a month tile names itself in full, for a screen reader (FR-014)', () => {
  it('is a button, named by its month, its year and its count', async () => {
    const tree = await mount({ picked: { kind: 'month', year: 2026, month: 11 } });
    const tile = control(tree, monthTileId(2026, 11));

    expect(tile.props.accessibilityRole).toBe('button');
    // November carries the day-dated memories and the month-only ones together: 2 + 1 + 3 = 6.
    expect(tile.props.accessibilityLabel).toBe('November 2026, 6 memories');
  });

  it('announces a faded month as unavailable', async () => {
    const tree = await mount({ picked: { kind: 'month', year: 2026, month: 11 } });
    const tile = control(tree, monthTileId(2026, 10));

    expect(tile.props.accessibilityState.disabled).toBe(true);
    expect(tile.props.accessibilityLabel).toBe('October 2026, unavailable');
  });

  it('says only the month inside a drop-down list, matching what it shows on screen', async () => {
    // `CalendarSheetBody`'s own rule: "a tile in a drop-down list never shows a count" -- a list
    // is for moving the calendar, not for answering a question about a month passed through.
    const tree = await mount();
    await act(async () => {
      control(tree, 'calendar-month-header').props.onPress();
    });

    const onScreenNow = control(tree, monthTileId(2026, 11));
    expect(onScreenNow.props.accessibilityState.disabled).toBe(false);
    expect(onScreenNow.props.accessibilityLabel).toBe('November 2026');
  });
});

// ---------------------------------------------------------------------------
// Year tiles (FR-014)
// ---------------------------------------------------------------------------

describe('a year tile names itself in full, for a screen reader (FR-014)', () => {
  it('is a button, named by its year and its count', async () => {
    const tree = await mount({ picked: { kind: 'year', year: 2026 } });
    const tile = control(tree, yearTileId(2026));

    expect(tile.props.accessibilityRole).toBe('button');
    expect(tile.props.accessibilityLabel).toBe('2026, 6 memories');
  });

  it('announces a faded year as unavailable', async () => {
    const tree = await mount({ picked: { kind: 'year', year: 2026 } });
    const tile = control(tree, yearTileId(2021));

    expect(tile.props.accessibilityState.disabled).toBe(true);
    expect(tile.props.accessibilityLabel).toBe('2021, unavailable');
  });

  it('says only the year inside a drop-down list, matching what it shows on screen', async () => {
    // The year header only exists in Date and Month view (Year view already *is* the twelve
    // years, so there is nothing for a header to open) -- the default mount, a day picked,
    // starts in Date view on November 2026.
    const tree = await mount();
    await act(async () => {
      control(tree, 'calendar-year-header').props.onPress();
    });

    const onScreenNow = control(tree, yearTileId(2026));
    expect(onScreenNow.props.accessibilityState.disabled).toBe(false);
    expect(onScreenNow.props.accessibilityLabel).toBe('2026');
  });
});

// ---------------------------------------------------------------------------
// The sheet's own controls (tasks.md's own list, beyond FR-014's examples)
// ---------------------------------------------------------------------------

describe("the sheet's ✕, its Date/Month/Year switch and its list headers are named too", () => {
  it('names the close button, as a button', async () => {
    const tree = await mount();
    const close = control(tree, 'calendar-sheet-close');

    expect(close.props.accessibilityRole).toBe('button');
    expect(typeof close.props.accessibilityLabel).toBe('string');
    expect(close.props.accessibilityLabel.trim().length).toBeGreaterThan(0);
  });

  it('names the Date, Month and Year switch, and says which one is current', async () => {
    const tree = await mount();

    const dateTab = control(tree, 'calendar-view-date');
    const monthTab = control(tree, 'calendar-view-month');
    const yearTab = control(tree, 'calendar-view-year');

    [dateTab, monthTab, yearTab].forEach((tab) => {
      expect(tab.props.accessibilityRole).toBe('button');
      expect(typeof tab.props.accessibilityLabel).toBe('string');
    });

    // The sheet opens in Date view (a day is picked), so Date alone is the current one.
    expect(dateTab.props.accessibilityState.selected).toBe(true);
    expect(monthTab.props.accessibilityState.selected).toBe(false);
    expect(yearTab.props.accessibilityState.selected).toBe(false);
  });

  it('names the month header, and says whether its list is open', async () => {
    const tree = await mount();
    const header = control(tree, 'calendar-month-header');

    expect(header.props.accessibilityRole).toBe('button');
    expect(header.props.accessibilityState.expanded).toBe(false);

    await act(async () => {
      control(tree, 'calendar-month-header').props.onPress();
    });

    expect(control(tree, 'calendar-month-header').props.accessibilityState.expanded).toBe(true);
  });

  it('names the year header, and says whether its list is open', async () => {
    const tree = await mount();
    const header = control(tree, 'calendar-year-header');

    expect(header.props.accessibilityRole).toBe('button');
    expect(header.props.accessibilityState.expanded).toBe(false);

    await act(async () => {
      control(tree, 'calendar-year-header').props.onPress();
    });

    expect(control(tree, 'calendar-year-header').props.accessibilityState.expanded).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T009 fix round 1 (item 2): the sheet's own ◄ ► are named too.
//
// Ruled in over FR-014's opening clause ("usable with screen readers") rather than its
// enumerated list: these two are the only way to move the sheet's own month, year or
// twelve-year window, so leaving them silent would leave a screen-reader user unable to
// navigate the sheet at all. The wording is the owner's own, named by what `step` would
// actually move -- `stepTarget` decides both, so the label and the action cannot disagree.
// Five cases, one per branch `stepTarget` can take.
// ---------------------------------------------------------------------------

describe("the sheet's own ◄ ► are named by what they would move (T009 fix round 1)", () => {
  it('says "month" in Date view, where ◄ ► step by month', async () => {
    const tree = await mount();

    expect(control(tree, 'calendar-prev').props.accessibilityRole).toBe('button');
    expect(control(tree, 'calendar-prev').props.accessibilityLabel).toBe('Previous month');
    expect(control(tree, 'calendar-prev').props.accessibilityState).toEqual({ disabled: false });
    expect(control(tree, 'calendar-next').props.accessibilityLabel).toBe('Next month');
    expect(control(tree, 'calendar-next').props.accessibilityState).toEqual({ disabled: false });
  });

  it('says "year" in Month view, where ◄ ► step by year', async () => {
    const tree = await mount({ picked: { kind: 'month', year: 2026, month: 11 } });

    expect(control(tree, 'calendar-prev').props.accessibilityLabel).toBe('Previous year');
    expect(control(tree, 'calendar-next').props.accessibilityLabel).toBe('Next year');
  });

  it('says "years" in Year view, where ◄ ► step the twelve-year window', async () => {
    const tree = await mount({ picked: { kind: 'year', year: 2026 } });

    expect(control(tree, 'calendar-prev').props.accessibilityLabel).toBe('Earlier years');
    expect(control(tree, 'calendar-next').props.accessibilityLabel).toBe('Later years');
  });

  it('says "year" with the month drop-down list open, where ◄ ► browse a different year', async () => {
    // Opening the month list from Date view moves to browsing the *year* behind it (T004's own
    // `step`: `list === 'month'` steps `year`), so the arrows say what this list-browsing state
    // actually does, not what Date view underneath it would otherwise do.
    const tree = await mount();
    await act(async () => {
      control(tree, 'calendar-month-header').props.onPress();
    });

    expect(control(tree, 'calendar-prev').props.accessibilityLabel).toBe('Previous year');
    expect(control(tree, 'calendar-next').props.accessibilityLabel).toBe('Next year');
  });

  it('says "years" with the year drop-down list open, where ◄ ► browse a different window', async () => {
    const tree = await mount();
    await act(async () => {
      control(tree, 'calendar-year-header').props.onPress();
    });

    expect(control(tree, 'calendar-prev').props.accessibilityLabel).toBe('Earlier years');
    expect(control(tree, 'calendar-next').props.accessibilityLabel).toBe('Later years');
  });
});

// ---------------------------------------------------------------------------
// The largest text size (FR-014, SC-006) -- what the code can guarantee; the device check
// itself is T011's.
// ---------------------------------------------------------------------------

describe('nothing here prevents the largest text size from working (FR-014, SC-006)', () => {
  it('scrolls its body, rather than overflowing it', async () => {
    const tree = await mount();

    expect(tree.root.findAllByType(ScrollView)).toHaveLength(1);
  });

  it('sets no numberOfLines on any of its text, so a label cannot be cut off', async () => {
    const tree = await mount({ picked: { kind: 'year', year: 2026 } });

    tree.root.findAllByType(Text).forEach((text) => {
      expect(text.props.numberOfLines).toBeUndefined();
    });
  });
});
