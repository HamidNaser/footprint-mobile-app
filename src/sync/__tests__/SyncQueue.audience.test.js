/**
 * The two queue moves an audience refusal needs, and neither of them exists yet.
 *
 * When the server cannot apply the audience a memory was saved with, the phone has to do one
 * of exactly two things with the queued operation (research R15):
 *
 *   - temporary refusal (`source_unavailable`, or a 503 on the single-operation route): put the
 *     operation back so the phone sends it again by itself, **without** spending any of the
 *     three retries that exist for flaky networks and **without** it ever counting as failed;
 *   - final refusal (`do_not_resend`, or a 422): take the operation out of the queue entirely,
 *     so nothing re-sends it, and leave no second record of the refusal anywhere --
 *     `journal_entries.share_state` is the only record there is, and the sync badge must not
 *     also claim a memory failed to upload (round-2 D1, round-3 H1; the owner: card only).
 *
 * Neither move can be made with what the queue has today:
 *
 *   - `cancelOperation` deletes only a `pending` row (`WHERE id = ? AND status = ?`). An
 *     operation refused on the single-operation route is `in_progress` by then --
 *     `_processSingleOperation` marks it so before it calls the server -- and one refused after
 *     an earlier network failure is `failed`. On both, `cancelOperation` deletes nothing and
 *     silently reports that it did nothing;
 *   - `markFailed` increments `retry_count` and sets `failed`, which `SyncContext` folds into
 *     the "N not sent" badge. A share that is merely waiting has not failed, and must not
 *     burn a retry it will need.
 *
 * `expo-sqlite` is native and cannot load under jest, so the real statements run against
 * Node's own SQLite, as `upgradePaths.test.js` and `SyncEngine.batchConflicts.test.js` already
 * do. The queue under test is the real one: its retry rule lives in SQL
 * (`status = 'pending' OR (status = 'failed' AND retry_count < 3)`), so a hand-written fake
 * queue would only be asserting on itself.
 */

import { DatabaseSync } from 'node:sqlite';
import { CREATE_TABLES } from '../../database/schema';

let db;

/**
 * expo-sqlite coerces an `undefined` bind parameter to NULL; node:sqlite throws on it. Coerced
 * here so the fake driver is faithful to the real one.
 */
const bind = (params = []) => params.map((p) => (p === undefined ? null : p));

const mockDriver = {
  runAsync: async (sql, params) => db.prepare(sql).run(...bind(params)),
  getAllAsync: async (sql, params) => db.prepare(sql).all(...bind(params)),
  getFirstAsync: async (sql, params) => db.prepare(sql).get(...bind(params)) ?? null,
  execAsync: async (sql) => db.exec(sql),
  withTransactionAsync: async (fn) => {
    db.exec('BEGIN');
    try {
      await fn();
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  },
};

jest.mock('../../database', () => ({
  getDatabase: jest.fn(async () => mockDriver),
}));

const { SyncQueue, SyncOperationType, OperationStatus } = require('../SyncQueue');

/** One queued edit, in whichever status the caller wants to find it in. */
async function queueOperation(status) {
  const id = await SyncQueue.enqueue({
    type: SyncOperationType.UPDATE_ENTRY,
    entityId: 'local-1',
    serverId: 'srv-1',
    data: { local_id: 'local-1' },
  });

  if (status === OperationStatus.IN_PROGRESS) await SyncQueue.markInProgress(id);
  if (status === OperationStatus.FAILED) await SyncQueue.markFailed(id, 'Network request failed');

  expect((await SyncQueue.getOperation(id)).status).toBe(status);
  return id;
}

const EVERY_UNSETTLED_STATUS = [
  OperationStatus.PENDING,
  OperationStatus.IN_PROGRESS,
  OperationStatus.FAILED,
];

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec(CREATE_TABLES.sync_queue);
  jest.clearAllMocks();
});

afterEach(() => {
  db.close();
});

describe('removeOperation', () => {
  it.each(EVERY_UNSETTLED_STATUS)('deletes a %s operation', async (status) => {
    const id = await queueOperation(status);

    expect(await SyncQueue.removeOperation(id)).toBe(true);

    expect(await SyncQueue.getOperation(id)).toBeNull();
    expect(db.prepare('SELECT COUNT(*) AS n FROM sync_queue').get().n).toBe(0);
  });

  it('reports honestly that an operation it was given no longer exists', async () => {
    // Said out loud rather than implied: a refusal arriving for something already gone is
    // not a success, and a caller that believes it removed a row it did not would stop
    // looking for the one still re-sending.
    expect(await SyncQueue.removeOperation('sync_never_existed')).toBe(false);
  });

  it('exists because cancelOperation cannot do this: it only ever deletes a pending row', async () => {
    // The reason this method is here at all, pinned so nobody folds the two together again.
    // An audience refusal on the single-operation route arrives while the operation is
    // in_progress, and `cancelOperation` deletes nothing at all for one of those -- then
    // returns false, which the refusal path has no way to act on.
    const inProgress = await queueOperation(OperationStatus.IN_PROGRESS);

    expect(await SyncQueue.cancelOperation(inProgress)).toBe(false);
    expect((await SyncQueue.getOperation(inProgress)).status).toBe(OperationStatus.IN_PROGRESS);

    expect(await SyncQueue.removeOperation(inProgress)).toBe(true);
    expect(await SyncQueue.getOperation(inProgress)).toBeNull();
  });

  it('tells the listeners the queue has changed, so the badge stops counting it', async () => {
    const id = await queueOperation(OperationStatus.FAILED);
    const listener = jest.fn();
    const unsubscribe = SyncQueue.addListener(listener);

    await SyncQueue.removeOperation(id);

    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });
});

describe('returnToPending', () => {
  it.each(EVERY_UNSETTLED_STATUS)('sets a %s operation back to pending', async (status) => {
    const id = await queueOperation(status);

    expect(await SyncQueue.returnToPending(id)).toBe(true);

    expect((await SyncQueue.getOperation(id)).status).toBe(OperationStatus.PENDING);
  });

  it.each(EVERY_UNSETTLED_STATUS)('leaves the retry budget of a %s operation exactly as it was', async (status) => {
    const id = await queueOperation(status);
    const before = (await SyncQueue.getOperation(id)).retryCount;

    await SyncQueue.returnToPending(id);

    expect((await SyncQueue.getOperation(id)).retryCount).toBe(before);
  });

  it('re-offers the operation for pushing, so the phone sends it again by itself', async () => {
    const id = await queueOperation(OperationStatus.IN_PROGRESS);

    // in_progress is not pushable: the queue assumes somebody is already sending it, so
    // left alone this operation is never sent again and the memory waits forever.
    expect((await SyncQueue.getPendingOperations()).map((op) => op.id)).not.toContain(id);

    await SyncQueue.returnToPending(id);

    expect((await SyncQueue.getPendingOperations()).map((op) => op.id)).toContain(id);
  });

  it('re-offers an operation whose retries are already spent, without spending another', async () => {
    // A waiting share must keep retrying for as long as the server keeps saying "later"
    // (FR-011). The three-retry budget belongs to flaky networks, and a share that is
    // merely waiting has not failed once, so it must neither consume the budget nor be
    // stopped by one already consumed.
    const id = await queueOperation(OperationStatus.FAILED);
    await SyncQueue.markFailed(id, 'Network request failed');
    await SyncQueue.markFailed(id, 'Network request failed');
    expect((await SyncQueue.getOperation(id)).retryCount).toBe(3);
    expect(await SyncQueue.getPendingOperations()).toEqual([]);

    await SyncQueue.returnToPending(id);

    expect((await SyncQueue.getPendingOperations()).map((op) => op.id)).toContain(id);
    expect((await SyncQueue.getOperation(id)).retryCount).toBe(3);
  });

  it('reports honestly that an operation it was given no longer exists', async () => {
    expect(await SyncQueue.returnToPending('sync_never_existed')).toBe(false);
  });

  it('tells the listeners the queue has changed', async () => {
    const id = await queueOperation(OperationStatus.FAILED);
    const listener = jest.fn();
    const unsubscribe = SyncQueue.addListener(listener);

    await SyncQueue.returnToPending(id);

    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });
});

describe('what the sync badge is told afterwards (round-3 H1)', () => {
  /**
   * `SyncContext` reads `getStats()` and shows `stats.failed + stats.conflict` as "N not
   * sent", and lists the `conflict` rows beside it. An audience refusal is shown on the
   * memory's own card and nowhere else, so after either move the badge must have nothing to
   * say -- which means no `failed` row and no `conflict` row, not a tidier message.
   */
  it('counts a removed operation as nothing at all', async () => {
    const id = await queueOperation(OperationStatus.IN_PROGRESS);

    await SyncQueue.removeOperation(id);

    expect(await SyncQueue.getStats()).toEqual({
      pending: 0,
      inProgress: 0,
      completed: 0,
      failed: 0,
      conflict: 0,
      total: 0,
    });
    expect(await SyncQueue.getConflictedOperations()).toEqual([]);
  });

  it('counts a returned operation as pending work, not as a failure or a refusal', async () => {
    const id = await queueOperation(OperationStatus.FAILED);
    expect((await SyncQueue.getStats()).failed).toBe(1);

    await SyncQueue.returnToPending(id);

    const stats = await SyncQueue.getStats();
    expect(stats.failed).toBe(0);
    expect(stats.conflict).toBe(0);
    expect(stats.pending).toBe(1);
    expect(await SyncQueue.getConflictedOperations()).toEqual([]);
  });

  it('is not re-armed into a failure by a user-driven retry of failed work', async () => {
    // `retryFailed()` calls `resetFailedOperations()`, which touches `failed` rows only. A
    // returned operation is already pending, so the reset neither finds it nor changes it --
    // and in particular cannot turn it into a failure after the fact.
    const id = await queueOperation(OperationStatus.FAILED);
    await SyncQueue.returnToPending(id);

    await SyncQueue.resetFailedOperations();

    const operation = await SyncQueue.getOperation(id);
    expect(operation.status).toBe(OperationStatus.PENDING);
    expect(operation.retryCount).toBe(1);
  });
});
