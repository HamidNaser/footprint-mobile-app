/**
 * Journal date handling.
 *
 * A journal entry's `date` is a **floating civil date** — the calendar day the
 * memory happened, in the timezone the user was standing in when they captured
 * it. It is deliberately NOT an instant.
 *
 * That distinction matters for a travel journal: a memory captured on 5 August
 * in New York must still read as 5 August after the user lands in Tokyo. If the
 * date were stored as an instant (or round-tripped through UTC) it would slide
 * to the 4th or 6th depending on where the reader happens to be, and entries
 * would appear to jump days mid-trip.
 *
 * So both directions stay in local civil time:
 *   write — derive `YYYY-MM-DD` from *local* calendar parts, never toISOString()
 *   read  — parse `YYYY-MM-DD` as *local* midnight, never `new Date(str)`
 *
 * `new Date('2026-08-05')` is the trap: per spec a date-only string parses as
 * UTC midnight, so `.getDate()` returns the 4th anywhere west of Greenwich.
 */

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n) => String(n).padStart(2, '0');

/**
 * Reduce any accepted date representation to a `YYYY-MM-DD` civil-date key.
 *
 * Already-a-key strings pass through untouched — that is what preserves the
 * floating date across timezones. Instants (Date, epoch ms, ISO datetime) are
 * resolved using the *device's current* local parts, which is the best
 * available answer when the capture zone was not recorded.
 *
 * @param {string|number|Date} value
 * @returns {string|null} `YYYY-MM-DD`, or null if unparseable
 */
export function toDateKey(value) {
  if (value == null) return null;

  if (typeof value === 'string') {
    const match = value.match(DATE_KEY);
    // Already a civil date: keep it verbatim. Re-parsing would reintroduce the
    // UTC shift this module exists to prevent.
    if (match) return value;
  }

  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;

  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Turn a civil-date key into a Date at **local** midnight.
 *
 * @param {string} key - `YYYY-MM-DD`
 * @returns {Date|null}
 */
export function parseDateKey(key) {
  const match = typeof key === 'string' ? key.match(DATE_KEY) : null;
  if (!match) {
    const d = new Date(key);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const [, y, m, d] = match;
  // Component constructor is local-time; `new Date(key)` would be UTC.
  return new Date(Number(y), Number(m) - 1, Number(d));
}

/**
 * Whether two values fall on the same civil day.
 *
 * Compares date keys rather than calendar getters, so a stored key is never
 * re-parsed and cannot drift.
 *
 * @param {string|number|Date} a
 * @param {string|number|Date} b
 * @returns {boolean}
 */
export function isSameDay(a, b) {
  const ka = toDateKey(a);
  const kb = toDateKey(b);
  return ka !== null && ka === kb;
}

/**
 * The civil date for right now, in the device's local timezone.
 * @returns {string} `YYYY-MM-DD`
 */
export function todayKey() {
  return toDateKey(new Date());
}

/**
 * Given the set of days that have entries, find the nearest one before or after
 * a reference day. Used by the journal's left/right swipe, which moves to the
 * next/previous day that actually *has* entries rather than ±1 calendar day.
 *
 * Keys are `YYYY-MM-DD`, so lexicographic ordering is chronological.
 *
 * @param {string[]} keys - available date keys, any order, duplicates fine
 * @param {string} fromKey - reference civil date
 * @param {1|-1} direction - 1 for next (later), -1 for previous (earlier)
 * @returns {string|null} the adjacent populated date key, or null if none
 */
export function adjacentDateKey(keys, fromKey, direction) {
  if (!Array.isArray(keys) || !fromKey) return null;

  const unique = [...new Set(keys.filter((k) => DATE_KEY.test(k)))].sort();
  if (unique.length === 0) return null;

  if (direction === 1) {
    return unique.find((k) => k > fromKey) ?? null;
  }
  for (let i = unique.length - 1; i >= 0; i -= 1) {
    if (unique[i] < fromKey) return unique[i];
  }
  return null;
}
