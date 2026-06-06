/**
 * useJournal Hook
 * 
 * React hook for journal operations with state management.
 * Provides a clean API for UI components to interact with journal entries,
 * including loading states, error handling, and optimistic updates.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { JournalService, EntryVisibility, ContentBlockType, MediaType } from '../services/JournalService';

/**
 * Hook for managing journal entries
 * @param {string} journalId - Journal ID to work with
 * @param {object} options - Hook options
 * @returns {object} Journal state and operations
 */
export function useJournal(journalId, options = {}) {
  const { 
    autoFetch = true,
    initialLimit = 20,
    pageSize = 20,
  } = options;

  // State
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Refs
  const offsetRef = useRef(0);
  const mountedRef = useRef(true);

  // ============================================================
  // Data Fetching
  // ============================================================

  /**
   * Fetch entries (initial load or refresh)
   */
  const fetchEntries = useCallback(async (reset = false) => {
    if (!journalId) {
      console.log('[useJournal] fetchEntries skipped - no journalId');
      return;
    }

    console.log('[useJournal] fetchEntries called:', { journalId, reset });

    try {
      if (reset) {
        setLoading(true);
        offsetRef.current = 0;
      }

      const limit = reset ? initialLimit : pageSize;
      const offset = reset ? 0 : offsetRef.current;

      const fetchedEntries = await JournalService.getEntries(journalId, {
        limit,
        offset,
      });

      console.log('[useJournal] fetchEntries result:', { 
        count: fetchedEntries.length, 
        entries: fetchedEntries.map(e => ({ localId: e.localId, date: e.date }))
      });

      if (!mountedRef.current) return;

      if (reset) {
        setEntries(fetchedEntries);
      } else {
        setEntries(prev => [...prev, ...fetchedEntries]);
      }

      offsetRef.current = offset + fetchedEntries.length;
      setHasMore(fetchedEntries.length === limit);
      setError(null);
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message);
        console.error('[useJournal] fetchEntries error:', err);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [journalId, initialLimit, pageSize]);

  /**
   * Load more entries (pagination)
   */
  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    await fetchEntries(false);
  }, [loading, hasMore, fetchEntries]);

  /**
   * Refresh entries (pull-to-refresh)
   */
  const refresh = useCallback(async () => {
    setRefreshing(true);
    await fetchEntries(true);
  }, [fetchEntries]);

  // ============================================================
  // Entry Creation
  // ============================================================

  /**
   * Create a new entry with optimistic update
   * @param {object} entryData - Entry data
   * @returns {Promise<object>} Created entry
   */
  const createEntry = useCallback(async (entryData) => {
    console.log('[useJournal] createEntry called:', { journalId, entryData });
    
    try {
      setError(null);

      const entry = await JournalService.createEntry({
        journalId,
        ...entryData,
      });

      console.log('[useJournal] createEntry success:', { localId: entry.localId, date: entry.date });

      // Optimistic update - add to beginning of list
      setEntries(prev => [entry, ...prev]);

      return entry;
    } catch (err) {
      setError(err.message);
      console.error('[useJournal] createEntry error:', err);
      throw err;
    }
  }, [journalId]);

  /**
   * Create a simple text entry
   */
  const createTextEntry = useCallback(async (text, options = {}) => {
    return createEntry({
      userId: options.userId,
      contentBlocks: [{
        id: Date.now().toString(),
        type: ContentBlockType.TEXT,
        content: text,
        order: 0,
      }],
      date: options.date,
      visibility: options.visibility || EntryVisibility.PRIVATE,
    });
  }, [createEntry]);

  /**
   * Create an entry with a photo
   */
  const createPhotoEntry = useCallback(async (photoUri, options = {}) => {
    try {
      setError(null);

      const entry = await JournalService.createPhotoEntry({
        journalId,
        userId: options.userId,
        photoUri,
        caption: options.caption,
        width: options.width,
        height: options.height,
        date: options.date,
        visibility: options.visibility || EntryVisibility.PRIVATE,
      });

      setEntries(prev => [entry, ...prev]);

      return entry;
    } catch (err) {
      setError(err.message);
      console.error('[useJournal] createPhotoEntry error:', err);
      throw err;
    }
  }, [journalId]);

  /**
   * Create an entry with audio
   */
  const createAudioEntry = useCallback(async (audioUri, options = {}) => {
    try {
      setError(null);

      const entry = await JournalService.createAudioEntry({
        journalId,
        userId: options.userId,
        audioUri,
        duration: options.duration,
        caption: options.caption,
        date: options.date,
        visibility: options.visibility || EntryVisibility.PRIVATE,
      });

      setEntries(prev => [entry, ...prev]);

      return entry;
    } catch (err) {
      setError(err.message);
      console.error('[useJournal] createAudioEntry error:', err);
      throw err;
    }
  }, [journalId]);

  /**
   * Create an entry with video
   */
  const createVideoEntry = useCallback(async (videoUri, options = {}) => {
    try {
      setError(null);

      const entry = await JournalService.createVideoEntry({
        journalId,
        userId: options.userId,
        videoUri,
        thumbnailUri: options.thumbnailUri,
        duration: options.duration,
        caption: options.caption,
        date: options.date,
        visibility: options.visibility || EntryVisibility.PRIVATE,
      });

      setEntries(prev => [entry, ...prev]);

      return entry;
    } catch (err) {
      setError(err.message);
      console.error('[useJournal] createVideoEntry error:', err);
      throw err;
    }
  }, [journalId]);

  /**
   * Create a mixed-content entry
   */
  const createMixedEntry = useCallback(async (options) => {
    try {
      setError(null);

      const entry = await JournalService.createMixedEntry({
        journalId,
        ...options,
      });

      setEntries(prev => [entry, ...prev]);

      return entry;
    } catch (err) {
      setError(err.message);
      console.error('[useJournal] createMixedEntry error:', err);
      throw err;
    }
  }, [journalId]);

  // ============================================================
  // Entry Updates
  // ============================================================

  /**
   * Update an entry with optimistic update
   * @param {string} localId - Entry local ID
   * @param {object} updates - Fields to update
   */
  const updateEntry = useCallback(async (localId, updates) => {
    // Store original for rollback
    const originalEntries = entries;

    try {
      setError(null);

      // Optimistic update
      setEntries(prev => prev.map(entry =>
        entry.localId === localId
          ? { ...entry, ...updates, updatedAt: Date.now() }
          : entry
      ));

      const updatedEntry = await JournalService.updateEntry(localId, updates);

      // Update with actual server response
      setEntries(prev => prev.map(entry =>
        entry.localId === localId ? updatedEntry : entry
      ));

      return updatedEntry;
    } catch (err) {
      // Rollback on error
      setEntries(originalEntries);
      setError(err.message);
      console.error('[useJournal] updateEntry error:', err);
      throw err;
    }
  }, [entries]);

  /**
   * Add content to an existing entry
   */
  const addContent = useCallback(async (localId, block) => {
    return JournalService.addContent(localId, block);
  }, []);

  // ============================================================
  // Entry Deletion
  // ============================================================

  /**
   * Delete an entry with optimistic update
   * @param {string} localId - Entry local ID
   */
  const deleteEntry = useCallback(async (localId) => {
    // Store for potential rollback
    const originalEntries = entries;
    const deletedEntry = entries.find(e => e.localId === localId);

    try {
      setError(null);

      // Optimistic removal
      setEntries(prev => prev.filter(entry => entry.localId !== localId));

      await JournalService.deleteEntry(localId);
    } catch (err) {
      // Rollback on error
      setEntries(originalEntries);
      setError(err.message);
      console.error('[useJournal] deleteEntry error:', err);
      throw err;
    }
  }, [entries]);

  // ============================================================
  // Search
  // ============================================================

  /**
   * Search entries by text
   * @param {string} query - Search query
   * @returns {Promise<Array>} Matching entries
   */
  const searchEntries = useCallback(async (query) => {
    if (!journalId) return [];

    try {
      return await JournalService.searchEntries(journalId, query);
    } catch (err) {
      console.error('[useJournal] searchEntries error:', err);
      return [];
    }
  }, [journalId]);

  // ============================================================
  // Computed Values
  // ============================================================

  /**
   * Entries grouped by date
   */
  const entriesByDate = useMemo(() => {
    const grouped = {};

    for (const entry of entries) {
      const date = entry.date;
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(entry);
    }

    return grouped;
  }, [entries]);

  /**
   * Total entry count
   */
  const entryCount = entries.length;

  // ============================================================
  // Effects
  // ============================================================

  // Auto-fetch on mount and journalId change
  useEffect(() => {
    if (autoFetch && journalId) {
      fetchEntries(true);
    }
  }, [autoFetch, journalId, fetchEntries]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Subscribe to service events
  useEffect(() => {
    const unsubCreate = JournalService.on('entryCreated', (entry) => {
      if (entry.journalId === journalId) {
        setEntries(prev => {
          // Avoid duplicates (in case already added optimistically)
          if (prev.some(e => e.localId === entry.localId)) {
            return prev;
          }
          return [entry, ...prev];
        });
      }
    });

    const unsubUpdate = JournalService.on('entryUpdated', (entry) => {
      if (entry.journalId === journalId) {
        setEntries(prev => prev.map(e =>
          e.localId === entry.localId ? entry : e
        ));
      }
    });

    const unsubDelete = JournalService.on('entryDeleted', ({ localId }) => {
      setEntries(prev => prev.filter(e => e.localId !== localId));
    });

    return () => {
      unsubCreate();
      unsubUpdate();
      unsubDelete();
    };
  }, [journalId]);

  // ============================================================
  // Return Value
  // ============================================================

  return {
    // State
    entries,
    entriesByDate,
    entryCount,
    loading,
    error,
    hasMore,
    refreshing,

    // Data fetching
    fetchEntries: () => fetchEntries(true),
    loadMore,
    refresh,

    // Entry creation
    createEntry,
    createTextEntry,
    createPhotoEntry,
    createAudioEntry,
    createVideoEntry,
    createMixedEntry,

    // Entry updates
    updateEntry,
    addContent,

    // Entry deletion
    deleteEntry,

    // Search
    searchEntries,

    // Utilities
    clearError: () => setError(null),
  };
}

/**
 * Hook for a single journal entry
 * @param {string} localId - Entry local ID
 * @returns {object} Entry state and operations
 */
export function useJournalEntry(localId) {
  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch entry
  const fetchEntry = useCallback(async () => {
    if (!localId) {
      setEntry(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const fetchedEntry = await JournalService.getEntry(localId);
      setEntry(fetchedEntry);
      setError(null);
    } catch (err) {
      setError(err.message);
      console.error('[useJournalEntry] fetchEntry error:', err);
    } finally {
      setLoading(false);
    }
  }, [localId]);

  // Update entry
  const updateEntry = useCallback(async (updates) => {
    if (!localId) return;

    try {
      setError(null);
      const updatedEntry = await JournalService.updateEntry(localId, updates);
      setEntry(updatedEntry);
      return updatedEntry;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [localId]);

  // Delete entry
  const deleteEntry = useCallback(async () => {
    if (!localId) return;

    try {
      await JournalService.deleteEntry(localId);
      setEntry(null);
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [localId]);

  // Auto-fetch
  useEffect(() => {
    fetchEntry();
  }, [fetchEntry]);

  // Subscribe to updates
  useEffect(() => {
    const unsubUpdate = JournalService.on('entryUpdated', (updatedEntry) => {
      if (updatedEntry.localId === localId) {
        setEntry(updatedEntry);
      }
    });

    const unsubDelete = JournalService.on('entryDeleted', ({ localId: deletedId }) => {
      if (deletedId === localId) {
        setEntry(null);
      }
    });

    return () => {
      unsubUpdate();
      unsubDelete();
    };
  }, [localId]);

  return {
    entry,
    loading,
    error,
    refresh: fetchEntry,
    updateEntry,
    deleteEntry,
    clearError: () => setError(null),
  };
}

/**
 * Hook for media gallery
 * @param {string} journalId - Journal ID
 * @returns {object} Media gallery state
 */
export function useMediaGallery(journalId) {
  const [mediaItems, setMediaItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchMedia = useCallback(async () => {
    if (!journalId) return;

    try {
      setLoading(true);
      const items = await JournalService.getMediaGallery(journalId);
      setMediaItems(items);
      setError(null);
    } catch (err) {
      setError(err.message);
      console.error('[useMediaGallery] fetchMedia error:', err);
    } finally {
      setLoading(false);
    }
  }, [journalId]);

  // Group by type
  const images = useMemo(
    () => mediaItems.filter(item => item.type === ContentBlockType.IMAGE),
    [mediaItems]
  );

  const videos = useMemo(
    () => mediaItems.filter(item => item.type === ContentBlockType.VIDEO),
    [mediaItems]
  );

  const audio = useMemo(
    () => mediaItems.filter(item => item.type === ContentBlockType.AUDIO),
    [mediaItems]
  );

  // Auto-fetch
  useEffect(() => {
    fetchMedia();
  }, [fetchMedia]);

  return {
    mediaItems,
    images,
    videos,
    audio,
    loading,
    error,
    refresh: fetchMedia,
    clearError: () => setError(null),
  };
}

// Re-export types for convenience
export { EntryVisibility, ContentBlockType, MediaType };

export default useJournal;
