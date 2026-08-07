/**
 * useEvents — loads events for a tab (my | invites | drafts) from the Hub API.
 *
 * There is deliberately no mock fallback. Falling back to fabricated events on
 * an API error meant a broken request and a real (if sparse) event list looked
 * identical on screen, so failures were invisible and the demo data could be
 * mistaken for the user's own. The screen now shows honest loading / empty /
 * error states instead.
 *
 * Returns { events, isLoading, error, refresh }.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { EventsApi } from '../api';

export function useEvents(tab = 'my') {
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
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

      // Not signed in: an empty list with a clear reason, not fabricated events.
      if (!EventsApi.isAuthenticated()) {
        if (!cancelled && mountedRef.current) {
          setEvents([]);
          setError({ message: 'Sign in to see your events.', code: 'NOT_AUTHENTICATED' });
          setIsLoading(false);
        }
        return;
      }

      try {
        const apiEvents = await EventsApi.getEvents(tab);
        if (!cancelled && mountedRef.current) {
          setEvents(apiEvents);
        }
      } catch (err) {
        console.warn('[useEvents] failed to load events:', err?.status, err?.code, err?.message);
        if (!cancelled && mountedRef.current) {
          setEvents([]);
          setError({
            message: err?.message || 'Could not load events',
            status: err?.status,
            code: err?.code,
          });
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

  return { events, isLoading, error, refresh };
}

export default useEvents;
