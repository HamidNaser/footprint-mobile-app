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
 * Ported from `foot-print-web/src/utils/familyDayRoster.js`. Used above the family summary,
 * and above a friends group's journal. A group of friends has no head or spouse, so relying
 * on list order rather than relation simply falls through to the order the group lists its
 * members.
 *
 * This also carries something the day-grouped summary would otherwise lose. Grouped by
 * person, a member with nothing recorded still got a header, so the screen could not
 * quietly disagree with the tree it was opened from (002's FR-010). Grouped by day there is
 * nowhere to hang that header — so it lives here instead, which is a better place for it:
 * it is now per-day rather than per-screen, and says not just "these five are in scope" but
 * "these four had nothing to say today".
 *
 * Membership comes from the journal book's `household` list (Phase 2), which already
 * arrives in reading order — head, then spouse, then children. Ordering that is now the
 * server's job: this module trusts the order it is given rather than re-deriving it from a
 * relation, so a member with no account still appears here rather than being inferred (and
 * dropped) from who wrote.
 */

/**
 * One row per household member, in the order `household` is given, whether or not the
 * member recorded anything.
 *
 * Nobody is ever dropped for having nothing. The people with nothing are the whole point:
 * they are the ones the reader is otherwise left guessing about.
 *
 * @param {Array} household - `{ memberId, userId, relation, name, avatarUrl, hasAccount }[]`,
 *   in reading order
 * @param {Array} dayEntries - the day's entries, each carrying `memberId`; already scoped to
 *   one day by the caller
 * @returns {Array<{memberId: string, name: string, avatar: string|null, relation: string,
 *   hasAccount: boolean, count: number, entryIds: Array<string>}>}
 */
export function rosterForDay(household, dayEntries) {
  const entries = dayEntries || [];

  return (household || []).map((member) => {
    const onDay = entries.filter((entry) => entry.memberId === member.memberId);

    return {
      memberId: member.memberId,
      // Family-tree nodes can lack a name; every consumer of this row treats it as a
      // string, so it is guarded here rather than carrying `undefined` outward.
      name: member.name || '',
      avatar: member.avatarUrl ?? null,
      relation: member.relation,
      // Not acted on here — no dimming distinction, no filtering. That's Phase 3.
      hasAccount: member.hasAccount,
      count: onDay.length,
      // So a face can carry the reader to what it is about.
      entryIds: onDay.map((entry) => entry.serverId || entry.localId || entry.id)
        .filter(Boolean),
    };
  });
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
