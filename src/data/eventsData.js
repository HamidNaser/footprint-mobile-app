/**
 * Events mock data + shapes (mobile).
 *
 * Single source of truth for the Events prototype on mobile. Mirrors the web
 * app's shapes (footprint-web-app/src/data/eventsData.js) so the same Hub API
 * (/api/v1/events) can back both clients. UI components depend only on the
 * shapes below, not on where the data comes from — when authenticated we load
 * from the API, otherwise we fall back to this mock so the screens always
 * render something.
 *
 * Event shape:
 *   {
 *     id: string,
 *     tab: 'my' | 'invites' | 'drafts',
 *     templateId: string,                 // -> EVENT_TEMPLATES[].id (visual theme)
 *     title: string,
 *     subtitle: string,
 *     date: ISO string,
 *     location: { name, address, lat, lng },
 *     host: { id, name, avatar },
 *     coverImage: string,
 *     description: string,
 *     rsvp: 'going' | 'maybe' | 'declined' | null,   // current user's response
 *     guests: Array<{ id, name, avatar, status }>,   // going|maybe|declined|invited
 *   }
 */

// ---- Tabs ------------------------------------------------------------------
export const EVENT_TABS = [
  { id: 'my', label: 'My events' },
  { id: 'invites', label: 'Invites' },
  { id: 'drafts', label: 'Drafts' },
];

// ---- Invitation templates (visual themes) ----------------------------------
// RN has no CSS gradients, so each template carries an `accent` (primary color),
// `accentSoft` (light tinted background) and an Ionicons `icon` for the theme.
export const EVENT_TEMPLATES = [
  {
    id: 'wedding',
    name: 'Wedding Invite',
    tagline: 'Elegant floral invitation',
    accent: '#b08968',
    accentSoft: '#f3ece1',
    icon: 'heart',
    cover: 'https://images.unsplash.com/photo-1519741497674-611481863552?w=800&h=1000&fit=crop',
  },
  {
    id: 'birthday',
    name: 'Birthday Invite',
    tagline: 'Fun & colorful celebration',
    accent: '#e0a500',
    accentSoft: '#fff3d6',
    icon: 'gift',
    cover: 'https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?w=800&h=1000&fit=crop',
  },
  {
    id: 'party',
    name: 'Party Invite',
    tagline: 'Modern get-together',
    accent: '#5b6cff',
    accentSoft: '#e8ecff',
    icon: 'sparkles',
    cover: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=800&h=1000&fit=crop',
  },
];

export function getTemplate(templateId) {
  return EVENT_TEMPLATES.find((t) => t.id === templateId) || EVENT_TEMPLATES[0];
}

// ---- Events ----------------------------------------------------------------

// ---- Helpers ---------------------------------------------------------------
/** Count guests by status → { going, maybe, declined, invited, total }. */
export function getGuestCounts(event) {
  const counts = { going: 0, maybe: 0, declined: 0, invited: 0, total: 0 };
  (event?.guests || []).forEach((g) => {
    if (counts[g.status] != null) counts[g.status] += 1;
    counts.total += 1;
  });
  return counts;
}

/** e.g. "Sat, Aug 15, 2026". */
export function formatEventDate(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** e.g. "6:00 PM". */
export function formatEventTime(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** Short list-row date, e.g. "Aug 15 · 6:00 PM". */
export function formatEventShort(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${day} · ${formatEventTime(date)}`;
}

// ---- Status display metadata (shared by pills / rings) ---------------------
export const RSVP_STATUS_META = {
  going: { label: 'Going', color: '#16a34a', soft: '#dcfce7', icon: 'checkmark-circle' },
  maybe: { label: 'Maybe', color: '#d97706', soft: '#fef3c7', icon: 'help-circle' },
  declined: { label: 'Declined', color: '#dc2626', soft: '#fee2e2', icon: 'close-circle' },
  invited: { label: 'Invited', color: '#64748b', soft: '#e2e8f0', icon: 'mail' },
};

export function getStatusMeta(status) {
  return RSVP_STATUS_META[status] || RSVP_STATUS_META.invited;
}
