import ApiClient from './ApiClient';
import { API_CONFIG, PHOTO_ENDPOINTS, buildUrl, buildUrlWithQuery } from '../config/api.config';

/**
 * The undated holding area (contracts/photo-metadata-api.md §3, FR-013, User Story 4).
 *
 * <p>
 * Where photographs land when they carry no usable capture date. <b>Nothing here is a journal
 * entry until the person makes one.</b>
 * </p>
 *
 * <p>
 * The same three calls the web client makes, deliberately: the grouping and the release from
 * holding are the server's, so two clients cannot produce two different libraries out of the
 * same photographs.
 * </p>
 *
 * <p>
 * A thin wrapper by design. Every rule worth testing lives in the pure helpers, because
 * `ApiClient` pulls in `AsyncStorage` and throws the moment it loads under jest.
 * </p>
 *
 * <p>
 * <b>`POST /undated/{mediaId}/date` is deliberately absent.</b> It dates one photograph without
 * grouping it — a genuinely different action — but the web service has had it for a while with
 * no caller, and adding an untested wrapper here would put the same dead code on a second
 * platform. It goes in when there is a screen that uses it.
 * </p>
 */
class HoldingAreaApiClass {
  constructor() {
    this.baseUrl = API_CONFIG.HUB_BASE_URL;
  }

  /**
   * One page of what this person is holding, with hints about which share a place.
   *
   * @param {number} [limit]
   * @param {string|null} [after] the previous page's `nextCursor`.
   *
   *   A cursor rather than a page number because the holding area <b>shrinks while somebody
   *   works through it</b> — every entry they create releases rows — so an offset would step
   *   over photographs each time the set moved underneath it.
   */
  async listUndated(limit = 200, after = null) {
    const url = buildUrl(this.baseUrl, PHOTO_ENDPOINTS.LIST_UNDATED);
    return ApiClient.get(buildUrlWithQuery(url, after ? { limit, after } : { limit }));
  }

  /**
   * Turn a chosen set of held photographs into one entry — the only route by which a held
   * photograph becomes one.
   *
   * @param {{mediaIds: string[], journalId: string, date: string, datePrecision: string}} request
   */
  async groupUndated({ mediaIds, journalId, date, datePrecision }) {
    return ApiClient.post(
      buildUrl(this.baseUrl, PHOTO_ENDPOINTS.GROUP_UNDATED),
      { mediaIds, journalId, date, datePrecision },
    );
  }

}

export const HoldingAreaApi = new HoldingAreaApiClass();
export default HoldingAreaApi;
