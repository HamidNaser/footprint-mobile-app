/**
 * Turning a sync operation the server refused into something a person can read.
 *
 * The sync badge already says "1 not sent" -- `SyncQueue.getStats().conflict` folded in by
 * `SyncContext`. That is a warning light with nothing behind it: among two hundred
 * memories the person cannot tell which one is stuck, or why. This module supplies the two
 * missing answers, and nothing else. There is deliberately no action here -- naming the
 * memory and saying what happened was chosen over offering retry/discard/keep-as-new, and
 * a later change may add one.
 *
 * ## Why the server's own words are never shown
 *
 * They are written for engineers and some of them are actively misleading to a person.
 * "Entry not found" is the common case, and it does not mean the person lost anything or
 * typed something wrong -- it means the memory was deleted on another device, so the edit
 * has nowhere to land. Shown raw it reads like the app lost the memory.
 *
 * So every reason is translated. The strings below were read out of the backend, not
 * guessed:
 *
 *   footprint-backend/Footprint.Hub/src/Footprint.Hub.Api/Controllers/V1/JournalsController.cs
 *     BatchSync()          -- the five `new SyncConflict { ... Reason = ... }` sites
 *     ValidateEntryDate()  -- the missing-date message
 *     ValidateVisibility() -- the two visibility messages
 *
 * ## Why there is a fallback, and why it does not show the raw string either
 *
 * The server can add a reason at any time without this app shipping. An unmapped reason
 * must still produce an honest sentence rather than a blank line, the word `undefined`, or
 * engineer-facing text. The fallback therefore says what is known -- the memory was not
 * saved -- and admits the rest, instead of inventing a cause. `ConflictResolver` has its
 * own placeholder for a server that refuses without saying why, and that lands here too and
 * takes the same path.
 */

import { toDateKey, parseDateKey } from './journalDate';

/**
 * Server reason -> what actually happened, in plain language.
 *
 * Keyed on the exact strings the backend emits. Exact-match, because a substring match on
 * short phrases like "not found" would quietly capture a future reason that only resembles
 * this one and tell the person something false.
 */
const PLAIN_REASONS = {
  // JournalsController.BatchSync, updates: the entry is not on the server any more. By far
  // the most likely refusal in practice, and the one whose server text misleads worst.
  'Entry not found':
    'This memory was deleted on another device, so your change could not be saved.',

  // The ownership guards (OWASP A01 / IDOR). Phrased as the account rather than as
  // "not authorized", which reads like an accusation.
  'Not authorized to update this entry':
    'This memory belongs to a different account, so your change could not be saved.',
  'Not authorized to delete this entry':
    'This memory belongs to a different account, so it could not be deleted.',

  // ValidateEntryDate.
  "An entry needs a date. The 'date' field was missing or empty.":
    'This memory has no date, so it could not be saved.',

  // ValidateVisibility, the custom-audience case.
  'Custom visibility requires a non-empty sharedWith list.':
    'This memory is set to be shared with chosen people, but nobody was chosen, so it could not be saved.',

  // ConflictResolver.processServerConflicts' own placeholder, for a refusal that arrives
  // with no reason at all. Not a server string, but it reaches the same field.
  'The server refused this change without saying why':
    'The server would not save this memory and did not say why.',
};

/**
 * `Invalid visibility '<x>'. Allowed: <list>.` is interpolated, so it cannot be a key.
 * Matched on its fixed opening instead -- the one place a prefix is the honest test.
 */
const INVALID_VISIBILITY_PREFIX = 'Invalid visibility';
const INVALID_VISIBILITY_PLAIN =
  'This memory’s privacy setting was not one the server recognised, so it could not be saved.';

/**
 * Said when the reason is unrecognised, missing, or not a string. Honest about the limit
 * rather than blank, and never the raw text.
 */
export const GENERIC_REFUSAL =
  'This memory could not be saved, and the app does not have a plain explanation for the reason the server gave.';

/**
 * Translate a server refusal reason into plain language.
 *
 * Always returns a non-empty sentence, for any input at all.
 *
 * @param {string} serverReason - the server's own `Reason`
 * @returns {string} something a person can read
 */
export function plainRefusalReason(serverReason) {
  if (typeof serverReason !== 'string') return GENERIC_REFUSAL;

  const reason = serverReason.trim();
  if (!reason) return GENERIC_REFUSAL;

  if (PLAIN_REASONS[reason]) return PLAIN_REASONS[reason];
  if (reason.startsWith(INVALID_VISIBILITY_PREFIX)) return INVALID_VISIBILITY_PLAIN;

  return GENERIC_REFUSAL;
}

/** Longest title shown before it is cut. Long enough to recognise, short enough for a line. */
const TITLE_LIMIT = 60;

const collapse = (text) => String(text).replace(/\s+/g, ' ').trim();

const truncate = (text) =>
  text.length <= TITLE_LIMIT ? text : `${text.slice(0, TITLE_LIMIT).trimEnd()}…`;

/**
 * The best available name for a memory, from the payload that was queued.
 *
 * Entries have no title column -- `journal_entries` stores `content_blocks`, `date` and a
 * location -- so the name has to be derived. Its own words first, because that is what a
 * person recognises; then where it was; then what it is made of.
 *
 * A refused DELETE is the honest gap here: `JournalRepository.delete` queues only
 * `{ local_id }`, so there is no text, no place and no date to show. It says so plainly
 * rather than printing an id.
 */
function titleFor(operation) {
  const data = operation?.data || {};

  const blocks = Array.isArray(data.contentBlocks)
    ? data.contentBlocks
    : Array.isArray(data.content_blocks)
    ? data.content_blocks
    : [];

  for (const block of blocks) {
    if (block?.type === 'text' && typeof block.content === 'string' && collapse(block.content)) {
      return truncate(collapse(block.content));
    }
  }

  const placeName = data.location?.name || data.location_name;
  if (typeof placeName === 'string' && collapse(placeName)) {
    return truncate(collapse(placeName));
  }

  const mediaCount = blocks.reduce(
    (total, block) => total + (Array.isArray(block?.media) ? block.media.length : 0),
    0
  );
  if (mediaCount === 1) return 'A memory with one photo';
  if (mediaCount > 1) return `A memory with ${mediaCount} photos`;

  // Nothing in the payload to name it by. A queued delete always lands here.
  if (operation?.type === 'delete_entry') return 'A memory you deleted on this phone';

  return 'A memory with nothing written in it yet';
}

/**
 * The memory's own day, as a day and never as an instant.
 *
 * `toDateKey` keeps an already-civil `YYYY-MM-DD` verbatim and `parseDateKey` reads it back
 * at *local* midnight, so a memory dated 4 June 1978 reads as 4 June 1978 everywhere.
 * `new Date('1978-06-04')` is UTC midnight and shows as 3 June for anybody west of
 * Greenwich -- the naive-timezone bug this project has already shipped once.
 */
function dayFor(operation) {
  const raw = operation?.data?.date;
  const key = toDateKey(raw);
  if (!key) return null;

  const date = parseDateKey(key);
  if (!date) return null;

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Describe one refused operation.
 *
 * @param {object} operation - a `SyncQueue` row as `_formatOperation` returns it
 * @returns {object} `{ operationId, localId, serverId, title, day, why }`
 */
export function describeRefusedMemory(operation) {
  return {
    operationId: operation?.id || null,
    // What ties the notice back to the memory itself, for whatever action is added later.
    localId: operation?.entityId || null,
    serverId: operation?.serverId || null,
    title: titleFor(operation),
    day: dayFor(operation),
    why: plainRefusalReason(operation?.conflictData?.reason),
  };
}

/**
 * Describe every refused operation, in the order given.
 *
 * Returns `[]` for an empty or missing list, so "nothing was refused" renders as nothing at
 * all rather than as an empty notice.
 *
 * @param {array} operations - from `SyncQueue.getConflictedOperations()`
 * @returns {array} one description per refused operation
 */
export function refusedMemoriesFrom(operations = []) {
  if (!Array.isArray(operations)) return [];
  return operations.map(describeRefusedMemory);
}

export default refusedMemoriesFrom;
