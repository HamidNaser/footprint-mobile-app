import { routeForHeadTap, summaryMemberId } from '../familyTapRouting';

/**
 * Which screen a head-card tap opens, and which household it asks for.
 *
 * **Rewritten for spec 003 (2026-09-06).** Under 002 the summary was reachable only from
 * your own head card, and these tests pinned that: every other head went to the group
 * journal. That was not a bug in the rule, it was the rule — but it left the summary
 * request carrying no member at all, so tapping your father's card showed your own family
 * under his name. 003 widens it: a head card is a household, and tapping one opens that
 * household's summary.
 *
 * The case worth guarding now is the second function. `memberId` is a tree-node id, and a
 * head card carries an account id right beside it. Sending the wrong one does not fail —
 * the server falls back to the caller's own household — so the screen looks like it works
 * and quietly describes the wrong family. That is the failure this file exists to catch.
 */
describe('routeForHeadTap', () => {
  const me = 'user_manal';

  it('opens the family summary for your own head card', () => {
    expect(routeForHeadTap({ id: 'node_1', linkedUserId: me })).toBe('FamilySummary');
  });

  it('opens the family summary for any other head card', () => {
    // The change from 002: this used to be PersonJournal, which is why the summary was
    // always the caller's own.
    expect(routeForHeadTap({ id: 'node_2', linkedUserId: 'user_someone_else' }))
      .toBe('FamilySummary');
  });

  it('opens the family summary for a head with no linked account', () => {
    // A tree-only grandfather. His branch is still a household; the summary is built from
    // the tree, not from accounts.
    expect(routeForHeadTap({ id: 'node_3', linkedUserId: null })).toBe('FamilySummary');
  });

  it('falls back to the group journal for a head with no node id', () => {
    expect(routeForHeadTap({ linkedUserId: me })).toBe('PersonJournal');
  });

  it('tolerates a missing head without throwing', () => {
    expect(routeForHeadTap(undefined)).toBe('PersonJournal');
    expect(routeForHeadTap(null)).toBe('PersonJournal');
  });
});

describe('summaryMemberId', () => {
  it('sends the tree-node id, never the account id', () => {
    // The whole point. An account id resolves to nothing and the server answers with the
    // caller's own household instead of failing, so this cannot be caught by looking.
    const head = { id: 'node_7', linkedUserId: 'user_manal' };

    expect(summaryMemberId(head)).toBe('node_7');
    expect(summaryMemberId(head)).not.toBe(head.linkedUserId);
  });

  it('means "my own household" when there is no node', () => {
    expect(summaryMemberId(undefined)).toBeUndefined();
    expect(summaryMemberId({})).toBeUndefined();
  });
});
