import { toMembersData } from '../FamilyService';

/**
 * Every individual, flat (spec 003, User Story 2).
 *
 * The branch and list views both group people into households, so selecting anybody there
 * opens their whole family. This is the one view that reaches a single person, which makes
 * "one row per individual, nobody merged and nobody dropped" its entire contract.
 *
 * The ordering matters for a quieter reason: a family read down the generations is legible,
 * and a family read in whatever order the backend returned is not — but both look fine on a
 * screenshot, so only a test catches the difference.
 */
describe('toMembersData', () => {
  const member = (id, name, birthYear) => ({
    id,
    name,
    birthYear,
    avatar: null,
    location: null,
    lat: null,
    lng: null,
    linkedUserId: null,
  });

  it('returns one row per individual, with nobody grouped into a household', () => {
    const { people } = toMembersData([
      member('m1', 'Akram', 1965),
      member('m2', 'Reem', 1968),
      member('m3', 'Lina', 1996),
    ]);

    expect(people).toHaveLength(3);
    expect(people.map((p) => p.name)).toEqual(['Akram', 'Reem', 'Lina']);
  });

  it('orders oldest first, so a family reads down the generations', () => {
    const { people } = toMembersData([
      member('m3', 'Lina', 1996),
      member('m1', 'Akram', 1965),
      member('m2', 'Reem', 1968),
    ]);

    expect(people.map((p) => p.name)).toEqual(['Akram', 'Reem', 'Lina']);
  });

  it('puts members with no recorded birth year last rather than guessing', () => {
    const { people } = toMembersData([
      member('m9', 'Unknown', null),
      member('m1', 'Akram', 1965),
    ]);

    expect(people.map((p) => p.name)).toEqual(['Akram', 'Unknown']);
  });

  it('marks the signed-in member so the row can say so', () => {
    const { people } = toMembersData([{ ...member('m1', 'Akram', 1965), isMe: true }]);

    expect(people[0].isMe).toBe(true);
  });

  it('omits isMe entirely for everybody else, rather than setting it false', () => {
    const { people } = toMembersData([member('m2', 'Reem', 1968)]);

    expect(people[0]).not.toHaveProperty('isMe');
  });

  it('carries the linked account so a row can open that person\'s journal', () => {
    const { people } = toMembersData([
      { ...member('m1', 'Akram', 1965), linkedUserId: 'user_akram' },
    ]);

    expect(people[0].linkedUserId).toBe('user_akram');
  });

  it('survives an empty or missing family', () => {
    expect(toMembersData([])).toEqual({ people: [] });
    expect(toMembersData(null)).toEqual({ people: [] });
    expect(toMembersData(undefined)).toEqual({ people: [] });
  });

  it('does not mutate the array it was given', () => {
    // It sorts, and sorting in place would reorder the members array the branch and list
    // views are built from.
    const members = [member('m3', 'Lina', 1996), member('m1', 'Akram', 1965)];
    toMembersData(members);

    expect(members.map((m) => m.name)).toEqual(['Lina', 'Akram']);
  });
});
