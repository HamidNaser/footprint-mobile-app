/**
 * What the sync indicator should be saying.
 *
 * This rule lived in three places -- SyncStatusBadge, JournalScreen and SettingsScreen --
 * and each got it wrong in its own way. The badge read `syncState` alone, and `IDLE`
 * there means "no sync is running", not "nothing is left to send", so it displayed
 * "Synced" over a queue eight operations deep. JournalScreen counted entries rendered on
 * screen, which misses queued media uploads entirely (they are not entries) and any entry
 * outside the current day. SettingsScreen had the shape right but was fed a hardcoded
 * zero behind a `TODO`.
 *
 * The failure they share is the same one: reporting success while data sat unsent, with
 * nothing on screen to contradict it. So the decision lives here, once, and returns a
 * status rather than an icon -- each caller keeps its own presentation.
 *
 * SyncState values are compared as literals rather than imported: importing the enum
 * pulls in SyncEngine, and with it the database and network stack, which would make this
 * module untestable without mocking all of them. The literals are pinned against the real
 * enum in the tests.
 */

export const SyncBadgeStatus = {
  DISABLED: 'disabled',
  OFFLINE: 'offline',
  SYNCING: 'syncing',
  FAILED: 'failed',
  PENDING: 'pending',
  SYNCED: 'synced',
};

/**
 * @param {object}  input
 * @param {string}  [input.syncState]     SyncState value, when the caller has one.
 * @param {number}  [input.pendingCount]  Queued or in-flight operations.
 * @param {number}  [input.failedCount]   Failed or conflicted operations.
 * @param {boolean} [input.isOnline]      Pass false to force OFFLINE.
 * @returns {string} a SyncBadgeStatus
 */
export function syncBadgeStatus({
  syncState,
  pendingCount = 0,
  failedCount = 0,
  isOnline = true,
} = {}) {
  // Sync being switched off explains everything else, so it is reported first.
  if (syncState === 'disabled') return SyncBadgeStatus.DISABLED;

  // Offline outranks the backlog: a queue that cannot drain because there is no network
  // is not a fault, and calling it one sends people looking for a problem they don't have.
  if (isOnline === false || syncState === 'offline') return SyncBadgeStatus.OFFLINE;

  // Work actually moving is worth showing over a count that is about to change.
  if (syncState === 'syncing') return SyncBadgeStatus.SYNCING;

  // Failures before pending: these do not clear on their own and need a person.
  if (failedCount > 0 || syncState === 'error') return SyncBadgeStatus.FAILED;

  if (pendingCount > 0) return SyncBadgeStatus.PENDING;

  return SyncBadgeStatus.SYNCED;
}

/**
 * True only when everything is on the server. The one honest basis for saying "Synced".
 */
export function isFullySynced({ pendingCount = 0, failedCount = 0 } = {}) {
  return pendingCount === 0 && failedCount === 0;
}
