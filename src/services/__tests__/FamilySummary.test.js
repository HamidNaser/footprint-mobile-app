import { getFamilySummary } from '../SocialService';

/**
 * The mobile side of the family summary (spec 002, User Story 1).
 *
 * What matters here is that the client preserves what the server decided — section order,
 * entry order, and empty sections — rather than quietly imposing its own. The ordering rule
 * lives on the server precisely so web and mobile can't drift into showing the same family
 * two different ways, and a client that re-sorted would defeat that.
 */
describe('getFamilySummary', () => {
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

  it('preserves the server\'s section order', async () => {
    respondWith({
      sections: [
        { memberId: 'm1', relation: 'self', name: 'Me', entries: [] },
        { memberId: 'm2', relation: 'spouse', name: 'Partner', entries: [] },
        { memberId: 'm3', relation: 'child', name: 'Kid', entries: [] },
      ],
    });

    const sections = await getFamilySummary(token);

    expect(sections.map((s) => s.relation)).toEqual(['self', 'spouse', 'child']);
  });

  it('keeps a section for a member with no entries', async () => {
    // FR-010 — a relative who hasn't journaled is still part of the family. Filtering
    // them out here would make the screen disagree with the tree it was opened from.
    respondWith({
      sections: [{ memberId: 'm3', relation: 'child', name: 'Kid', entries: [] }],
    });

    const sections = await getFamilySummary(token);

    expect(sections).toHaveLength(1);
    expect(sections[0].entries).toEqual([]);
  });

  it('preserves entry order within a section', async () => {
    respondWith({
      sections: [
        {
          memberId: 'm1',
          relation: 'self',
          name: 'Me',
          entries: [
            { id: 'newer', date: '2026-05-05T16:12:00Z', contentBlocks: [] },
            { id: 'older', date: '2024-01-01T09:00:00Z', contentBlocks: [] },
          ],
        },
      ],
    });

    const sections = await getFamilySummary(token);

    expect(sections[0].entries.map((e) => e.serverId)).toEqual(['newer', 'older']);
  });

  it('normalises a missing avatar to null rather than undefined', async () => {
    respondWith({ sections: [{ memberId: 'm1', relation: 'self', name: 'Me', entries: [] }] });

    const sections = await getFamilySummary(token);

    expect(sections[0].avatarUrl).toBeNull();
  });

  it('returns nothing when no family is recorded', async () => {
    respondWith({ sections: [] });

    expect(await getFamilySummary(token)).toEqual([]);
  });

  it('asks for the family-summary endpoint, not the flat family feed', async () => {
    // /feed/family is a different, pre-existing endpoint: relevance-ranked, own posts
    // excluded, driven by a different relationship model. Pointing at it would silently
    // produce the wrong view.
    respondWith({ sections: [] });

    await getFamilySummary(token);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/feed/family-summary'),
      expect.any(Object),
    );
  });
});
