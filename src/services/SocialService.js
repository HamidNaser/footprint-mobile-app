/**
 * Social Service
 *
 * Network-first access to OTHER people's data (friends list + any user's
 * journal feed). Unlike the signed-in user's own journal (offline-first via
 * SQLite + the sync engine), friends'/family's content is fetched live from the
 * Hub/Users API, mirroring the web app. The backend enforces per-entry
 * visibility, so these endpoints only ever return what the viewer is allowed to
 * see — no client-side visibility filtering is required.
 */

import { API_CONFIG } from '../config/api.config';

const BASE = `${API_CONFIG.HUB_BASE_URL}${API_CONFIG.API_VERSION}`;

async function authFetch(endpoint, accessToken, options = {}) {
  const response = await fetch(`${BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const err = new Error(data.message || `Request failed (${response.status})`);
    err.status = response.status;
    throw err;
  }

  if (response.status === 204) return null;
  return response.json();
}

// ============================================================
// Friends
// ============================================================

/** Format an ISO date string as "24 November 1988". */
export function formatBirthday(isoDate) {
  if (!isoDate) return null;
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** Pick the most relevant employer: the current job if any, else the first. */
export function pickWork(employment) {
  if (!Array.isArray(employment) || employment.length === 0) return null;
  const current = employment.find((e) => e.isCurrent);
  return (current ?? employment[0]).company ?? null;
}

/** Pick the primary school: the first education entry's institution. */
export function pickEducation(education) {
  if (!Array.isArray(education) || education.length === 0) return null;
  return education[0].institution ?? null;
}

/** Merge a friend link and its hydrated public profile into the card shape. */
export function adaptFriend(link, profile) {
  const friend = link.friend || {};
  const fullName = [friend.firstName, friend.lastName].filter(Boolean).join(' ').trim();

  return {
    id: friend.id || link.id,
    name: link.nickname || fullName || friend.visibleId || 'Unknown',
    avatar: friend.avatarUrl || profile?.avatarUrl || null,
    location: friend.location || profile?.location || null,
    birthday: formatBirthday(profile?.birthDate),
    education: pickEducation(profile?.education),
    work: pickWork(profile?.employment),
  };
}

/**
 * Fetch a single user's public profile. Returns null on any failure so friend
 * hydration degrades gracefully to summary-only fields.
 * @param {string} accessToken
 * @param {string} userId
 */
export async function getUserProfile(accessToken, userId) {
  try {
    return await authFetch(`/users/${encodeURIComponent(userId)}`, accessToken);
  } catch {
    return null;
  }
}

/**
 * Fetch the current user's friends and hydrate each with their public profile.
 * @param {string} accessToken
 * @returns {Promise<Array>} friend cards { id, name, avatar, location, birthday, education, work }
 */
export async function getFriends(accessToken) {
  const data = await authFetch('/users/me/friends', accessToken);
  const links = data?.links || [];

  return Promise.all(
    links.map(async (link) => {
      const friendId = link.friend?.id;
      const profile = friendId ? await getUserProfile(accessToken, friendId) : null;
      return adaptFriend(link, profile);
    })
  );
}

// ============================================================
// Another user's journal feed
// ============================================================

/** Normalize backend content-block type strings to what JournalEntryCard renders. */
function normalizeBlockType(type) {
  switch ((type || '').toLowerCase()) {
    case 'text':
      return 'text';
    case 'photo':
    case 'photos':
    case 'image':
    case 'images':
      return 'photos';
    case 'video':
    case 'videos':
      return 'video';
    case 'audio':
      return 'audio';
    default:
      return type;
  }
}

/** Map a backend ContentBlockResponse into the mobile card block shape. */
function adaptBlock(block) {
  const media = (block.media || []).map((m) => ({
    id: m.id,
    serverUrl: m.url || m.serverUrl || null,
    thumbnailUrl: m.thumbnailUrl || null,
    width: m.width ?? null,
    height: m.height ?? null,
    duration: m.duration ?? null,
  }));

  return {
    id: block.id,
    type: normalizeBlockType(block.type),
    content: block.content ?? null,
    media,
    duration: block.duration ?? null,
    waveform: block.waveform || [],
  };
}

/**
 * Map a backend JournalEntryResponse into the shape JournalEntryCard expects.
 * Notably: `createdAt` becomes a millisecond timestamp and `localId` is set so
 * FlatList keying works the same as local entries.
 *
 * Two distinct facts are kept distinct, matching `JournalRepository.createFromServer`:
 * `date` is the calendar day the entry is *about*, chosen by the writer, and is what
 * day-grouping reads (`getEntriesByDate` looks entries up by it). `createdAt` is the
 * instant the record was made, and is what time-of-day display reads. Folding the first
 * into the second destroys the time and, because an ISO date-only string parses as UTC
 * midnight while bucketing reads local time, also moves entries a day west of UTC.
 */
export function adaptEntry(entry) {
  const author = entry.author || {};

  return {
    localId: entry.id,
    serverId: entry.id,
    journalId: entry.journalId,
    userId: entry.userId,
    // Verbatim, never re-parsed: round-tripping a civil day through Date and back to a
    // local calendar day lands on the previous day for every timezone west of UTC.
    date: entry.date ?? null,
    // Falls back to the civil day rather than to now: an entry dated last year should not
    // read as recorded today just because the server omitted one field.
    createdAt: new Date(entry.createdAt || entry.date || Date.now()).getTime(),
    updatedAt: entry.updatedAt ? new Date(entry.updatedAt).getTime() : null,
    visibility: entry.visibility,
    syncStatus: 'synced',
    location: entry.location
      ? { lat: entry.location.lat, lng: entry.location.lng, name: entry.location.name }
      : null,
    contentBlocks: (entry.contentBlocks || []).map(adaptBlock),
    reactions: {},
    responses: [],
    responsesCount: entry.commentsCount || 0,
    author: {
      id: author.id || entry.userId,
      name: author.name || null,
      avatarUrl: author.avatar || author.avatarUrl || null,
    },
  };
}

/**
 * Fetch another user's journal entries as visible to the signed-in viewer.
 * Backend enforces per-entry visibility (family / friends / public), so this
 * only returns what the viewer is actually allowed to see.
 * @param {string} accessToken
 * @param {string} userId - target user's id
 * @returns {Promise<Array>} entries in the mobile card shape
 */
export async function getUserEntries(accessToken, userId) {
  if (!userId) return [];

  const data = await authFetch(`/feed/user/${encodeURIComponent(userId)}`, accessToken);
  const items = data?.items || [];
  return items.map((item) => adaptEntry(item.entry || item));
}

/**
 * One household's journal as the book: who is in the household, and a page of the days
 * they wrote on.
 *
 * The household comes back separately from the days on purpose. Membership is a fact about
 * the family; days are a fact about what was written. Deriving the first from the second --
 * which the per-member-sections shape did -- meant anyone who had written nothing vanished
 * from their own family, and a reader could not tell "quiet" from "not here".
 *
 * Paging is by date cursor rather than entry count: a per-member cap gave every member a
 * different horizon, so reading backwards the household thinned out one person at a time.
 *
 * @param {string} accessToken
 * @param {object} [options]
 * @param {string} [options.memberId] - which family-tree node's household to show. A tree-node
 *   id, not a user id: the server only ever consults the caller's own tree. Omitted means
 *   the caller's own branch.
 * @param {string} [options.before] - date cursor, `YYYY-MM-DD`. Pass the previous response's
 *   `oldestDate` to read further back.
 * @param {number} [options.days] - how many days-with-entries to fetch. The server clamps it.
 * @returns {Promise<{household: Array, days: Array, oldestDate: string|null, hasMore: boolean}>}
 */
export async function getJournalBook(accessToken, { memberId, before, days } = {}) {
  const params = [];
  if (memberId) params.push(`memberId=${encodeURIComponent(memberId)}`);
  if (before) params.push(`before=${encodeURIComponent(before)}`);
  if (days) params.push(`days=${encodeURIComponent(days)}`);
  const query = params.length ? `?${params.join('&')}` : '';

  const data = await authFetch(`/journal/book${query}`, accessToken);

  return {
    household: (data?.household || []).map((member) => ({
      memberId: member.memberId,
      userId: member.userId ?? null,
      relation: member.relation,
      name: member.name,
      avatarUrl: member.avatarUrl ?? null,
      hasAccount: member.hasAccount,
    })),
    days: (data?.days || []).map((day) => ({
      date: day.date,
      // No civil-date stripping here any more. This used to remove `date` before adapting,
      // because adaptEntry folded it into `createdAt` and collapsed every time to midnight.
      // adaptEntry now keeps the two apart, so the entry can carry its own civil day.
      entries: (day.entries || []).map((item) => ({
        ...adaptEntry(item.entry || {}),
        memberId: item.memberId,
      })),
    })),
    oldestDate: data?.oldestDate ?? null,
    hasMore: Boolean(data?.hasMore),
  };
}
