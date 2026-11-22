import {
  routeForHeadTap,
  summaryMemberId,
  personRouteParams,
  householdRouteParams,
} from '../familyTapRouting';

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

/**
 * `FamilyScreen` route params carry a real `userId` (019 research R2).
 *
 * Today `handleMemberPress`/`handleFamilyPress` send `member.linkedUserId || member.id` as
 * the person's `id`, so a relative with no account sends a family-tree node id. As an
 * `authorId` on the server, a node id is a 200 with no days — which reads as "no memories"
 * rather than "no account". These helpers add a top-level `userId` (the real account id, or
 * `null`) beside the unchanged `person`/`persons` shape, so a later screen can tell the two
 * apart and refuse to ask the server about someone who was never asked at all.
 */
describe('personRouteParams', () => {
  it('passes the linked user id as a top-level userId, alongside the unchanged person', () => {
    const member = { id: 'node_5', linkedUserId: 'user_sami', name: 'Sami', avatar: 'uri-sami' };

    expect(personRouteParams(member)).toEqual({
      person: { id: 'user_sami', name: 'Sami', avatar: 'uri-sami' },
      isGroup: false,
      userId: 'user_sami',
    });
  });

  it('sends null, never the tree-node id, for a member with no linked account', () => {
    const member = { id: 'node_6', linkedUserId: null, name: 'Huda', avatar: 'uri-huda' };

    const params = personRouteParams(member);

    expect(params.userId).toBeNull();
    // Today's behaviour for `person.id` is unchanged: it still falls back to the node id.
    expect(params.person).toEqual({ id: 'node_6', name: 'Huda', avatar: 'uri-huda' });
  });

  it('treats a missing linkedUserId the same as an explicit null', () => {
    const member = { id: 'node_7', name: 'Yusuf', avatar: 'uri-yusuf' };

    expect(personRouteParams(member).userId).toBeNull();
  });
});

describe('householdRouteParams', () => {
  it('carries userId on every person, linked or not, and marks the book kind', () => {
    const head = { id: 'node_1', linkedUserId: 'user_dad', name: 'Dad Family', avatar: 'a1' };
    const spouse = { id: 'node_2', linkedUserId: 'user_mom', name: 'Mom', avatar: 'a2' };
    const unlinkedChild = { id: 'node_3', linkedUserId: null, name: 'Kid', avatar: 'a3' };

    const params = householdRouteParams(head, [spouse, unlinkedChild]);

    expect(params.isGroup).toBe(true);
    expect(params.bookKind).toBe('household');
    expect(params.persons).toEqual([
      { id: 'user_dad', name: 'Dad Family', avatar: 'a1', userId: 'user_dad' },
      { id: 'user_mom', name: 'Mom', avatar: 'a2', userId: 'user_mom' },
      { id: 'node_3', name: 'Kid', avatar: 'a3', userId: null },
    ]);
  });

  it('keeps today\'s group name, built from the head\'s first name', () => {
    const head = { id: 'node_1', linkedUserId: 'user_dad', name: 'Dad Family', avatar: 'a1' };

    expect(householdRouteParams(head, []).groupName).toBe("Dad's Family");
  });

  it('builds the head-only household when there is no spouse or children', () => {
    const head = { id: 'node_9', linkedUserId: null, name: 'Grandpa', avatar: 'a9' };

    const params = householdRouteParams(head, []);

    expect(params.persons).toEqual([
      { id: 'node_9', name: 'Grandpa', avatar: 'a9', userId: null },
    ]);
  });
});
