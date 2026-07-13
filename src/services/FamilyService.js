/**
 * Family Service
 *
 * Fetches the current user's family tree from the Footprint Hub API and adapts
 * the flat backend member list into the shapes the Family screen expects:
 *   - branch (BranchView)  { branches: [...] }  (only units that have children)
 *   - list   (ListView)    { families: [...] }  (all units)
 *
 * Mirrors the web app's familyService transform so web and mobile show the same tree.
 */

import { API_CONFIG } from '../config/api.config';

const FAMILY_ENDPOINT = `${API_CONFIG.HUB_BASE_URL}${API_CONFIG.API_VERSION}/family`;

/**
 * Normalize a backend FamilyMemberResponse into the flat member shape.
 */
export function adaptMember(m) {
  return {
    id: m.id,
    name: m.name,
    birthYear: m.birthYear ?? null,
    avatar: m.avatarUrl ?? null,
    gender: m.gender ?? null,
    spouseId: m.spouseId ?? null,
    parentIds: Array.isArray(m.parentIds) ? m.parentIds : [],
    isMe: m.isOwner === true,
    // The user account this tree node is linked to (null if unclaimed). Used to
    // open that person's live journal from the Family screen.
    linkedUserId: m.linkedUserId ?? null,
    location: m.location?.name ?? null,
    lat: m.location?.lat ?? null,
    lng: m.location?.lng ?? null,
  };
}

function childrenOf(members, parentIds) {
  const idSet = new Set(parentIds.filter(Boolean));
  return members
    .filter((m) => (m.parentIds || []).some((p) => idSet.has(p)))
    .map((c) => ({ id: c.id, name: c.name, avatar: c.avatar, linkedUserId: c.linkedUserId ?? null }));
}

/**
 * Build "family units" from the flat list: a couple (male first) or a single
 * person. Each member is processed once.
 */
function buildUnits(members) {
  const byId = new Map(members.map((m) => [m.id, m]));
  const seen = new Set();
  const units = [];

  for (const member of members) {
    if (seen.has(member.id)) continue;
    seen.add(member.id);

    const spouse = member.spouseId ? byId.get(member.spouseId) : null;
    if (spouse) {
      seen.add(spouse.id);
      const head = member.gender === 'male' ? member : spouse;
      const partner = member.gender === 'male' ? spouse : member;
      units.push({ head, spouse: partner });
    } else {
      units.push({ head: member, spouse: null });
    }
  }
  return units;
}

function orderUnits(units) {
  return [...units].sort((a, b) => {
    if (a.head.isMe !== b.head.isMe) return a.head.isMe ? -1 : 1;
    return (b.head.birthYear ?? 0) - (a.head.birthYear ?? 0);
  });
}

/**
 * Convert the flat normalized member list into BranchView's shape.
 * Only units that have children are meaningful "branches".
 */
export function toBranchData(members) {
  const units = orderUnits(buildUnits(members));
  const branches = units
    .map((u) => ({
      id: u.head.id,
      name: u.head.name,
      birthYear: u.head.birthYear,
      avatar: u.head.avatar,
      linkedUserId: u.head.linkedUserId ?? null,
      ...(u.head.isMe ? { isMe: true } : {}),
      spouse: u.spouse
        ? { id: u.spouse.id, name: u.spouse.name, role: 'wife', avatar: u.spouse.avatar, linkedUserId: u.spouse.linkedUserId ?? null }
        : null,
      children: childrenOf(members, [u.head.id, u.spouse?.id]),
    }))
    .filter((b) => b.children.length > 0);

  return { branches };
}

/**
 * Convert the flat normalized member list into ListView's shape.
 * All units are listed (couples, singles, childless).
 */
export function toListData(members) {
  const units = orderUnits(buildUnits(members));
  const families = units.map((u) => ({
    id: u.head.id,
    name: u.head.name,
    role: u.spouse ? 'Husband' : '',
    avatar: u.head.avatar,
    linkedUserId: u.head.linkedUserId ?? null,
    ...(u.head.isMe ? { isMe: true } : {}),
    spouse: u.spouse
      ? { id: u.spouse.id, name: u.spouse.name, role: 'wife', avatar: u.spouse.avatar, linkedUserId: u.spouse.linkedUserId ?? null }
      : null,
    children: childrenOf(members, [u.head.id, u.spouse?.id]),
  }));

  return { families };
}

/**
 * Fetch the current user's family tree from the Hub API.
 * @param {string} accessToken - Bearer token from AuthContext.
 * @returns {Promise<{ members, branch, list }>}
 */
export async function getFamilyTree(accessToken) {
  const headers = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const response = await fetch(FAMILY_ENDPOINT, { headers });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || `Failed to load family (${response.status})`);
  }

  const data = await response.json();
  const members = (data.members || []).map(adaptMember);

  return {
    members,
    branch: toBranchData(members),
    list: toListData(members),
  };
}
