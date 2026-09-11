/**
 * LifelineApi - API service for the Timeline (Lifeline) feature.
 *
 * Serves a person's year-by-year, generation-by-generation life story live from
 * the Hub API (GET /api/v1/lifeline...), projected from journal entries + family
 * tree — the same source the web app uses.
 *
 * It used to fall back to local mock data whenever the backend was unreachable or
 * the user was signed out, "so the screen always renders". What it rendered was a
 * father called Omar who died in 2019 and a grandfather called Ali who emigrated
 * across the sea, with stock portraits of strangers — shown to somebody opening
 * their own family timeline, with nothing to say it was not theirs.
 *
 * The candidates call below already had the right answer written next to it:
 * inventing a suggestion would mean asking somebody about an afternoon that never
 * happened. Inventing a father is the same mistake, further along.
 *
 * These now return null on failure and let the screen say so.
 */

import { ApiClient } from './ApiClient';
import { API_CONFIG, buildUrl } from '../config/api.config';

/**
 * Get a person's Lifeline overview (years + lineage). Pass no id for the current
 * user. Returns null when it cannot be loaded.
 *
 * A real timeline with no years in it is returned as it is, not treated as a
 * failure. Somebody who has recorded nothing yet has an empty timeline, and that
 * is the truth about their timeline — it was previously the trigger for replacing
 * them with an invented family.
 */
export const getLifeline = async (personId = null) => {
  try {
    const endpoint = personId ? `/lifeline/${encodeURIComponent(personId)}` : '/lifeline';
    const url = buildUrl(API_CONFIG.HUB_BASE_URL, endpoint);
    return (await ApiClient.get(url)) || null;
  } catch (err) {
    console.warn('[LifelineApi] could not load the overview:', err.message);
    return null;
  }
};

/**
 * Get the detail for a single year of a person's Lifeline. Returns null when it
 * cannot be loaded.
 */
export const getLifelineYear = async (personId, year) => {
  try {
    const url = buildUrl(
      API_CONFIG.HUB_BASE_URL,
      `/lifeline/${encodeURIComponent(personId)}/year/${year}`
    );
    return (await ApiClient.get(url)) || null;
  } catch (err) {
    console.warn('[LifelineApi] could not load year', year, err.message);
    return null;
  }
};

/**
 * Days that might have mattered, offered as questions.
 *
 * Returns an empty list on any failure rather than falling back to mock data. Inventing a
 * suggestion would mean asking somebody about an afternoon that never happened -- the
 * reasoning that has now been applied to the overview above as well.
 */
export const getTimelineCandidates = async (limit = 20) => {
  try {
    const url = buildUrl(API_CONFIG.HUB_BASE_URL, `/lifeline/candidates?limit=${limit}`);
    const data = await ApiClient.get(url);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn('[LifelineApi] could not load candidates:', err.message);
    return [];
  }
};

/**
 * Never show me this suggestion again.
 *
 * The one call here that must not fail quietly. A lost dismissal means showing the same
 * memory again to somebody who has already asked once to stop seeing it, so this throws
 * and lets the card put itself back.
 */
export const dismissCandidate = async (candidateKey, personId = null) => {
  const url = buildUrl(API_CONFIG.HUB_BASE_URL, '/lifeline/candidates/dismiss');
  await ApiClient.post(url, { candidateKey, personId });
};

/** Undo a dismissal, for a mis-tap. */
export const restoreCandidate = async (candidateKey) => {
  const url = buildUrl(API_CONFIG.HUB_BASE_URL, '/lifeline/candidates/restore');
  await ApiClient.post(url, { candidateKey });
};

export default {
  getLifeline,
  getLifelineYear,
  getTimelineCandidates,
  dismissCandidate,
  restoreCandidate,
};
