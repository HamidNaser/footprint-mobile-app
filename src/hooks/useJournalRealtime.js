/**
 * useJournalRealtime Hook
 * 
 * Custom hook for handling real-time journal updates.
 * Subscribes to relevant SignalR events and provides
 * methods for updating journal state in real-time.
 * 
 * Usage:
 * ```jsx
 * const { newEntryCount, incomingEntries, clearNewEntries } = useJournalRealtime();
 * ```
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRealtime, useRealtimeEvent } from '../context';
import { SignalREvents } from '../services/SignalRService';

/**
 * Custom hook for journal real-time updates
 */
export function useJournalRealtime(options = {}) {
  const {
    onNewEntry,        // Callback when new entry received
    onEntryUpdated,    // Callback when entry updated
    onEntryDeleted,    // Callback when entry deleted
    autoRefresh = true, // Auto-refresh journal on new entries
  } = options;

  const { 
    isConnected, 
    subscribeToEvent,
    notifications,
  } = useRealtime();

  // Track incoming entries that haven't been viewed yet
  const [incomingEntries, setIncomingEntries] = useState([]);
  const [newEntryCount, setNewEntryCount] = useState(0);
  
  // Track if we should show "new entries available" banner
  const [hasNewEntries, setHasNewEntries] = useState(false);
  
  // Last refresh timestamp
  const lastRefreshRef = useRef(Date.now());

  /**
   * Handle incoming notifications for journal entries
   * The backend sends notifications like:
   * - type: 'journal_entry' - New family member journal entry
   * - type: 'comment' - Comment on your entry
   * - type: 'reaction' - Reaction to your entry
   */
  useEffect(() => {
    const unsubscribe = subscribeToEvent(SignalREvents.RECEIVE_NOTIFICATION, (notification) => {
      // Check if this is a journal-related notification
      if (notification.type === 'journal_entry') {
        // New journal entry from family member
        const entry = {
          id: notification.actionUrl?.split('/').pop(), // Extract entry ID from URL
          authorId: notification.actorId,
          authorName: notification.actorName,
          authorAvatar: notification.actorAvatar,
          preview: notification.body,
          timestamp: notification.createdAt,
        };

        setIncomingEntries(prev => [entry, ...prev]);
        setNewEntryCount(prev => prev + 1);
        setHasNewEntries(true);

        if (onNewEntry) {
          onNewEntry(entry);
        }
      }
      
      if (notification.type === 'comment') {
        // Comment on your entry
        if (onEntryUpdated) {
          onEntryUpdated({
            type: 'comment',
            entryId: notification.actionUrl?.split('/').pop(),
            actor: {
              id: notification.actorId,
              name: notification.actorName,
              avatar: notification.actorAvatar,
            },
            timestamp: notification.createdAt,
          });
        }
      }

      if (notification.type === 'reaction') {
        // Reaction to your entry
        if (onEntryUpdated) {
          onEntryUpdated({
            type: 'reaction',
            entryId: notification.actionUrl?.split('/').pop(),
            actor: {
              id: notification.actorId,
              name: notification.actorName,
            },
            timestamp: notification.createdAt,
          });
        }
      }
    });

    return unsubscribe;
  }, [subscribeToEvent, onNewEntry, onEntryUpdated]);

  /**
   * Clear new entry notifications (called when user refreshes or views entries)
   */
  const clearNewEntries = useCallback(() => {
    setIncomingEntries([]);
    setNewEntryCount(0);
    setHasNewEntries(false);
    lastRefreshRef.current = Date.now();
  }, []);

  /**
   * Mark journal as refreshed (resets new entry indicators)
   */
  const markRefreshed = useCallback(() => {
    clearNewEntries();
  }, [clearNewEntries]);

  /**
   * Get entries that arrived after last refresh
   */
  const getEntriesSinceRefresh = useCallback(() => {
    return incomingEntries.filter(
      entry => new Date(entry.timestamp).getTime() > lastRefreshRef.current
    );
  }, [incomingEntries]);

  return {
    // State
    isConnected,
    newEntryCount,
    hasNewEntries,
    incomingEntries,
    
    // Methods
    clearNewEntries,
    markRefreshed,
    getEntriesSinceRefresh,
  };
}

/**
 * Hook for presence awareness in journal context
 * Shows which family members are currently online/active
 */
export function useJournalPresence(familyMemberIds = []) {
  const { onlineUsers, isUserOnline } = useRealtime();
  const [onlineFamily, setOnlineFamily] = useState([]);

  useEffect(() => {
    const online = familyMemberIds.filter(id => isUserOnline(id));
    setOnlineFamily(online);
  }, [familyMemberIds, onlineUsers, isUserOnline]);

  return {
    onlineFamily,
    onlineFamilyCount: onlineFamily.length,
    isUserOnline,
  };
}

export default useJournalRealtime;
