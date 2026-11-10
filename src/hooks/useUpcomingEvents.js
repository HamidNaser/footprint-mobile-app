/**
 * useUpcomingEvents -- events for Home's "Coming up" card and the Timeline tab's Events pane
 * (FR-031..034, research R11).
 *
 * Merges the user's own events ('my') and the ones they are invited to ('invites'),
 * de-duplicated by `id`, published only, then splits them against the phone's local
 * calendar date: `upcoming` (today or later) ascending, soonest first; `past` (strictly
 * before today) descending, most recent first.
 *
 * The split is a **string comparison** of the civil `date` (`YYYY-MM-DD`) against the
 * phone's local `YYYY-MM-DD` -- never a `Date` built from the civil value. FR-032 requires a
 * same-day event to count as upcoming for the whole day; building a `Date` from a date-only
 * string parses it as UTC midnight, and comparing that instant against "now" can misclassify
 * today's own event once the device's time zone and the clock disagree about which side of
 * UTC midnight they fall on (constitution: a civil date is a day, not an instant). A `date`
 * that is not a well-formed `YYYY-MM-DD` string (contract says this cannot happen, but fail
 * closed rather than silently dropping the event) is treated as upcoming, so it is at least
 * visible rather than vanishing from both lists with no signal.
 *
 * An event hosted by the caller and also appearing on their invites tab (e.g. co-hosted) keeps
 * the `my` copy as the base -- the person hosts it, so their own copy is authoritative -- but
 * carries over `rsvp` from the `invites` copy when the base has none, so it does not lose its
 * RSVP in the merge.
 *
 * Drafts are counted, not listed, from `getEvents('drafts')`.
 *
 * Signed out: mirrors `useEvents` -- no network call, `error.code === 'NOT_AUTHENTICATED'`,
 * empty lists, so the three tabs are never asked unauthenticated and the card can show the
 * right message rather than a generic failure.
 *
 * Any one of the three calls failing yields `error` and empty lists -- never a partial result
 * (sharing/reads fail closed, CLAUDE.md).
 */

import { useState, useEffect, useRef } from 'react';
import { EventsApi } from '../api';

/** The phone's local calendar day, as `YYYY-MM-DD` -- never derived from a civil value. */
function localToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** A well-formed civil date string -- the only shape the string split below is valid on. */
function isCivilDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function useUpcomingEvents() {
  const [upcoming, setUpcoming] = useState([]);
  const [past, setPast] = useState([]);
  const [draftsCount, setDraftsCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
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

      // Not signed in: no network call, same shape useEvents uses for the same case --
      // otherwise all three tabs go out unauthenticated and come back 401s.
      if (!EventsApi.isAuthenticated()) {
        if (!cancelled && mountedRef.current) {
          setUpcoming([]);
          setPast([]);
          setDraftsCount(0);
          setError({ message: 'Sign in to see your events.', code: 'NOT_AUTHENTICATED' });
          setIsLoading(false);
        }
        return;
      }

      try {
        const [mine, invited, drafts] = await Promise.all([
          EventsApi.getEvents('my'),
          EventsApi.getEvents('invites'),
          EventsApi.getEvents('drafts'),
        ]);
        if (cancelled || !mountedRef.current) return;

        const invitedById = new Map((invited || []).filter(Boolean).map((e) => [e.id, e]));
        const seen = new Set();
        const published = [];
        (mine || []).forEach((event) => {
          if (!event || event.status !== 'published' || seen.has(event.id)) return;
          seen.add(event.id);
          const invite = invitedById.get(event.id);
          // Keep the host's own copy as the base; carry the RSVP over from the invite copy
          // only when the host copy has none, so a co-hosted event never loses it.
          published.push(event.rsvp != null || !invite ? event : { ...event, rsvp: invite.rsvp });
        });
        (invited || []).forEach((event) => {
          if (!event || event.status !== 'published' || seen.has(event.id)) return;
          seen.add(event.id);
          published.push(event);
        });

        const today = localToday();
        const nextUpcoming = published
          .filter((event) => !isCivilDate(event.date) || event.date >= today)
          .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
        const nextPast = published
          .filter((event) => isCivilDate(event.date) && event.date < today)
          .sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0));

        setUpcoming(nextUpcoming);
        setPast(nextPast);
        setDraftsCount(Array.isArray(drafts) ? drafts.length : 0);
      } catch (err) {
        if (cancelled || !mountedRef.current) return;
        // Fail closed: never leave a previous (or partial) list standing.
        setUpcoming([]);
        setPast([]);
        setDraftsCount(0);
        setError({
          message: err?.message || 'Could not load events',
          status: err?.status,
          code: err?.code,
        });
      } finally {
        if (!cancelled && mountedRef.current) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { upcoming, past, draftsCount, isLoading, error };
}

export default useUpcomingEvents;
