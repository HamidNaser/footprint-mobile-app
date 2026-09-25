import { parseExifLocalDateTime } from '../LocationService';

/**
 * EXIF `DateTimeOriginal` is a bare wall-clock string — `"2018:07:04 15:22:00"` — carrying
 * no zone at all. Handed to `new Date()` it silently acquires *the importing device's*
 * zone, so one file read on a phone in Toronto and the same file read in a browser in
 * Tokyo yield instants fourteen hours apart, and the same photographs then cluster into
 * different entries from identical input (SC-005, FR-008, research.md #9).
 *
 * This file is the mobile half. Its expectations are deliberately identical to
 * `foot-print-web/src/utils/photoImport.test.js` — the two implementations are a shared
 * convention rather than two solutions to one problem, and T015 pins them to one fixture.
 */
describe('parseExifLocalDateTime', () => {
  it('keeps the wall clock the camera recorded', () => {
    expect(parseExifLocalDateTime('2018:07:04 15:22:00')).toBe('2018-07-04T15:22:00');
  });

  it('gives the same answer whichever timezone the device is in', () => {
    // The whole point. No Date is constructed anywhere in the path, so there is nothing
    // for a device zone to act on -- asserted directly rather than trusted.
    const original = process.env.TZ;
    const readIn = (zone) => {
      process.env.TZ = zone;
      return parseExifLocalDateTime('2018:07:04 15:22:00');
    };

    try {
      expect(readIn('America/Toronto')).toBe(readIn('Asia/Tokyo'));
      expect(readIn('Pacific/Kiritimati')).toBe('2018-07-04T15:22:00');
    } finally {
      process.env.TZ = original;
    }
  });

  it('reads a date the ISO way round as well', () => {
    expect(parseExifLocalDateTime('2018-07-04 15:22:00')).toBe('2018-07-04T15:22:00');
    expect(parseExifLocalDateTime('2018-07-04T15:22:00')).toBe('2018-07-04T15:22:00');
  });

  it('drops sub-second precision rather than choking on it', () => {
    expect(parseExifLocalDateTime('2018:07:04 15:22:00.480')).toBe('2018-07-04T15:22:00');
  });

  it('treats the all-zero tag as no date at all', () => {
    // What a camera writes when its clock was never set. A real value in the file and not
    // a date -- it belongs in the holding area (FR-013), not the year zero.
    expect(parseExifLocalDateTime('0000:00:00 00:00:00')).toBeNull();
  });

  it('refuses a date that could not have happened', () => {
    expect(parseExifLocalDateTime('2018:13:04 15:22:00')).toBeNull();
    expect(parseExifLocalDateTime('2018:07:32 15:22:00')).toBeNull();
    expect(parseExifLocalDateTime('2018:02:30 15:22:00')).toBeNull();
    expect(parseExifLocalDateTime('2018:07:04 25:22:00')).toBeNull();
  });

  it('keeps a leap day that really exists', () => {
    expect(parseExifLocalDateTime('2016:02:29 09:00:00')).toBe('2016-02-29T09:00:00');
    expect(parseExifLocalDateTime('2015:02:29 09:00:00')).toBeNull();
  });

  it('keeps an implausible year rather than discarding the photograph', () => {
    // A camera clock reset to its epoch. FR-016 stores the value and flags it elsewhere;
    // refusing it here would lose the only date the file carries.
    expect(parseExifLocalDateTime('1970:01:01 00:00:00')).toBe('1970-01-01T00:00:00');
  });

  it('has no answer for a missing or unreadable tag', () => {
    expect(parseExifLocalDateTime(null)).toBeNull();
    expect(parseExifLocalDateTime(undefined)).toBeNull();
    expect(parseExifLocalDateTime('   ')).toBeNull();
    expect(parseExifLocalDateTime('yesterday')).toBeNull();
  });

  it('refuses a Date object instead of quietly trusting one', () => {
    // On this platform the Date usually arrives from `asset.exif`, already built by the
    // picker in device-local terms. Returning null makes that a visible failure rather
    // than a plausible wrong answer.
    expect(parseExifLocalDateTime(new Date('2018-07-04T15:22:00Z'))).toBeNull();
  });
});

/**
 * Cross-client date parity (T015) — the SC-005/FR-008 regression guard.
 *
 * Everything above proves this module is self-consistent. None of it would notice if the
 * web half drifted: both suites could stay green while the two clients read different
 * capture times out of the same photograph, and a library imported from a phone would
 * cluster differently from the same library imported in a browser. That is the failure
 * this block exists to catch.
 *
 * The mechanism is one table of EXIF tags and expected values, asserted on both sides.
 * `foot-print-web/src/utils/photoImport.test.js` carries an identical block; the two are
 * only meaningful together.
 *
 * The expected values are NOT copied from either implementation. They are read off the
 * written contract — `takenAtLocal` is `YYYY-MM-DDTHH:mm:ss`, zone-less (data-model.md),
 * and `"2018:07:04 15:22:00"` is `"2018-07-04T15:22:00"` in contracts/imports-api.md's own
 * example. A literal lifted from one client would let both suites agree on the same bug.
 *
 * The cases are chosen for where a zone shift *shows*: midnight, the last second of a
 * year, and a leap day. An implementation that routes through `new Date()` moves those
 * across a day, a month, or a year boundary, so the literal comparison catches it on any
 * host whose zone is not UTC — and the timezone sweep below catches it on one that is.
 */
const DATE_PARITY_CASES = [
  // contracts/imports-api.md's own worked example.
  ['2018:07:04 15:22:00', '2018-07-04T15:22:00'],
  // Midnight: the instant a zone shift is most visible, and the one a whole day hangs on.
  ['2018:01:01 00:00:00', '2018-01-01T00:00:00'],
  // The last second of a year. A naive conversion rolls it into the next one.
  ['1999:12:31 23:59:59', '1999-12-31T23:59:59'],
  // A leap day at midnight -- rolls to the 28th or the 1st of March if a zone is applied.
  ['2016:02:29 00:00:00', '2016-02-29T00:00:00'],
  // Sub-seconds are dropped, not rejected.
  ['2018:07:04 15:22:00.480', '2018-07-04T15:22:00'],
  // A clock that was never set is not a date (FR-013).
  ['0000:00:00 00:00:00', null],
  // A clock reset to its epoch is implausible but still the only date the file carries
  // (FR-016) -- kept here, flagged elsewhere.
  ['1970:01:01 00:00:00', '1970-01-01T00:00:00'],
];

const PARITY_TIMEZONES = [
  'UTC',
  'America/Toronto',
  'Asia/Tokyo',
  'Asia/Kolkata', // +05:30 -- a half-hour offset, which integer-hour arithmetic gets wrong
  'Pacific/Kiritimati', // +14:00 -- the furthest ahead there is
];

describe('cross-client date parity (T015)', () => {
  it('reads the shared table exactly as the web client must', () => {
    for (const [tag, expected] of DATE_PARITY_CASES) {
      expect(parseExifLocalDateTime(tag)).toBe(expected);
    }
  });

  it('gives the same answers whatever timezone the device is in', () => {
    const original = process.env.TZ;

    try {
      for (const zone of PARITY_TIMEZONES) {
        process.env.TZ = zone;
        for (const [tag, expected] of DATE_PARITY_CASES) {
          expect(parseExifLocalDateTime(tag)).toBe(expected);
        }
      }
    } finally {
      process.env.TZ = original;
    }
  });

  it('covers the boundaries a zone shift would move', () => {
    // Guards the table itself. Drop the midnight or year-end case and the block above
    // still passes while testing almost nothing -- these are the rows that fail loudly
    // when a Date creeps back into the path.
    const tags = DATE_PARITY_CASES.map(([tag]) => tag);
    expect(tags).toContain('2018:01:01 00:00:00');
    expect(tags).toContain('1999:12:31 23:59:59');
    expect(tags).toContain('2016:02:29 00:00:00');
  });
});
