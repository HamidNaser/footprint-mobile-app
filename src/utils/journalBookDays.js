/**
 * Turn the journal book's server-grouped days into the `SectionList` sections
 * `FamilySummaryScreen` draws.
 *
 * This is the successor to `familySummaryDays.js`. That module existed because the old
 * endpoint answered "who is in this family and what have they written" grouped by person,
 * so the client had to flatten every member's entries into one pool, group them by day
 * itself, and re-sort each day head-then-spouse-then-children so a day didn't inherit
 * whatever order the server happened to return its sections in.
 *
 * The journal book endpoint (spec phase 2) does both of those on the server: it already
 * groups by day, and it already orders each day's entries by the member's position in the
 * household. Re-deriving either one here would be exactly the kind of copy this phase
 * exists to remove -- two clients computing the same ordering is two chances for it to
 * drift. So this module's job shrinks to two things the server cannot do for us:
 *
 *   - attribution: entries arrive carrying only `memberId`. `adaptEntry` falls back to a
 *     null author when the API omits one, and a family journal that cannot name your
 *     wife's memory is worse than not showing it -- the household roster passed in here
 *     always knows.
 *   - the day heading: `dayLabel`, ported unchanged from `familySummaryDays.js`.
 *
 * One thing this module deliberately does NOT carry forward: the `'undated'` bucket.
 * `familySummaryDays.js` grouped entries by a day key it derived itself, so an entry with
 * no usable date had nowhere to go and needed its own bucket to avoid looking dropped.
 * That derivation is gone -- the server groups by day and hands us `day.date` directly,
 * and the backend floors a non-nullable date, so a dateless *entry* is not reachable in
 * normal operation. Carrying per-entry bucketing forward would be dead code that reads as
 * a live case.
 *
 * The risk shifts rather than disappearing, though: a malformed response could still hand
 * back a *day* with a missing or empty `date`. That day's entries must not be dropped --
 * dropping them silently is exactly how somebody concludes their entry was lost -- so such
 * a day renders under a "Date unknown" heading and sorts last, same as before, just at the
 * day level instead of the entry level.
 */

import { parseDateKey } from './journalDate';

/** A day's heading — "Sunday, 5 August 2026", or the raw key if it cannot be parsed. */
export function dayLabel(key) {
  const date = parseDateKey(key);
  if (!date) return key;

  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Attribute one entry from the household roster rather than from the entry itself.
 *
 * An entry whose `memberId` isn't found in the household still renders -- it keeps
 * whatever `adaptEntry` already put on it (a null author, in practice) rather than being
 * dropped, since a stale roster is not a reason to hide someone's memory.
 */
function attribute(entry, householdById) {
  const member = householdById.get(entry.memberId);
  if (!member) return entry;

  return {
    ...entry,
    author: {
      id: member.memberId,
      name: member.name,
      avatarUrl: member.avatarUrl ?? null,
    },
  };
}

/**
 * The journal book's days as `SectionList` sections, newest day first.
 *
 * @param {Array} days - `{ date, entries }[]`, already grouped and ordered by the server
 * @param {Array} household - `{ memberId, name, avatarUrl, ... }[]`, for attribution
 * @returns {Array} `[{ key, title, data }]` ready for `SectionList`
 */
export function journalBookToDays(days, household) {
  const householdById = new Map((household || []).map((member) => [member.memberId, member]));

  const sections = (days || []).map((day, index) => {
    const dateKey = day?.date || null;
    // A day the server couldn't date still gets a section -- its own heading, sorted last
    // -- rather than being dropped or filed under a guessed date.
    const unknown = !dateKey;

    return {
      key: unknown ? `unknown-${index}` : dateKey,
      title: unknown ? 'Date unknown' : dayLabel(dateKey),
      data: (day?.entries || []).map((entry) => attribute(entry, householdById)),
      unknown,
    };
  });

  return sections
    .sort((a, b) => {
      if (a.unknown && b.unknown) return 0;
      if (a.unknown) return 1;
      if (b.unknown) return -1;
      return a.key < b.key ? 1 : -1;
    })
    .map(({ unknown: _unknown, ...section }) => section);
}

export default journalBookToDays;
