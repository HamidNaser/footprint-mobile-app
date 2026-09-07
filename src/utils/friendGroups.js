/**
 * The groups a friends list falls into.
 *
 * A group is not a record anywhere. Nobody creates "MIT" and adds people to it -- it exists
 * because four of your friends put MIT down as where they studied. So groups are derived
 * here, on the way to the screen, from the two attributes a friend profile actually carries:
 * where they were educated and where they work.
 *
 * Two decisions, both settled on web and preserved here verbatim:
 *
 * - **A group of one is still a group.** If only one friend went to Kansas, Kansas is still
 *   on the screen. Hiding it would mean the only way to see that connection is to read every
 *   card, and a memory app should surface the connection rather than bury it for want of a
 *   second person.
 * - **Somebody can be in several.** A friend who studied at MIT and works at Cox appears
 *   under both, because both are true. De-duplicating would force a choice between two real
 *   facts about them.
 *
 * Ported from `foot-print-web/src/utils/friendGroups.js`. The two clients must group
 * identically (SC-002), so this is a deliberate line-for-line port rather than a
 * reimplementation -- any behavioural drift here is a bug, not a platform difference.
 *
 * Until now the mobile tree drew `FRIENDS_TREE_DATA`, a bundled sample of five invented
 * people shown to every user regardless of who was signed in. A note on the August commit
 * that removed the other invented data recorded why this one survived: "the backend has no
 * concept of either". That is no longer true -- `Footprint.Users` carries education and
 * employment, and `SocialService.adaptFriend` already reads both onto every friend card.
 * The data was in hand; only this file was missing.
 */

/** The two attributes that make a group, in the order they are shown. */
export const GROUP_KINDS = [
  { kind: 'education', label: 'Education', field: 'education' },
  { kind: 'work', label: 'Work', field: 'work' },
];

/**
 * A stable id for a group.
 *
 * Derived from the kind and the name rather than an index, because the list re-derives on
 * every friends fetch and an index would move under a selection. Selecting "MIT" and then
 * gaining a friend at Amazon would otherwise silently change which group is open.
 *
 * @param {string} kind
 * @param {string} name
 * @returns {string}
 */
export function groupId(kind, name) {
  return `${kind}:${String(name).trim().toLowerCase()}`;
}

/**
 * Bucket friends by one attribute.
 *
 * Names are matched case- and space-insensitively so "MIT" and "mit " are one group, but the
 * first spelling seen is the one displayed -- a friend who typed it in lowercase should not
 * rename the group for everybody else.
 *
 * @param {Array} friends
 * @param {string} field
 * @param {string} kind
 * @returns {Array<{id: string, kind: string, name: string, friends: Array}>}
 */
function bucketBy(friends, field, kind) {
  const buckets = new Map();

  (friends || []).forEach((friend) => {
    const raw = friend?.[field];
    if (!raw || typeof raw !== 'string') return;
    const name = raw.trim();
    if (!name) return;

    const key = groupId(kind, name);
    if (!buckets.has(key)) {
      buckets.set(key, { id: key, kind, name, friends: [] });
    }
    buckets.get(key).friends.push(friend);
  });

  return [...buckets.values()];
}

/**
 * Every group in the friends list, grouped by kind for the tree.
 *
 * @param {Array} friends - friends in the card shape: `{ id, name, avatar, education, work }`
 * @returns {Array} `[{ kind, label, groups: [{ id, kind, name, friends }] }]`, kinds with no
 *   groups omitted so an empty category never draws an empty branch.
 */
export function buildFriendGroups(friends) {
  return GROUP_KINDS
    .map(({ kind, label, field }) => ({
      kind,
      label,
      // Biggest first, then alphabetical. A friends list is read top-down and the group
      // somebody is most likely to want is the one with most people in it; ties fall back to
      // a name so the order is fixed rather than dependent on fetch order.
      groups: bucketBy(friends, field, kind).sort(
        (a, b) => b.friends.length - a.friends.length || a.name.localeCompare(b.name)
      ),
    }))
    .filter((category) => category.groups.length > 0);
}

/**
 * Every group, flat, for looking one up by id.
 *
 * @param {Array} categories
 * @returns {Array}
 */
export function flattenGroups(categories) {
  return (categories || []).flatMap((c) => c.groups);
}

/**
 * Friends who belong to no group at all.
 *
 * Somebody who has recorded neither a school nor an employer cannot appear in the grouped
 * view -- there is nothing to group them by. They are still a friend, so this says who they
 * are rather than letting them fall silently out of the screen; the List view remains their
 * way in.
 *
 * @param {Array} friends
 * @returns {Array}
 */
export function ungroupedFriends(friends) {
  return (friends || []).filter((friend) => {
    const hasEducation = typeof friend?.education === 'string' && friend.education.trim();
    const hasWork = typeof friend?.work === 'string' && friend.work.trim();
    return !hasEducation && !hasWork;
  });
}

/* -------------------------------------------------------------------------------------
 * Mobile-only presentation shaping below this line.
 *
 * Everything above is the shared grouping rule and must stay in step with web. What
 * follows adapts that result to the shape mobile's existing TreeView already draws, so
 * the tree keeps its current layout and only its data changes (FR-008: no redesign).
 * ---------------------------------------------------------------------------------- */

/** The Ionicons name each category is drawn with, matching the tree's existing look. */
const CATEGORY_ICONS = { education: 'school', work: 'briefcase' };

/**
 * Shape derived groups into the object mobile's TreeView expects.
 *
 * The bundled sample this replaces carried a Wikipedia logo URL per organisation. Derived
 * groups have no logo and never will -- "MIT" exists because friends typed it, not because
 * anything registered it -- so `logo` is deliberately absent and the screen draws initials
 * instead, the same fallback `Avatar` already gives a person without a photograph. An
 * invented logo would be the same mistake as an invented friend, one layer down.
 *
 * @param {Array} friends - friends in the card shape
 * @param {{name?: string, avatarUrl?: string, birthYear?: number|string}} [viewer]
 * @returns {{user: object, categories: Array}}
 */
export function toTreeData(friends, viewer) {
  const categories = buildFriendGroups(friends).map((category) => ({
    id: category.kind,
    name: category.label,
    icon: CATEGORY_ICONS[category.kind] ?? 'people',
    organizations: category.groups.map((group) => ({
      id: group.id,
      name: group.name,
      friends: group.friends,
    })),
  }));

  return {
    user: {
      name: viewer?.name ?? 'You',
      avatar: viewer?.avatarUrl ?? null,
      // Omitted rather than guessed. The sample said "Born 1965" for everybody; a birth
      // year the account has not recorded is not ours to supply.
      birthYear: viewer?.birthYear ?? null,
    },
    categories,
  };
}

export default buildFriendGroups;
