/**
 * Turn the family summary's per-member sections into the day-by-day list the rest of the
 * app reads.
 *
 * The summary arrives grouped by person, which is how the endpoint answers "who is in this
 * family and what have they written". Every other journal surface in the app is read by
 * day. Rendering the endpoint's own shape meant this screen alone was organised by person:
 * a family's week arrived as five separate stacks, and answering "what happened on Sunday"
 * meant reading all five and holding the dates in your head.
 *
 * So the two are transposed here. Every member's entries go into one pool, the pool is
 * grouped by civil date, and within a day the entries are ordered head of the branch, then
 * spouse, then children -- so a day reads down the family in a fixed order rather than in
 * whatever order the server happened to return.
 *
 * Ported from `foot-print-web/src/utils/familySummarySpreads.js`, with one deliberate
 * difference: web produces "spreads" for its flip-book, and mobile has no such thing. The
 * output here is `SectionList` sections, which is what this screen already draws (FR-008:
 * no redesign). The *ordering* rules are identical, because a family's day should read the
 * same on both clients.
 *
 * Attribution is taken from the section, not from the entry. `adaptEntry` falls back to a
 * null author when the API omits one, and a family journal that cannot name your wife's
 * memory is worse than not showing it -- the section already knows exactly whose entries
 * these are.
 *
 * One thing this transposition costs, and where it is paid back: grouped by person, a
 * member with nothing recorded still got a header, so the screen could not disagree with
 * the tree it was opened from (002's FR-010). Grouped by day there is nowhere to put that
 * header. The day roster restores it -- it draws every member of the household above the
 * list, dimming whoever recorded nothing that day.
 */

import { toDateKey, parseDateKey } from './journalDate';

/** Head of the branch first, then spouse, then children. */
const RELATION_ORDER = { head: 0, spouse: 1, child: 2 };

function relationRank(relation) {
  const rank = RELATION_ORDER[relation];
  return rank === undefined ? Number.MAX_SAFE_INTEGER : rank;
}

/**
 * A day's heading — "Sunday, 5 August 2026", or the raw key if it cannot be parsed.
 *
 * @param {string} key - `YYYY-MM-DD`
 * @returns {string}
 */
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
 * Flatten per-member sections into one entry pool, each entry carrying who recorded it.
 *
 * @param {Array} sections - `{ memberId, relation, name, avatarUrl, entries }[]`
 * @returns {Array} entries in card shape, each with `author`, `relation` and `sectionIndex`
 */
export function flattenFamilyEntries(sections) {
  const entries = [];

  (sections || []).forEach((section, sectionIndex) => {
    (section.entries || []).forEach((entry) => {
      entries.push({
        ...entry,
        author: {
          ...(entry.author || {}),
          id: section.memberId,
          name: section.name,
          avatarUrl: section.avatarUrl ?? null,
        },
        // Carried for ordering only.
        relation: section.relation,
        sectionIndex,
      });
    });
  });

  return entries;
}

/**
 * The family summary as day sections, newest day first.
 *
 * @param {Array} sections - the endpoint's per-member sections
 * @returns {Array} `[{ key, title, data }]` ready for `SectionList`
 */
export function familySummaryToDays(sections) {
  const byDay = new Map();

  flattenFamilyEntries(sections).forEach((entry) => {
    const key = toDateKey(entry.createdAt);
    // An entry with no usable date cannot be placed on a day. Dropping it silently is how
    // somebody concludes an entry was lost, so it is kept under its own heading rather
    // than filed under today, which would be a guess.
    const dayKey = key ?? 'undated';
    if (!byDay.has(dayKey)) byDay.set(dayKey, []);
    byDay.get(dayKey).push(entry);
  });

  const days = [...byDay.entries()].map(([key, data]) => ({
    key,
    title: key === 'undated' ? 'Date unknown' : dayLabel(key),
    data: data.sort((a, b) => {
      const byRelation = relationRank(a.relation) - relationRank(b.relation);
      if (byRelation !== 0) return byRelation;
      // Two children, or two entries from one person: keep the server's order, which is
      // already newest-first within a member.
      return a.sectionIndex - b.sectionIndex;
    }),
  }));

  // Newest day first; undated last, since it has no position on the timeline.
  return days.sort((a, b) => {
    if (a.key === 'undated') return 1;
    if (b.key === 'undated') return -1;
    return a.key < b.key ? 1 : -1;
  });
}

export default familySummaryToDays;
