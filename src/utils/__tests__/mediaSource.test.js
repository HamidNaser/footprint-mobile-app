import { thumbnailSource, fullSizeSource, videoSource } from '../mediaSource';

/**
 * 007 R10 -- mobile local-first sources.
 *
 * localPath first on the capturing device; small views use the server-computed thumbnailUrl;
 * full-size views use displayUrl; the original is for video playback and download only. A
 * cached address containing /api/v1/media/t/ (the old rendition route) is never used.
 */
const OLD = 'https://api.example.com/api/v1/media/t/grid/abc.jpg';

describe('thumbnailSource', () => {
  const remote = {
    serverUrl: 'https://cdn/full.jpg',
    displayUrl: 'https://cdn/abc/display.webp',
    thumbnailUrl: 'https://cdn/abc/grid.webp',
  };

  it('prefers the device copy, which costs nothing and works with no signal', () => {
    expect(thumbnailSource({ ...remote, localPath: 'file:///local.jpg' })).toBe('file:///local.jpg');
  });

  it('uses thumbnailUrl, not the original or the display copy', () => {
    expect(thumbnailSource(remote)).toBe('https://cdn/abc/grid.webp');
  });

  it('reads the SQLite mirror thumbnailUri when thumbnailUrl is absent', () => {
    expect(thumbnailSource({ thumbnailUri: 'https://cdn/abc/grid.webp' })).toBe('https://cdn/abc/grid.webp');
  });

  it('never falls back to the original', () => {
    expect(thumbnailSource({ serverUrl: 'https://cdn/full.jpg', url: 'https://cdn/full.jpg' })).toBeNull();
    expect(thumbnailSource({ serverUrl: 'https://cdn/full.jpg', displayUrl: 'https://cdn/d.webp' })).toBeNull();
  });

  it('never uses a cached address on the old /api/v1/media/t/ route', () => {
    expect(thumbnailSource({ thumbnailUrl: OLD })).toBeNull();
    expect(thumbnailSource({ thumbnailUri: OLD, thumbnailUrl: OLD })).toBeNull();
  });

  it('skips a stale cached address and uses the next good one', () => {
    expect(thumbnailSource({ thumbnailUri: OLD, thumbnailUrl: 'https://cdn/abc/grid.webp' }))
      .toBe('https://cdn/abc/grid.webp');
  });

  it('still prefers localPath over a stale cached address', () => {
    expect(thumbnailSource({ localPath: 'file:///l.jpg', thumbnailUrl: OLD })).toBe('file:///l.jpg');
  });

  it('returns null when there is nothing to load', () => {
    expect(thumbnailSource({})).toBeNull();
    expect(thumbnailSource(null)).toBeNull();
    expect(thumbnailSource(undefined)).toBeNull();
  });
});

describe('fullSizeSource', () => {
  it('uses displayUrl, not the thumbnail and not the original', () => {
    expect(fullSizeSource({
      thumbnailUrl: 'https://cdn/g.webp',
      displayUrl: 'https://cdn/d.webp',
      serverUrl: 'https://cdn/full.jpg',
    })).toBe('https://cdn/d.webp');
  });

  it('still prefers the device copy', () => {
    expect(fullSizeSource({ localPath: 'file:///local.jpg', displayUrl: 'https://cdn/d.webp' }))
      .toBe('file:///local.jpg');
  });

  it('never falls back to the original', () => {
    expect(fullSizeSource({ serverUrl: 'https://cdn/full.jpg', url: 'https://cdn/full.jpg' })).toBeNull();
  });

  it('never uses a cached address on the old /api/v1/media/t/ route', () => {
    expect(fullSizeSource({ displayUrl: OLD })).toBeNull();
    expect(fullSizeSource({ displayUrl: OLD, displayUri: OLD })).toBeNull();
  });

  it('returns null when there is nothing to load', () => {
    expect(fullSizeSource({})).toBeNull();
    expect(fullSizeSource(null)).toBeNull();
  });
});

describe('videoSource', () => {
  it('plays the device copy first, then the original', () => {
    expect(videoSource({ localPath: 'file:///v.mp4', serverUrl: 'https://cdn/v.mp4' })).toBe('file:///v.mp4');
    expect(videoSource({ serverUrl: 'https://cdn/v.mp4' })).toBe('https://cdn/v.mp4');
    expect(videoSource({ url: 'https://cdn/v.mp4' })).toBe('https://cdn/v.mp4');
  });

  it('is not given a rendition address', () => {
    expect(videoSource({ thumbnailUrl: 'https://cdn/g.webp' })).toBeNull();
    expect(videoSource({ serverUrl: OLD })).toBeNull();
    expect(videoSource(null)).toBeNull();
  });
});
