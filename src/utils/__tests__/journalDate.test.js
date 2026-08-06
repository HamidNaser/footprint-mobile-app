/**
 * Tests for floating civil-date handling.
 *
 * These deliberately assert against the *local* calendar parts of a constructed
 * Date rather than hard-coded strings, so they are meaningful whatever timezone
 * the machine or CI runner is in. A UTC-based implementation fails them
 * anywhere with a non-zero offset.
 */

import {
  toDateKey,
  parseDateKey,
  isSameDay,
  todayKey,
  adjacentDateKey,
} from '../journalDate';

const pad = (n) => String(n).padStart(2, '0');
const localKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

describe('toDateKey', () => {
  it('uses local calendar parts, not UTC, at every hour of the day', () => {
    // The regression: toISOString() shifts the date across the UTC boundary, so
    // an entry written at 21:00 in New York was stamped with tomorrow, and one
    // written at 09:00 was read back as yesterday.
    for (let hour = 0; hour < 24; hour += 1) {
      const d = new Date(2026, 7, 5, hour, 30);
      expect(toDateKey(d)).toBe(localKey(d));
    }
  });

  it('passes an existing civil-date key through untouched', () => {
    // Re-parsing is what reintroduces the UTC shift, and it is also what would
    // make a date slide when the user changes timezone.
    expect(toDateKey('2026-08-05')).toBe('2026-08-05');
  });

  it('accepts epoch milliseconds', () => {
    const d = new Date(2026, 0, 31, 23, 59);
    expect(toDateKey(d.getTime())).toBe(localKey(d));
  });

  it('pads single-digit months and days', () => {
    expect(toDateKey(new Date(2026, 0, 3, 12))).toBe('2026-01-03');
  });

  it('returns null for unusable input', () => {
    expect(toDateKey(null)).toBeNull();
    expect(toDateKey(undefined)).toBeNull();
    expect(toDateKey('not a date')).toBeNull();
  });
});

describe('parseDateKey', () => {
  it('parses a key as local midnight, not UTC midnight', () => {
    // `new Date('2026-08-05')` yields the 4th anywhere west of Greenwich.
    const d = parseDateKey('2026-08-05');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(5);
    expect(d.getHours()).toBe(0);
  });

  it('round-trips with toDateKey at every hour', () => {
    for (let hour = 0; hour < 24; hour += 1) {
      const key = toDateKey(new Date(2026, 7, 5, hour, 30));
      expect(toDateKey(parseDateKey(key))).toBe(key);
    }
  });
});

describe('isSameDay', () => {
  it('matches a stored key against a Date on the same civil day', () => {
    const noon = new Date(2026, 7, 5, 12);
    expect(isSameDay(localKey(noon), noon)).toBe(true);
  });

  it('matches regardless of time of day', () => {
    const early = new Date(2026, 7, 5, 0, 1);
    const late = new Date(2026, 7, 5, 23, 59);
    expect(isSameDay(early, late)).toBe(true);
  });

  it('does not match adjacent days', () => {
    expect(isSameDay('2026-08-05', '2026-08-06')).toBe(false);
  });

  it('is false when either side is unusable', () => {
    expect(isSameDay(null, '2026-08-05')).toBe(false);
    expect(isSameDay('2026-08-05', undefined)).toBe(false);
  });
});

describe('todayKey', () => {
  it('agrees with the local calendar', () => {
    expect(todayKey()).toBe(localKey(new Date()));
  });
});

describe('adjacentDateKey', () => {
  // Swiping moves to the next/previous day that HAS entries, not +/- 1 day.
  const keys = ['2026-08-01', '2026-08-05', '2026-08-06', '2026-08-20'];

  it('finds the next populated day, skipping empty ones', () => {
    expect(adjacentDateKey(keys, '2026-08-06', 1)).toBe('2026-08-20');
  });

  it('finds the previous populated day, skipping empty ones', () => {
    expect(adjacentDateKey(keys, '2026-08-05', -1)).toBe('2026-08-01');
  });

  it('works from a day with no entries of its own', () => {
    expect(adjacentDateKey(keys, '2026-08-10', 1)).toBe('2026-08-20');
    expect(adjacentDateKey(keys, '2026-08-10', -1)).toBe('2026-08-06');
  });

  it('returns null at the ends rather than wrapping', () => {
    expect(adjacentDateKey(keys, '2026-08-20', 1)).toBeNull();
    expect(adjacentDateKey(keys, '2026-08-01', -1)).toBeNull();
  });

  it('tolerates duplicates, disorder and junk', () => {
    const messy = ['2026-08-06', '2026-08-01', '2026-08-06', 'nonsense', null];
    expect(adjacentDateKey(messy, '2026-08-01', 1)).toBe('2026-08-06');
  });

  it('returns null when there are no usable keys', () => {
    expect(adjacentDateKey([], '2026-08-05', 1)).toBeNull();
    expect(adjacentDateKey(['junk'], '2026-08-05', -1)).toBeNull();
  });
});
