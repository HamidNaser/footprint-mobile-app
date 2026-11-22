/**
 * usePinnedHeadingScroll -- bringing a pressed pin's piece into view in a list whose month
 * headings are pinned (016 FR-017; 019 T009 fix round 1).
 *
 * `JournalEntryCard` reports, through `onRequestScrollTo(offset)`, how far down itself a pressed
 * map pin's piece sits. The card cannot know where it sits in the *list* -- `FlatList` lays every
 * card inside a cell of its own, so a card's `onLayout` reports a position relative to that cell
 * and not to the list's content -- so the screen supplies the row index and
 * `scrollToIndex`'s `viewOffset` does the rest: the row is placed `offset` points above the top of
 * the screen, which brings the piece itself to the top.
 *
 * ⚠ **A year is the one list with something already at the top of it.** `viewOffset: -offset` puts
 * the pressed piece at the very top of the list, which in a year list is exactly where the pinned
 * month heading sits -- so the piece would land *under* the words naming its month, the one place
 * it cannot be read. The measured height of **that row's own** pinned heading is added, and the
 * piece lands just below it.
 *
 * ## Why this is a module of its own
 *
 * The rule lives in three screens. `JournalScreen.js` has carried it since 016 and **is not
 * touched**: the 019 design says the Journal tab is not changed, and 016's tests pin its
 * behaviour, which is the same reason research R9 accepted a second copy of the date bar. That
 * constraint says nothing about the two *new* screens, though, and a copy each in
 * `PersonJournalScreen` and `FamilySummaryScreen` would be self-inflicted -- three independently
 * maintained copies of a measurement, where a correction to one is invisible to the others
 * (T009 review fix round 1, the tech lead's ruling). So the two new screens share this one, and
 * the Journal tab's copy stays where it is.
 *
 * ## The two things that are easy to get subtly wrong
 *
 * - **Heights are kept per heading, not as one number** (016 T007 fix round 1, finding B). The
 *   month headings are **not** all the same height: `"2026, month not known"` is a longer label
 *   than `"March 2026"` and wraps to a second line at a large text size on a narrow screen. One
 *   shared number would hold whichever heading laid out most recently, so a heading below January
 *   laying out last would make a pin pressed *in* January clear a gap a line too big. The heading
 *   pinned above a row is the one that has to be cleared, so it is the one measured and the one
 *   read.
 * - **`headingsPinned` is asked of the period on screen, never derived from the measurements or
 *   the rows.** A month list and a day have no pinned heading and must pass the offset through
 *   unchanged; a height left over from a year somebody was reading a moment ago must not push a
 *   month's pressed pin a heading too far. Deriving it ("are there any month heading rows?")
 *   happens to agree today, but it would make the answer a property of the data rather than of
 *   what is on screen, which is not the rule 016 states.
 *
 * Refs rather than state throughout: nothing on screen is drawn from a measurement. They are read
 * at the one moment a pin is pressed, and holding them as state would re-render a whole list the
 * first time a heading measured itself, for no visible change (016 SC-005 asks for 300 memories
 * scrolling without stutter).
 *
 * @param {object} options
 * @param {Array<{kind?: string, key?: string}>} options.rows - the list's rows, as
 *   `calendarModel.buildRows` builds them. A day's list has none, and passes nothing here.
 * @param {boolean} [options.headingsPinned] - whether the list on screen pins its month headings,
 *   which is true of a year list and of nothing else.
 * @param {string} [options.screenName] - who to name in the warning when a scroll is refused, so
 *   a log line says which screen it came from.
 * @returns {{
 *   listRef: React.MutableRefObject<any>,
 *   measureHeading: (key: string, event: object) => void,
 *   scrollPieceIntoView: (rowIndex: number, offset: number) => void,
 *   onScrollToIndexFailed: (info: object) => void,
 * }}
 */

import { useCallback, useRef } from 'react';

export function usePinnedHeadingScroll({ rows, headingsPinned = false, screenName = 'screen' } = {}) {
  /** The list itself. `scrollToIndex` is a `FlatList` method; a `SectionList` has none. */
  const listRef = useRef(null);

  /** How tall each month heading is, by heading key, as each one last reported itself. */
  const headingHeightsRef = useRef(new Map());

  /**
   * The most recent measurement of any heading -- the fallback for a heading that has somehow
   * not reported yet, which is better than nothing because every month heading is within a line
   * of the others.
   */
  const lastHeadingHeightRef = useRef(0);

  /**
   * One month heading reporting its own height. Nothing else can measure it:
   * `react-test-renderer` lays nothing out, and on a real phone the height depends on the text
   * size somebody has chosen.
   *
   * A height that is not a positive number is **ignored rather than recorded**: React Native
   * reports `0` for a view it has not laid out, and storing that would tell a pressed pin there
   * is no heading to clear when there is one.
   */
  const measureHeading = useCallback((key, event) => {
    const height = event?.nativeEvent?.layout?.height;
    if (typeof height !== 'number' || height <= 0) return;
    headingHeightsRef.current.set(key, height);
    lastHeadingHeightRef.current = height;
  }, []);

  /**
   * How tall the heading pinned above row `rowIndex` is -- the nearest month heading at or above
   * it, which is the one `stickyHeaderIndices` has stuck to the top of the screen while that row
   * is being looked at.
   *
   * The walk is backwards from the row and stops at the first heading, so it is a few steps in a
   * year of twelve months, and it happens once, on a press, never on a render or a scroll. `0` --
   * a month list's own offset -- is the answer for a row with no heading above it at all.
   */
  const pinnedHeadingHeight = useCallback((rowIndex) => {
    if (!Array.isArray(rows) || rows.length === 0) return 0;

    for (let i = Math.min(rowIndex, rows.length - 1); i >= 0; i -= 1) {
      if (rows[i]?.kind === 'monthHeading') {
        const measured = headingHeightsRef.current.get(rows[i].key);
        return measured || lastHeadingHeightRef.current;
      }
    }
    return 0;
  }, [rows]);

  /**
   * Bring a piece into view, for a pin pressed on the card in row `rowIndex` (016 FR-017).
   *
   * ⚠ A deliberate deviation from tasks.md's original wording ("scrolls the list to the given
   * offset"): `scrollToOffset` would need the row's own position in the list's content, which no
   * public API on `FlatList` reports.
   */
  const scrollPieceIntoView = useCallback((rowIndex, offset) => {
    const pinned = headingsPinned ? pinnedHeadingHeight(rowIndex) : 0;
    listRef.current?.scrollToIndex({ index: rowIndex, viewOffset: pinned - offset, animated: true });
  }, [headingsPinned, pinnedHeadingHeight]);

  /**
   * A row the list had not laid out after all: the memory stays where it is.
   *
   * Deliberately silent to the person. They pressed a pin and the journal did not move, which is
   * the honest outcome and is self-evident on screen; an alert over a memory would be worse than
   * the missed scroll. The highlight on the piece still happens -- the card does that itself.
   *
   * The list must be given this handler. Without `getItemLayout` and without it, `VirtualizedList`
   * throws an invariant for an index past the end of its own data, and there is no error boundary
   * anywhere in `src` to contain it.
   */
  const onScrollToIndexFailed = useCallback((info) => {
    console.warn(`[${screenName}] could not scroll to a pressed pin’s piece`, info);
  }, [screenName]);

  return { listRef, measureHeading, scrollPieceIntoView, onScrollToIndexFailed };
}

export default usePinnedHeadingScroll;
