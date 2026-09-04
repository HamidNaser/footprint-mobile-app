/**
 * Where a tap on the family tree should go.
 *
 * Pulled out of FamilyScreen as a plain function with no React Native imports, so the rule
 * can be tested directly. This repo has no React Native testing library and this feature
 * adds no dependencies, so a rule left inline in the component would be untestable — and
 * this particular rule is exactly the one worth guarding: it decides whether tapping your
 * own head card shows your whole family or silently falls through to the old group journal.
 */

/**
 * @param {object} head - the tapped head card (a family unit's head)
 * @param {string|undefined} currentUserId - the signed-in user's account id
 * @returns {'FamilySummary'|'PersonJournal'} the screen to navigate to
 */
export function routeForHeadTap(head, currentUserId) {
  // Both sides must be real before they can match. A tree node with no linked account has
  // `linkedUserId == null`, and a signed-out or still-loading session has no id — comparing
  // those loosely would make `null === undefined` route somebody to a summary of a family
  // that isn't theirs.
  if (head?.linkedUserId && currentUserId && head.linkedUserId === currentUserId) {
    return 'FamilySummary';
  }

  return 'PersonJournal';
}

export default routeForHeadTap;
