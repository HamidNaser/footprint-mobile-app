import { formatPeriodDate, parsePeriodDate } from '../periodDate';

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

/**
 * Reading what somebody typed (FR-013c, T064).
 *
 * <p>
 * Deliberately the same rules as `foot-print-web/src/utils/periodDate.js`, case for case, so the
 * two clients cannot disagree about what "1978" means. Two repositories cannot share a module;
 * pinning both to the same cases is how they stay honest.
 * </p>
 *
 * <p>
 * It was left out of the earlier port on purpose — nothing on mobile could enter a date until the
 * holding-area screen existed, and an untested helper with no caller is worse than no helper.
 * </p>
 */
describe('parsePeriodDate', () => {
  it('reads a year alone', () => {
    expect(parsePeriodDate('1978')).toEqual({ date: '1978-01-01', datePrecision: 'year' });
  });

  it('reads a month', () => {
    expect(parsePeriodDate('1978-07')).toEqual({ date: '1978-07-01', datePrecision: 'month' });
  });

  it('reads a full date', () => {
    expect(parsePeriodDate('2018-07-04')).toEqual({ date: '2018-07-04', datePrecision: 'day' });
  });

  it('tolerates the spacing somebody actually types', () => {
    expect(parsePeriodDate('  1978  ')).toEqual({ date: '1978-01-01', datePrecision: 'year' });
  });

  it('accepts slashes', () => {
    expect(parsePeriodDate('1978/07/04')).toEqual({ date: '1978-07-04', datePrecision: 'day' });
  });

  it('refuses a month that is not a month', () => {
    expect(parsePeriodDate('1978-13')).toBeNull();
    expect(parsePeriodDate('1978-00')).toBeNull();
  });

  it('refuses a day the month does not have', () => {
    expect(parsePeriodDate('1978-02-30')).toBeNull();
    expect(parsePeriodDate('1900-02-29')).toBeNull();
  });

  it('accepts a leap day in a leap year', () => {
    expect(parsePeriodDate('2000-02-29')).toEqual({ date: '2000-02-29', datePrecision: 'day' });
  });

  it('refuses a year nobody photographed', () => {
    // Photography starts in 1826. Unlike captured EXIF, this value *creates* an entry, so it
    // is validated rather than kept-and-flagged.
    expect(parsePeriodDate('0007')).toBeNull();
    expect(parsePeriodDate('3000')).toBeNull();
  });

  it('refuses nonsense rather than guessing at it', () => {
    for (const text of ['', '   ', 'last summer', '19', '197', '1978-', null, undefined, 12]) {
      expect(parsePeriodDate(text)).toBeNull();
    }
  });
});
