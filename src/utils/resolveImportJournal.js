/**
 * Which journal an import puts its entries in (FR-001, FR-009).
 *
 * <p>
 * The same rule as the web client's
 * `foot-print-web/src/pages/Import/resolveImportJournal.js`, deliberately. Two repositories
 * cannot share a module, so the two are kept honest by being pinned to the same behaviour:
 * the signed-in person's journal, one created if they have none, and the most recent if they
 * have several.
 * </p>
 *
 * <p>
 * Both ends are settled here rather than by asking. Somebody who has just agreed to import
 * their camera roll is not in the mood for a question they have no opinion about, and the
 * people most likely to import a back catalogue signed up an hour ago and have no journal at
 * all. Nothing is silent, though: the screen names the destination before the import starts,
 * and <b>this is not called until it does</b> — opening the screen must not create anything.
 * </p>
 */

/** What a journal created for an import is called. Matches the web client. */
export const NEW_JOURNAL_NAME = 'My Journal';

/**
 * `ApiClient` returns whatever the endpoint answered, so a list may arrive bare or wrapped.
 * Reading a wrapped list as "no journals" would create a second notebook beside the one the
 * person already has, which is why this is more forgiving than an `Array.isArray` check.
 */
function asList(response) {
  if (Array.isArray(response)) return response;
  for (const key of ['items', 'journals', 'data', 'results']) {
    if (Array.isArray(response?.[key])) return response[key];
  }
  return [];
}

/**
 * The newest journal, and on a tie the last one the server sent.
 *
 * A reduce rather than a sort, because `createdAt` is optional and a sort comparing two
 * missing values is stable in a way that silently prefers the oldest. Ties resolving to the
 * last entry keeps two imports in one session landing in the same place, which matters more
 * than which one it picks.
 */
function mostRecent(journals) {
  return journals.reduce((best, candidate) =>
    (candidate.createdAt ?? '') >= (best.createdAt ?? '') ? candidate : best);
}

/**
 * Required lazily, not imported.
 *
 * `JournalApi` pulls in `ApiClient`, which pulls in `AsyncStorage`, which throws the moment
 * it is loaded under jest. A top-level import would therefore make this rule — the one that
 * decides where somebody's whole photograph library lands — untestable. Callers always inject
 * in tests, so the require never runs there. The same reasoning is why `buildPhotoMetadata`
 * lives outside `MediaPicker`.
 */
const journalApi = () => require('../api/JournalApi').default;

/**
 * @param {object} [deps] injected for testing; defaults to the real journal API.
 * @returns {Promise<{id: string, name: string, created: boolean}>}
 */
export async function resolveImportJournal({
  listJournals = (...args) => journalApi().listJournals(...args),
  createJournal = (...args) => journalApi().createJournal(...args),
} = {}) {
  const journals = asList(await listJournals());

  if (journals.length > 0) {
    const chosen = mostRecent(journals);
    return { id: chosen.id, name: chosen.name, created: false };
  }

  let created;
  try {
    created = await createJournal({ name: NEW_JOURNAL_NAME });
  } catch (failure) {
    // Named, because "offline" on its own leaves somebody who just granted photo access
    // with no idea which of the two steps went wrong.
    throw new Error(`Could not create a journal to import into: ${failure.message}`);
  }

  return { id: created.id, name: created.name ?? NEW_JOURNAL_NAME, created: true };
}

export default resolveImportJournal;
