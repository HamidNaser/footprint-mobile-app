/**
 * Who is in a household, and which of them recorded anything on the day being read.
 *
 * The family summary merges everyone's entries and groups them by day, so a day holding
 * one entry from one child shows exactly that — one entry, and no sign that four other
 * people were ever in scope. Absence is invisible, and the reader fills the gap with the
 * only explanation available to them, which is that something is broken.
 *
 * Answering it needs the roster and the day together. The roster alone says who is
 * included; the roster *for this day* also says why the page is thin.
 *
 * Ported from `foot-print-web/src/utils/familyDayRoster.js`. Used in two places here, as on
 * web: above the family summary, and above a friends group's journal. A group of friends
 * has no head or spouse, so the relation ordering simply falls through to the order the
 * group lists its members.
 *
 * This also carries something the day-grouped summary would otherwise lose. Grouped by
 * person, a member with nothing recorded still got a header, so the screen could not
 * quietly disagree with the tree it was opened from (002's FR-010). Grouped by day there is
 * nowhere to hang that header — so it lives here instead, which is a better place for it:
 * it is now per-day rather than per-screen, and says not just "these five are in scope" but
 * "these four had nothing to say today".
 */

import { toDateKey } from './journalDate';

/** Head first, then spouse, then children — the order the sections already arrive in. */
const RELATION_ORDER = { head: 0, self: 0, spouse: 1, child: 2 };

function rank(relation) {
  const r = RELATION_ORDER[relation];
  return r === undefined ? Number.MAX_SAFE_INTEGER : r;
}

/**
 * The calendar day an entry belongs to.
 *
 * Delegates to `toDateKey`, which is this app's answer to the civil-date problem: an
 * already-formatted key passes through untouched rather than being re-parsed into a UTC
 * instant that lands a day earlier west of Greenwich.
 *
 * @param {object} entry
 * @returns {string|null} `YYYY-MM-DD`
 */
export function dayOf(entry) {
  return toDateKey(entry?.date ?? entry?.createdAt ?? entry?.recordedAt ?? null);
}

/**
 * One row per household member, in a fixed order, whether or not they recorded anything.
 *
 * Nobody is ever dropped for having nothing. The people with nothing are the whole point:
 * they are the ones the reader is otherwise left guessing about.
 *
 * @param {Array} sections - the summary, one section per member
 * @param {string|null} day - the day on screen, `YYYY-MM-DD`; null counts everything
 * @returns {Array<{memberId: string, name: string, avatar: string|null, relation: string,
 *   count: number, entryIds: Array<string>}>}
 */
export function rosterForDay(sections, day) {
  return (sections || [])
    .map((section) => {
      const onDay = (section.entries || []).filter(
        (entry) => day == null || dayOf(entry) === day
      );

      return {
        memberId: section.memberId,
        name: section.name,
        avatar: section.avatarUrl ?? null,
        relation: section.relation,
        count: onDay.length,
        // So a face can carry the reader to what it is about.
        entryIds: onDay.map((entry) => entry.serverId || entry.localId || entry.id)
          .filter(Boolean),
      };
    })
    .sort((a, b) => rank(a.relation) - rank(b.relation));
}

/**
 * The sentence under the faces.
 *
 * Said in words as well as drawn, because the dimming only works once somebody has already
 * understood what it means — and the confusion this is here to answer happens on the first
 * encounter, not the tenth.
 *
 * @param {Array} roster
 * @param {string} [dateText]
 * @returns {string}
 */
export function rosterCaption(roster, dateText) {
  const total = (roster || []).length;
  const recorded = (roster || []).filter((r) => r.count > 0).length;
  const when = dateText ? ` on ${dateText}` : '';

  if (total === 0) return '';
  if (recorded === 0) return `Nobody recorded anything${when}`;
  if (recorded === total) {
    return total === 1 ? `1 memory${when}` : `All ${total} recorded something${when}`;
  }

  return `${recorded} of ${total} recorded something${when}`;
}

export default rosterForDay;
