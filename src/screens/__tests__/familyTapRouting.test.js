import { routeForHeadTap } from '../familyTapRouting';

/**
 * Which screen a head-card tap opens (spec 002, User Story 3).
 *
 * The consolidated summary is reachable only by tapping your *own* head card. Everything
 * else — another family's head, a relative with no account, a session that hasn't resolved
 * yet — must keep going to PersonJournal exactly as it did before this feature existed.
 * These are the cases where a loose comparison would quietly show someone a "family
 * summary" built from a family that isn't theirs.
 */
describe('routeForHeadTap', () => {
  const me = 'user_manal';

  it('opens the family summary when you tap your own head card', () => {
    expect(routeForHeadTap({ linkedUserId: me }, me)).toBe('FamilySummary');
  });

  it('opens the group journal for any other head card', () => {
    expect(routeForHeadTap({ linkedUserId: 'user_someone_else' }, me)).toBe('PersonJournal');
  });

  it('opens the group journal for a head card with no linked account', () => {
    // A tree-only ancestor. Without the null guard this would compare null against a
    // missing id and could route to a summary that is not this user's family.
    expect(routeForHeadTap({ linkedUserId: null }, me)).toBe('PersonJournal');
  });

  it('opens the group journal when the session has no user yet', () => {
    expect(routeForHeadTap({ linkedUserId: me }, undefined)).toBe('PersonJournal');
  });

  it('does not treat a missing id on both sides as a match', () => {
    expect(routeForHeadTap({ linkedUserId: null }, undefined)).toBe('PersonJournal');
    expect(routeForHeadTap({}, undefined)).toBe('PersonJournal');
  });

  it('tolerates a missing head without throwing', () => {
    expect(routeForHeadTap(undefined, me)).toBe('PersonJournal');
  });
});
