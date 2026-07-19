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
 * FlatList keying and date grouping work the same as local entries.
 */
export function adaptEntry(entry) {
  const author = entry.author || {};

  return {
    localId: entry.id,
    serverId: entry.id,
    journalId: entry.journalId,
    userId: entry.userId,
    createdAt: new Date(entry.date || entry.createdAt || Date.now()).getTime(),
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
