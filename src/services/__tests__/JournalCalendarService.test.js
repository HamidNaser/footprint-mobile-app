/**
 * JournalCalendarService (019 T004) -- the phone's calls to the three server look-ups the
 * calendar is built from: `/journal/calendar`, `/journal/period` (paged), and the two-call
 * merge that answers "everything on one day" (research R5).
 *
 * Two rules from the project's constitution bind this file hard, and the tests below exist to
 * hold them:
 *
 * 1. **Sharing fails closed.** A half-loaded period must never reach the caller in place of an
 *    error. `getPeriod` does not catch a failing page and return what it had so far -- it lets
 *    the rejection propagate, so a caller that awaits it either has the whole period or nothing.
 * 2. **A civil date is a day, not an instant.** `from`/`to` are `'YYYY-MM-DD'` strings carried
 *    verbatim into the query string -- never round-tripped through `new Date(string)`, which
 *    would parse them as UTC midnight and read a day early west of Greenwich.
 *
 * `authorIds` also carries a safety guard, not a convenience: the caller guarantees the list is
 * never empty, but an empty `authorIds` string is a 400 at the server and omitting the
 * parameter means "the caller alone" -- so both functions throw `RangeError`, synchronously and
 * before any `fetch`, on an empty list or one over 50 ids.
 */

import { getCalendar, getPeriod, getDay } from '../JournalCalendarService';

const token = 'test-token';

function respondWith(payload, status = 200) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  });
}

function respondSequentially(payloads) {
  const fn = jest.fn();
  payloads.forEach((payload) => {
    fn.mockResolvedValueOnce({
      ok: payload.status ? payload.status >= 200 && payload.status < 300 : true,
      status: payload.status || 200,
      json: async () => payload.body,
    });
  });
  global.fetch = fn;
}

function idsOf(n) {
  return Array.from({ length: n }, (_, i) => `u${i + 1}`);
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('getCalendar', () => {
  it('asks the calendar endpoint with authorIds joined and encoded as one query value', async () => {
    respondWith({ authorIds: ['u1', 'u2'], days: [] });

    await getCalendar(token, ['u1', 'u2']);

    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain('/journal/calendar?authorIds=u1%2Cu2');
  });

  it('encodes an id that would otherwise break the query string', async () => {
    respondWith({ authorIds: [], days: [] });

    await getCalendar(token, ['a&b=c d', 'u2']);

    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain(`authorIds=${encodeURIComponent('a&b=c d,u2')}`);
    expect(url).not.toContain('a&b=c d,u2');
  });

  it('returns the rows passed straight through, ready for buildIndex', async () => {
    const days = [
      { date: '2026-11-01', precision: 'day', count: 2 },
      { date: '2026-11-03', precision: 'month', count: 5 },
    ];
    respondWith({ authorIds: ['u1'], days });

    const result = await getCalendar(token, ['u1']);

    expect(result).toEqual({ authorIds: ['u1'], days });
  });

  it('throws RangeError and makes no request on an empty authorIds list', async () => {
    global.fetch = jest.fn();

    await expect(getCalendar(token, [])).rejects.toThrow(RangeError);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('throws RangeError and makes no request on more than 50 ids', async () => {
    global.fetch = jest.fn();

    await expect(getCalendar(token, idsOf(51))).rejects.toThrow(RangeError);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('accepts the boundary of exactly 50 ids', async () => {
    respondWith({ authorIds: idsOf(50), days: [] });

    await expect(getCalendar(token, idsOf(50))).resolves.toEqual({ authorIds: idsOf(50), days: [] });
  });

  it('rethrows authFetch\'s error, with status, on a non-2xx -- never a partial or empty result', async () => {
    respondWith({ message: 'nope' }, 403);

    await expect(getCalendar(token, ['u1'])).rejects.toMatchObject({ status: 403 });
  });
});

describe('getPeriod', () => {
  it('builds the URL with authorIds, from, to, precision and limit=500', async () => {
    respondWith({ items: [], hasMore: false });

    await getPeriod(token, { authorIds: ['u1'], from: '2026-01-01', to: '2026-01-31', precision: 'month' });

    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain('/journal/period?');
    expect(url).toContain('authorIds=u1');
    expect(url).toContain('from=2026-01-01');
    expect(url).toContain('to=2026-01-31');
    expect(url).toContain('precision=month');
    expect(url).toContain('limit=500');
  });

  it('carries from/to verbatim as date-only strings, never through new Date(string)', async () => {
    // Regression target: new Date('2026-01-01') is UTC midnight and reads as 2025-12-31 west
    // of Greenwich. Asserting the exact string reached the query proves no such round trip
    // happened -- a round trip through Date would not reliably change the string's spelling,
    // so the real guard is the GUARDED_FILES grep (T014); this pins the observable behaviour.
    respondWith({ items: [], hasMore: false });

    await getPeriod(token, { authorIds: ['u1'], from: '2026-03-05', to: '2026-03-05', precision: 'day' });

    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain('from=2026-03-05');
    expect(url).toContain('to=2026-03-05');
  });

  it('follows nextCursor to the end, keeping limit=500 on every page', async () => {
    respondSequentially([
      { body: { items: [{ entry: { id: 'e1', createdAt: '2026-01-01T00:00:00.000Z', contentBlocks: [] } }], hasMore: true, nextCursor: 'c1' } },
      { body: { items: [{ entry: { id: 'e2', createdAt: '2026-01-02T00:00:00.000Z', contentBlocks: [] } }], hasMore: true, nextCursor: 'c2' } },
      { body: { items: [{ entry: { id: 'e3', createdAt: '2026-01-03T00:00:00.000Z', contentBlocks: [] } }], hasMore: false } },
    ]);

    const result = await getPeriod(token, { authorIds: ['u1'], from: '2026-01-01', to: '2026-01-31', precision: 'month' });

    expect(result.map((e) => e.serverId)).toEqual(['e1', 'e2', 'e3']);
    expect(global.fetch.mock.calls).toHaveLength(3);
    global.fetch.mock.calls.forEach((call) => expect(call[0]).toContain('limit=500'));
    expect(global.fetch.mock.calls[1][0]).toContain('cursor=c1');
    expect(global.fetch.mock.calls[2][0]).toContain('cursor=c2');
    // First page asks no cursor at all.
    expect(global.fetch.mock.calls[0][0]).not.toContain('cursor=');
  });

  it('fails the whole call when any page fails -- a half-loaded period is never returned', async () => {
    respondSequentially([
      { body: { items: [{ entry: { id: 'e1', createdAt: '2026-01-01T00:00:00.000Z', contentBlocks: [] } }], hasMore: true, nextCursor: 'c1' } },
      { body: { message: 'server error' }, status: 500 },
    ]);

    await expect(
      getPeriod(token, { authorIds: ['u1'], from: '2026-01-01', to: '2026-01-31', precision: 'month' })
    ).rejects.toMatchObject({ status: 500 });
  });

  it('fails the whole call -- not a silent partial return -- when a page claims hasMore with no nextCursor', async () => {
    // A malformed response: the server says there is more to fetch but gives nothing to fetch
    // it with. Looping on it would hang forever; stopping quietly and returning what had been
    // collected would be exactly the half-loaded period "sharing fails closed" forbids -- a
    // caller awaiting getPeriod would read a truncated result as the whole period. Neither is
    // acceptable, so this must reject, and the first page's entry must not resolve as if it
    // were a complete (if short) answer.
    respondWith({
      items: [{ entry: { id: 'e1', createdAt: '2026-01-01T00:00:00.000Z', contentBlocks: [] } }],
      hasMore: true,
      // no nextCursor
    });

    await expect(
      getPeriod(token, { authorIds: ['u1'], from: '2026-01-01', to: '2026-01-31', precision: 'month' })
    ).rejects.toThrow();
    // Exactly one request was made -- it did not loop re-fetching the same page either.
    expect(global.fetch.mock.calls).toHaveLength(1);
  });

  it('passes every entry through adaptEntry, keeping datePrecision', async () => {
    respondWith({
      items: [
        { entry: { id: 'e1', createdAt: '2026-01-01T00:00:00.000Z', datePrecision: 'month', contentBlocks: [] } },
      ],
      hasMore: false,
    });

    const result = await getPeriod(token, { authorIds: ['u1'], from: '2026-01-01', to: '2026-01-31', precision: 'month' });

    expect(result[0].datePrecision).toBe('month');
    expect(result[0].serverId).toBe('e1');
  });

  it('defaults datePrecision to day when the server omits it, via the same adaptEntry path', async () => {
    respondWith({
      items: [{ entry: { id: 'e1', createdAt: '2026-01-01T00:00:00.000Z', contentBlocks: [] } }],
      hasMore: false,
    });

    const result = await getPeriod(token, { authorIds: ['u1'], from: '2026-01-01', to: '2026-01-31', precision: 'day' });

    expect(result[0].datePrecision).toBe('day');
  });

  it('throws RangeError and makes no request on an empty authorIds list', async () => {
    global.fetch = jest.fn();

    await expect(
      getPeriod(token, { authorIds: [], from: '2026-01-01', to: '2026-01-31', precision: 'month' })
    ).rejects.toThrow(RangeError);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('throws RangeError and makes no request on more than 50 ids', async () => {
    global.fetch = jest.fn();

    await expect(
      getPeriod(token, { authorIds: idsOf(51), from: '2026-01-01', to: '2026-01-31', precision: 'month' })
    ).rejects.toThrow(RangeError);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('getDay', () => {
  it('makes the month and year calls for D..D and concatenates them, month first', async () => {
    respondWith({ items: [], hasMore: false });
    const day = '2026-06-15';

    await getDay(token, ['u1'], day);

    const urls = global.fetch.mock.calls.map((call) => call[0]);
    expect(urls).toHaveLength(2);
    expect(urls.some((u) => u.includes('precision=month') && u.includes(`from=${day}`) && u.includes(`to=${day}`))).toBe(true);
    expect(urls.some((u) => u.includes('precision=year') && u.includes(`from=${day}`) && u.includes(`to=${day}`))).toBe(true);
  });

  it('concatenates month results before year results, server order within each', async () => {
    const day = '2026-06-15';
    global.fetch = jest.fn().mockImplementation((url) => {
      if (url.includes('precision=month')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            items: [{ entry: { id: 'month-1', createdAt: `${day}T09:00:00.000Z`, contentBlocks: [] } }],
            hasMore: false,
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          items: [{ entry: { id: 'year-1', createdAt: `${day}T10:00:00.000Z`, contentBlocks: [] } }],
          hasMore: false,
        }),
      });
    });

    const result = await getDay(token, ['u1'], day);

    expect(result.map((e) => e.serverId)).toEqual(['month-1', 'year-1']);
  });

  it('fails when either the month or the year call fails', async () => {
    const day = '2026-06-15';
    global.fetch = jest.fn().mockImplementation((url) => {
      if (url.includes('precision=year')) {
        return Promise.resolve({ ok: false, status: 500, json: async () => ({ message: 'boom' }) });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ items: [], hasMore: false }) });
    });

    await expect(getDay(token, ['u1'], day)).rejects.toMatchObject({ status: 500 });
  });
});
