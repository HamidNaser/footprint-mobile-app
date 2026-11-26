/**
 * Journal Calendar Service (019 T004)
 *
 * The phone's calls to the three server look-ups the Family and Friends calendar is built
 * from. No server endpoint is new here -- `/journal/calendar` and `/journal/period` already
 * exist and already apply the server's single visibility filter to a list of 1-50 people
 * (research R1), exactly as the website's 015 uses them. This file only shapes the calls and
 * the responses for the phone.
 *
 * Two rules bind every function here:
 *
 * - **Sharing fails closed.** If a page of a period cannot be loaded, the whole call fails --
 *   `getPeriod` never hands back the pages it already had. A non-2xx response rethrows
 *   `authFetch`'s error (which carries `status`) instead of resolving to an empty or partial
 *   result.
 * - **A civil date is a day, not an instant.** `from` and `to` are `'YYYY-MM-DD'` strings built
 *   by the caller from calendar parts, and this file carries them into the query string
 *   verbatim -- never through `new Date(string)`, which parses a date-only string as UTC
 *   midnight and reads a day early west of Greenwich.
 */

import { authFetch, adaptEntry } from './SocialService';

const MAX_AUTHOR_IDS = 50;
const PERIOD_PAGE_LIMIT = 500;

/**
 * Guard the `authorIds` invariant every endpoint here shares: 1-50 ids. An empty list is a 400
 * at the server, and omitting the parameter entirely means "the caller alone" -- so an empty
 * list must never reach the server as either. The caller guarantees the list it passes is
 * never empty; this throws rather than silently coping, and throws before any `fetch` runs.
 *
 * @param {string[]} authorIds
 */
function assertAuthorIds(authorIds) {
  if (!Array.isArray(authorIds) || authorIds.length === 0 || authorIds.length > MAX_AUTHOR_IDS) {
    const length = Array.isArray(authorIds) ? authorIds.length : authorIds;
    throw new RangeError(`authorIds must contain 1-${MAX_AUTHOR_IDS} ids, got ${length}`);
  }
}

/** `authorIds=…` as the contract spells it: the ids joined with a comma, then the whole value encoded once. */
function authorIdsQuery(authorIds) {
  return `authorIds=${encodeURIComponent(authorIds.join(','))}`;
}

/**
 * The calendar index for a list of people: one row per day that has a memory, at whichever
 * precision it was stored at.
 *
 * @param {string} accessToken
 * @param {string[]} authorIds - 1-50 non-empty ids; the caller guarantees it is never empty.
 * @returns {Promise<{authorIds: string[], days: Array<{date: string, precision: string, count: number}>}>}
 */
export async function getCalendar(accessToken, authorIds) {
  assertAuthorIds(authorIds);

  const data = await authFetch(`/journal/calendar?${authorIdsQuery(authorIds)}`, accessToken);

  return {
    authorIds: data?.authorIds || [],
    days: (data?.days || []).map((row) => ({
      date: row.date,
      precision: row.precision,
      count: row.count,
    })),
  };
}

/**
 * Every memory of the given people in `[from, to]` at one precision, walking the server's
 * cursor to the end. `from`/`to` are civil-date strings the caller already built from parts --
 * this function does not parse or reconstruct them, only carries them into the query string.
 *
 * Fails closed: if any page's request fails, the error propagates and nothing already fetched
 * is returned. A caller sees either the whole period or a rejected promise, never a part of it.
 *
 * @param {string} accessToken
 * @param {object} options
 * @param {string[]} options.authorIds - 1-50 non-empty ids; the caller guarantees it is never empty.
 * @param {string} options.from - 'YYYY-MM-DD'
 * @param {string} options.to - 'YYYY-MM-DD'
 * @param {'day'|'month'|'year'} options.precision
 * @returns {Promise<Array>} every page's entries, adapted, in server order
 */
export async function getPeriod(accessToken, { authorIds, from, to, precision }) {
  assertAuthorIds(authorIds);

  const entries = [];
  let cursor = null;
  let hasMore = true;

  while (hasMore) {
    const params = [
      authorIdsQuery(authorIds),
      `from=${encodeURIComponent(from)}`,
      `to=${encodeURIComponent(to)}`,
      `precision=${encodeURIComponent(precision)}`,
      `limit=${PERIOD_PAGE_LIMIT}`,
    ];
    if (cursor) params.push(`cursor=${encodeURIComponent(cursor)}`);

    // No try/catch: a failing page's error propagates as-is, so the caller never receives the
    // pages fetched before it (sharing fails closed).
    const data = await authFetch(`/journal/period?${params.join('&')}`, accessToken);

    const items = data?.items || [];
    items.forEach((item) => entries.push(adaptEntry(item.entry || item)));

    cursor = data?.nextCursor ?? null;
    hasMore = Boolean(data?.hasMore);

    // The server said there is more to fetch but gave nothing to fetch it with. Looping would
    // re-request this same page forever; returning what was collected so far would be exactly
    // the half-loaded period "sharing fails closed" forbids -- a caller would read it as the
    // whole period. Fail loudly instead.
    if (hasMore && !cursor) {
      throw new Error(
        'getPeriod: server reported hasMore with no nextCursor; the period is incomplete'
      );
    }
  }

  return entries;
}

/**
 * Every memory of the given people on a single civil day, at every precision the Journal tab
 * would show for that date (research R5): `/journal/period` has no "every precision" option,
 * so a day is the month page and the year page for `day..day`, run in parallel and
 * concatenated -- month's entries first, then year's, each in the server's own order. Callers
 * that need a different order (newest-first, or household order) re-sort this result
 * themselves; it is not sorted here.
 *
 * @param {string} accessToken
 * @param {string[]} authorIds - 1-50 non-empty ids; the caller guarantees it is never empty.
 * @param {string} day - 'YYYY-MM-DD'
 * @returns {Promise<Array>}
 */
export async function getDay(accessToken, authorIds, day) {
  const [monthEntries, yearEntries] = await Promise.all([
    getPeriod(accessToken, { authorIds, from: day, to: day, precision: 'month' }),
    getPeriod(accessToken, { authorIds, from: day, to: day, precision: 'year' }),
  ]);

  return [...monthEntries, ...yearEntries];
}
