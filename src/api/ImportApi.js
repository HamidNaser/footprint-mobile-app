import ApiClient from './ApiClient';
import { API_CONFIG, IMPORT_ENDPOINTS, buildUrl, buildUrlWithQuery } from '../config/api.config';

/**
 * The import endpoints (contracts/imports-api.md).
 *
 * <p>
 * Deliberately the same five calls the web client makes, in the same order: create a batch,
 * register pages of already-uploaded photographs against it, then finalize repeatedly until
 * the server reports nothing ungrouped left. The grouping, the deduplication and the
 * entry-making all live on the server precisely so that two clients cannot produce two
 * different libraries from the same photographs.
 * </p>
 *
 * <p>
 * A thin wrapper by design — every rule worth testing is in `runPhotoImport`, which imports
 * none of this, because `ApiClient` pulls in `AsyncStorage` and throws under jest.
 * </p>
 */
class ImportApiClass {
  constructor() {
    this.baseUrl = API_CONFIG.HUB_BASE_URL;
  }

  /** Start an import. */
  async createBatch(journalId) {
    return ApiClient.post(buildUrl(this.baseUrl, IMPORT_ENDPOINTS.CREATE_BATCH), { journalId });
  }

  /**
   * Register a page of already-uploaded photographs against a batch.
   *
   * @param {string} batchId
   * @param {Array<{mediaId: string, metadata: object}>} photos
   */
  async registerPhotos(batchId, photos) {
    return ApiClient.post(
      buildUrl(this.baseUrl, IMPORT_ENDPOINTS.REGISTER_PHOTOS, { batchId }),
      { photos },
    );
  }

  /**
   * What a batch already holds — what a resuming client diffs against so it uploads only the
   * remainder (FR-011).
   */
  async listBatchPhotos(batchId) {
    return ApiClient.get(buildUrl(this.baseUrl, IMPORT_ENDPOINTS.LIST_BATCH_PHOTOS, { batchId }));
  }

  /**
   * Group a page of registered photographs into entries.
   *
   * Safe to call again, and meant to be: the caller loops while `hasMore` is true. A
   * photograph already assigned to an entry is no longer ungrouped, so a repeated call over a
   * finished batch creates nothing rather than duplicating it.
   */
  async finalizeBatch(batchId, maxPhotos = null) {
    return ApiClient.post(
      buildUrl(this.baseUrl, IMPORT_ENDPOINTS.FINALIZE, { batchId }),
      maxPhotos ? { maxPhotos } : {},
    );
  }

  /** The caller's imports. A client resuming after a crash starts here. */
  async listBatches(status = null) {
    const url = buildUrl(this.baseUrl, IMPORT_ENDPOINTS.LIST_BATCHES);
    return ApiClient.get(status ? buildUrlWithQuery(url, { status }) : url);
  }
}

export const ImportApi = new ImportApiClass();
export default ImportApi;
