/**
 * EventsApi — client for the Footprint.Hub Events endpoints (/api/v1/events).
 *
 * Mirrors the web app's `src/services/eventsService.js`. Uses the shared
 * ApiClient (Bearer auth + automatic token refresh) and adapts backend
 * responses into the shapes the Events screens render (see src/data/eventsData.js).
 */

import { ApiClient } from './ApiClient';
import { API_CONFIG, buildUrl, buildUrlWithQuery } from '../config/api.config';

const EVENTS_PATH = '/events';

/** Normalise an API event into the shape the UI components rely on. */
const adaptEvent = (e) => {
  if (!e) return null;
  return {
    id: e.id,
    tab: e.tab,
    templateId: e.templateId || 'party',
    title: e.title || '',
    subtitle: e.subtitle || '',
    date: e.date,
    location: {
      name: e.location?.name || '',
      address: e.location?.address || '',
      lat: e.location?.lat ?? null,
      lng: e.location?.lng ?? null,
    },
    host: {
      id: e.host?.id || '',
      name: e.host?.name || 'User',
      avatar: e.host?.avatar || null,
    },
    coverImage: e.coverImage || '',
    status: e.status || 'published',
    description: e.description || '',
    rsvp: e.rsvp ?? null,
    guests: (e.guests || []).map((g) => ({
      id: g.id,
      name: g.name || 'Guest',
      avatar: g.avatar || null,
      status: g.status,
    })),
  };
};

/** Build the request body sent to POST/PUT from the UI form + template. */
const toRequestBody = (form) => ({
  title: (form.title || '').trim(),
  subtitle: form.subtitle || null,
  description: form.description || null,
  templateId: form.templateId || null,
  date: form.date ? new Date(form.date).toISOString() : new Date().toISOString(),
  location: {
    name: form.location?.name || null,
    address: form.location?.address || null,
    lat: form.location?.lat ?? null,
    lng: form.location?.lng ?? null,
  },
  coverImage: form.coverImage || null,
  publish: form.publish !== false,
  guests: form.guests || null,
});

export const EventsApi = {
  /** True when there is a stored access token. */
  isAuthenticated() {
    return ApiClient.isAuthenticated();
  },

  /** GET /api/v1/events?tab=my|invites|drafts */
  async getEvents(tab = 'my') {
    const url = buildUrlWithQuery(buildUrl(API_CONFIG.HUB_BASE_URL, EVENTS_PATH), { tab });
    const data = await ApiClient.get(url);
    return (data?.events || []).map(adaptEvent);
  },

  /** GET /api/v1/events/{id} */
  async getEvent(id) {
    const url = buildUrl(API_CONFIG.HUB_BASE_URL, `${EVENTS_PATH}/${encodeURIComponent(id)}`);
    return adaptEvent(await ApiClient.get(url));
  },

  /** POST /api/v1/events */
  async createEvent(form) {
    const url = buildUrl(API_CONFIG.HUB_BASE_URL, EVENTS_PATH);
    return adaptEvent(await ApiClient.post(url, toRequestBody(form)));
  },

  /** PUT /api/v1/events/{id} */
  async updateEvent(id, form) {
    const url = buildUrl(API_CONFIG.HUB_BASE_URL, `${EVENTS_PATH}/${encodeURIComponent(id)}`);
    return adaptEvent(await ApiClient.put(url, toRequestBody(form)));
  },

  /** POST /api/v1/events/{id}/rsvp */
  async rsvpEvent(id, status) {
    const url = buildUrl(API_CONFIG.HUB_BASE_URL, `${EVENTS_PATH}/${encodeURIComponent(id)}/rsvp`);
    return adaptEvent(await ApiClient.post(url, { status }));
  },

  /** DELETE /api/v1/events/{id} — tolerates 404 (already gone). */
  async deleteEvent(id) {
    const url = buildUrl(API_CONFIG.HUB_BASE_URL, `${EVENTS_PATH}/${encodeURIComponent(id)}`);
    try {
      await ApiClient.delete(url);
    } catch (err) {
      if (err?.status !== 404) throw err;
    }
    return true;
  },
};

export default EventsApi;
