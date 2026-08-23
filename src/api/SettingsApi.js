/**
 * Settings API
 *
 * Client for user settings that live on the Hub API — currently the location
 * privacy precision (how precisely family and friends see an entry's location).
 */

import { ApiClient } from './ApiClient';
import { API_CONFIG, SETTINGS_ENDPOINTS, buildUrl } from '../config/api.config';

/**
 * Location-precision options shown in the UI, in order.
 * `meters === null` means "Private" — no coordinate is shared, only the place name.
 * Allowed values must match the backend LocationPrecision.AllowedMeters + Private.
 */
export const LOCATION_PRECISION_OPTIONS = [
  { meters: 0, label: 'Exact', hint: 'The precise spot' },
  { meters: 100, label: 'Street', hint: 'Which block/street (~100 m)' },
  { meters: 500, label: 'Neighborhood', hint: 'General area (~500 m)' },
  { meters: 1000, label: 'District', hint: 'Part of town (~1 km)' },
  { meters: 5000, label: 'City', hint: 'City-level (~5 km)' },
  { meters: null, label: 'Private', hint: 'No map pin — place name only' },
];

class SettingsApiClass {
  constructor() {
    this.baseUrl = API_CONFIG.HUB_BASE_URL;
  }

  /**
   * Get the current user's location-privacy settings.
   * @returns {Promise<{ defaultLocationSharing: string, familyLocationPrecisionMeters: number, friendsLocationPrecisionMeters: number|null }>}
   */
  async getLocationSettings() {
    const url = buildUrl(this.baseUrl, SETTINGS_ENDPOINTS.GET_LOCATION);
    return ApiClient.get(url);
  }

  /**
   * Update the current user's location-privacy settings.
   * @param {{ defaultLocationSharing: string, familyLocationPrecisionMeters: number, friendsLocationPrecisionMeters: number|null }} settings
   */
  async updateLocationSettings(settings) {
    const url = buildUrl(this.baseUrl, SETTINGS_ENDPOINTS.UPDATE_LOCATION);
    return ApiClient.put(url, settings);
  }

  /**
   * Whether this person wants to be told about the days that might have mattered.
   *
   * Read from the server rather than kept on the device: the prompts are raised
   * server-side, so a value stored here would hide the card and do nothing about the
   * notification — and this phone and the browser would quietly disagree about what had
   * been chosen.
   *
   * @returns {Promise<{ showSuggestions: boolean, notifyAboutSuggestions: boolean }>}
   */
  async getSuggestionSettings() {
    const url = buildUrl(this.baseUrl, SETTINGS_ENDPOINTS.GET_SUGGESTIONS);
    return ApiClient.get(url);
  }

  /**
   * Record the choice, and return what was actually stored rather than what was asked for.
   * @param {{ showSuggestions: boolean, notifyAboutSuggestions: boolean }} settings
   */
  async updateSuggestionSettings(settings) {
    const url = buildUrl(this.baseUrl, SETTINGS_ENDPOINTS.UPDATE_SUGGESTIONS);
    return ApiClient.put(url, settings);
  }
}

export const SettingsApi = new SettingsApiClass();
export default SettingsApi;
