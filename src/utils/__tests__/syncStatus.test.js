/**
 * The indicator must never claim "Synced" while anything is still unsent.
 *
 * That claim was wrong in three separate components at once, and it is the kind of wrong
 * that produces no error and no log line -- the app looked finished, the photos were
 * still on the phone, and the only way to find out was to open the web app and notice
 * the images missing. These pin the rule so it cannot quietly come back.
 */

import { syncBadgeStatus, isFullySynced, SyncBadgeStatus } from '../syncStatus';

describe('the regression itself', () => {
  it('does not say synced while operations are queued', () => {
    // The exact reported case: engine idle, eight operations waiting.
    expect(syncBadgeStatus({ syncState: 'idle', pendingCount: 8 }))
      .toBe(SyncBadgeStatus.PENDING);
  });

  it('does not say synced while operations have failed', () => {
    expect(syncBadgeStatus({ syncState: 'idle', failedCount: 19 }))
      .toBe(SyncBadgeStatus.FAILED);
  });

  it('says synced only when the queue is genuinely empty', () => {
    expect(syncBadgeStatus({ syncState: 'idle', pendingCount: 0, failedCount: 0 }))
      .toBe(SyncBadgeStatus.SYNCED);
  });
});

describe('precedence', () => {
  it('reports failures ahead of pending, because they will not clear themselves', () => {
    expect(syncBadgeStatus({ syncState: 'idle', pendingCount: 5, failedCount: 2 }))
      .toBe(SyncBadgeStatus.FAILED);
  });

  it('reports offline ahead of a backlog, which is waiting rather than broken', () => {
    // A queue that cannot drain for want of a network is not a fault, and calling it
    // one sends people hunting a problem they do not have.
    expect(syncBadgeStatus({ syncState: 'idle', pendingCount: 8, isOnline: false }))
      .toBe(SyncBadgeStatus.OFFLINE);
    expect(syncBadgeStatus({ syncState: 'offline', pendingCount: 8 }))
      .toBe(SyncBadgeStatus.OFFLINE);
  });

  it('reports offline even when operations have failed', () => {
    expect(syncBadgeStatus({ syncState: 'offline', failedCount: 3 }))
      .toBe(SyncBadgeStatus.OFFLINE);
  });

  it('reports disabled above everything, since it explains the rest', () => {
    expect(syncBadgeStatus({ syncState: 'disabled', pendingCount: 8, failedCount: 2 }))
      .toBe(SyncBadgeStatus.DISABLED);
  });

  it('shows work in flight over a count that is about to change', () => {
    expect(syncBadgeStatus({ syncState: 'syncing', pendingCount: 8 }))
      .toBe(SyncBadgeStatus.SYNCING);
  });

  it('treats an errored engine as a failure even with nothing counted', () => {
    expect(syncBadgeStatus({ syncState: 'error' })).toBe(SyncBadgeStatus.FAILED);
  });

  it('still surfaces a backlog while paused', () => {
    // PAUSED has no branch of its own; what matters is that the queue is not hidden.
    expect(syncBadgeStatus({ syncState: 'paused', pendingCount: 4 }))
      .toBe(SyncBadgeStatus.PENDING);
  });
});

describe('defaults', () => {
  it('is synced given nothing at all, rather than throwing', () => {
    expect(syncBadgeStatus()).toBe(SyncBadgeStatus.SYNCED);
    expect(syncBadgeStatus({})).toBe(SyncBadgeStatus.SYNCED);
  });
});

describe('isFullySynced', () => {
  it('requires both counts at zero', () => {
    expect(isFullySynced({ pendingCount: 0, failedCount: 0 })).toBe(true);
    expect(isFullySynced({ pendingCount: 1, failedCount: 0 })).toBe(false);
    expect(isFullySynced({ pendingCount: 0, failedCount: 1 })).toBe(false);
    expect(isFullySynced()).toBe(true);
  });
});

describe('the state literals match the real enum', () => {
  it('uses the values SyncEngine actually emits', () => {
    // syncStatus.js compares against literals to stay free of SyncEngine's dependencies.
    // That is only safe while the literals are correct, so read the enum out of the
    // source and check them -- a rename there fails here rather than on a device.
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '../../sync/SyncEngine.js'),
      'utf8'
    );
    const body = source.match(/export const SyncState = \{([\s\S]*?)\}/)[1];
    const values = [...body.matchAll(/:\s*'([a-z]+)'/g)].map((m) => m[1]);

    expect(values).toEqual(
      expect.arrayContaining(['idle', 'syncing', 'error', 'offline', 'disabled'])
    );
  });
});
