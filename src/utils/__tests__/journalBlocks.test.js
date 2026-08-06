/**
 * Tests for capture-session block ordering.
 *
 * The rule these defend: an entry reads back in the order things were
 * captured. Grouping by kind detaches a voice note from the photo it was
 * recorded about.
 */

import { buildContentBlocks } from '../journalBlocks';

const photo = (at, uri = `p${at}.jpg`) => ({ type: 'photo', uri, capturedAt: at });
const galleryImage = (at, uri = `g${at}.jpg`) => ({ type: 'image', uri, capturedAt: at });
const video = (at, uri = `v${at}.mp4`) => ({ type: 'video', uri, capturedAt: at, duration: 5000 });
const audio = (at, uri = `a${at}.m4a`) => ({ uri, capturedAt: at, duration: 3000 });
const note = (at, content = `note ${at}`) => ({ content, capturedAt: at });

const kinds = (blocks) => blocks.map((b) => b.type);

describe('buildContentBlocks ordering', () => {
  it('emits blocks in capture order, not grouped by kind', () => {
    const blocks = buildContentBlocks({
      attachedMedia: [photo(1), video(4)],
      audioRecordings: [audio(3)],
      textNotes: [note(2)],
    });

    expect(kinds(blocks)).toEqual(['photos', 'text', 'audio', 'video']);
  });

  it('puts the primary composer text first regardless of captures', () => {
    const blocks = buildContentBlocks({
      text: 'Left Gare du Nord',
      attachedMedia: [photo(1)],
      textNotes: [note(2)],
    });

    expect(kinds(blocks)).toEqual(['text', 'photos', 'text']);
    expect(blocks[0].content).toBe('Left Gare du Nord');
    expect(blocks[2].content).toBe('note 2');
  });

  it('ignores blank primary text', () => {
    expect(kinds(buildContentBlocks({ text: '   ', attachedMedia: [photo(1)] })))
      .toEqual(['photos']);
  });
});

describe('photo run collapsing', () => {
  it('collapses consecutive photos into one grid block', () => {
    const blocks = buildContentBlocks({ attachedMedia: [photo(1), photo(2), photo(3)] });

    expect(kinds(blocks)).toEqual(['photos']);
    expect(blocks[0].media).toHaveLength(3);
  });

  it('starts a new photo block after a non-photo capture', () => {
    // Two photos, a voice note, then two more photos: the note must stay
    // between them rather than all four photos merging.
    const blocks = buildContentBlocks({
      attachedMedia: [photo(1), photo(2), photo(4), photo(5)],
      audioRecordings: [audio(3)],
    });

    expect(kinds(blocks)).toEqual(['photos', 'audio', 'photos']);
    expect(blocks[0].media).toHaveLength(2);
    expect(blocks[2].media).toHaveLength(2);
  });

  it('treats gallery images and camera photos as the same kind', () => {
    const blocks = buildContentBlocks({ attachedMedia: [photo(1), galleryImage(2)] });

    expect(kinds(blocks)).toEqual(['photos']);
    expect(blocks[0].media).toHaveLength(2);
  });

  it('gives each video its own block', () => {
    const blocks = buildContentBlocks({ attachedMedia: [video(1), video(2)] });
    expect(kinds(blocks)).toEqual(['video', 'video']);
  });
});

describe('multiple captures of one kind', () => {
  it('keeps every voice note instead of replacing earlier ones', () => {
    // Recording a second voice note used to silently discard the first.
    const blocks = buildContentBlocks({ audioRecordings: [audio(1), audio(2), audio(3)] });

    expect(kinds(blocks)).toEqual(['audio', 'audio', 'audio']);
    expect(blocks.map((b) => b.media[0].localPath)).toEqual(['a1.m4a', 'a2.m4a', 'a3.m4a']);
  });

  it('keeps every typed note', () => {
    const blocks = buildContentBlocks({ textNotes: [note(1), note(2)] });
    expect(blocks.map((b) => b.content)).toEqual(['note 1', 'note 2']);
  });
});

describe('block payloads', () => {
  it('maps media onto localPath, which is what the card reads', () => {
    const blocks = buildContentBlocks({ attachedMedia: [photo(1, 'file:///tmp/x.jpg')] });
    expect(blocks[0].media[0].localPath).toBe('file:///tmp/x.jpg');
  });

  it('carries duration onto audio and video blocks', () => {
    const blocks = buildContentBlocks({
      attachedMedia: [video(2)],
      audioRecordings: [audio(1)],
    });

    expect(blocks[0].duration).toBe(3000);
    expect(blocks[1].duration).toBe(5000);
  });

  it('applies the per-item location resolver to media', () => {
    const blocks = buildContentBlocks({
      attachedMedia: [photo(1)],
      blockLocation: { lat: 1, lng: 2 },
      mediaLocation: () => ({ lat: 48.8, lng: 2.3 }),
    });

    expect(blocks[0].media[0].location).toEqual({ lat: 48.8, lng: 2.3 });
    expect(blocks[0].location).toEqual({ lat: 1, lng: 2 });
  });

  it('generates stable localIds without Math.random', () => {
    const a = buildContentBlocks({ attachedMedia: [photo(1, 'x.jpg')] });
    const b = buildContentBlocks({ attachedMedia: [photo(1, 'x.jpg')] });

    expect(a[0].media[0].localId).toBe(b[0].media[0].localId);
  });
});

describe('edge cases', () => {
  it('returns nothing for an empty session', () => {
    expect(buildContentBlocks({})).toEqual([]);
  });

  it('keeps unstamped items ahead of stamped ones rather than dropping them', () => {
    const blocks = buildContentBlocks({
      attachedMedia: [{ type: 'photo', uri: 'legacy.jpg' }, photo(5)],
    });

    expect(kinds(blocks)).toEqual(['photos']);
    expect(blocks[0].media.map((m) => m.localPath)).toEqual(['legacy.jpg', 'p5.jpg']);
  });
});
