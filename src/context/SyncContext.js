/**
 * Sync Context
 * 
 * Provides sync state and controls throughout the app.
 * Initializes SyncEngine when user is authenticated.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { SyncEngine, SyncQueue, SyncState, SyncEvent } from '../sync';
import { useAuth } from './AuthContext';
import { SettingsService, StorageMode } from '../services/SettingsService';
import { SignalRService, SignalREvents } from '../services/SignalRService';

const SyncContext = createContext(null);

export function SyncProvider({ children }) {
  const { isAuthenticated, user } = useAuth();
  const [syncState, setSyncState] = useState(SyncState.IDLE);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Queue depth, read from the queue rather than inferred from syncState. These are
  // different questions: syncState answers "is a sync running right now", and the
  // queue answers "is there anything still unsent". Conflating them is what let the
  // app show "Synced" beside eight pending operations.
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);

  const refreshQueueCounts = useCallback(async () => {
    try {
      const stats = await SyncQueue.getStats();
      // In-progress work is still unsent, so it counts as pending. Conflicts count as
      // failures: both need a person, and neither clears on its own.
      setPendingCount(stats.pending + stats.inProgress);
      setFailedCount(stats.failed + stats.conflict);
    } catch (error) {
      console.error('[SyncContext] Could not read queue counts:', error);
    }
  }, []);

  // Initialize SyncEngine when authenticated
  useEffect(() => {
    let mounted = true;

    const initSync = async () => {
      if (!isAuthenticated || !user) {
        console.log('[SyncContext] User not authenticated, skipping sync init');
        return;
      }

      try {
        // Check storage mode before initializing
        const storageMode = await SettingsService.getStorageMode();
        if (storageMode === StorageMode.LOCAL_ONLY) {
          console.log('[SyncContext] Local-only mode, sync disabled');
          if (mounted) {
            setSyncState(SyncState.DISABLED);
            setIsInitialized(true);
          }
          return;
        }

        console.log('[SyncContext] Initializing SyncEngine...');
        await SyncEngine.initialize();
        
        if (mounted) {
          setIsInitialized(true);
          setSyncState(SyncEngine.getState());
          setLastSyncTime(SyncEngine.getLastSyncTime());
        }

        console.log('[SyncContext] SyncEngine initialized successfully');
      } catch (error) {
        console.error('[SyncContext] Failed to initialize SyncEngine:', error);
        if (mounted) {
          setSyncState(SyncState.ERROR);
        }
      }
    };

    initSync();

    return () => {
      mounted = false;
    };
  }, [isAuthenticated, user]);

  // Set up SyncEngine event listeners
  useEffect(() => {
    if (!isInitialized) return;

    const handleEvent = (event, data) => {
      switch (event) {
        case SyncEvent.STATE_CHANGED:
          console.log('[SyncContext] State changed:', data.currentState);
          setSyncState(data.currentState);
          break;
        case SyncEvent.SYNC_STARTED:
          console.log('[SyncContext] Sync started');
          setIsSyncing(true);
          break;
        case SyncEvent.SYNC_COMPLETED:
          console.log('[SyncContext] Sync completed');
          setIsSyncing(false);
          setLastSyncTime(new Date());
          break;
        case SyncEvent.SYNC_FAILED:
          console.error('[SyncContext] Sync failed:', data.error);
          setIsSyncing(false);
          break;
        case SyncEvent.PROGRESS:
          setSyncProgress(data);
          break;
      }
    };

    // Subscribe to all events
    const unsubscribe = SyncEngine.addListener(handleEvent);

    return () => {
      // Unsubscribe on cleanup
      unsubscribe();
    };
  }, [isInitialized]);

  // Track queue depth
  useEffect(() => {
    if (!isInitialized) return;

    let cancelled = false;
    let scheduled = false;

    // The queue notifies on every status change, so a sync of twenty operations fires
    // dozens of these in a burst. Coalesce them into one read per tick rather than
    // running a COUNT per event.
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      setTimeout(() => {
        scheduled = false;
        if (!cancelled) refreshQueueCounts();
      }, 250);
    };

    refreshQueueCounts();
    const unsubscribe = SyncQueue.addListener(schedule);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [isInitialized, refreshQueueCounts]);

  // Listen for SignalR sync notifications
  useEffect(() => {
    if (!isInitialized) return;

    const handleSyncAvailable = (syncEvent) => {
      console.log('[SyncContext] SignalR sync available:', syncEvent.type, syncEvent.action);
      // Trigger a sync when notified of new data
      SyncEngine.sync({ force: false }).catch(err => {
        console.error('[SyncContext] Auto-sync from SignalR failed:', err);
      });
    };

    // Subscribe to SignalR sync events
    const unsubscribe = SignalRService.on(SignalREvents.SYNC_AVAILABLE, handleSyncAvailable);

    return () => {
      unsubscribe();
    };
  }, [isInitialized]);

  // Cleanup on logout
  useEffect(() => {
    if (!isAuthenticated && isInitialized) {
      console.log('[SyncContext] User logged out, destroying SyncEngine');
      SyncEngine.destroy();
      setIsInitialized(false);
      setSyncState(SyncState.IDLE);
      setLastSyncTime(null);
      setPendingCount(0);
      setFailedCount(0);
    }
  }, [isAuthenticated, isInitialized]);

  // Manual sync trigger
  const triggerSync = useCallback(async (options = {}) => {
    if (!isInitialized) {
      console.warn('[SyncContext] Cannot sync - not initialized');
      return { success: false, reason: 'not_initialized' };
    }

    return SyncEngine.sync(options);
  }, [isInitialized]);

  // Start auto-sync
  const startAutoSync = useCallback(() => {
    if (isInitialized) {
      SyncEngine.startAutoSync();
    }
  }, [isInitialized]);

  // Stop auto-sync
  const stopAutoSync = useCallback(() => {
    if (isInitialized) {
      SyncEngine.stopAutoSync();
    }
  }, [isInitialized]);

  const value = {
    // State
    syncState,
    lastSyncTime,
    isSyncing,
    syncProgress,
    isInitialized,
    pendingCount,
    failedCount,

    // Computed
    isOnline: syncState !== SyncState.OFFLINE,
    isSyncEnabled: syncState !== SyncState.DISABLED,
    // "Everything is saved on the server" — the only honest basis for saying Synced.
    isFullySynced: pendingCount === 0 && failedCount === 0,

    // Actions
    triggerSync,
    startAutoSync,
    stopAutoSync,
    refreshQueueCounts,
  };

  return (
    <SyncContext.Provider value={value}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSync must be used within a SyncProvider');
  }
  return context;
}

export { SyncState };
