import { getJournalBook } from '../SocialService';

/**
 * The mobile side of the journal book (phase 2 of the journal-book work).
 *
 * The book separates two facts that used to be conflated: who is in the household
 * (`household`), and which days they wrote on (`days`), paged by a date cursor rather than
 * a per-member entry cap. These tests exist to keep the client from re-collapsing that split
 * -- e.g. by dropping a member with no account, or by letting a civil-day field leak into an
 * entry's timestamp.
 */
describe('getJournalBook', () => {
  const token = 'test-token';

  function respondWith(payload) {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => payload,
    });
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('asks for the journal-book endpoint with no query parameters when none are given', async () => {
    respondWith({ household: [], days: [], oldestDate: null, hasMore: false });

    await getJournalBook(token);

    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain('/journal/book');
    expect(url).not.toContain('?');
  });

  it('does not double the /api/v1 prefix', async () => {
    // authFetch already prepends HUB_BASE_URL + API_VERSION ('/api/v1'). Pointing at
    // '/api/v1/journal/book' here would resolve to a 404-inducing double prefix.
    respondWith({ household: [], days: [], oldestDate: null, hasMore: false });

    await getJournalBook(token);

    const [url] = global.fetch.mock.calls[0];
    expect(url).not.toContain('/api/v1/api/v1');
  });

  it('sends memberId, before and days when given', async () => {
    respondWith({ household: [], days: [], oldestDate: null, hasMore: false });

    await getJournalBook(token, { memberId: 'node_7', before: '2026-08-01', days: 10 });

    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain('memberId=node_7');
    expect(url).toContain('before=2026-08-01');
    expect(url).toContain('days=10');
  });

  it('escapes a member id that would otherwise break the query string', async () => {
    // Ids are opaque to this client, so encoding them is load-bearing rather than
    // cosmetic: one containing & or = would truncate the query and send a different
    // request than the caller asked for. The test above cannot prove the encoding
    // happens, because 'node_7' encodes to itself.
    respondWith({ household: [], days: [], oldestDate: null, hasMore: false });

    await getJournalBook(token, { memberId: 'a&b=c d' });

    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain('memberId=a%26b%3Dc%20d');
    expect(url).not.toContain('a&b=c');
  });

  it('keeps a household member who has no account, with userId null and hasAccount false', async () => {
    // A grandmother who never signed up is still part of the household. Filtering her
    // out here -- or defaulting userId to something falsy-but-truthy -- would make the
    // exact bug this endpoint exists to fix.
    respondWith({
      household: [
        { memberId: 'm1', userId: null, relation: 'grandmother', name: 'Grandma', hasAccount: false },
      ],
      days: [],
      oldestDate: null,
      hasMore: false,
    });

    const book = await getJournalBook(token);

    expect(book.household).toEqual([
      {
        memberId: 'm1',
        userId: null,
        relation: 'grandmother',
        name: 'Grandma',
        avatarUrl: null,
        hasAccount: false,
      },
    ]);
  });

  it('preserves the order the server lists the household in, member for member', async () => {
    // Reading order -- head, spouse, then children -- is the server's job now, and this
    // client is a pass-through. Seeded deliberately out of that order so a client-side
    // re-sort, the thing this phase exists to remove the last copies of, would produce a
    // different array and fail here rather than coincidentally agreeing.
    respondWith({
      household: [
        { memberId: 'm3', userId: 'u3', relation: 'child', name: 'Lina', hasAccount: true },
        { memberId: 'm1', userId: 'u1', relation: 'head', name: 'Akram', hasAccount: true },
        { memberId: 'm2', userId: 'u2', relation: 'spouse', name: 'Reem', hasAccount: true },
      ],
      days: [],
      oldestDate: null,
      hasMore: false,
    });

    const book = await getJournalBook(token);

    expect(book.household.map((m) => m.memberId)).toEqual(['m3', 'm1', 'm2']);
    expect(book.household.map((m) => m.name)).toEqual(['Lina', 'Akram', 'Reem']);
  });

  it('adapts each entry and tags it with its memberId', async () => {
    respondWith({
      household: [],
      days: [
        {
          date: '2026-09-10',
          entries: [
            { memberId: 'm1', entry: { id: 'e1', createdAt: '2026-09-10T10:00:00.000Z', contentBlocks: [] } },
            { memberId: 'm2', entry: { id: 'e2', createdAt: '2026-09-10T11:00:00.000Z', contentBlocks: [] } },
          ],
        },
      ],
      oldestDate: '2026-09-10',
      hasMore: false,
    });

    const book = await getJournalBook(token);

    expect(book.days[0].entries).toHaveLength(2);
    expect(book.days[0].entries.map((e) => e.memberId)).toEqual(['m1', 'm2']);
    expect(book.days[0].entries.map((e) => e.serverId)).toEqual(['e1', 'e2']);
  });

  it('takes an entry\'s time from createdAt, never from the civil day, and leaves the day a civil day', async () => {
    // The day bucket's `date` is a civil day with no time component ("2026-09-10").
    // adaptEntry (shared with getUserEntries) prefers `entry.date` over
    // `entry.createdAt` when both are present -- that's fine for feeds where `date`
    // already carries a full timestamp, but here it would collapse every entry's
    // time-of-day to midnight if a civil-day `date` ever rode along on the entry
    // itself. This is exactly the latent bug the web client had in the function this
    // one replaces.
    const createdAt = '2026-09-10T23:45:00.000Z';
    respondWith({
      household: [],
      days: [
        {
          date: '2026-09-10',
          entries: [
            {
              memberId: 'm1',
              entry: { id: 'e1', createdAt, date: '2026-09-10', contentBlocks: [] },
            },
          ],
        },
      ],
      oldestDate: '2026-09-10',
      hasMore: false,
    });

    const book = await getJournalBook(token);

    expect(book.days[0].date).toBe('2026-09-10');
    expect(book.days[0].entries[0].createdAt).toBe(new Date(createdAt).getTime());
    expect(book.days[0].entries[0].createdAt).not.toBe(new Date('2026-09-10').getTime());
  });

  it('surfaces oldestDate and hasMore from the response', async () => {
    respondWith({ household: [], days: [], oldestDate: '2026-08-15', hasMore: true });

    const book = await getJournalBook(token);

    expect(book.oldestDate).toBe('2026-08-15');
    expect(book.hasMore).toBe(true);
  });

  it('defaults oldestDate to null and hasMore to false when absent', async () => {
    respondWith({ household: [], days: [] });

    const book = await getJournalBook(token);

    expect(book.oldestDate).toBeNull();
    expect(book.hasMore).toBe(false);
  });
});
