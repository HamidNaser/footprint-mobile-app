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

  /**
   * The real property, asserted directly: this never constructs a `Date`.
   *
   * <p>
   * The first version of these tests pinned `process.env.TZ` to a westward zone instead. That
   * does not work under jest — Node resolves the zone before `beforeAll` runs — so it passed
   * only on a machine already in that zone, and failed in CI. Worse, it was passing locally for
   * a reason that had nothing to do with the code.
   * </p>
   *
   * <p>
   * Replacing `Date` with something that throws needs no timezone at all and tests the property
   * rather than a symptom of it: if the implementation ever reaches for a `Date`, these go red
   * everywhere, in UTC as readily as anywhere else.
   * </p>
   */
  describe('without a Date at all', () => {
    const RealDate = global.Date;

    beforeAll(() => {
      global.Date = function ForbiddenDate() {
        throw new Error('formatPeriodDate must not construct a Date — a civil date is a day.');
      };
      global.Date.now = RealDate.now;
    });

    afterAll(() => { global.Date = RealDate; });

    it('renders a year', () => {
      expect(formatPeriodDate('1978-01-01', 'year')).toBe('1978');
    });

    it('renders a month', () => {
      expect(formatPeriodDate('1978-07-01', 'month')).toBe('July 1978');
    });

    it('renders a day', () => {
      expect(formatPeriodDate('2018-01-01', 'day')).toBe('1 January 2018');
    });
  });
});
