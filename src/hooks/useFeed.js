/**
 * useFeed Hook
 * 
 * React hook for fetching feed entries (others' shared entries).
 * Supports single user feed, group feed, family feed, and friends feed.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { FeedApi } from '../api';

/**
 * Feed types
 */
export const FeedType = {
  MAIN: 'main',           // Self + friends
  FAMILY: 'family',       // Family members
  FRIENDS: 'friends',     // Friends
  USER: 'user',           // Specific user
  GROUP: 'group',         // Multiple users
};

/**
 * Hook for fetching feed entries
 * @param {object} options - Hook options
 * @param {string} options.type - Feed type (FeedType enum)
 * @param {string} options.userId - User ID (for USER type)
 * @param {string[]} options.userIds - User IDs (for GROUP type)
 * @param {boolean} options.autoFetch - Auto-fetch on mount (default true)
 * @param {number} options.pageSize - Page size (default 20)
 * @returns {object} Feed state and operations
 */
export function useFeed(options = {}) {
  const {
    type = FeedType.MAIN,
    userId,
    userIds,
    autoFetch = true,
    pageSize = 20,
  } = options;

  // State
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  // Refs
  const offsetRef = useRef(0);
  const mountedRef = useRef(true);

  // ============================================================
  // Data Fetching
  // ============================================================

  /**
   * Fetch feed entries
   */
  const fetchFeed = useCallback(async (reset = false) => {
    console.log('[useFeed] fetchFeed called:', { type, userId, userIds, reset });

    try {
      if (reset) {
        setLoading(true);
        offsetRef.current = 0;
      }

      const limit = pageSize;
      const offset = reset ? 0 : offsetRef.current;

      let response;

      switch (type) {
        case FeedType.MAIN:
          response = await FeedApi.getFeed({ limit, offset });
          break;
        case FeedType.FAMILY:
          response = await FeedApi.getFamilyFeed({ limit, offset });
          break;
        case FeedType.FRIENDS:
          response = await FeedApi.getFriendsFeed({ limit, offset });
          break;
        case FeedType.USER:
          if (!userId) {
            throw new Error('userId required for USER feed type');
          }
          response = await FeedApi.getUserFeed(userId, { limit, offset });
          break;
        case FeedType.GROUP:
          if (!userIds || userIds.length === 0) {
            throw new Error('userIds required for GROUP feed type');
          }
          response = await FeedApi.getGroupFeed(userIds, { limit, offset });
          break;
        default:
          throw new Error(`Unknown feed type: ${type}`);
      }

      console.log('[useFeed] fetchFeed response:', { 
        itemCount: response.items?.length || 0,
        totalCount: response.totalCount,
        hasMore: response.hasMore,
      });

      if (!mountedRef.current) return;

      // Extract entries from feed items
      const feedEntries = (response.items || []).map(item => ({
        ...item.entry,
        feedScore: item.score,
        feedReason: item.reason,
      }));

      if (reset) {
        setEntries(feedEntries);
      } else {
        setEntries(prev => [...prev, ...feedEntries]);
      }

      offsetRef.current = offset + feedEntries.length;
      setHasMore(response.hasMore ?? feedEntries.length === limit);
      setTotalCount(response.totalCount || 0);
      setError(null);
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message);
        console.error('[useFeed] fetchFeed error:', err);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [type, userId, userIds, pageSize]);

  /**
   * Load more entries (pagination)
   */
  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    await fetchFeed(false);
  }, [loading, hasMore, fetchFeed]);

  /**
   * Refresh feed
   */
  const refresh = useCallback(async () => {
    setRefreshing(true);
    await fetchFeed(true);
  }, [fetchFeed]);

  // ============================================================
  // Effects
  // ============================================================

  // Track mounted state
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Auto-fetch on mount or when parameters change
  useEffect(() => {
    if (autoFetch) {
      fetchFeed(true);
    }
  }, [type, userId, JSON.stringify(userIds), autoFetch]);

  // ============================================================
  // Return
  // ============================================================

  return {
    entries,
    loading,
    error,
    hasMore,
    refreshing,
    totalCount,
    refresh,
    loadMore,
    fetchFeed,
  };
}

export default useFeed;
