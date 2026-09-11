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

export default routeForHeadTap;
