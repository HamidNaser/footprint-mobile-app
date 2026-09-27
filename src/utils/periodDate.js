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

/** Photography starts in 1826, so an earlier year is a typo rather than a memory. */
const EARLIEST_YEAR = 1826;

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

function daysInMonth(year, month) {
  if (month !== 2) return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return leap ? 29 : 28;
}

/**
 * What somebody typed, as a date and a precision — or null (FR-013c).
 *
 * <p>
 * Null rather than a guess. "last summer" is a real thing to know about a photograph and not
 * something this can turn into a date; the honest response is to leave it held.
 * </p>
 *
 * <p>
 * Deliberately the same rules as the web client's, case for case, so the two cannot disagree
 * about what "1978" means. The year bound is the one place this validates rather than
 * keeps-and-flags, because unlike captured EXIF this value <b>creates an entry</b>.
 * </p>
 *
 * <p>
 * The only `Date` in this file is here, asking what year it is now — which is a question about
 * the present, not about a stored civil date.
 * </p>
 *
 * @param {string} text `1978`, `1978-07`, or `1978-07-04`. Slashes accepted.
 * @returns {{date: string, datePrecision: 'year'|'month'|'day'}|null}
 */
export function parsePeriodDate(text) {
  if (typeof text !== 'string') return null;

  const match = text.trim().replace(/\//g, '-').match(/^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/);
  if (!match) return null;

  const year = Number(match[1]);
  if (year < EARLIEST_YEAR || year > new Date().getFullYear() + 1) return null;

  if (match[2] === undefined) {
    return { date: `${match[1]}-01-01`, datePrecision: 'year' };
  }

  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const mm = String(month).padStart(2, '0');

  if (match[3] === undefined) {
    return { date: `${match[1]}-${mm}-01`, datePrecision: 'month' };
  }

  const day = Number(match[3]);
  if (day < 1 || day > daysInMonth(year, month)) return null;

  return { date: `${match[1]}-${mm}-${String(day).padStart(2, '0')}`, datePrecision: 'day' };
}

export default formatPeriodDate;
