/**
 * Sync Context
 * 
 * Provides sync state and controls throughout the app.
 * Initializes SyncEngine when user is authenticated.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { SyncEngine, SyncState, SyncEvent } from '../sync';
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
    
    // Computed
    isOnline: syncState !== SyncState.OFFLINE,
    isSyncEnabled: syncState !== SyncState.DISABLED,
    
    // Actions
    triggerSync,
    startAutoSync,
    stopAutoSync,
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
