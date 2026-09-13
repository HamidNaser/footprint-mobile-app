/**
 * The roster exists for the people who are *not* on the page.
 *
 * Which makes its central property a negative one, and negatives are what quietly stop
 * holding: nobody is ever dropped for having recorded nothing. An optimisation that skipped
 * empty members would look tidier, pass every other test, and silently reintroduce the
 * exact confusion this module was written to answer — a thin day reading as a broken
 * screen.
 *
 * Membership now comes from `household` (Phase 2's `getJournalBook`), not from who wrote.
 * `household` already arrives in reading order — head, then spouse, then children — so this
 * module no longer sorts; it trusts the order it is given. `dayEntries` is already scoped to
 * one day (the caller does that, via the journal book's day grouping), so this module no
 * longer knows what a "day" is either.
 */

import { rosterForDay, rosterCaption } from './dayRoster';

const member = (memberId, relation, name, overrides = {}) => ({
  memberId,
  relation,
  name,
  avatarUrl: null,
  hasAccount: true,
  ...overrides,
});

const entry = (id, createdAt, memberId) => ({ serverId: id, createdAt, memberId });

describe('rosterForDay', () => {
  const household = [
    member('m1', 'head', 'Akram'),
    member('m2', 'spouse', 'Reem'),
    member('m3', 'child', 'Lina'),
  ];

  it('keeps everybody, including those who recorded nothing that day', () => {
    const roster = rosterForDay(household, [entry('a', 1, 'm1')]);

    expect(roster.map((r) => r.name)).toEqual(['Akram', 'Reem', 'Lina']);
  });

  it('counts only the entries belonging to each member', () => {
    const roster = rosterForDay(household, [
      entry('a', 1, 'm1'),
      entry('b', 2, 'm3'),
    ]);

    expect(roster.map((r) => r.count)).toEqual([1, 0, 1]);
  });

  // The critical regression test: seeded in an order no relation-based sort would produce
  // (child, then head, then spouse — `head, spouse, child` and its reverse are the only two
  // orderings a `rank()`-style sort could ever emit), so a reintroduced sort would visibly
  // change the assertion below rather than accidentally agreeing with it.
  it('keeps household order exactly as given, without re-sorting by relation', () => {
    const outOfRelationOrder = [
      member('m3', 'child', 'Lina'),
      member('m1', 'head', 'Akram'),
      member('m2', 'spouse', 'Reem'),
    ];

    const roster = rosterForDay(outOfRelationOrder, []);

    expect(roster.map((r) => r.name)).toEqual(['Lina', 'Akram', 'Reem']);
    expect(roster.map((r) => r.relation)).toEqual(['child', 'head', 'spouse']);
  });

  it('keeps a friends group in the order it lists its members, having no relation at all', () => {
    const friends = [
      member('f1', undefined, 'Ben'),
      member('f2', undefined, 'Ann'),
    ];

    const roster = rosterForDay(friends, []);

    expect(roster.map((r) => r.name)).toEqual(['Ben', 'Ann']);
  });

  it('counts whatever entries it is given, regardless of how many belong to one member', () => {
    const roster = rosterForDay(household, [
      entry('a', 1, 'm1'),
      entry('b', 2, 'm1'),
      entry('c', 3, 'm3'),
    ]);

    expect(roster.map((r) => r.count)).toEqual([2, 0, 1]);
  });

  it('carries entry ids so a face can jump to what it is about', () => {
    const roster = rosterForDay(household, [entry('a', 1, 'm1')]);

    expect(roster[0].entryIds).toEqual(['a']);
    expect(roster[1].entryIds).toEqual([]);
  });

  it('carries hasAccount without acting on it', () => {
    const roster = rosterForDay(
      [member('m1', 'head', 'Akram', { hasAccount: true }), member('m2', 'child', 'Sami', { hasAccount: false })],
      []
    );

    expect(roster.map((r) => r.hasAccount)).toEqual([true, false]);
  });

  it('guards a missing name rather than carrying undefined', () => {
    const roster = rosterForDay([member('m1', 'child', undefined)], []);

    expect(roster[0].name).toBe('');
  });

  it('survives empty and missing input', () => {
    expect(rosterForDay([], [])).toEqual([]);
    expect(rosterForDay(null, null)).toEqual([]);
  });
});

describe('rosterCaption', () => {
  const roster = (recorded, total) =>
    Array.from({ length: total }, (_, i) => ({ count: i < recorded ? 1 : 0 }));

  it('says nobody recorded anything', () => {
    expect(rosterCaption(roster(0, 4), '5 August')).toBe(
      'Nobody recorded anything on 5 August'
    );
  });

  it('says how many of how many', () => {
    expect(rosterCaption(roster(1, 4), '5 August')).toBe('1 of 4 recorded something on 5 August');
  });

  it('says when everybody did', () => {
    expect(rosterCaption(roster(4, 4), '5 August')).toBe('All 4 recorded something on 5 August');
  });

  it('does not say "all 1" for a household of one', () => {
    expect(rosterCaption(roster(1, 1), '5 August')).toBe('1 memory on 5 August');
  });

  it('says nothing at all for an empty roster', () => {
    expect(rosterCaption([], '5 August')).toBe('');
  });
});
