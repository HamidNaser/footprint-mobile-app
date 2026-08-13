import { thumbnailSource, fullSizeSource } from '../mediaSource';

/**
 * The journal's photo grid loaded full-size originals. Measured against production, that
 * is 76 KB per tile where the Hub will serve a 7 KB rendition — over a feed of forty
 * entries, the difference between a scroll that works on a train and one that does not.
 */
describe('thumbnailSource', () => {
  const remote = {
    serverUrl: 'https://cdn/full.jpg',
    thumbnailUrl: 'https://api/t/grid/full.jpg',
    thumbnailUri: 'https://api/t/grid/full.jpg',
  };

  it('prefers the device copy, which costs nothing and works with no signal', () => {
    expect(thumbnailSource({ ...remote, localPath: 'file:///local.jpg' }))
      .toBe('file:///local.jpg');
  });

  it('uses the small remote copy rather than the original', () => {
    // The whole point. Falling through to serverUrl here is the bug.
    expect(thumbnailSource(remote)).toBe('https://api/t/grid/full.jpg');
  });

  it('reads thumbnailUrl when the local mirror has not been written yet', () => {
    // Entries pulled from /journals/changes arrive with thumbnailUrl; DatabaseService
    // mirrors it into thumbnailUri, but the raw shape reaches components too.
    expect(thumbnailSource({ serverUrl: 'https://cdn/full.jpg', thumbnailUrl: 'https://api/t.jpg' }))
      .toBe('https://api/t.jpg');
  });

  it('falls back to the original rather than showing nothing', () => {
    expect(thumbnailSource({ serverUrl: 'https://cdn/full.jpg' })).toBe('https://cdn/full.jpg');
  });

  it('returns null when there is nothing to load', () => {
    // So a caller renders a placeholder instead of an Image pointed at undefined.
    expect(thumbnailSource({})).toBeNull();
    expect(thumbnailSource(null)).toBeNull();
    expect(thumbnailSource(undefined)).toBeNull();
  });
});

describe('fullSizeSource', () => {
  it('skips the thumbnail, because the person asked to see the photograph', () => {
    // A 320px rendition stretched across a phone screen is visibly worse than waiting.
    expect(fullSizeSource({ thumbnailUri: 'https://api/t.jpg', serverUrl: 'https://cdn/full.jpg' }))
      .toBe('https://cdn/full.jpg');
  });

  it('still prefers the device copy', () => {
    expect(fullSizeSource({ localPath: 'file:///local.jpg', serverUrl: 'https://cdn/full.jpg' }))
      .toBe('file:///local.jpg');
  });

  it('returns null when there is nothing to load', () => {
    expect(fullSizeSource({})).toBeNull();
  });
});
