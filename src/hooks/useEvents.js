/**
 * useEvents — loads events for a tab (my | invites | drafts).
 *
 * Mirrors the web hook: when the user is authenticated it calls the Hub API,
 * otherwise (or on any API error) it falls back to the local mock data so the
 * screens always render. Returns { events, isLoading, error, source, refresh }.
 *
 *   source === 'api'  -> live backend data
 *   source === 'mock' -> local fallback (unauthenticated or API failed)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { EventsApi } from '../api';
import { getEventsForTab } from '../data/eventsData';

export function useEvents(tab = 'my') {
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [source, setSource] = useState('mock');
  const [reloadKey, setReloadKey] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);

      // Unauthenticated → mock immediately (offline-friendly, like the web app).
      if (!EventsApi.isAuthenticated()) {
        if (!cancelled && mountedRef.current) {
          setEvents(getEventsForTab(tab));
          setSource('mock');
          setIsLoading(false);
        }
        return;
      }

      try {
        const apiEvents = await EventsApi.getEvents(tab);
        if (!cancelled && mountedRef.current) {
          setEvents(apiEvents);
          setSource('api');
        }
      } catch (err) {
        console.warn('[useEvents] API failed, falling back to mock:', err?.message);
        if (!cancelled && mountedRef.current) {
          setEvents(getEventsForTab(tab));
          setSource('mock');
          setError(err);
        }
      } finally {
        if (!cancelled && mountedRef.current) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [tab, reloadKey]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  return { events, isLoading, error, source, refresh };
}

export default useEvents;
