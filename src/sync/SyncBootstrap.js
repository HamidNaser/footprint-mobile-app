/**
 * Sync Bootstrap
 *
 * Single entry point that activates the offline-first sync stack once the user
 * is authenticated. It wires together the pieces that were previously built but
 * never connected:
 *   - DatabaseService (local SQLite)
 *   - ApiClient / NetworkMonitor (authenticated Hub access)
 *   - SyncEngine (push local -> server, pull server -> local)
 *
 * The local-first contract is preserved: the UI always reads/writes SQLite; this
 * only turns on the background sync loop. Every step is guarded so a failure here
 * can never break local journaling.
 */

import { ApiClient } from '../api/ApiClient';
import { JournalApi } from '../api/JournalApi';
import { SyncEngine } from './SyncEngine';
import { NetworkMonitor } from './NetworkMonitor';
import { DatabaseService } from '../services/DatabaseService';
import { SettingsService } from '../services/SettingsService';

let _started = false;

/**
 * Make the local default journal point at the user's server journal so that
 * entries pulled from the server (which carry the server journal id) line up
 * with what JournalScreen queries. Falls back to a local journal id if the
 * server has none yet.
 */
async function reconcileDefaultJournal() {
  try {
    const response = await JournalApi.listJournals();
    // The Hub may return an array, { journals: [...] }, or { items: [...] }.
    const journals = Array.isArray(response)
      ? response
      : response?.journals || response?.items || [];
    const serverJournal = journals[0];

    if (serverJournal?.id) {
      await SettingsService.setDefaultJournalId(serverJournal.id);
      console.log('[SyncBootstrap] Adopted server journal as default:', serverJournal.id);
      return;
    }
  } catch (error) {
    console.warn('[SyncBootstrap] listJournals failed:', error?.message);
  }

  // No server journal (or the call failed): make sure some default exists so
  // local journaling keeps working.
  const existing = await SettingsService.getDefaultJournalId();
  if (!existing) {
    await SettingsService.getOrCreateDefaultJournal();
  }
}

/**
 * Guarantee the local store belongs to the currently-authenticated user. If a
 * different account previously owned the on-device data, wipe it before syncing
 * so one user's journal can never bleed into another's session.
 */
async function ensureFreshLocalStore(userId) {
  if (!userId) return;
  try {
    const previousOwner = await SettingsService.getUserId();
    if (previousOwner && previousOwner !== userId) {
      console.log('[SyncBootstrap] Account switch detected; clearing local data', {
        previousOwner,
        userId,
      });
      await DatabaseService.clearLocalData();
      // Drop the previous account's journal id + sync cursor as well.
      await SettingsService.clearSettings(true);
    }
    // Record the current owner of the local store.
    await SettingsService.setUserId(userId);
  } catch (error) {
    console.warn('[SyncBootstrap] ensureFreshLocalStore failed:', error?.message);
  }
}

/**
 * Start the sync stack. Safe to call multiple times.
 */
export async function startSync(userId) {
  if (_started) return;

  try {
    await DatabaseService.initialize();
    await ensureFreshLocalStore(userId);
    await ApiClient.initialize();
    await NetworkMonitor.initialize();
    await reconcileDefaultJournal();
    await SyncEngine.initialize();

    _started = true;

    // Kick off an initial sync (pull is what populates a fresh device) then
    // keep syncing on the background interval.
    SyncEngine.sync().catch((error) =>
      console.warn('[SyncBootstrap] initial sync failed:', error?.message),
    );
    SyncEngine.startAutoSync();

    console.log('[SyncBootstrap] Sync started');
  } catch (error) {
    console.warn('[SyncBootstrap] start failed:', error?.message);
    _started = false;
  }
}

/**
 * Stop the sync stack (on logout).
 */
export function stopSync() {
  try {
    SyncEngine.stopAutoSync();
  } catch (error) {
    console.warn('[SyncBootstrap] stop failed:', error?.message);
  }
  _started = false;
}

/**
 * Tear down the local offline store on logout so the next account starts clean
 * and no journal data bleeds across sessions. Every step is guarded so logout
 * can never fail here.
 */
export async function teardownLocalData() {
  stopSync();
  try {
    await DatabaseService.clearLocalData();
  } catch (error) {
    console.warn('[SyncBootstrap] clearLocalData failed:', error?.message);
  }
  try {
    await SettingsService.clearSettings(true);
  } catch (error) {
    console.warn('[SyncBootstrap] clearSettings failed:', error?.message);
  }
}
