/**
 * 016: the phone calendar's pure model.
 *
 * Everything here works in integers and strings -- a year, a month, a day, a `YYYY-MM-DD`
 * key -- never a moment in time (FR-011). A memory dated 5 March happened on 5 March for a
 * reader in Auckland and for a reader in Los Angeles, and nothing in this module may let that
 * slip: no date string is ever handed to the `Date` constructor. The one `Date` this file
 * builds is built from numeric parts (year, month minus one, day), which is a local calendar
 * day and not an instant read back through a timezone -- the same pattern `journalDate.js`
 * uses, and the trap its header describes. `src/utils/__tests__/calendarModel.test.js`
 * greps this file to keep it that way.
 *
 * No React, no database: one responsibility, which is to turn calendar arithmetic and the
 * calendar index into plain data that a screen, the sheet or a list can read. The phone's own
 * module, deliberately: the web's feature-014 equivalent is a reference, never a dependency,
 * and nothing is shared between the two.
 *
 * Its one import is `periodDate.js`, which is pure, dependency-free and sits in this same
 * directory. It is the canonical home of the twelve month names and of the leap rule, and a
 * second copy of either here would be a second thing to keep in step -- so `daysInMonth` is
 * re-exported from there rather than rewritten, and the month wording comes from there too.
 * The dependency runs in one direction only, `calendarModel` → `periodDate`, so there is no
 * cycle.
 *
 * Who reads what:
 *
 *   `dayKeyOf`                                  which civil day an entry is on (T005-T007)
 *   `daysInMonth`, `monthGrid`, `monthKey`,
 *   `WEEKDAY_NAMES`                             the sheet's Date view (T004)
 *   `stepMonth`, `stepYear`, `stepWindow`,
 *   `windowStartFor`                            the sheet's ◄ ► (T004)
 *   `neighbourMonth`, `neighbourYear`           the date bar's ◄ ► and the swipe (T006, T007)
 *   `buildIndex`                                the index behind faded tiles and counts (T005)
 *   `buildRows`                                 the month and year lists (T006, T007)
 *   `filterRange`                               the web build's stand-in for T003's SQL
 *   `isDescending`                              the one reading of `order` (`filterRange`, T003)
 *   `fourDigitYear`                             the one reading of "is this a year at all" --
 *                                               asked here and by `JournalScreen.rangeFor` (T006)
 *   `WEEKDAY_NAMES_FULL`, `dayTileWords`        a day tile's spoken label (T009, FR-014) --
 *                                               `CalendarSheetBody.js`'s day tiles read it rather
 *                                               than keeping a second weekday list of their own
 *
 * Days are **not** stepped here: `journalDate.adjacentDateKey` already does that, and it is
 * the one place that answers it (research R7). Months and years are what it cannot take.
 *
 * ⚠ **`dayKeyOf` is deliberately not `journalDate.toDateKey`.** The two agree on a plain
 * `YYYY-MM-DD` and disagree on a date that carries a time: `toDateKey` falls through to
 * `new Date(value)` and then reads the device's *local* calendar parts, so
 * `2026-03-05T23:30:00Z` is the 5th in London and the 6th in Auckland -- the stored day moves
 * with the reader. This module takes the leading `YYYY-MM-DD` and stops, which is the
 * zone-stable answer FR-011 and SC-004 require, and the same answer T003's SQL gives with
 * `substr(date, 1, 10)` ("a test row holding a full ISO instant still lands on the day its
 * key names"). So the calendar, the lists and the queries all place a memory on one day, and
 * `dayKeyOf` is exported so that Tasks 5-7 ask this module rather than reaching for
 * `toDateKey` and getting the other answer.
 */

import { daysInMonth, monthName, formatPeriodDate } from './periodDate';

/**
 * Fixed names rather than a formatted date, for the same reason `periodDate.js` keeps its
 * month names: a heading read out of the device's locale would change wording from phone to
 * phone, and FR-005 words these headings exactly ("Thu 5 March"). `periodDate` has no
 * weekdays of its own -- it never needs one -- so this is the only list here.
 *
 * Exported since T004, for the one other thing that needs these seven words: the column heads
 * over the calendar sheet's day grid. They are the same seven words in the same order, and a
 * second copy of them in a component -- in **two** components, since the sheet has a `.web.js`
 * variant -- is two more things to keep in step with a day heading. So the list stays here,
 * which is where this file's header already says it belongs, and the sheet reads it.
 */
export const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * The same seven days, in full -- "Sunday" rather than "Sun" -- for T009's spoken day-tile
 * labels (FR-014: "Thursday 5 March 2026"), which name a day in full because a screen reader has
 * no three-letter column head to lean on the way a sighted reader does.
 *
 * Exported and kept here rather than in `CalendarSheetBody.js`, for the exact reason
 * `WEEKDAY_NAMES` above already is: a second weekday list in a component is a second thing to
 * keep in step with this one, and the day it drifted -- a reorder, a localisation -- would be
 * the day a screen reader spoke the wrong weekday for a date it was showing.
 */
export const WEEKDAY_NAMES_FULL = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

/** The leading civil date of a day key or of a full instant -- the day part, and no more. */
const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})/;

/** The suffix that names a period's rough-dated group, as the web's calendar also spells it. */
const ROUGH_SUFFIX = ':rough';

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * The civil day a stored date names: its leading `YYYY-MM-DD` and nothing else.
 *
 * A stored date may carry a time (an older row, or a server value), and the day part is the
 * only part that says which day it was. Taking it with a regex rather than by parsing is the
 * whole point: `2026-03-05T23:30:00Z` parsed as an instant is the 6th in Auckland.
 */
function keyFromDate(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(DAY_KEY);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

/**
 * The civil day an **instant** falls on, from the device's local calendar parts -- exactly
 * what `journalDate.toDateKey` does with an instant, and for the same reason: when all that
 * is known is a moment in time, the reader's own day is the best answer available.
 *
 * This is only ever asked of `createdAt`, which really is an instant. A stored `date` is a
 * civil day and is never read this way: that is the drift the module exists to prevent.
 */
function keyFromInstant(value) {
  if (value == null || value === '') return null;

  const at = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(at.getTime())) return null;

  return `${at.getFullYear()}-${pad2(at.getMonth() + 1)}-${pad2(at.getDate())}`;
}

/**
 * Which civil day something is on, as `YYYY-MM-DD`, or null when nothing says.
 *
 * Takes either a stored date string (`'2026-03-05'`, or one carrying a time) or a whole
 * entry. For an entry the stored `date` is the answer; only if it is missing or empty does
 * it fall back to the civil day of `createdAt`. The fallback is defensive -- `date` is
 * `NOT NULL` in the local schema (`src/database/schema.js`), so an entry without one cannot
 * come out of the database -- but it is the difference between a memory that is listed
 * somewhere and one that is listed nowhere, and FR-005 ("every memory of that month") and
 * FR-010 ("every memory the phone holds") are both absolute.
 *
 * **This is the one answer** to "which day is this memory on": exported so Tasks 5-7 ask
 * here rather than reaching for `journalDate.toDateKey`, which answers differently for a date
 * carrying a time -- see the ⚠ paragraph in this file's header.
 */
export function dayKeyOf(value) {
  if (value == null) return null;
  if (typeof value === 'string') return keyFromDate(value);
  if (typeof value !== 'object') return null;

  return keyFromDate(value.date) ?? keyFromInstant(value.createdAt);
}

/**
 * How much of an entry's date is real. A missing precision is a day, as everywhere else.
 *
 * Read only under the camelCase name an entry mapped by `DatabaseService._mapEntryRow`
 * carries. The raw SQL spelling (`date_precision`) is deliberately *not* accepted here, so
 * that a caller handing raw rows where mapped entries belong fails visibly rather than
 * having every rough-dated memory read as day-dated. `buildIndex` is the one function that
 * takes raw index rows, and it is the one that accepts both spellings.
 */
function precisionOf(entry) {
  return (entry && entry.datePrecision) || 'day';
}

/**
 * Whether an `order` means newest first.
 *
 * The one spelling that matters is `'DESC'`, read without regard to case, and **anything
 * else -- including nothing at all -- is the ascending calendar order**. A single day asks
 * for `'DESC'` and keeps the order the feed has today (FR-004); a month or a year asks for
 * the other and reads oldest first (FR-005, FR-006).
 *
 * Exported because it is asked in two places: here, by `filterRange`, and by
 * `DatabaseService.getEntriesInRange`, which turns it into the direction of its `ORDER BY`.
 * Those two must give one answer -- a month list that read one way on a phone and the other
 * way on the web build would be two different screens -- and two copies of "`'DESC'` in any
 * case" agree only until one of them is corrected. So there is one copy, and it is this one.
 */
export function isDescending(order) {
  return typeof order === 'string' && order.toUpperCase() === 'DESC';
}

/**
 * Created times compared as the SQL compares them: numerically when both are numbers (a
 * local row may hold epoch milliseconds), and otherwise as strings, which is chronological
 * for the ISO timestamps the app writes.
 */
function compareCreated(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;

  const sa = a == null ? '' : String(a);
  const sb = b == null ? '' : String(b);
  if (sa < sb) return -1;
  return sa > sb ? 1 : 0;
}

// ---------------------------------------------------------------------------
// daysInMonth, monthKey, monthGrid (FR-002)
// ---------------------------------------------------------------------------

/**
 * How many days a civil month has, leap years included -- `periodDate.daysInMonth`, re-exported
 * rather than rewritten.
 *
 * It is the same question `periodDate` already answers when it validates a typed-in date, and
 * the whole leap rule (the century arms included) is the kind of thing that must have one home:
 * two copies agree until the day one of them is corrected. Re-exported under this name because
 * it is the name T002's brief gives the calendar's own interface, so Tasks 3-9 read it here.
 */
export { daysInMonth };

/** A month as `YYYY-MM`. Padded, so keys sort chronologically as plain strings. */
export function monthKey(year, month) {
  return `${year}-${pad2(month)}`;
}

/**
 * Six rows of seven tiles, Sunday first. A tile is `{ key, day }` for a day of **this** month
 * or `null` for a blank -- never a neighbouring month's day, so nothing outside the month a
 * grid is for can be counted, marked or tapped (FR-002's faded, untappable empty tiles).
 *
 * Always six rows, even when five would do, so the sheet does not change height as somebody
 * steps through the months.
 */
export function monthGrid(year, month) {
  // `|| 0` because `periodDate.daysInMonth` answers `undefined` for a month that is not one,
  // and a grid is still six rows of blanks rather than a crash.
  const total = daysInMonth(year, month) || 0;

  // Numeric parts: a local calendar day, which is what `getDay()` may be asked about. A
  // date *string* here is the defect this module exists to prevent.
  const firstWeekday = new Date(year, month - 1, 1).getDay(); // 0 = Sunday

  const cells = [];
  for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
  for (let day = 1; day <= total; day += 1) {
    cells.push({ key: `${monthKey(year, month)}-${pad2(day)}`, day });
  }
  while (cells.length < 42) cells.push(null);

  const rows = [];
  for (let row = 0; row < 6; row += 1) rows.push(cells.slice(row * 7, row * 7 + 7));
  return rows;
}

// ---------------------------------------------------------------------------
// Stepping (FR-002's arrows, FR-008's direction)
// ---------------------------------------------------------------------------

/**
 * `delta` months on, wrapping the year either way.
 *
 * FR-008: a positive delta is always **later in time**. The floor division is what keeps that
 * true across December -- the arithmetic a month-only `(month + delta) % 12` gets wrong by
 * eleven months in a way that reads perfectly plausibly on screen.
 */
export function stepMonth(year, month, delta) {
  const total = (month - 1) + delta;
  return {
    year: year + Math.floor(total / 12),
    month: (((total % 12) + 12) % 12) + 1,
  };
}

/** `delta` years on. */
export function stepYear(year, delta) {
  return year + delta;
}

/** A whole twelve-year list at a time -- FR-002's "arrows by the next set". */
export function stepWindow(start, delta) {
  return start + delta * 12;
}

/**
 * The first year the twelve-year list shows for a given year: six back, so the year somebody
 * is looking at sits in the middle of the twelve rather than in a corner of them.
 */
export function windowStartFor(year) {
  return year - 6;
}

// ---------------------------------------------------------------------------
// buildIndex (data-model: calendarIndex; FR-010, FR-011)
// ---------------------------------------------------------------------------

const addTo = (map, key, count) => {
  map.set(key, (map.get(key) || 0) + count);
};

/** An index with nothing in it -- always readable, never a reason to throw. */
const emptyIndex = () => ({
  days: new Map(),
  months: new Map(),
  years: new Map(),
  roughMonths: new Map(),
  roughYears: new Map(),
});

/**
 * Five `Map`s of counts, built from the rows `getCalendarIndexRows` returns (T003): a civil
 * day, a precision and a count.
 *
 * A day-precision row -- or one with no precision at all, which means a day everywhere else
 * in the app -- counts in `days`, `months` and `years`. A month-only row counts in `months`,
 * `years` and, kept apart, `roughMonths`; **never in `days`**, which is what stops a memory
 * known only to its month from marking the 1st as a day with memories (FR-011). A year-only
 * row counts in `years` and, kept apart, `roughYears`, and so marks neither a day nor a
 * month. `roughMonths` and `roughYears` are kept apart rather than folded in because the
 * sheet needs a period's whole count *and* how much of it is only roughly dated.
 *
 * A row with no usable day, or no count above zero, is **ignored** rather than guessed at: a
 * day entered with a count of zero would mark a tile as holding memories it does not hold
 * (FR-010). Anything that is not an array of rows reads as no rows at all, so the index is
 * always ready, even before anything has loaded.
 *
 * **An unrecognised precision is dropped too**, which means a memory stored with one is
 * counted nowhere and so is reachable from nowhere in the calendar. That is deliberate and
 * it is the fail-closed choice: there are only three precisions -- the spec defines no fourth,
 * and `periodDate.parsePeriodDate` can emit no fourth -- so a row carrying one is a row this
 * module does not understand, and placing it on a day, a month or a year of this module's
 * choosing would be inventing what somebody knows about their own memory. If a fourth
 * precision is ever added, this is where it is taught.
 *
 * Both spellings of the two fields are read -- `day`/`date` and `precision`/`date_precision`
 * -- because the SQL column is `date_precision`, and a precision this failed to read would
 * silently turn every rough-dated memory into a day-dated one, which is the single thing
 * FR-011 forbids.
 */
export function buildIndex(rows) {
  const index = emptyIndex();
  if (!Array.isArray(rows)) return index;

  rows.forEach((row) => {
    if (!row) return;

    const key = dayKeyOf(typeof row.day === 'string' ? row.day : row.date);
    if (!key) return;

    const count = row.count;
    if (!Number.isFinite(count) || count <= 0) return;

    const precision = row.precision || row.date_precision || 'day';
    const month = key.slice(0, 7);
    const year = key.slice(0, 4);

    if (precision === 'day') {
      addTo(index.days, key, count);
      addTo(index.months, month, count);
      addTo(index.years, year, count);
    } else if (precision === 'month') {
      addTo(index.months, month, count);
      addTo(index.years, year, count);
      addTo(index.roughMonths, month, count);
    } else if (precision === 'year') {
      addTo(index.years, year, count);
      addTo(index.roughYears, year, count);
    }
  });

  return index;
}

// ---------------------------------------------------------------------------
// Neighbours (FR-007, FR-008; research R7)
// ---------------------------------------------------------------------------

/**
 * The key `delta` steps away among `keys`, in `delta`'s direction.
 *
 * Defined even when `key` itself is not among them (research R7): the search starts from
 * where that key *would* sort, not from whether it is there -- which is what keeps ◄ ► working
 * in a month that has just lost its last memory and is still the month on screen. A step of
 * none asks the other question, "is this period still a period with memories?", and answers
 * only when it is.
 *
 * Both month keys (`YYYY-MM`) and year keys (`YYYY`) are fixed-width and zero-padded, so
 * sorting them as strings is sorting them chronologically.
 */
/**
 * Whether a year can be compared against the index's own keys at all.
 *
 * The keys are read out of `YYYY-MM-DD` dates, so they are always four digits wide, and the
 * comparison above is a string comparison. A three-digit year would sort `'999'` *after*
 * `'2026'` and answer with a straight face; there is no such journal, so the honest answer is
 * no answer.
 *
 * **Exported because a third caller asks it** (T006 fix round 1, finding A): `JournalScreen`'s
 * `rangeFor` decides whether a picked month is readable at all, and `neighbourMonth` and
 * `monthRows` here both refuse a year this answers `false` for. Three gates have to agree on what
 * a readable month is, or the screen reads a range the model then returns no rows for -- and an
 * empty answer on a *readable* month is drawn as "0 memories / No entries yet", which is a
 * positive claim that somebody's month is empty. Two copies of "is this a four-digit year" agree
 * only until one of them is corrected, so there is one copy and it is this one.
 */
export function fourDigitYear(year) {
  return Number.isInteger(year) && year >= 1000 && year <= 9999;
}

function neighbourAmong(keys, key, delta) {
  const sorted = [...keys].sort();
  if (sorted.length === 0) return null;

  if (delta === 0) return sorted.includes(key) ? key : null;

  if (delta > 0) {
    const first = sorted.findIndex((k) => k > key);
    if (first === -1) return null;
    const target = first + (delta - 1);
    return target < sorted.length ? sorted[target] : null;
  }

  let last = -1;
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    if (sorted[i] < key) { last = i; break; }
  }
  if (last === -1) return null;

  const target = last - (Math.abs(delta) - 1);
  return target >= 0 ? sorted[target] : null;
}

/**
 * The nearest month that really holds a memory, `delta` months of them away -- as a picked
 * period, ready to become `picked`, or null when there is none.
 *
 * FR-007: ◄ ► move to the earlier or later month with memories, **stopping where there is
 * none** rather than wrapping round. FR-008: `+1` is the later one. A month that is in the
 * index only because of a rough-dated memory is a month with memories, so ► reaches it
 * (FR-016: a 1st holding only rough-dated memories is reached through its month).
 *
 * Null, never a throw, for an index or a period it cannot read: a swipe is not worth a crash.
 */
export function neighbourMonth(index, period, delta) {
  if (!index || !(index.months instanceof Map)) return null;
  if (!Number.isInteger(delta)) return null;
  if (!period || !fourDigitYear(period.year) || !Number.isInteger(period.month)) return null;
  if (period.month < 1 || period.month > 12) return null;

  const key = neighbourAmong(index.months.keys(), monthKey(period.year, period.month), delta);
  if (!key) return null;

  return { kind: 'month', year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) };
}

/** The same answer for years, over the years with memories (FR-007, FR-008). */
export function neighbourYear(index, period, delta) {
  if (!index || !(index.years instanceof Map)) return null;
  if (!Number.isInteger(delta)) return null;
  if (!period || !fourDigitYear(period.year)) return null;

  const key = neighbourAmong(index.years.keys(), String(period.year), delta);
  if (!key) return null;

  return { kind: 'year', year: Number(key) };
}

// ---------------------------------------------------------------------------
// buildRows (FR-005, FR-006; research R8)
// ---------------------------------------------------------------------------

/**
 * The weekday (0 = Sunday) of a civil day -- numeric parts handed to `Date`, exactly as
 * `monthGrid`'s own weekday lookup is built, never a date string read as an instant. The one
 * place this feature asks "which weekday is this", so `dayHeadingLabel` and `dayTileWords`
 * cannot read a different weekday for the same day.
 */
function weekdayIndexOf(year, month, day) {
  return new Date(year, month - 1, day).getDay();
}

/** FR-005's day heading: "Thu 5 March" -- weekday, day, month, and no year. */
function dayHeadingLabel(key) {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const day = Number(key.slice(8, 10));

  const weekday = WEEKDAY_NAMES[weekdayIndexOf(year, month, day)];
  return `${weekday} ${day} ${monthName(month)}`;
}

/**
 * FR-014's spoken name for a day tile -- "Thursday 5 November 2026" -- the full weekday and the
 * full month, read in full because a screen reader has no three-letter column head to lean on.
 *
 * Exported so that `CalendarSheetBody.js`'s day tiles ask here rather than keeping a second
 * weekday list and a second `new Date(year, month - 1, day)` of their own: this file is already
 * the one place a civil date in this feature becomes words (`dayHeadingLabel`,
 * `monthHeadingLabel`), and a day tile's spoken label is a third wording of the same day that
 * must not drift from the grey heading's.
 */
export function dayTileWords(year, month, day) {
  const weekday = WEEKDAY_NAMES_FULL[weekdayIndexOf(year, month, day)];
  return `${weekday} ${day} ${monthName(month)} ${year}`;
}

/**
 * "March 2026" -- FR-005's heading for a month's month-only memories, and FR-006's heading
 * for a month of a year.
 *
 * `periodDate.formatPeriodDate` of a month-precision date, which is those exact words, so a
 * heading and the date line on the card beneath it cannot read differently and there is no
 * second wording to keep in step (the web's 014 model calls it the same way). FR-014's spoken
 * label ("March 2026, 4 memories, open") names the year too.
 */
function monthHeadingLabel(key) {
  return formatPeriodDate(`${key}-01`, 'month');
}

/** FR-006's final heading, for the memories of a year whose month nobody knows. */
function roughYearHeadingLabel(year) {
  return `${year}, month not known`;
}

const emptyRows = () => ({ rows: [], stickyIndices: [] });

/** An entry with the civil day and the precision it is to be placed by, or null. */
function place(entry) {
  const key = dayKeyOf(entry);
  return key ? { entry, key, precision: precisionOf(entry) } : null;
}

/** Oldest first: by day, then by created time -- FR-005's order, within a day too. */
function byDayThenCreated(a, b) {
  if (a.key !== b.key) return a.key < b.key ? -1 : 1;
  return compareCreated(a.entry.createdAt, b.entry.createdAt);
}

const entryRow = (placed) => ({ kind: 'entry', key: placed.entry.localId, entry: placed.entry });

/**
 * One month's memories as rows: a grey day heading per day with memories, its cards oldest
 * first, and that month's month-only memories last under "March 2026" (FR-005).
 *
 * The same rows in a month list and inside an open month of a year, because FR-005 says the
 * day headings appear in both and a month should not read differently depending on how it
 * was reached.
 */
function rowsForMonth(placed, key) {
  const rows = [];

  const dated = placed.filter((p) => p.precision === 'day').sort(byDayThenCreated);
  let heading = null;
  dated.forEach((p) => {
    if (p.key !== heading) {
      heading = p.key;
      rows.push({ kind: 'dayHeading', key: p.key, label: dayHeadingLabel(p.key) });
    }
    rows.push(entryRow(p));
  });

  const rough = placed.filter((p) => p.precision === 'month')
    .sort((a, b) => compareCreated(a.entry.createdAt, b.entry.createdAt));
  if (rough.length > 0) {
    rows.push({
      kind: 'dayHeading',
      key: `${key}${ROUGH_SUFFIX}`,
      label: monthHeadingLabel(key),
    });
    rough.forEach((p) => rows.push(entryRow(p)));
  }

  return rows;
}

/** A month list: day headings and cards, and nothing sticky (R8). */
function monthRows(placed, period) {
  const { year, month } = period;
  // The same refusal `neighbourMonth` makes, for the same reason: a year this module cannot
  // compare against its own four-digit keys is refused, not answered. Answering an empty
  // list where the neighbour functions refuse outright would be the worse of the two, because
  // an empty month reads on screen as a month with nothing in it.
  if (!fourDigitYear(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return emptyRows();
  }

  const key = monthKey(year, month);

  // Day and month precision only. A memory known only to its year belongs to the year, not
  // to the month its stored 1 January happens to fall in (FR-011, FR-016) -- the same answer
  // T003's query gives, so the model and the SQL cannot disagree.
  const mine = placed.filter((p) => p.key.slice(0, 7) === key
    && (p.precision === 'day' || p.precision === 'month'));

  return { rows: rowsForMonth(mine, key), stickyIndices: [] };
}

/**
 * A year list: one month heading per month with memories, in calendar order, then a final
 * "YYYY, month not known" heading when there is anything to put under it (FR-006). An open
 * heading is followed by its month's own rows; a closed one by nothing.
 *
 * `stickyIndices` holds the month heading rows **only**, so a day heading never sticks (R8).
 * It also answers "which heading is first": `rows[stickyIndices[0]].key` is the one a year
 * opens with (FR-006).
 */
function yearRows(placed, period, open) {
  const { year } = period;
  if (!fourDigitYear(year)) return emptyRows();

  const mine = placed.filter((p) => p.key.slice(0, 4) === String(year));

  const byMonth = new Map();
  const rough = [];
  mine.forEach((p) => {
    if (p.precision === 'year') {
      rough.push(p);
      return;
    }
    if (p.precision !== 'day' && p.precision !== 'month') return;

    const key = p.key.slice(0, 7);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(p);
  });

  const rows = [];
  const stickyIndices = [];

  /**
   * `children` is a function, not an array: a closed heading's rows are never built. A year
   * of twelve months rebuilds its rows on every toggle of `openMonths`, and building the day
   * headings of eleven closed months each time -- a `Date` apiece -- is work whose result is
   * thrown away. SC-005 asks for 300 memories without visible stutter.
   */
  const pushHeading = (heading, children) => {
    stickyIndices.push(rows.length);
    rows.push(heading);
    if (heading.open) rows.push(...children());
  };

  [...byMonth.keys()].sort().forEach((key) => {
    const group = byMonth.get(key);
    pushHeading({
      kind: 'monthHeading',
      key,
      label: monthHeadingLabel(key),
      count: group.length,
      open: open.has(key),
    }, () => rowsForMonth(group, key));
  });

  if (rough.length > 0) {
    const key = `${year}${ROUGH_SUFFIX}`;

    pushHeading({
      kind: 'monthHeading',
      key,
      label: roughYearHeadingLabel(year),
      count: rough.length,
      open: open.has(key),
    // No day headings under this one: the day is exactly what nobody knows. Oldest first by
    // created time, the only order these memories have.
    }, () => rough
      .sort((a, b) => compareCreated(a.entry.createdAt, b.entry.createdAt))
      .map(entryRow));
  }

  return { rows, stickyIndices };
}

/** The open month keys, however the caller holds them. Nothing given is nothing open. */
function openSet(openMonths) {
  if (openMonths instanceof Set) return openMonths;
  return new Set(Array.isArray(openMonths) ? openMonths : []);
}

/**
 * The flat rows of a month or year list (research R8), as `{ rows, stickyIndices }`.
 *
 * One flat list rather than a section list, because a card's map pin scrolls by row index
 * (`scrollPieceIntoView`) and a `SectionList` has no `scrollToIndex` at all. So every row
 * carries a flat index and a key of its own: an entry row is keyed by the entry's `localId`,
 * exactly as the day feed keys its cards today, and a heading row by the period it names.
 *
 * - `{ kind: 'dayHeading', key, label }` -- FR-005's small grey heading, never sticky.
 * - `{ kind: 'monthHeading', key, label, count, open }` -- a year's heading, which sticks.
 * - `{ kind: 'entry', key, entry }` -- the unchanged `JournalEntryCard`'s own memory.
 *
 * Nothing is returned for a day pick, or for no pick at all: a day is the Journal's own feed,
 * drawn exactly as it is today, and FR-005 puts the headings in month and year lists only.
 * Each entry is placed on `dayKeyOf`'s answer -- its stored date, or failing that the day it
 * was created -- and is left out only when nothing at all says which day it is on.
 *
 * `openMonths` is a `Set` (or an array) of heading keys, and belongs to the screen, not here
 * -- including which one is open when a year is first picked (FR-006), which is
 * `rows[stickyIndices[0]].key`.
 *
 * **`entries`** are entries as `DatabaseService._mapEntryRow` returns them: `localId`, `date`,
 * `datePrecision`, `createdAt`. Raw database rows do not belong here -- their `date_precision`
 * would read as a missing precision, which is a day, and every rough-dated memory would be
 * listed as one of a day's. `buildIndex` is the one function that takes raw rows.
 */
export function buildRows(entries, picked, openMonths) {
  if (!picked || typeof picked !== 'object') return emptyRows();

  const placed = (Array.isArray(entries) ? entries : [])
    .map(place)
    .filter(Boolean);

  if (picked.kind === 'month') return monthRows(placed, picked);
  if (picked.kind === 'year') return yearRows(placed, picked, openSet(openMonths));
  return emptyRows();
}

// ---------------------------------------------------------------------------
// filterRange (the web build's stand-in for T003's SQL -- research R2)
// ---------------------------------------------------------------------------

/**
 * The entries of a civil-date range, filtered by precision and ordered as T003's SQL orders
 * them.
 *
 * The web build of the app has a database shim that ignores ranges and ordering (research
 * R2), so on web the same question has to be answered in JS. It must be answered the *same
 * way*: a different order on web would be a different screen.
 *
 * - **Both ends are inclusive**, and a day is compared as its civil-date key -- what the SQL
 *   does with `substr(date, 1, 10)` -- so a row holding a full instant lands on the day its
 *   key names, in every time zone (SC-004).
 * - **Ascending by day, then by created time** (FR-005, FR-006: calendar order, oldest first
 *   within a day too); `'DESC'` gives a single day the newest-first order the feed has today
 *   (FR-004). The word is read without regard to case, so the one spelling that matters
 *   cannot be missed by a caller writing it the way the SQL does not; anything else is the
 *   ascending calendar order.
 * - **`precisions`** is a list of the precisions to keep, a missing precision reading as a
 *   day. No list at all means every precision, which is how a whole day is asked for
 *   (FR-016's placement); an empty list means none, exactly as SQL's `IN ()` matches nothing.
 * - Two memories that cannot be told apart keep the order they were given, in either
 *   direction, and the array handed in is never sorted in place.
 * - **`entries`** are entries as `DatabaseService._mapEntryRow` returns them (`localId`,
 *   `date`, `datePrecision`, `createdAt`), as `buildRows` takes them -- not raw database rows,
 *   whose `date_precision` this would read as no precision at all, which is a day.
 */
export function filterRange(entries, fromKey, toKey, precisions, order) {
  const from = dayKeyOf(fromKey);
  const to = dayKeyOf(toKey);
  if (!Array.isArray(entries) || !from || !to) return [];

  const allowed = Array.isArray(precisions) ? new Set(precisions) : null;

  const kept = [];
  entries.forEach((entry, given) => {
    if (!entry) return;

    const key = dayKeyOf(entry);
    if (!key || key < from || key > to) return;
    if (allowed && !allowed.has(precisionOf(entry))) return;

    kept.push({ entry, key, given });
  });

  const direction = isDescending(order) ? -1 : 1;
  kept.sort((a, b) => {
    if (a.key !== b.key) return (a.key < b.key ? -1 : 1) * direction;

    const created = compareCreated(a.entry.createdAt, b.entry.createdAt);
    if (created !== 0) return created * direction;

    // A full tie keeps the order it arrived in, whichever way round the rest is sorted.
    return a.given - b.given;
  });

  return kept.map((k) => k.entry);
}
