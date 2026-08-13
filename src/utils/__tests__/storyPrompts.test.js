import { buildStoryPrompts } from '../storyPrompts';

/**
 * These pin the wording, which is the part that decides whether anyone answers.
 *
 * The failure worth guarding is not a crash — it is a prompt that reads wrong enough that
 * the person closes it. "Ask about these 1 photographs" is the whole feature wasted.
 */
describe('buildStoryPrompts', () => {
  const memory = (over = {}) => ({
    id: '68c000000000000000000009',
    photos: ['a.jpg', 'b.jpg', 'c.jpg'],
    needsStory: true,
    isCurrentUser: false,
    authorName: 'Grandpa Akram',
    authorAvatar: 'akram.jpg',
    ...over,
  });

  it('only prompts for memories the backend says have no story', () => {
    const prompts = buildStoryPrompts([
      memory({ id: 'a', needsStory: true }),
      memory({ id: 'b', needsStory: false }),
    ], 1975);

    expect(prompts.map((p) => p.memoryId)).toEqual(['a']);
  });

  it('asks the person who was there, by name', () => {
    const [prompt] = buildStoryPrompts([memory()], 1975);

    expect(prompt.prompt).toBe('Ask Grandpa Akram about these 3 photographs from 1975');
  });

  it('invites you to tell your own', () => {
    // Your own photographs are not a request to someone else.
    const [prompt] = buildStoryPrompts([memory({ isCurrentUser: true })], 1975);

    expect(prompt.prompt).toBe('3 photographs from 1975, and no story yet — tell us about them');
  });

  it('says photograph, not photographs, when there is one', () => {
    const [theirs] = buildStoryPrompts([memory({ photos: ['a.jpg'] })], 1975);
    const [mine] = buildStoryPrompts([memory({ photos: ['a.jpg'], isCurrentUser: true })], 1975);

    expect(theirs.prompt).toBe('Ask Grandpa Akram about this photograph from 1975');
    expect(mine.prompt).toBe('One photograph from 1975, and no story yet — tell us about it');
  });

  it('drops the year rather than printing "from undefined"', () => {
    const [prompt] = buildStoryPrompts([memory()]);

    expect(prompt.prompt).toBe('Ask Grandpa Akram about these 3 photographs');
  });

  it('does not ask for a name it does not have', () => {
    // An entry whose author never resolved would otherwise read "Ask about...".
    const [prompt] = buildStoryPrompts([memory({ authorName: null, author: null })], 1975);

    expect(prompt.prompt).toBe('3 photographs from 1975, and no story yet');
  });

  it('reads the author off a nested author object too', () => {
    // Places adapts memories flat; other screens carry a nested author.
    const [prompt] = buildStoryPrompts(
      [memory({ authorName: null, authorAvatar: null, author: { name: 'Sara', avatar: 's.jpg' } })],
      1990,
    );

    expect(prompt.prompt).toBe('Ask Sara about these 3 photographs from 1990');
    expect(prompt.author.avatar).toBe('s.jpg');
  });

  it('counts media objects as well as photo urls', () => {
    // Places adapts a memory twice before it reaches a card: urls become media objects.
    // Counting only `photos` would word every card prompt as "This memory".
    const [prompt] = buildStoryPrompts(
      [memory({ photos: undefined, media: [{ uri: 'a.jpg' }, { uri: 'b.jpg' }] })],
      1975,
    );

    expect(prompt.prompt).toBe('Ask Grandpa Akram about these 2 photographs from 1975');
  });

  it('never says "these 0 photographs"', () => {
    // A memory whose photographs did not load still deserves asking about, but a count of
    // zero in the sentence reads as a bug to whoever sees it.
    const [theirs] = buildStoryPrompts([memory({ photos: undefined, media: undefined })], 1975);
    const [mine] = buildStoryPrompts(
      [memory({ photos: undefined, media: undefined, isCurrentUser: true })], 1975,
    );

    expect(theirs.prompt).toBe('Ask Grandpa Akram about this memory from 1975');
    expect(mine.prompt).toBe('This memory from 1975 has no story yet — tell us about it');
  });

  it('carries the whole memory so the interview can target that entry', () => {
    const m = memory();
    const [prompt] = buildStoryPrompts([m], 1975);

    expect(prompt.memory).toBe(m);
  });

  it('survives being handed nothing', () => {
    expect(buildStoryPrompts(null)).toEqual([]);
    expect(buildStoryPrompts([])).toEqual([]);
    expect(buildStoryPrompts([null, undefined])).toEqual([]);
  });
});
