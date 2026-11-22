/**
 * `usePinnedHeadingScroll` -- the measured scroll that brings a pressed pin's piece clear of a
 * pinned month heading (016 FR-017; 019 T009 fix round 1).
 *
 * The rule used to live in a copy each in `JournalScreen.js` and `PersonJournalScreen.js`, with a
 * third about to be written in `FamilySummaryScreen.js`. The two new screens now share this one
 * module (`JournalScreen.js` keeps its own, deliberately -- the Journal tab is not touched by
 * 019), so this file is where its arithmetic is pinned once.
 *
 * The cases that matter are the two that a plausible-looking implementation gets wrong:
 *
 * - **a height per heading, not one shared number** -- the headings are not all the same height,
 *   so a pin pressed in January must clear *January's* heading however recently February measured
 *   itself;
 * - **a list with no pinned heading passes the offset through unchanged** -- a month and a day
 *   have nothing at the top of them, and a measurement left over from a year somebody was reading
 *   a moment ago must not push a month's pressed pin a heading too far.
 *
 * The list is a plain object with a `scrollToIndex`, assigned to the ref the hook returns: what is
 * under test is the arithmetic and which heading it reads, not `FlatList`. That the screens really
 * hand the hook's callbacks to a real list is pinned where it belongs, in
 * `PersonJournalScreen.calendar.test.js`.
 */

import React from 'react';
import renderer, { act } from 'react-test-renderer';

import { usePinnedHeadingScroll } from '../usePinnedHeadingScroll';

global.IS_REACT_ACT_ENVIRONMENT = true;

/** A year list of two open months, as `calendarModel.buildRows` builds one. */
const YEAR_ROWS = [
  { kind: 'monthHeading', key: '2026-01', label: 'January 2026' },
  { kind: 'dayHeading', key: '2026-01-05', label: 'Mon 5 January' },
  { kind: 'entry', key: 'y-01-05' },
  { kind: 'monthHeading', key: '2026-02', label: 'February 2026' },
  { kind: 'dayHeading', key: '2026-02-07', label: 'Sat 7 February' },
  { kind: 'entry', key: 'y-02-07' },
];

/** A month list: day headings only, and so nothing that is ever pinned. */
const MONTH_ROWS = [
  { kind: 'dayHeading', key: '2026-02-07', label: 'Sat 7 February' },
  { kind: 'entry', key: 'y-02-07' },
];

let trees = [];

afterEach(() => {
  trees.forEach((tree) => act(() => tree.unmount()));
  trees = [];
});

/**
 * Mount the hook in a probe and keep its latest return value, with a stand-in list attached.
 *
 * `attachList: false` leaves the ref empty, which is the state a list that has not mounted yet is
 * in -- a pin cannot really be pressed then, but a screen that asked anyway must not crash.
 */
function setup(options, { attachList = true } = {}) {
  const scrollToIndex = jest.fn();
  const out = { current: null };
  let props = options;
  let tree = null;

  const Probe = ({ o }) => {
    out.current = usePinnedHeadingScroll(o);
    if (attachList) out.current.listRef.current = { scrollToIndex };
    return null;
  };

  act(() => {
    tree = renderer.create(<Probe o={props} />);
  });
  trees.push(tree);

  return {
    hook: out,
    scrollToIndex,
    /** React Native reporting one heading's height, as it does on layout. */
    measure: (key, height) => act(() => {
      out.current.measureHeading(key, { nativeEvent: { layout: { height, width: 390, x: 0, y: 0 } } });
    }),
    press: (rowIndex, offset) => act(() => {
      out.current.scrollPieceIntoView(rowIndex, offset);
    }),
    rerender: (next) => {
      props = next;
      act(() => tree.update(<Probe o={props} />));
    },
  };
}

describe('a year list, whose month headings are pinned', () => {
  const inAYear = () => setup({ rows: YEAR_ROWS, headingsPinned: true, screenName: 'TestScreen' });

  it('clears the heading pinned above the pressed row, by its measured height', () => {
    const { measure, press, scrollToIndex } = inAYear();
    measure('2026-02', 72);

    press(5, 160);

    expect(scrollToIndex).toHaveBeenCalledWith({ index: 5, viewOffset: 72 - 160, animated: true });
  });

  /**
   * The finding this per-heading map exists for. February measures taller than January and
   * measures **after** it; a pin pressed in January must still clear January's own heading.
   */
  it('reads that row’s own heading, not whichever measured most recently', () => {
    const { measure, press, scrollToIndex } = inAYear();
    measure('2026-01', 44);
    measure('2026-02', 72);

    press(2, 160);
    expect(scrollToIndex).toHaveBeenLastCalledWith({ index: 2, viewOffset: 44 - 160, animated: true });

    press(5, 160);
    expect(scrollToIndex).toHaveBeenLastCalledWith({ index: 5, viewOffset: 72 - 160, animated: true });
  });

  it('follows the same heading as it is measured again, rather than the first answer', () => {
    const { measure, press, scrollToIndex } = inAYear();

    measure('2026-02', 44);
    press(5, 160);
    expect(scrollToIndex).toHaveBeenLastCalledWith({ index: 5, viewOffset: 44 - 160, animated: true });

    // The text size changed under them, and the heading is now two lines tall.
    measure('2026-02', 60);
    press(5, 160);
    expect(scrollToIndex).toHaveBeenLastCalledWith({ index: 5, viewOffset: 60 - 160, animated: true });
  });

  it('falls back to the last height measured for a heading that has not reported yet', () => {
    const { measure, press, scrollToIndex } = inAYear();
    // Only January has laid out; February's row is pressed before its own heading reported.
    measure('2026-01', 44);

    press(5, 160);

    expect(scrollToIndex).toHaveBeenLastCalledWith({ index: 5, viewOffset: 44 - 160, animated: true });
  });

  it('clears nothing for a row with no heading above it at all', () => {
    const { measure, press, scrollToIndex } = setup({
      rows: [{ kind: 'entry', key: 'loose' }, ...YEAR_ROWS],
      headingsPinned: true,
    });
    measure('2026-01', 44);

    press(0, 160);

    expect(scrollToIndex).toHaveBeenLastCalledWith({ index: 0, viewOffset: -160, animated: true });
  });

  /**
   * React Native reports `0` for a view it has not laid out. Recorded, it would tell a pressed
   * pin there is no heading to clear when there is one -- so it is ignored, and the heading's
   * last real height stands.
   */
  it('ignores a height that is not a positive number', () => {
    const { measure, press, scrollToIndex, hook } = inAYear();
    measure('2026-02', 72);

    measure('2026-02', 0);
    measure('2026-02', -5);
    act(() => hook.current.measureHeading('2026-02', {}));
    act(() => hook.current.measureHeading('2026-02', { nativeEvent: { layout: {} } }));

    press(5, 160);
    expect(scrollToIndex).toHaveBeenLastCalledWith({ index: 5, viewOffset: 72 - 160, animated: true });
  });

  it('never asks for a row past the end of the rows it was given', () => {
    const { measure, press, scrollToIndex } = inAYear();
    measure('2026-02', 72);

    // The rows changed under a press that was already on its way: the walk starts from the last
    // row that exists rather than reading past the end of the array.
    press(99, 160);

    expect(scrollToIndex).toHaveBeenLastCalledWith({ index: 99, viewOffset: 72 - 160, animated: true });
  });
});

describe('a list with no pinned heading', () => {
  it('passes the offset through unchanged in a month list', () => {
    const { press, scrollToIndex } = setup({ rows: MONTH_ROWS, headingsPinned: false });

    press(1, 160);

    expect(scrollToIndex).toHaveBeenCalledWith({ index: 1, viewOffset: -160, animated: true });
  });

  it('passes it through in a day, which has no rows at all', () => {
    const { press, scrollToIndex } = setup({ rows: [], headingsPinned: false });

    press(0, 80);

    expect(scrollToIndex).toHaveBeenCalledWith({ index: 0, viewOffset: -80, animated: true });
  });

  /**
   * The half a regression would arrive through: a screen that remembered the height it measured
   * in a year would scroll a month's pressed pin a heading too far, past the piece somebody asked
   * to see. The measurement survives the move -- it is the *period on screen* that decides.
   */
  it('ignores a height measured while a year was on screen, once a month is', () => {
    const { measure, press, scrollToIndex, rerender } = setup({
      rows: YEAR_ROWS,
      headingsPinned: true,
    });
    measure('2026-02', 72);

    rerender({ rows: MONTH_ROWS, headingsPinned: false });
    press(1, 160);

    expect(scrollToIndex).toHaveBeenLastCalledWith({ index: 1, viewOffset: -160, animated: true });
  });
});

describe('the list itself', () => {
  it('does nothing, and does not throw, before a list is attached', () => {
    const { press } = setup({ rows: YEAR_ROWS, headingsPinned: true }, { attachList: false });

    expect(() => press(5, 160)).not.toThrow();
  });

  it('warns, and does not throw, when the list refuses the row', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { hook } = setup({ rows: YEAR_ROWS, headingsPinned: true, screenName: 'TestScreen' });

    expect(() => hook.current.onScrollToIndexFailed({ index: 99, highestMeasuredFrameIndex: 3 }))
      .not.toThrow();

    // Named, so a log line says which screen it came from.
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('[TestScreen]'),
      { index: 99, highestMeasuredFrameIndex: 3 },
    );
    warn.mockRestore();
  });
});
