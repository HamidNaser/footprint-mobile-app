import { formatPeriodDate } from '../periodDate';

/**
 * A date somebody knows only roughly, rendered as much of it as is real (FR-013c, T055).
 *
 * <p>
 * The holding area on web lets somebody date a box of scans "1978". That stores 1 January 1978,
 * because a date has to be some day — and rendering it back as "1 January 1978" shows them a day
 * they never supplied, as though they had.
 * </p>
 *
 * <p>
 * Deliberately the same output as
 * `foot-print-web/src/utils/periodDate.js`'s `formatPeriodDate`, and deliberately a subset of it:
 * mobile has no holding-area screen yet (T064), so it renders period dates but never makes them,
 * and a `parsePeriodDate` here would be untested code with no caller.
 * </p>
 *
 * <p>
 * <b>Nothing here constructs a `Date`.</b> `new Date('1978-01-01')` is midnight UTC, so
 * formatting it west of Greenwich renders <i>31 December 1977</i> — the entry moves a year
 * depending on where the reader is standing. A civil date is a day, not an instant.
 * </p>
 */
describe('formatPeriodDate', () => {
  it('renders a year as a year', () => {
    expect(formatPeriodDate('1978-01-01', 'year')).toBe('1978');
  });

  it('renders a month as a month', () => {
    expect(formatPeriodDate('1978-07-01', 'month')).toBe('July 1978');
  });

  it('renders a day as a day', () => {
    expect(formatPeriodDate('2018-07-04', 'day')).toBe('4 July 2018');
  });

  it('never shows a day the person did not supply', () => {
    expect(formatPeriodDate('1978-01-01', 'year')).not.toMatch(/January/);
  });

  it('falls back to the day when no precision was recorded', () => {
    // Every entry created before FR-013c, and every entry read out of the local database —
    // `journal_entries` has no `date_precision` column yet. The full stored date is what
    // those rows mean.
    expect(formatPeriodDate('2018-07-04', null)).toBe('4 July 2018');
    expect(formatPeriodDate('2018-07-04', undefined)).toBe('4 July 2018');
  });

  it('reads an instant as the civil day it was stored for', () => {
    expect(formatPeriodDate('2018-07-04T23:30:00Z', 'day')).toBe('4 July 2018');
  });

  it('says nothing rather than something wrong', () => {
    expect(formatPeriodDate(null, 'day')).toBe('');
    expect(formatPeriodDate('not a date', 'day')).toBe('');
  });

  describe('west of Greenwich', () => {
    /*
     * Pinned to a zone rather than left to chance. CI is UTC, where the naive `Date`-based
     * answer is right by accident — so an unpinned test would pass in CI whether or not the
     * bug was present, and fail only on a developer's machine.
     */
    const original = process.env.TZ;

    beforeAll(() => { process.env.TZ = 'America/Chicago'; });
    afterAll(() => { process.env.TZ = original; });

    it('is in a zone where the naive answer really is wrong', () => {
      // Guards the guard: if this stops being true the next two say nothing while passing.
      expect(new Date('1978-01-01').toLocaleDateString('en-GB', { year: 'numeric' })).toBe('1977');
    });

    it('does not shift a year-precision date into the previous year', () => {
      expect(formatPeriodDate('1978-01-01', 'year')).toBe('1978');
    });

    it('does not shift a new year’s day entry into December', () => {
      expect(formatPeriodDate('2018-01-01', 'day')).toBe('1 January 2018');
    });
  });
});
