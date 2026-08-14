import { needsStory, hasNarrative, entriesNeedingStory } from '../entryNarrative';

/**
 * "Which of my photographs has nobody explained?"
 *
 * The same rule the backend applies in EntryNarrative, restated here because mobile reads
 * its own SQLite database rather than the API. Two copies of one rule can drift, so these
 * cover the same cases the backend's tests do — a list that disagrees with the badge on
 * each row is the kind of bug nobody reports, because each screen looks right on its own.
 */
describe('needsStory', () => {
  const entry = (...contentBlocks) => ({ localId: 'e1', contentBlocks });

  const photos = (count = 1) => ({
    type: 'photos',
    media: Array.from({ length: count }, (_, i) => ({ localPath: `p${i}.jpg` })),
  });

  const text = (content) => ({ type: 'text', content });
  const audio = (recorded = true) => ({
    type: 'audio',
    media: recorded ? [{ localPath: 'voice.m4a' }] : [],
  });

  it('finds photographs with no words', () => {
    expect(needsStory(entry(photos(7)))).toBe(true);
  });

  it('leaves alone photographs somebody wrote about', () => {
    expect(needsStory(entry(photos(), text('We drove down for the wedding.')))).toBe(false);
  });

  it('counts a recorded voice as a story', () => {
    // A voice counts as much as a paragraph. For a family memory it counts for more.
    expect(needsStory(entry(photos(), audio()))).toBe(false);
  });

  it.each([undefined, null, '', '   ', '\n\t '])(
    'treats an empty text block (%p) as no story at all',
    (content) => {
      // An abandoned draft leaves a text block with nothing in it. Counting it would drop
      // the exact photographs that most need attention -- the ones somebody started to
      // describe and gave up on.
      expect(needsStory(entry(photos(), text(content)))).toBe(true);
    },
  );

  it('does not count a recording that captured nothing', () => {
    expect(needsStory(entry(photos(), audio(false)))).toBe(true);
  });

  it('does not consider a written entry with no photographs to be missing anything', () => {
    // This is about unexplained images, not about entries in general. A written note with
    // no photographs is complete as it stands.
    expect(needsStory(entry(text('A quiet Tuesday.')))).toBe(false);
  });

  it('recognises every name a photograph block goes by locally', () => {
    // Server entries arrive as `photos`; the compose flow has written `image` and `photo`.
    // Missing one would silently exclude a whole class of entry from the worklist.
    for (const type of ['photos', 'photo', 'image', 'video']) {
      expect(needsStory(entry({ type, media: [{ localPath: 'a.jpg' }] }))).toBe(true);
    }
  });

  it('handles a bare media block with no media array', () => {
    // The photo reader in JournalScreen falls back to treating the block itself as one
    // item, so this shape genuinely occurs.
    expect(needsStory(entry({ type: 'image', localPath: 'a.jpg' }))).toBe(true);
  });

  it('does not count an empty media block as photographs', () => {
    expect(needsStory(entry({ type: 'photos', media: [] }))).toBe(false);
  });

  it('survives entries with nothing in them', () => {
    expect(needsStory(entry())).toBe(false);
    expect(needsStory({})).toBe(false);
    expect(needsStory(null)).toBe(false);
    expect(needsStory({ contentBlocks: 'not an array' })).toBe(false);
  });
});

describe('hasNarrative', () => {
  it('counts audio on its own', () => {
    expect(hasNarrative({ contentBlocks: [{ type: 'audio', media: [{ localPath: 'a.m4a' }] }] }))
      .toBe(true);
  });

  it('does not count photographs', () => {
    expect(hasNarrative({ contentBlocks: [{ type: 'photos', media: [{ localPath: 'a.jpg' }] }] }))
      .toBe(false);
  });
});

describe('entriesNeedingStory', () => {
  it('keeps only the entries worth asking about', () => {
    const withStory = { localId: 'a', contentBlocks: [{ type: 'photos', media: [{ localPath: 'a.jpg' }] }, { type: 'text', content: 'Lovely' }] };
    const without = { localId: 'b', contentBlocks: [{ type: 'photos', media: [{ localPath: 'b.jpg' }] }] };

    expect(entriesNeedingStory([withStory, without]).map((e) => e.localId)).toEqual(['b']);
  });

  it('survives being handed nothing', () => {
    expect(entriesNeedingStory(null)).toEqual([]);
    expect(entriesNeedingStory([])).toEqual([]);
  });
});
