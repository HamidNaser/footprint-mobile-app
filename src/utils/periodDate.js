/**
 * A date somebody knows only roughly (FR-013c, T055).
 *
 * <p>
 * The holding area on web lets somebody date a box of scans "1978". That stores 1 January 1978,
 * because a date has to be some day — and rendering it back as "1 January 1978" shows them a day
 * they never supplied, as though they had. The precision is the only thing that stops that.
 * </p>
 *
 * <p>
 * Deliberately the same output as `foot-print-web/src/utils/periodDate.js`, and deliberately a
 * <b>subset</b> of it: mobile renders period dates but cannot yet make them — there is no
 * holding-area screen here (T064) — so a `parsePeriodDate` would be untested code with no
 * caller. When T064 lands, port it then.
 * </p>
 *
 * <p>
 * <b>Nothing here constructs a `Date`.</b> `new Date('1978-01-01')` is midnight UTC, so
 * formatting it west of Greenwich renders <i>31 December 1977</i> — the entry moves a year
 * depending on where the reader is standing. A civil date is a day, not an instant, and a
 * `Date` appearing in this file is a defect.
 * </p>
 */

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * A period date as somebody should read it: `1978`, `July 1978`, `4 July 2018`.
 *
 * An absent precision renders as a day. That covers every entry created before FR-013c and
 * every entry read out of the local database — `journal_entries` has no `date_precision`
 * column — and the full stored date is what those rows mean.
 *
 * @param {string|null|undefined} date `YYYY-MM-DD`, or an ISO instant whose date part is used.
 * @param {string|null|undefined} datePrecision `year`, `month` or `day`.
 * @returns {string} empty when there is no usable date — never a guess.
 */
export function formatPeriodDate(date, datePrecision) {
  if (typeof date !== 'string') return '';

  // The civil day is the date part. A time component is not information about which day it
  // was, and parsing the whole thing as an instant is how the day moves.
  const match = date.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '';

  const [, year, month, day] = match;
  const monthName = MONTH_NAMES[Number(month) - 1];
  if (!monthName) return '';

  if (datePrecision === 'year') return year;
  if (datePrecision === 'month') return `${monthName} ${year}`;

  return `${Number(day)} ${monthName} ${year}`;
}

export default formatPeriodDate;
