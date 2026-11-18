/**
 * 016 T002: the specification of `calendarModel`, the phone calendar's pure model.
 *
 * Everything the calendar sheet and the month and year lists do with a date happens here, in
 * integers and `YYYY-MM-DD` strings -- never in a moment in time. That is the whole point of
 * the module and the reason this file is where it is pinned down: a memory dated 5 March
 * happened on 5 March for a reader in Los Angeles and for a reader in Auckland, and nothing
 * in the calendar may let that slip (FR-011, SC-004).
 *
 * So these tests are written to be **zone-blind**: every expectation is a fixed string or a
 * fixed integer, and not one of them is computed from the clock. That is what makes
 * `node scripts/test-tz.mjs` meaningful -- it runs this very file under
 * `America/Los_Angeles`, `UTC` and `Pacific/Auckland`, and an expectation that moved with the
 * zone would fail in two of the three rather than quietly agreeing with itself (SC-004).
 *
 * The last `describe` is not about behaviour at all: it reads this feature's own files looking
 * for a date string handed to the `Date` constructor, which is the one spelling that turns a
 * civil date into an instant (`journalDate.js`'s header). A guard, because the defect it
 * catches is invisible in a single zone -- the zone the author happens to be in. The guard
 * must not name the spelling it bans in so many words, or it would flag itself.
 */

import fs from 'fs';
import path from 'path';

import {
  dayKeyOf,
  daysInMonth,
  monthKey,
  monthGrid,
  stepMonth,
  stepYear,
  stepWindow,
  windowStartFor,
  neighbourMonth,
  neighbourYear,
  buildIndex,
  buildRows,
  filterRange,
  isDescending,
} from '../calendarModel';
// Imported to state a contract, not because `calendarModel` uses it: the fallback below must
// place a dateless memory on the same day the Journal's own helper would.
import { toDateKey } from '../journalDate';

/**
 * An entry as `DatabaseService._mapEntryRow` returns one, cut down to the fields the model
 * reads. `datePrecision` is left off deliberately in most cases: a row written before the
 * column existed has none, and a missing precision means a day everywhere else.
 */
const entry = (localId, date, createdAt, datePrecision) => ({
  localId,
  date,
  createdAt,
  ...(datePrecision === undefined ? {} : { datePrecision }),
});

const kinds = (rows) => rows.map((row) => row.kind);
const labels = (rows) => rows.filter((row) => row.kind !== 'entry').map((row) => row.label);
const entryIds = (rows) => rows.filter((row) => row.kind === 'entry').map((row) => row.key);

// ---------------------------------------------------------------------------
// daysInMonth, monthKey
// ---------------------------------------------------------------------------

describe('daysInMonth', () => {
  it('knows the ordinary lengths', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => daysInMonth(2026, m)))
      .toEqual([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
  });

  // All three arms of the leap rule, because the cheap version of it (`year % 4 === 0`) is
  // right for 2024 and wrong for 1900, and only a century year shows the difference. The
  // journal reaches back to scanned photographs, so 1900 is a year somebody can pick.
  it('follows the whole leap rule, centuries included', () => {
    expect(daysInMonth(2024, 2)).toBe(29);   // divisible by 4
    expect(daysInMonth(2026, 2)).toBe(28);   // not
    expect(daysInMonth(1900, 2)).toBe(28);   // a century, not divisible by 400
    expect(daysInMonth(2000, 2)).toBe(29);   // a century, divisible by 400
  });
});

describe('monthKey', () => {
  it('pads the month, so keys sort chronologically as plain strings', () => {
    expect(monthKey(2026, 3)).toBe('2026-03');
    expect(monthKey(2026, 11)).toBe('2026-11');
    expect(['2026-11', '2026-03'].sort()).toEqual(['2026-03', '2026-11']);
  });
});

// ---------------------------------------------------------------------------
// dayKeyOf: the one answer to "which civil day is this memory on"
// ---------------------------------------------------------------------------

describe('dayKeyOf', () => {
  it('passes a civil date straight through, from a string or from an entry', () => {
    expect(dayKeyOf('2026-03-05')).toBe('2026-03-05');
    expect(dayKeyOf(entry('e', '2026-03-05', '1'))).toBe('2026-03-05');
  });

  /**
   * SC-004, at the root: a stored date that carries a time lands on the day its own key
   * names, in every zone. `2026-03-05T23:30:00Z` read as an instant is the 6th in Auckland
   * and `2026-03-01T00:30:00Z` is 28 February in Los Angeles -- which is why this reads the
   * leading `YYYY-MM-DD` and stops, exactly as T003's SQL does with `substr(date, 1, 10)`.
   */
  it('SC-004: takes the day part of a date carrying a time, never parsing it', () => {
    expect(dayKeyOf('2026-03-05T23:30:00.000Z')).toBe('2026-03-05');
    expect(dayKeyOf(entry('e', '2026-03-01T00:30:00.000Z', '1'))).toBe('2026-03-01');
    expect(dayKeyOf('2026-03-05 23:30:00')).toBe('2026-03-05');
  });

  /**
   * The defensive path: `date` is `NOT NULL` in the local schema, so this cannot happen to a
   * row out of the database -- but a memory listed nowhere would break FR-005's "every memory
   * of that month" and FR-010's "every memory the phone holds" absolutely, and the created
   * time is the one other thing that says when. `createdAt` really is an instant, so it is
   * resolved as one -- and to the same day the Journal's own `toDateKey` resolves it to, so a
   * month list and the day feed agree about where it goes.
   */
  it('falls back to the created day when there is no stored date, as toDateKey would', () => {
    const created = '2026-03-15T12:00:00.000Z';

    expect(dayKeyOf(entry('e', null, created))).toBe(toDateKey(created));
    expect(dayKeyOf(entry('e', '', created))).toBe(toDateKey(created));
    expect(dayKeyOf(entry('e', '   ', created))).toBe(toDateKey(created));
    // Epoch milliseconds, which a local row may hold instead.
    expect(dayKeyOf(entry('e', null, 1773576000000))).toBe(toDateKey(1773576000000));
  });

  it('prefers the stored date, and only falls back when there is none', () => {
    // A created time four days later must not move the memory off the day it is dated.
    expect(dayKeyOf(entry('e', '2026-03-05', '2026-03-09T09:00:00.000Z'))).toBe('2026-03-05');
  });

  it('answers null when nothing at all says which day it is', () => {
    expect(dayKeyOf(null)).toBeNull();
    expect(dayKeyOf(undefined)).toBeNull();
    expect(dayKeyOf(17)).toBeNull();
    expect(dayKeyOf('sometime in March')).toBeNull();
    expect(dayKeyOf(entry('e', null, null))).toBeNull();
    expect(dayKeyOf(entry('e', 'sometime', 'whenever'))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// monthGrid (FR-002: the Date view's six rows)
// ---------------------------------------------------------------------------

describe('monthGrid', () => {
  it('is always six rows of seven, so the sheet never changes height', () => {
    [[2026, 2], [2026, 3], [2024, 2], [2026, 8]].forEach(([year, month]) => {
      const grid = monthGrid(year, month);
      expect(grid).toHaveLength(6);
      grid.forEach((row) => expect(row).toHaveLength(7));
    });
  });

  // March 2026 begins on a Sunday, so its first cell is the 1st with nothing before it --
  // the one case that would also pass if the leading blanks were forgotten entirely. The
  // February below is the guard for that.
  it('starts the month in its own weekday column, Sunday first', () => {
    expect(monthGrid(2026, 3)[0][0]).toEqual({ key: '2026-03-01', day: 1 });

    // 1 February 2024 is a Thursday: the fifth column, four blanks before it.
    expect(monthGrid(2024, 2)[0].slice(0, 4)).toEqual([null, null, null, null]);
    expect(monthGrid(2024, 2)[0][4]).toEqual({ key: '2024-02-01', day: 1 });
  });

  it('carries every day of the month, and the 29th of a leap February', () => {
    const days = monthGrid(2024, 2).flat().filter(Boolean).map((cell) => cell.day);
    expect(days).toEqual(Array.from({ length: 29 }, (_, i) => i + 1));
  });

  // FR-002's faded, untappable empty tiles are blanks, not the neighbouring month's days: a
  // cell holding 28 February would be markable, and tappable, from March's grid.
  it('never carries a neighbouring month\'s day -- a cell is this month or a blank', () => {
    const cells = monthGrid(2026, 3).flat().filter(Boolean);

    expect(cells).toHaveLength(31);
    cells.forEach((cell) => {
      expect(cell.key).toBe(`2026-03-${String(cell.day).padStart(2, '0')}`);
    });
  });

  it('pads the tail with blanks rather than running into April', () => {
    const grid = monthGrid(2026, 3);
    expect(grid[4].slice(3)).toEqual([null, null, null, null]);
    expect(grid[5]).toEqual([null, null, null, null, null, null, null]);
  });
});

// ---------------------------------------------------------------------------
// Stepping (FR-008: "Next" is always later in time)
// ---------------------------------------------------------------------------

describe('stepMonth', () => {
  it('moves one month and wraps the year either way', () => {
    expect(stepMonth(2026, 3, 1)).toEqual({ year: 2026, month: 4 });
    expect(stepMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(stepMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });

  it('takes a step of more than one month, and a step of none', () => {
    expect(stepMonth(2026, 3, 13)).toEqual({ year: 2027, month: 4 });
    expect(stepMonth(2026, 3, -13)).toEqual({ year: 2025, month: 2 });
    expect(stepMonth(2026, 3, 0)).toEqual({ year: 2026, month: 3 });
  });

  /**
   * FR-008: *"'Next' MUST always move forward in time, for days, months and years."*
   *
   * Stated as a property over two whole years rather than as a pair of examples, because the
   * way this goes wrong is a sign error at the wrap -- December's "next" landing on January
   * of the *same* year, which is eleven months backwards and reads perfectly plausibly on
   * screen.
   */
  it('FR-008: +1 is always later in time, including across December', () => {
    let year = 2025;
    let month = 1;

    for (let i = 0; i < 24; i += 1) {
      const next = stepMonth(year, month, 1);
      expect(next.year * 12 + next.month).toBeGreaterThan(year * 12 + month);
      year = next.year;
      month = next.month;
    }

    expect({ year, month }).toEqual({ year: 2027, month: 1 });
  });
});

describe('stepYear, stepWindow and windowStartFor', () => {
  it('steps a year', () => {
    expect(stepYear(2026, 1)).toBe(2027);
    expect(stepYear(2026, -1)).toBe(2025);
  });

  it('steps the year list a whole window at a time (FR-002: arrows by the next set)', () => {
    expect(stepWindow(2020, 1)).toBe(2032);
    expect(stepWindow(2020, -1)).toBe(2008);
    expect(stepWindow(2020, 0)).toBe(2020);
  });

  // Six back, so the year somebody is looking at sits in the middle of the twelve rather
  // than in a corner of them.
  it('opens the twelve-year window six years before the year itself', () => {
    expect(windowStartFor(2026)).toBe(2020);
    expect(windowStartFor(2026) + 11).toBe(2031);
    expect(windowStartFor(1978)).toBe(1972);
  });
});

// ---------------------------------------------------------------------------
// buildIndex (data-model: calendarIndex; FR-010, FR-011)
// ---------------------------------------------------------------------------

describe('buildIndex', () => {
  /** Rows as `getCalendarIndexRows` (T003) returns them: a day, a precision and a count. */
  const rows = [
    { day: '2026-03-05', precision: 'day', count: 2 },
    { day: '2026-03-17', precision: 'day', count: 1 },
    { day: '2026-03-01', precision: 'month', count: 3 },   // March, day not known
    { day: '2019-01-01', precision: 'year', count: 4 },    // 2019, month not known
  ];

  it('counts day-precision memories into days, months and years', () => {
    const index = buildIndex(rows);

    expect(index.days.get('2026-03-05')).toBe(2);
    expect(index.days.get('2026-03-17')).toBe(1);
    expect(index.months.get('2026-03')).toBe(6);   // 2 + 1 day-dated, plus the 3 month-only
    expect(index.years.get('2026')).toBe(6);
  });

  /**
   * FR-011: *"Month-only and year-only memories MUST show only what is known and MUST NOT
   * mark the 1st."*
   *
   * The stored date of a month-only memory **is** the 1st -- that is how a civil date can be
   * stored at all -- so the only thing standing between it and a marked, tappable 1 March
   * tile is this: a month-precision row never enters `days`.
   */
  it('FR-011: a memory known only to its month never marks the 1st as a day with memories', () => {
    const index = buildIndex(rows);

    expect(index.days.has('2026-03-01')).toBe(false);
    expect(index.roughMonths.get('2026-03')).toBe(3);
  });

  it('FR-011: a memory known only to its year marks neither the 1st nor January', () => {
    const index = buildIndex(rows);

    expect(index.days.has('2019-01-01')).toBe(false);
    expect(index.months.has('2019-01')).toBe(false);
    expect(index.years.get('2019')).toBe(4);
    expect(index.roughYears.get('2019')).toBe(4);
  });

  // Kept apart rather than folded into `months`/`years`: the sheet needs a month's whole
  // count *and* to know how much of it is only roughly dated.
  it('keeps roughMonths and roughYears apart from the counts they contribute to', () => {
    const index = buildIndex(rows);

    expect(index.roughMonths.has('2019-01')).toBe(false);
    expect(index.roughYears.has('2026')).toBe(false);
  });

  it('reads a missing precision as a day, as everywhere else in the app', () => {
    const index = buildIndex([{ day: '2026-03-05', count: 1 }]);

    expect(index.days.get('2026-03-05')).toBe(1);
    expect(index.roughMonths.size).toBe(0);
  });

  // The SQL column is `date_precision`, and the day column may well arrive as `date`. Both
  // spellings are read, because the alternative is silent: an unread precision makes every
  // rough-dated memory look day-dated, which is the one thing FR-011 forbids.
  it('also reads the SQL spellings, date and date_precision', () => {
    const index = buildIndex([{ date: '2026-03-01', date_precision: 'month', count: 3 }]);

    expect(index.days.has('2026-03-01')).toBe(false);
    expect(index.roughMonths.get('2026-03')).toBe(3);
  });

  it('adds up two rows that fall on the same day', () => {
    const index = buildIndex([
      { day: '2026-03-05', precision: 'day', count: 2 },
      { day: '2026-03-05', precision: 'day', count: 1 },
    ]);

    expect(index.days.get('2026-03-05')).toBe(3);
  });

  it('takes the civil day out of a full instant without re-reading it as one', () => {
    const index = buildIndex([{ day: '2026-03-05T23:30:00.000Z', precision: 'day', count: 1 }]);

    expect([...index.days.keys()]).toEqual(['2026-03-05']);
  });

  // A row with nothing usable to say is dropped rather than guessed at: a day entered with a
  // count of zero would mark a tile as holding memories it does not hold (FR-010).
  it('ignores a row with no usable date or no usable count', () => {
    const index = buildIndex([
      { day: 'sometime', precision: 'day', count: 1 },
      { day: null, precision: 'day', count: 1 },
      { day: '2026-03-05', precision: 'day', count: 0 },
      { day: '2026-03-06', precision: 'day' },
      { day: '2026-03-07', precision: 'day', count: 'two' },
      { day: '2026-03-08', precision: 'decade', count: 1 },
      null,
    ]);

    expect(index.days.size).toBe(0);
    expect(index.months.size).toBe(0);
    expect(index.years.size).toBe(0);
  });

  it('is always a usable index, even for no rows at all', () => {
    [undefined, null, 'rows', []].forEach((bad) => {
      const index = buildIndex(bad);

      expect(index.days instanceof Map).toBe(true);
      expect(index.days.size).toBe(0);
      expect(index.months.size).toBe(0);
      expect(index.years.size).toBe(0);
      expect(index.roughMonths.size).toBe(0);
      expect(index.roughYears.size).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Neighbours (FR-007, FR-008; research R7)
// ---------------------------------------------------------------------------

describe('neighbourMonth and neighbourYear', () => {
  const index = buildIndex([
    { day: '2024-11-02', precision: 'day', count: 1 },
    { day: '2026-03-05', precision: 'day', count: 2 },
    { day: '2026-07-01', precision: 'month', count: 1 },
    { day: '2019-01-01', precision: 'year', count: 4 },
  ]);
  // months: 2024-11, 2026-03, 2026-07.   years: 2019, 2024, 2026.

  /**
   * FR-007: *"◄ ► and the swipe MUST move to the earlier or later month (or year) with
   * memories, stopping where there is none."* With FR-008: +1 is the later one.
   */
  it('FR-007/FR-008: +1 is the next later month with memories, -1 the earlier one', () => {
    expect(neighbourMonth(index, { year: 2024, month: 11 }, 1))
      .toEqual({ kind: 'month', year: 2026, month: 3 });
    expect(neighbourMonth(index, { year: 2026, month: 3 }, 1))
      .toEqual({ kind: 'month', year: 2026, month: 7 });
    expect(neighbourMonth(index, { year: 2026, month: 7 }, -1))
      .toEqual({ kind: 'month', year: 2026, month: 3 });
  });

  it('FR-007: stops where there is none, rather than wrapping round', () => {
    expect(neighbourMonth(index, { year: 2026, month: 7 }, 1)).toBeNull();
    expect(neighbourMonth(index, { year: 2024, month: 11 }, -1)).toBeNull();
    expect(neighbourYear(index, { year: 2026 }, 1)).toBeNull();
    expect(neighbourYear(index, { year: 2019 }, -1)).toBeNull();
  });

  it('FR-007/FR-008: steps years the same way, over the years with memories', () => {
    expect(neighbourYear(index, { year: 2019 }, 1)).toEqual({ kind: 'year', year: 2024 });
    expect(neighbourYear(index, { year: 2024 }, 1)).toEqual({ kind: 'year', year: 2026 });
    expect(neighbourYear(index, { year: 2024 }, -1)).toEqual({ kind: 'year', year: 2019 });
  });

  /**
   * Research R7: the neighbour must be defined for a starting month that is **not in the
   * index** -- a month whose last memory has just been deleted is still the month on screen,
   * and its ◄ ► must keep working. So the answer is read from where that month *would* sort,
   * never from whether it is there.
   */
  it('R7: answers for a month or year that holds nothing at all', () => {
    expect(neighbourMonth(index, { year: 2025, month: 6 }, 1))
      .toEqual({ kind: 'month', year: 2026, month: 3 });
    expect(neighbourMonth(index, { year: 2025, month: 6 }, -1))
      .toEqual({ kind: 'month', year: 2024, month: 11 });
    expect(neighbourYear(index, { year: 2022 }, 1)).toEqual({ kind: 'year', year: 2024 });
    expect(neighbourYear(index, { year: 2022 }, -1)).toEqual({ kind: 'year', year: 2019 });
  });

  it('counts a month with only rough-dated memories as a month with memories', () => {
    // July 2026 is in the index only because of a month-only memory, and ► must still reach
    // it -- FR-016: a 1st holding only rough-dated memories is reached through its month.
    expect(index.days.has('2026-07-01')).toBe(false);
    expect(neighbourMonth(index, { year: 2026, month: 4 }, 1))
      .toEqual({ kind: 'month', year: 2026, month: 7 });
  });

  it('skips the right number of periods for a larger step', () => {
    expect(neighbourMonth(index, { year: 2024, month: 11 }, 2))
      .toEqual({ kind: 'month', year: 2026, month: 7 });
    expect(neighbourMonth(index, { year: 2024, month: 11 }, 3)).toBeNull();
    expect(neighbourYear(index, { year: 2026 }, -2)).toEqual({ kind: 'year', year: 2019 });
  });

  // A step of none asks a different question -- "is this period still a period with
  // memories?" -- which is what a month that has just lost its last memory needs answered.
  it('answers a zero step only when the period itself still holds a memory', () => {
    expect(neighbourMonth(index, { year: 2026, month: 3 }, 0))
      .toEqual({ kind: 'month', year: 2026, month: 3 });
    expect(neighbourMonth(index, { year: 2025, month: 6 }, 0)).toBeNull();
    expect(neighbourYear(index, { year: 2026 }, 0)).toEqual({ kind: 'year', year: 2026 });
    expect(neighbourYear(index, { year: 2022 }, 0)).toBeNull();
  });

  it('answers null rather than throwing for an unusable index or period', () => {
    expect(neighbourMonth(null, { year: 2026, month: 3 }, 1)).toBeNull();
    expect(neighbourMonth({}, { year: 2026, month: 3 }, 1)).toBeNull();
    expect(neighbourMonth(index, null, 1)).toBeNull();
    expect(neighbourMonth(index, { year: 2026 }, 1)).toBeNull();
    expect(neighbourMonth(index, { year: 2026, month: 13 }, 1)).toBeNull();
    expect(neighbourMonth(index, { year: 2026, month: 3 }, 1.5)).toBeNull();
    expect(neighbourYear(index, { year: '2026' }, 1)).toBeNull();
    expect(neighbourYear(buildIndex([]), { year: 2026 }, 1)).toBeNull();
    // The index's keys are four digits wide and compared as strings, so a year that cannot
    // be compared against them is refused rather than answered wrongly ('999' > '2026').
    expect(neighbourYear(index, { year: 999 }, 1)).toBeNull();
    expect(neighbourMonth(index, { year: 999, month: 6 }, 1)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildRows, a month (FR-005; research R8)
// ---------------------------------------------------------------------------

describe('buildRows: a month', () => {
  const march = { kind: 'month', year: 2026, month: 3 };

  // Deliberately seeded in no useful order, with the two memories of the 5th the other way
  // round, so an implementation that merely kept the order it was given would visibly
  // disagree with the assertions below rather than accidentally agree with them.
  const entries = [
    entry('e-17', '2026-03-17', '2026-03-17T09:00:00.000Z'),
    entry('e-05-late', '2026-03-05', '2026-03-05T18:00:00.000Z'),
    entry('e-rough', '2026-03-01', '2026-03-20T08:00:00.000Z', 'month'),
    entry('e-05-early', '2026-03-05', '2026-03-05T07:00:00.000Z'),
  ];

  /**
   * FR-005: *"Picking a month MUST list every memory of that month ... in date order (oldest
   * first, within a day too), with month-only memories last, under a small grey heading per
   * day ("Thu 5 March") and "March 2026" for month-only memories."*
   */
  it('FR-005: oldest first, within a day too, under a grey heading per day', () => {
    const { rows } = buildRows(entries, march);

    expect(kinds(rows)).toEqual([
      'dayHeading', 'entry', 'entry',   // the 5th: early, then late
      'dayHeading', 'entry',            // the 17th
      'dayHeading', 'entry',            // March 2026, day not known
    ]);
    expect(entryIds(rows)).toEqual(['e-05-early', 'e-05-late', 'e-17', 'e-rough']);
  });

  it('FR-005: a day heading reads "Thu 5 March" -- weekday, day, month, no year', () => {
    const { rows } = buildRows(entries, march);

    expect(labels(rows)).toEqual(['Thu 5 March', 'Tue 17 March', 'March 2026']);
  });

  /**
   * FR-005 again, and FR-011: month-only memories come **last**, under "March 2026", and are
   * never listed as a day's. Seeding one dated 2 March rather than the 1st proves the
   * grouping is by precision and not by the day the stored date happens to carry.
   */
  it('FR-005/FR-011: month-only memories come last, under "March 2026", never as a day', () => {
    const { rows } = buildRows([
      entry('e-rough', '2026-03-02', '2026-03-20T08:00:00.000Z', 'month'),
      entry('e-day', '2026-03-05', '2026-03-05T07:00:00.000Z'),
    ], march);

    expect(labels(rows)).toEqual(['Thu 5 March', 'March 2026']);
    expect(entryIds(rows)).toEqual(['e-day', 'e-rough']);
  });

  it('keys an entry row by its localId and a heading row by its own period (R8)', () => {
    const { rows } = buildRows(entries, march);

    expect(rows.map((row) => row.key)).toEqual([
      '2026-03-05', 'e-05-early', 'e-05-late',
      '2026-03-17', 'e-17',
      '2026-03:rough', 'e-rough',
    ]);
  });

  it('hands back the entry itself on an entry row, for the unchanged card to draw', () => {
    const { rows } = buildRows(entries, march);

    expect(rows.find((row) => row.key === 'e-17').entry).toBe(entries[0]);
  });

  // R8: only month headings stick, and a month list has none of those.
  it('R8: a month list has no sticky rows -- a day heading never sticks', () => {
    const { stickyIndices } = buildRows(entries, march);

    expect(stickyIndices).toEqual([]);
  });

  it('leaves out anything that is not this month', () => {
    const { rows } = buildRows([
      ...entries,
      entry('e-feb', '2026-02-28', '2026-02-28T09:00:00.000Z'),
      entry('e-apr', '2026-04-01', '2026-04-01T09:00:00.000Z'),
      entry('e-2025', '2025-03-05', '2025-03-05T09:00:00.000Z'),
    ], march);

    expect(entryIds(rows)).toEqual(['e-05-early', 'e-05-late', 'e-17', 'e-rough']);
  });

  /**
   * FR-016 keeps a year-only memory on 1 January of its own *day* page, and a year is not a
   * month: a memory known only to 2026 is reached through the year, never listed as one of
   * March's. T006 asks the database for the day and month precisions only, so this is the
   * same answer in the model and the two cannot disagree.
   */
  it('FR-016: a year-only memory is not one of a month\'s, even when dated in it', () => {
    const { rows } = buildRows([
      entry('e-year', '2026-03-01', '2026-03-01T09:00:00.000Z', 'year'),
      entry('e-day', '2026-03-05', '2026-03-05T07:00:00.000Z'),
    ], march);

    expect(entryIds(rows)).toEqual(['e-day']);
  });

  it('is an empty list for a month with nothing in it, never a bare heading', () => {
    expect(buildRows([], march)).toEqual({ rows: [], stickyIndices: [] });
  });

  it('leaves out an entry only when nothing at all says which day it is on', () => {
    const { rows } = buildRows([
      entry('e-nothing', null, null),
      entry('e-junk', 'sometime in March', 'whenever'),
      entry('e-good', '2026-03-05', '3'),
    ], march);

    expect(entryIds(rows)).toEqual(['e-good']);
  });

  // The defensive path, in a list: a memory with no stored date is listed on the day it was
  // created rather than listed nowhere (FR-005, FR-010; see `dayKeyOf`). Mid-month and
  // mid-day, so it is in March in all three of test-tz's zones; the day it lands on is
  // asserted as `toDateKey`'s answer rather than written out, which would move with the zone.
  it('FR-005/FR-010: lists an entry with no stored date on its created day', () => {
    const created = '2026-03-15T12:00:00.000Z';
    const { rows } = buildRows([entry('e-fallback', null, created)], march);

    expect(entryIds(rows)).toEqual(['e-fallback']);
    expect(rows[0].kind).toBe('dayHeading');
    expect(rows[0].key).toBe(toDateKey(created));
  });

  /**
   * The same refusal `neighbourMonth` and `neighbourYear` make. An index key is four digits
   * wide and compared as a string, so a year that cannot be compared against one is refused
   * rather than answered -- and refused the same way whichever function is asked, because an
   * empty list reads on screen as "this month holds nothing", which is a different claim.
   */
  it('refuses a year too narrow to compare, as the neighbour functions do', () => {
    const ancient = [entry('e', '0999-03-05', '1')];

    expect(buildRows(ancient, { kind: 'month', year: 999, month: 3 }))
      .toEqual({ rows: [], stickyIndices: [] });
    expect(buildRows(ancient, { kind: 'year', year: 999 }))
      .toEqual({ rows: [], stickyIndices: [] });
  });

  // Day mode is the Journal's own feed, drawn exactly as today (FR-004): no headings, so no
  // rows from here. The headings appear only in month and year lists (FR-005).
  it('is an empty list for a day pick, or for no pick at all', () => {
    [null, undefined, { kind: 'day', date: '2026-03-05' }, {}, 'month'].forEach((picked) => {
      expect(buildRows(entries, picked).rows).toEqual([]);
    });
  });

  it('answers an empty list rather than throwing for unusable entries', () => {
    expect(buildRows(null, march).rows).toEqual([]);
    expect(buildRows([null, undefined], march).rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildRows, a year (FR-006; research R8)
// ---------------------------------------------------------------------------

describe('buildRows: a year', () => {
  const year2026 = { kind: 'year', year: 2026 };

  const entries = [
    entry('e-jul', '2026-07-04', '2026-07-04T09:00:00.000Z'),
    entry('e-mar-05', '2026-03-05', '2026-03-05T07:00:00.000Z'),
    entry('e-mar-rough', '2026-03-01', '2026-03-20T08:00:00.000Z', 'month'),
    entry('e-mar-17', '2026-03-17', '2026-03-17T09:00:00.000Z'),
    entry('e-year-rough', '2026-01-01', '2026-12-01T08:00:00.000Z', 'year'),
  ];

  /**
   * FR-006: *"Picking a year MUST show one heading per month with memories, in calendar
   * order, plus a final "YYYY, month not known" heading when needed."*
   */
  it('FR-006: one heading per month with memories, in calendar order, the rough one last', () => {
    const { rows, stickyIndices } = buildRows(entries, year2026);

    expect(rows.filter((row) => row.kind === 'monthHeading').map((row) => row.label))
      .toEqual(['March 2026', 'July 2026', '2026, month not known']);
    // The heading rows in list order, which is also how T007 finds the one to open when a
    // year is picked: `rows[stickyIndices[0]].key` (FR-006).
    expect(stickyIndices.map((i) => rows[i].key)).toEqual(['2026-03', '2026-07', '2026:rough']);
    expect(rows[stickyIndices[0]].key).toBe('2026-03');
  });

  it('FR-007: a month heading carries its own count', () => {
    const { rows } = buildRows(entries, year2026);

    expect(rows.filter((row) => row.kind === 'monthHeading').map((row) => [row.key, row.count]))
      .toEqual([['2026-03', 3], ['2026-07', 1], ['2026:rough', 1]]);
  });

  /**
   * FR-006: *"A tap opens a heading's cards below it at full width, or closes them."* Which
   * months are open is the screen's own state (`openMonths`, data-model); this turns that set
   * into rows, and a closed month contributes its heading and nothing else.
   */
  it('FR-006: only an open month\'s cards are listed below its heading', () => {
    const { rows } = buildRows(entries, year2026, new Set(['2026-07']));

    expect(kinds(rows)).toEqual([
      'monthHeading',                          // March, closed
      'monthHeading', 'dayHeading', 'entry',   // July, open
      'monthHeading',                          // 2026, month not known, closed
    ]);
    expect(rows.filter((row) => row.kind === 'monthHeading').map((row) => row.open))
      .toEqual([false, true, false]);
    expect(entryIds(rows)).toEqual(['e-jul']);
  });

  it('takes the open months as an array as readily as a Set, and nothing as none open', () => {
    expect(entryIds(buildRows(entries, year2026, ['2026-07']).rows)).toEqual(['e-jul']);
    expect(entryIds(buildRows(entries, year2026).rows)).toEqual([]);
    expect(entryIds(buildRows(entries, year2026, null).rows)).toEqual([]);
  });

  /**
   * FR-005's grey day headings *"appear only in month and year lists"* -- in both of them --
   * so inside an open month of a year the memories are grouped by day exactly as in a month
   * list: oldest first, with that month's month-only memories last under "March 2026".
   */
  it('FR-005/FR-006: an open month is grouped by day, oldest first, rough last', () => {
    const { rows } = buildRows(entries, year2026, new Set(['2026-03']));

    expect(kinds(rows)).toEqual([
      'monthHeading', 'dayHeading', 'entry', 'dayHeading', 'entry', 'dayHeading', 'entry',
      'monthHeading',
      'monthHeading',
    ]);
    expect(labels(rows)).toEqual([
      'March 2026', 'Thu 5 March', 'Tue 17 March', 'March 2026',
      'July 2026',
      '2026, month not known',
    ]);
    expect(entryIds(rows)).toEqual(['e-mar-05', 'e-mar-17', 'e-mar-rough']);
  });

  it('FR-006: the "month not known" memories are listed when that heading is open', () => {
    const { rows } = buildRows(entries, year2026, new Set(['2026:rough']));

    expect(kinds(rows)).toEqual(['monthHeading', 'monthHeading', 'monthHeading', 'entry']);
    expect(entryIds(rows)).toEqual(['e-year-rough']);
  });

  it('FR-006: leaves the final heading out when every memory has a month', () => {
    const { rows, stickyIndices } = buildRows([entries[0], entries[1]], year2026);

    expect(labels(rows)).toEqual(['March 2026', 'July 2026']);
    expect(stickyIndices.map((i) => rows[i].key)).toEqual(['2026-03', '2026-07']);
  });

  /**
   * R8: *"In a year, `stickyHeaderIndices` lists the indices of the **month heading** rows
   * only, so day headings never stick."*
   */
  it('R8: stickyIndices are the month heading rows and nothing else', () => {
    const { rows, stickyIndices } = buildRows(entries, year2026, new Set(['2026-03']));

    expect(stickyIndices).toEqual([0, 7, 8]);
    stickyIndices.forEach((i) => expect(rows[i].kind).toBe('monthHeading'));
    expect(rows.filter((row) => row.kind === 'monthHeading'))
      .toHaveLength(stickyIndices.length);
  });

  it('leaves out anything that is not this year', () => {
    const { rows } = buildRows([
      ...entries,
      entry('e-2025', '2025-12-31', '2025-12-31T09:00:00.000Z'),
      entry('e-2027', '2027-01-01', '2027-01-01T09:00:00.000Z'),
    ], year2026, new Set(['2026-03', '2026-07', '2026:rough']));

    expect(entryIds(rows))
      .toEqual(['e-mar-05', 'e-mar-17', 'e-mar-rough', 'e-jul', 'e-year-rough']);
  });

  it('is an empty list for a year with nothing in it', () => {
    expect(buildRows([], year2026)).toEqual({ rows: [], stickyIndices: [] });
  });
});

// ---------------------------------------------------------------------------
// SC-004 in the model: a stored instant still lands on the day it names
// ---------------------------------------------------------------------------

/**
 * SC-004: *"Zero memories shown on a different day when the phone's time zone is changed
 * (three zones, west and east of Greenwich)."*
 *
 * Proving that properly means running the whole file in three zones, which is
 * `scripts/test-tz.mjs`'s job. What is exercised here is the thing that moves when it goes
 * wrong: a date that carries a time. `2026-03-05T23:30:00Z` read as an instant is the 6th in
 * Auckland, and `2026-03-01T00:30:00Z` is 28 February in Los Angeles -- so one memory would
 * change day and the other would leave the month altogether. Read as a civil date, neither
 * moves anywhere, in any zone.
 */
describe('SC-004: a date that carries a time never moves day', () => {
  const march = { kind: 'month', year: 2026, month: 3 };

  const entries = [
    entry('e-late-night', '2026-03-05T23:30:00.000Z', '2026-03-05T23:30:00.000Z'),
    entry('e-first-morning', '2026-03-01T00:30:00.000Z', '2026-03-01T00:30:00.000Z'),
  ];

  it('groups it under the day its own key names', () => {
    const { rows } = buildRows(entries, march);

    expect(labels(rows)).toEqual(['Sun 1 March', 'Thu 5 March']);
    expect(entryIds(rows)).toEqual(['e-first-morning', 'e-late-night']);
  });

  it('keeps it in the month its own key names', () => {
    const { rows } = buildRows(entries, { kind: 'year', year: 2026 }, ['2026-03']);

    expect(rows.filter((row) => row.kind === 'monthHeading').map((row) => row.key))
      .toEqual(['2026-03']);
    expect(entryIds(rows)).toEqual(['e-first-morning', 'e-late-night']);
  });

  it('counts it on the day its own key names', () => {
    const index = buildIndex([
      { day: '2026-03-05T23:30:00.000Z', precision: 'day', count: 1 },
      { day: '2026-03-01T00:30:00.000Z', precision: 'day', count: 1 },
    ]);

    expect([...index.days.keys()].sort()).toEqual(['2026-03-01', '2026-03-05']);
    expect(index.months.get('2026-03')).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// isDescending (the one reading of `order`, shared with T003's SQL)
// ---------------------------------------------------------------------------

/**
 * The rule `filterRange` sorts by and `DatabaseService.getEntriesInRange` turns into the
 * direction of its `ORDER BY`. Exported so that there is one copy of it rather than two: a
 * month list that read oldest-first on a phone and newest-first on the web build would be two
 * different screens, and two copies of "`'DESC'` in any case" agree only until one is changed.
 */
describe('isDescending', () => {
  it('reads only DESC as newest first, and without regard to case', () => {
    expect(isDescending('DESC')).toBe(true);
    expect(isDescending('desc')).toBe(true);
    expect(isDescending('Desc')).toBe(true);
  });

  it('reads anything else, and nothing at all, as the calendar order', () => {
    expect(isDescending('ASC')).toBe(false);
    expect(isDescending('descending')).toBe(false);
    expect(isDescending(undefined)).toBe(false);
    expect(isDescending(null)).toBe(false);
    expect(isDescending(-1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// filterRange (T003's SQL, in JS, for the web build of the app -- research R2)
// ---------------------------------------------------------------------------

describe('filterRange', () => {
  const entries = [
    entry('e-mar-17', '2026-03-17', '2026-03-17T09:00:00.000Z'),
    entry('e-mar-05-late', '2026-03-05', '2026-03-05T18:00:00.000Z'),
    entry('e-mar-05-early', '2026-03-05', '2026-03-05T07:00:00.000Z'),
    entry('e-mar-rough', '2026-03-01', '2026-03-20T08:00:00.000Z', 'month'),
    entry('e-year-rough', '2026-01-01', '2026-12-01T08:00:00.000Z', 'year'),
    entry('e-apr', '2026-04-01', '2026-04-01T09:00:00.000Z'),
    entry('e-feb', '2026-02-28', '2026-02-28T09:00:00.000Z'),
  ];

  const ids = (list) => list.map((e) => e.localId);

  /**
   * FR-005/FR-006 calendar order, which is what the SQL asks for too: ascending by day, then
   * by created time. The whole reason this exists is that the web build's database shim
   * ignores ranges and ordering (research R2), so the answer has to be computed in JS -- and
   * a different order on web would be a different screen.
   */
  it('FR-005: a month is ascending by day, then by created time', () => {
    expect(ids(filterRange(entries, '2026-03-01', '2026-03-31', ['day', 'month'])))
      .toEqual(['e-mar-rough', 'e-mar-05-early', 'e-mar-05-late', 'e-mar-17']);
  });

  /**
   * FR-004: *"Picking a day MUST show that day ... in today's order (newest first)."* T003
   * passes `'DESC'` for a single day, so the day page keeps the order the feed has today.
   */
  it('FR-004: a single day asked for DESC is newest first', () => {
    expect(ids(filterRange(entries, '2026-03-05', '2026-03-05', ['day', 'month', 'year'], 'DESC')))
      .toEqual(['e-mar-05-late', 'e-mar-05-early']);
  });

  // The SQL spells it `DESC`; a caller spelling it in lower case means the same thing, and
  // reading it as "not DESC" would quietly hand a day back oldest first (FR-004).
  it('reads the order without regard to case, and anything else as calendar order', () => {
    expect(ids(filterRange(entries, '2026-03-05', '2026-03-05', ['day'], 'desc')))
      .toEqual(['e-mar-05-late', 'e-mar-05-early']);
    expect(ids(filterRange(entries, '2026-03-05', '2026-03-05', ['day'], 'ASC')))
      .toEqual(['e-mar-05-early', 'e-mar-05-late']);
    expect(ids(filterRange(entries, '2026-03-05', '2026-03-05', ['day'], undefined)))
      .toEqual(['e-mar-05-early', 'e-mar-05-late']);
  });

  it('is inclusive of both ends of the range', () => {
    expect(ids(filterRange(entries, '2026-02-28', '2026-04-01', null)))
      .toEqual(['e-feb', 'e-mar-rough', 'e-mar-05-early', 'e-mar-05-late', 'e-mar-17', 'e-apr']);
  });

  it('filters by precision, reading a missing precision as a day', () => {
    expect(ids(filterRange(entries, '2026-01-01', '2026-12-31', ['year'])))
      .toEqual(['e-year-rough']);
    expect(ids(filterRange(entries, '2026-03-01', '2026-03-31', ['day'])))
      .toEqual(['e-mar-05-early', 'e-mar-05-late', 'e-mar-17']);
  });

  // No precision list at all means every precision, which is how a whole day is asked for
  // (FR-016's placement). An empty list means none, exactly as SQL's `IN ()` matches nothing.
  it('reads no precision list as every precision, and an empty one as none', () => {
    expect(ids(filterRange(entries, '2026-03-05', '2026-03-05'))).toHaveLength(2);
    expect(filterRange(entries, '2026-03-05', '2026-03-05', [])).toEqual([]);
  });

  /**
   * SC-004 again, where T003's SQL answers it with `substr(date, 1, 10)`: the day is compared
   * as its civil-date key, so a row holding a full instant lands on the day its key names in
   * every zone -- it neither changes day nor leaves the month.
   */
  it('SC-004: compares the civil day of a full instant, never the instant', () => {
    const instants = [
      entry('e-late-night', '2026-03-05T23:30:00.000Z', '2026-03-05T23:30:00.000Z'),
      entry('e-first-morning', '2026-03-01T00:30:00.000Z', '2026-03-01T00:30:00.000Z'),
    ];

    expect(ids(filterRange(instants, '2026-03-01', '2026-03-31', ['day'])))
      .toEqual(['e-first-morning', 'e-late-night']);
    expect(ids(filterRange(instants, '2026-03-05', '2026-03-05', ['day'])))
      .toEqual(['e-late-night']);
  });

  it('orders numeric created times numerically, not as strings', () => {
    const sameDay = [entry('e-9', '2026-03-05', 9), entry('e-10', '2026-03-05', 10)];

    expect(ids(filterRange(sameDay, '2026-03-05', '2026-03-05', ['day'])))
      .toEqual(['e-9', 'e-10']);
    expect(ids(filterRange(sameDay, '2026-03-05', '2026-03-05', ['day'], 'DESC')))
      .toEqual(['e-10', 'e-9']);
  });

  it('holds the given order for two memories that cannot be told apart', () => {
    const tied = [
      entry('e-first', '2026-03-05', '2026-03-05T07:00:00.000Z'),
      entry('e-second', '2026-03-05', '2026-03-05T07:00:00.000Z'),
    ];

    expect(ids(filterRange(tied, '2026-03-05', '2026-03-05', ['day'])))
      .toEqual(['e-first', 'e-second']);
    expect(ids(filterRange(tied, '2026-03-05', '2026-03-05', ['day'], 'DESC')))
      .toEqual(['e-first', 'e-second']);
  });

  it('answers an empty list rather than throwing for unusable arguments', () => {
    expect(filterRange(null, '2026-03-01', '2026-03-31')).toEqual([]);
    expect(filterRange(entries, null, '2026-03-31')).toEqual([]);
    expect(filterRange(entries, '2026-03-01', null)).toEqual([]);
    expect(filterRange([entry('e', null, '1')], '2026-03-01', '2026-03-31')).toEqual([]);
  });

  it('never hands back the array it was given, so a caller cannot sort the feed by accident', () => {
    const given = [entry('e', '2026-03-05', '1')];
    const got = filterRange(given, '2026-03-01', '2026-03-31');

    expect(got).not.toBe(given);
    expect(got[0]).toBe(given[0]);
  });
});

// ---------------------------------------------------------------------------
// The civil-date guard (FR-011; `journalDate.js`'s header)
// ---------------------------------------------------------------------------

describe('the civil-date guard: no date string parsed as an instant', () => {
  /**
   * 016's own files, and the two existing files it edits. Both of those are free of the
   * spelling today, so listing them is a real guard rather than a standing failure.
   *
   * Named one file at a time, never as a folder: a folder scan cannot tell a file that is
   * clean from a file that was never written. A file a later task has not written yet is
   * skipped with a note, unless `CALENDAR_FILES_STRICT=1` -- which `scripts/test-tz.mjs
   * --strict` sets, so the feature's final run proves every listed file was really read.
   */
  const GUARDED_FILES = [
    'src/utils/calendarModel.js',
    'src/utils/__tests__/calendarModel.test.js',
    'src/components/journal/CalendarSheet.js',
    'src/components/journal/CalendarSheet.web.js',
    'src/components/journal/CalendarListHeading.js',
    'src/screens/JournalScreen.js',
    'src/services/DatabaseService.js',
    'scripts/test-tz.mjs',
  ];

  const ROOT = path.resolve(__dirname, '../../..');
  const strict = process.env.CALENDAR_FILES_STRICT === '1';

  /**
   * Every spelling of the same defect, not only the single-quoted one: a date-only string
   * parses as UTC midnight however it is quoted. Run over the whole file rather than line by
   * line, and with `\s*` between, so a call broken across two lines is caught as readily as
   * one written on a single line -- then the line number is counted back from the offset, so
   * a failure still names where to look.
   */
  const INSTANT_PARSE = /new Date\(\s*['"`]/g;

  const offendingLines = (text, relative) => {
    const found = [];
    const pattern = new RegExp(INSTANT_PARSE.source, 'g');

    let match = pattern.exec(text);
    while (match) {
      const line = text.slice(0, match.index).split(/\r?\n/).length;
      found.push(`${relative}:${line}: ${text.split(/\r?\n/)[line - 1].trim()}`);
      match = pattern.exec(text);
    }
    return found;
  };

  it('reads at least this feature\'s own model and its tests', () => {
    const present = GUARDED_FILES.filter((file) => fs.existsSync(path.join(ROOT, file)));

    expect(present).toContain('src/utils/calendarModel.js');
    expect(present).toContain('src/utils/__tests__/calendarModel.test.js');
  });

  /**
   * The guard checked against itself, because a grep that matches nothing passes for ever
   * and proves nothing. The samples are assembled out of pieces so that this file does not
   * contain the spelling it bans -- which would make the guard flag its own test.
   */
  it('catches the spelling it bans, on one line or across two', () => {
    const onOneLine = `const d = new Date(${"'"}2026-03-05${"'"});`;
    const acrossTwo = `const d = new Date(\n  ${'"'}2026-03-05${'"'},\n);`;

    expect(offendingLines(onOneLine, 'sample.js')).toHaveLength(1);
    // The line it names, quoted back rather than written out here: this file may not contain
    // the spelling, or the guard would -- rightly -- flag its own test.
    expect(offendingLines(acrossTwo, 'sample.js'))
      .toEqual([`sample.js:1: ${acrossTwo.split('\n')[0]}`]);
    // The one spelling that is allowed, and the one this module itself uses: numeric parts.
    expect(offendingLines('const d = new Date(year, month - 1, day);', 'sample.js')).toEqual([]);
  });

  const scanned = GUARDED_FILES.filter((file) => fs.existsSync(path.join(ROOT, file)));
  const notYetWritten = GUARDED_FILES.filter((file) => !fs.existsSync(path.join(ROOT, file)));

  scanned.forEach((relative) => {
    it(`${relative} parses no date string as an instant`, () => {
      const text = fs.readFileSync(path.join(ROOT, relative), 'utf8');

      expect(offendingLines(text, relative)).toEqual([]);
    });
  });

  /**
   * A file a later task of 016 has not written yet.
   *
   * `it.todo` rather than a passing test with a `console.warn`: jest reports it as a todo in
   * its own summary, which says "not scanned yet" exactly as plainly, while leaving a normal
   * run's output clean -- three warnings in `npx jest` became nine in `node
   * scripts/test-tz.mjs`, and noise in a test run is how real warnings come to be ignored.
   * Under `--strict` (T010's run) the same file is a failing test instead.
   */
  notYetWritten.forEach((relative) => {
    if (strict) {
      it(`${relative} parses no date string as an instant`, () => {
        throw new Error(`${relative} does not exist (CALENDAR_FILES_STRICT=1)`);
      });
      return;
    }
    it.todo(`${relative} parses no date string as an instant (not written yet)`);
  });
});
