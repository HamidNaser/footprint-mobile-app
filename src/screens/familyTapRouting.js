/**
 * Where a tap on the family tree should go.
 *
 * Pulled out of FamilyScreen as a plain function with no React Native imports, so the rule
 * can be tested directly. This repo has no React Native testing library, so a rule left
 * inline in the component would be untestable — and this is exactly the rule worth
 * guarding, because getting it wrong shows somebody a family that is not the one they
 * tapped.
 *
 * **Widened by spec 003 (2026-09-06).** It used to open the summary only for your *own*
 * head card; every other household fell through to the group journal, and the summary
 * request carried no member at all, so it always described the caller's household whoever
 * had been tapped. Tapping your father's card showed your own family under his name.
 *
 * A head card *is* a household, so tapping one now opens that household's summary — yours
 * or anybody else's — matching web, where `useFamilySummary` has taken a `memberId` all
 * along. Individual people are unaffected: they are reached by tapping a member rather
 * than a head, and still open that person's own journal.
 */

/**
 * @param {object} head - the tapped head card (a family unit's head)
 * @returns {'FamilySummary'|'PersonJournal'} the screen to navigate to
 */
export function routeForHeadTap(head) {
  // The summary is built from the family tree, so what identifies a household is the tree
  // node — not an account. A grandfather who never used the app has no `linkedUserId` and
  // his branch is still his.
  return head?.id ? 'FamilySummary' : 'PersonJournal';
}

/**
 * The household to summarise, as the API identifies it.
 *
 * A **tree-node id, not a user id**. The server only ever consults the caller's own tree,
 * so a node id resolves and an account id does not — silently, returning the caller's own
 * household as though nothing were wrong. The two live side by side on every head card,
 * which is what makes the mistake easy.
 *
 * @param {object} head
 * @returns {string|undefined} the node id, or undefined to mean "my own household"
 */
export function summaryMemberId(head) {
  return head?.id ?? undefined;
}

/**
 * Today's one-person route params, plus a top-level `userId`.
 *
 * `person.id` keeps today's exact fallback (`linkedUserId || id`) — the tree-node id still
 * reaches `person.id`, because callers elsewhere (avatars, display) rely on a non-empty id.
 * `userId` is the new, honest field: the member's real account id, or `null` when there is
 * none. It sits beside `person`, never inside it, and it is never a `??`-style fallback onto
 * `id` — that fallback is exactly the bug 019 research R2 closes, because it would re-send a
 * tree-node id to the server as though it were an account.
 *
 * @param {object} member - a family-tree member (spouse, child, or similar)
 * @returns {{person: {id: string, name: string, avatar: *}, isGroup: false, userId: (string|null)}}
 */
export function personRouteParams(member) {
  return {
    person: {
      id: member.linkedUserId || member.id,
      name: member.name,
      avatar: member.avatar,
    },
    isGroup: false,
    userId: member.linkedUserId ?? null,
  };
}

/**
 * Today's group-mode route params for a head card with no family-book id (research R2's
 * "head card's household"), now with a `userId` (or `null`) on every person and
 * `bookKind: 'household'` so the receiving screen can give it household order.
 *
 * `head` and `members` (spouse and children, in today's order) are combined into one
 * `persons` list, each shaped exactly as today — `{id, name, avatar}`, `id` falling back to
 * the tree-node id — plus `userId`. Dropping a person with no `userId` is the consuming
 * screen's job (research R2), not this helper's: every person is sent, honestly labelled.
 *
 * @param {object} head - the tapped head card
 * @param {object[]} members - the head's spouse and/or children, in display order
 * @returns {{persons: object[], isGroup: true, groupName: (string|undefined), bookKind: 'household'}}
 */
export function householdRouteParams(head, members) {
  const persons = [head, ...members].map((person) => ({
    id: person.linkedUserId || person.id,
    name: person.name,
    avatar: person.avatar,
    userId: person.linkedUserId ?? null,
  }));

  return {
    persons,
    isGroup: true,
    groupName: `${head.name.split(' ')[0]}'s Family`,
    bookKind: 'household',
  };
}

export default routeForHeadTap;
