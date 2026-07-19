/**
 * useFamilyTree
 *
 * Pattern 2 (Cached + background refresh) for the Family screen:
 *   1. Show cached family (from AsyncStorage) instantly if present.
 *   2. Fetch fresh data from the Hub API in the background, update UI + cache.
 *   3. If offline / request fails: keep showing cache (if any); otherwise show
 *      the real (possibly empty) state — no bundled mock fallback.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { getFamilyTree } from '../services/FamilyService';

const CACHE_KEY = '@footprint/family_tree';

export function useFamilyTree() {
  const { accessToken } = useAuth();
  const [branchData, setBranchData] = useState(null);
  const [listData, setListData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [error, setError] = useState(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    // 1. Show cache instantly if present
    try {
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached && mounted.current) {
        const parsed = JSON.parse(cached);
        setBranchData(parsed.branch);
        setListData(parsed.list);
        setIsLive(true);
      }
    } catch {
      // ignore cache read errors
    }

    // 2. No token → nothing to show (real empty state, no mock)
    if (!accessToken) {
      if (mounted.current) {
        setIsLive(false);
        setIsLoading(false);
      }
      return;
    }

    // 3. Fetch fresh data from the API
    try {
      const { branch, list } = await getFamilyTree(accessToken);
      const hasData = (branch?.branches?.length || 0) > 0 || (list?.families?.length || 0) > 0;

      if (mounted.current) {
        setBranchData(branch);
        setListData(list);
        setIsLive(true);
        if (hasData) {
          AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ branch, list })).catch(() => {});
        } else {
          // Account genuinely has no family yet → show the real empty state and
          // drop any stale cache so we don't keep showing removed members.
          AsyncStorage.removeItem(CACHE_KEY).catch(() => {});
        }
      }
    } catch (err) {
      if (mounted.current) {
        setError(err.message);
        // Keep whatever cache we already showed; do not substitute mock data.
      }
    } finally {
      if (mounted.current) setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  return { branchData, listData, isLoading, isLive, error, refresh: load };
}
