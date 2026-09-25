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
