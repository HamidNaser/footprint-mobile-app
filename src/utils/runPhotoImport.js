/**
 * Bringing a phone's photograph library in (User Story 3, FR-001, FR-009, FR-011).
 *
 * <p>
 * The same contract as the web client's `foot-print-web/src/pages/Import/runImport.js` —
 * create a batch, read each photograph before uploading it, register in pages, then finalize
 * repeatedly until the server says there is nothing ungrouped left. Deliberately so: the
 * grouping, the deduplication and the entry-making are the server's, and two clients that
 * disagree about the sequence would produce two different libraries from the same photographs.
 * </p>
 *
 * <p>
 * What differs is the source. A browser is handed a list of files; a phone enumerates a
 * library it never holds all of at once, so this pages through with a cursor and does the
 * resume diff against a set of hashes rather than against an up-front list. Same rule,
 * streamed.
 * </p>
 *
 * <p>
 * <b>Nothing here may import `expo-media-library`, `ApiClient` or `DatabaseService`.</b> All
 * three throw the moment they are loaded under jest, and this is the part with the rules in
 * it. Everything is injected; the screen supplies the real implementations.
 * </p>
 */

/**
 * Photographs per library page. Large enough that a twenty-thousand-photograph library is a
 * few hundred round trips rather than twenty thousand, small enough that one page's worth of
 * asset info is not a memory problem on an older phone.
 */
export const LIBRARY_PAGE_SIZE = 100;

/** Registrations per call. Matches the web client's `REGISTRATION_PAGE_SIZE`. */
export const REGISTRATION_PAGE_SIZE = 500;

/**
 * A ceiling on the finalize loop.
 *
 * Not expected to be reached. It exists so a server that never reports completion cannot spin
 * here indefinitely, draining a battery and never returning to the person watching.
 */
export const MAX_FINALIZE_PAGES = 200;

/**
 * What an interrupted run already got through (FR-011).
 *
 * The diff is by **content hash**, because it is the only thing the two sides can compare: the
 * server knows media ids for what it holds, and the phone is holding assets it has never
 * uploaded and has no id for.
 */
async function alreadyUploaded(open, listBatchPhotos) {
  if (!open) return new Set();

  try {
    const registered = await listBatchPhotos(open.batchId);
    return new Set((registered?.photos ?? []).map((p) => p.contentHash).filter(Boolean));
  } catch {
    // A batch that cannot be read must not stop somebody importing at all. Falling back to
    // re-offering everything costs uploads the server will deduplicate; refusing costs them
    // the feature.
    return new Set();
  }
}

/**
 * @param {object} args
 * @param {string} args.journalId where the entries go. Settled by `resolveImportJournal`.
 * @param {(progress: object) => void} [args.onProgress]
 * @param {object} args.deps every side effect, injected.
 */
export async function runPhotoImport({ journalId, onProgress = () => {}, deps }) {
  const {
    listAssets, assetInfo, hashOf, uploadImage, buildPhotoMetadata,
    createBatch, registerPhotos, finalizeBatch, listBatches, listBatchPhotos,
    savePhotoMetadata, confirmPhotoMetadata, countVideos,
  } = deps;

  const summary = {
    entriesCreated: 0, registered: 0, duplicates: 0, held: 0,
    skipped: 0, failed: 0, videos: 0, incomplete: false,
  };

  if (!journalId) {
    throw new Error('An import needs a journal to put its entries in.');
  }

  // Counted, never imported. Videos are not photographs and are not silently treated as
  // them; saying how many there are is the difference between "not supported yet" and
  // "where did those go".
  summary.videos = await countVideos().catch(() => 0);

  const open = (await listBatches('in_progress').catch(() => []))
    ?.find((b) => b.status === 'in_progress');
  const batchId = open?.batchId ?? (await createBatch(journalId)).batchId;
  const known = await alreadyUploaded(open, listBatchPhotos);

  let cursor = null;
  let hasNextPage = true;
  let seen = 0;
  let pending = [];

  /** Register what is queued, and only then let the durable local rows go. */
  const flush = async () => {
    if (pending.length === 0) return;

    const counts = await registerPhotos(batchId, pending.map((p) => p.registration));
    summary.registered += counts.registered ?? 0;
    summary.duplicates += counts.duplicates ?? 0;
    summary.held += counts.held ?? 0;

    // Only now. A row confirmed before the server holds it is a row the purge will delete,
    // taking with it the only durable copy of something that cannot be read again.
    for (const { assetId } of pending) {
      // Same reasoning as the save above: a wider net than `.catch()`, because a failure to
      // confirm must not undo a registration the server has already accepted.
      try {
        await confirmPhotoMetadata(assetId);
      } catch {
        // The row stays unconfirmed and the retry path will offer it again, which is the
        // safe direction.
      }
    }

    pending = [];
  };

  while (hasNextPage) {
    const page = await listAssets({ first: LIBRARY_PAGE_SIZE, after: cursor });
    cursor = page.endCursor;
    hasNextPage = Boolean(page.hasNextPage);

    for (const asset of page.assets ?? []) {
      seen += 1;
      onProgress({ phase: 'reading', done: seen, fileName: asset.filename });

      try {
        // Read before uploading: the metadata has to come off the original while the phone
        // still has it.
        const full = await assetInfo(asset);

        // Unhashable is not the same as already uploaded. Erring towards re-offering costs
        // an upload the server deduplicates; erring the other way loses a photograph.
        const hash = await hashOf(full).catch(() => null);
        if (hash && known.has(hash)) {
          summary.skipped += 1;
          continue;
        }

        const metadata = buildPhotoMetadata(full, { captureRoute: 'import', contentHash: hash });

        /*
         * Durable before the network. The OS kills the app to reclaim memory and anything held
         * only in memory goes with it.
         *
         * A try/catch rather than `.catch()`, deliberately. The intent is that a failed local
         * write never costs the photograph — and `.catch()` only absorbs a rejection, so a
         * synchronous throw (or a stub that returns no promise) escaped to the per-photograph
         * handler and marked the photograph failed, skipping the upload entirely. The net has to
         * be wider than the failure it is there for.
         */
        try {
          await savePhotoMetadata(asset.id, metadata);
        } catch {
          // Losing the durable copy is bad; losing the photograph because the copy failed is
          // worse.
        }

        const media = await uploadImage({ asset: full, metadata });
        pending.push({
          assetId: asset.id,
          registration: { mediaId: media.mediaId, metadata },
        });
      } catch {
        // One bad photograph out of twenty thousand must not abandon the rest. Counted and
        // reported rather than silently skipped.
        summary.failed += 1;
      }

      if (pending.length >= REGISTRATION_PAGE_SIZE) {
        await flush();
      }
    }
  }

  await flush();

  // Repeatedly, until the server says there is nothing ungrouped left. This is the loop the
  // whole import depends on finishing.
  let pages = 0;
  let hasMore = true;
  while (hasMore && pages < MAX_FINALIZE_PAGES) {
    const page = await finalizeBatch(batchId);
    summary.entriesCreated += page.entriesCreated ?? 0;
    hasMore = Boolean(page.hasMore);
    pages += 1;

    onProgress({
      phase: 'grouping',
      entriesCreated: summary.entriesCreated,
      remaining: page.photosRemaining,
    });
  }

  // Reported rather than thrown: the entries that were created are real and worth keeping,
  // and the person needs to know the rest are not done.
  summary.incomplete = hasMore;

  onProgress({ phase: 'done', ...summary });
  return summary;
}

export default runPhotoImport;
