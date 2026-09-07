/**
 * The grouping rules, pinned.
 *
 * These are not incidental behaviours. Each one was argued through on web and written into
 * the comments there, and the two clients must agree exactly -- a user who opens the grouped
 * view on their phone and then on their laptop is looking at the same friends and must see
 * the same groups. A drift here is a bug, not a platform difference.
 *
 * The two that are easiest to "tidy" away by accident, and so most worth a test:
 * a group of one is still a group, and a friend with both a school and an employer belongs
 * to both.
 */

import {
  buildFriendGroups,
  flattenGroups,
  groupId,
  ungroupedFriends,
} from './friendGroups';

const friend = (id, name, education, work) => ({
  id,
  name,
  avatar: null,
  education,
  work,
});

describe('buildFriendGroups', () => {
  it('groups friends by where they studied and where they work', () => {
    const categories = buildFriendGroups([
      friend('1', 'Ann', 'MIT', 'Cox'),
      friend('2', 'Ben', 'MIT', null),
    ]);

    const education = categories.find((c) => c.kind === 'education');
    const work = categories.find((c) => c.kind === 'work');

    expect(education.groups).toHaveLength(1);
    expect(education.groups[0].name).toBe('MIT');
    expect(education.groups[0].friends.map((f) => f.name)).toEqual(['Ann', 'Ben']);

    expect(work.groups).toHaveLength(1);
    expect(work.groups[0].friends.map((f) => f.name)).toEqual(['Ann']);
  });

  it('keeps a group of one', () => {
    // Hiding it would mean the only way to see that connection is to read every card.
    const categories = buildFriendGroups([friend('1', 'Ann', 'Kansas', null)]);
    const education = categories.find((c) => c.kind === 'education');

    expect(education.groups).toHaveLength(1);
    expect(education.groups[0].friends).toHaveLength(1);
  });

  it('puts a friend with both attributes in both groups', () => {
    // De-duplicating would force a choice between two facts that are both true.
    const categories = buildFriendGroups([friend('1', 'Ann', 'MIT', 'Cox')]);

    expect(flattenGroups(categories).map((g) => g.name).sort()).toEqual(['Cox', 'MIT']);
    flattenGroups(categories).forEach((group) => {
      expect(group.friends.map((f) => f.id)).toEqual(['1']);
    });
  });

  it('treats names case- and space-insensitively but displays the first spelling seen', () => {
    const categories = buildFriendGroups([
      friend('1', 'Ann', 'MIT', null),
      friend('2', 'Ben', 'mit ', null),
    ]);
    const education = categories.find((c) => c.kind === 'education');

    expect(education.groups).toHaveLength(1);
    expect(education.groups[0].name).toBe('MIT');
    expect(education.groups[0].friends).toHaveLength(2);
  });

  it('orders groups biggest first, then alphabetically', () => {
    const categories = buildFriendGroups([
      friend('1', 'Ann', 'Yale', null),
      friend('2', 'Ben', 'MIT', null),
      friend('3', 'Cal', 'MIT', null),
      friend('4', 'Dee', 'Brown', null),
    ]);
    const education = categories.find((c) => c.kind === 'education');

    expect(education.groups.map((g) => g.name)).toEqual(['MIT', 'Brown', 'Yale']);
  });

  it('omits a category with no groups rather than drawing an empty branch', () => {
    const categories = buildFriendGroups([friend('1', 'Ann', 'MIT', null)]);

    expect(categories.map((c) => c.kind)).toEqual(['education']);
  });

  it('ignores blank and non-string attributes', () => {
    const categories = buildFriendGroups([
      friend('1', 'Ann', '   ', null),
      friend('2', 'Ben', null, 42),
    ]);

    expect(categories).toEqual([]);
  });

  it('survives no friends at all', () => {
    expect(buildFriendGroups([])).toEqual([]);
    expect(buildFriendGroups(null)).toEqual([]);
    expect(buildFriendGroups(undefined)).toEqual([]);
  });
});

describe('groupId', () => {
  it('is stable across a re-fetch and independent of position', () => {
    // Selecting "MIT" and then gaining a friend at Amazon must not change which group
    // is open, so the id cannot be derived from an index.
    expect(groupId('education', 'MIT')).toBe(groupId('education', ' mit '));
    expect(groupId('education', 'MIT')).not.toBe(groupId('work', 'MIT'));
  });
});

describe('ungroupedFriends', () => {
  it('names the friends who belong to no group so they are not silently lost', () => {
    const nobody = friend('3', 'Cal', null, null);
    const result = ungroupedFriends([friend('1', 'Ann', 'MIT', null), nobody]);

    expect(result.map((f) => f.id)).toEqual(['3']);
  });

  it('does not count a blank attribute as belonging somewhere', () => {
    expect(ungroupedFriends([friend('1', 'Ann', '  ', '')]).map((f) => f.id)).toEqual(['1']);
  });
});
