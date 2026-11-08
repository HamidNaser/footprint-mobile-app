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

  describe('Decision 10 — everything keeps where it happened', () => {
    const paris = { lat: 48.85, lng: 2.35 };
    const home = { lat: 38.62, lng: -90.19, name: 'Home' };

    it('keeps a recording position rather than the entry location', () => {
      // The gap this closes. Audio inherited the entry's single picked location, which for
      // most entries is nothing -- so a grandmother recorded in Paris was filed as having
      // happened nowhere.
      const blocks = buildContentBlocks({
        audioRecordings: [{ uri: 'gran.m4a', capturedAt: 1, duration: 90, location: paris }],
        blockLocation: home,
      });

      const audio = blocks.find((b) => b.type === 'audio');
      expect(audio.location).toEqual(paris);
      expect(audio.media[0].location).toEqual(paris);
    });

    it('keeps where a note was written', () => {
      const blocks = buildContentBlocks({
        textNotes: [{ content: 'It rained all week', capturedAt: 1, location: paris }],
        blockLocation: home,
      });

      expect(blocks.find((b) => b.type === 'text').location).toEqual(paris);
    });

    it('still falls back to the entry location when a capture has none', () => {
      // Most captures will have nothing for a long while yet, and they must keep behaving
      // exactly as before.
      const blocks = buildContentBlocks({
        audioRecordings: [{ uri: 'a.m4a', capturedAt: 1 }],
        textNotes: [{ content: 'A note', capturedAt: 2 }],
        blockLocation: home,
      });

      expect(blocks.find((b) => b.type === 'audio').location).toEqual(home);
      expect(blocks.find((b) => b.type === 'text').location).toEqual(home);
    });

    it('leaves everything unlocated when there is nothing to go on', () => {
      const blocks = buildContentBlocks({
        audioRecordings: [{ uri: 'a.m4a', capturedAt: 1 }],
      });

      expect(blocks.find((b) => b.type === 'audio').location).toBeUndefined();
    });
  });
});

/**
 * The ordered-pieces form: `buildContentBlocks(pieces)`.
 *
 * The capture screen keeps one ordered list of pieces (data-model "Piece"), and that list IS the
 * order -- FR-005: "a text note MUST keep its place in that order rather than always appearing
 * first". The legacy object form above sorts four separate lists by an integer sequence and
 * hoists the composer text to the top; both of those are what this form replaces.
 *
 * The legacy form stays supported until T068, and every test above still exercises it. That is
 * deliberate: `JournalComposeModal` is the only caller today and it is rewritten by T068, not here.
 */
describe('ordered pieces (FR-005, FR-027)', () => {
  // ISO-8601 UTC instants, which is what a piece carries (data-model: "instant of capture").
  // Never a civil date: a capture time is an instant.
  const at = (second) => `2026-11-08T09:00:${String(second).padStart(2, '0')}.000Z`;

  const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

  const textAt = (second, content = `note at ${second}`) =>
    ({ localId: `t${second}`, kind: 'text', content, capturedAt: at(second) });
  const audioAt = (second) =>
    ({ localId: `c${second}`, kind: 'audio', uri: `clip${second}.m4a`, duration: 12, capturedAt: at(second) });
  const photoAt = (second) =>
    ({ localId: `p${second}`, kind: 'photo', uri: `p${second}.jpg`, width: 100, height: 200, capturedAt: at(second) });
  const videoAt = (second) =>
    ({ localId: `v${second}`, kind: 'video', uri: `v${second}.mp4`, duration: 5, capturedAt: at(second) });

  /** The quickstart M6 walk: note, clip, note, photo, photo, video. */
  const theSamWalk = () => [
    textAt(1, 'Set off at dawn'),
    audioAt(2),
    textAt(3, 'Sam found the bridge'),
    photoAt(4),
    photoAt(5),
    videoAt(6),
  ];

  it('keeps capture order and does not hoist the notes (M6, FR-005)', () => {
    const blocks = buildContentBlocks(theSamWalk());

    // Six pieces, five blocks: the two consecutive photos are still one grid block.
    expect(kinds(blocks)).toEqual(['text', 'audio', 'text', 'photos', 'video']);
    expect(blocks[3].media).toHaveLength(2);

    // The notes are where they were written, not at the top. This is the whole of FR-005: the
    // legacy form puts the composer's text first, which detached "Sam found the bridge" from
    // the bridge.
    expect(blocks[0].content).toBe('Set off at dawn');
    expect(blocks[2].content).toBe('Sam found the bridge');
  });

  it('puts capturedAt on media items and on text blocks, and nowhere else (FR-027, C3)', () => {
    const blocks = buildContentBlocks(theSamWalk());

    // A block with no media is where its own time is a recorded fact.
    expect(blocks[0].capturedAt).toBe(at(1));
    expect(blocks[2].capturedAt).toBe(at(3));

    // A block WITH media carries no block-level time -- its time is its media's (Principle II,
    // contract C3, and the same rule the Hub holds). A block-level copy would be derived data,
    // and derived data is never stored.
    expect(blocks[1].capturedAt).toBeUndefined();
    expect(blocks[3].capturedAt).toBeUndefined();
    expect(blocks[4].capturedAt).toBeUndefined();

    // Every media item carries its own.
    expect(blocks[1].media[0].capturedAt).toBe(at(2));
    expect(blocks[3].media.map((m) => m.capturedAt)).toEqual([at(4), at(5)]);
    expect(blocks[4].media[0].capturedAt).toBe(at(6));

    // Nothing is left out, and every one of them is an ISO instant rather than a sequence
    // number -- a sequence number is what the old composer stored, and it is meaningless to
    // any other device.
    const everyMediaTime = blocks.flatMap((b) => (b.media || []).map((m) => m.capturedAt));
    expect(everyMediaTime).toHaveLength(4);
    everyMediaTime.forEach((time) => expect(time).toMatch(ISO_INSTANT));
    blocks
      .filter((b) => !b.media)
      .forEach((b) => expect(b.capturedAt).toMatch(ISO_INSTANT));
  });

  it('keeps list order for pieces stamped in the same millisecond (R8)', () => {
    // Four captures inside one millisecond is what a burst of taps looks like. Sorted by time
    // they would come out in whatever order the sort happens to produce; the order that is true
    // is the order they were captured in, which is the list's.
    const same = '2026-11-08T09:00:00.000Z';
    const blocks = buildContentBlocks([
      { localId: 'n1', kind: 'text', content: 'first', capturedAt: same },
      { localId: 'p1', kind: 'photo', uri: 'p1.jpg', capturedAt: same },
      { localId: 'n2', kind: 'text', content: 'second', capturedAt: same },
      { localId: 'c1', kind: 'audio', uri: 'c1.m4a', capturedAt: same },
    ]);

    expect(kinds(blocks)).toEqual(['text', 'photos', 'text', 'audio']);
    expect(blocks.filter((b) => b.type === 'text').map((b) => b.content))
      .toEqual(['first', 'second']);
  });

  it('orders on the list, not on the time, even when the times disagree (R8)', () => {
    // A stable sort on the list index, never on the time. A clock that went backwards -- or a
    // time typed in by hand -- must not reshuffle what the person watched themselves capture.
    // The stored time is kept exactly as recorded; plausibility is a read-time rule only.
    const blocks = buildContentBlocks([
      textAt(9, 'written first'),
      textAt(1, 'written second'),
    ]);

    expect(blocks.map((b) => b.content)).toEqual(['written first', 'written second']);
    expect(blocks.map((b) => b.capturedAt)).toEqual([at(9), at(1)]);
  });

  it('emits remote media by id and url, with no localPath (edit mode)', () => {
    // An edit loads the memory's existing media back as pieces. Those are already on the
    // server: they are referenced by server id and url, never copied and never re-uploaded, and
    // they must carry no localPath at all. The `url` is what already excludes them from the
    // upload queue (`SyncEngine._isUnuploadedItem` requires `!(serverUrl || url)`); omitting
    // localPath is so the two signals can never disagree -- an item claiming both a server copy
    // and a pending local file is a contradiction for every later reader of it.
    const blocks = buildContentBlocks([
      {
        localId: 'r1',
        kind: 'photo',
        remote: { id: 'media-9', url: 'https://example.invalid/nine.jpg' },
        capturedAt: at(1),
      },
      {
        localId: 'r2',
        kind: 'audio',
        remote: { id: 'media-10', url: 'https://example.invalid/ten.m4a' },
        duration: 7,
        capturedAt: at(2),
      },
    ]);

    expect(kinds(blocks)).toEqual(['photos', 'audio']);

    const [remotePhoto] = blocks[0].media;
    expect(remotePhoto.id).toBe('media-9');
    expect(remotePhoto.url).toBe('https://example.invalid/nine.jpg');
    expect(remotePhoto.localPath).toBeUndefined();
    expect(remotePhoto.uri).toBeUndefined();
    expect(remotePhoto.capturedAt).toBe(at(1));

    const [remoteClip] = blocks[1].media;
    expect(remoteClip.id).toBe('media-10');
    expect(remoteClip.url).toBe('https://example.invalid/ten.m4a');
    expect(remoteClip.localPath).toBeUndefined();
  });

  it('keeps new local media on localPath, which is what marks it for upload', () => {
    // The other half of the rule above, so neither can be satisfied by dropping both.
    const blocks = buildContentBlocks([photoAt(1)]);

    expect(blocks[0].media[0].localPath).toBe('p1.jpg');
    expect(blocks[0].media[0].id).toBeUndefined();
    expect(blocks[0].media[0].url).toBeUndefined();

    // The piece's own localId reaches the media item. The data model mandates it ("stable
    // within the draft") and `CaptureDraftStore` is the only producer, so this is a pin against
    // a regression rather than a defence: nothing here invents one, because an invented id for
    // a remote piece (no `uri` to derive from) would look valid and collide.
    expect(blocks[0].media[0].localId).toBe('p1');
  });

  it('mixes remote and new media in one photo run without losing either', () => {
    const blocks = buildContentBlocks([
      {
        localId: 'r1',
        kind: 'photo',
        remote: { id: 'media-9', url: 'https://example.invalid/nine.jpg' },
        capturedAt: at(1),
      },
      photoAt(2),
    ]);

    expect(kinds(blocks)).toEqual(['photos']);
    expect(blocks[0].media.map((m) => m.id)).toEqual(['media-9', undefined]);
    expect(blocks[0].media.map((m) => m.localPath)).toEqual([undefined, 'p2.jpg']);
    expect(blocks[0].media.map((m) => m.capturedAt)).toEqual([at(1), at(2)]);
  });

  it('keeps where each piece happened, per piece (Decision 10)', () => {
    // Each piece is pinned where it was captured (`CaptureLocation.withLocation`), so the
    // entry-level location is not involved on this path at all. A note written in Paris was
    // being filed wherever the entry was tagged afterwards, which is the gap Decision 10 closed.
    const paris = { lat: 48.85, lng: 2.35 };
    const home = { lat: 38.62, lng: -90.19, name: 'Home' };

    const blocks = buildContentBlocks([
      { ...textAt(1, 'It rained all week'), location: paris },
      { ...photoAt(2), location: home },
    ]);

    expect(blocks[0].location).toEqual(paris);
    expect(blocks[1].media[0].location).toEqual(home);
  });

  it('carries duration onto audio and video blocks', () => {
    const blocks = buildContentBlocks([audioAt(1), videoAt(2)]);

    expect(blocks[0].duration).toBe(12);
    expect(blocks[1].duration).toBe(5);
  });

  it('drops a note left empty rather than saving a blank block', () => {
    // The same rule the legacy form holds for blank composer text. A piece recorded and then
    // emptied is not a memory of anything.
    const blocks = buildContentBlocks([textAt(1, '   '), photoAt(2)]);

    expect(kinds(blocks)).toEqual(['photos']);
  });

  /**
   * Nothing captured is ever lost (FR-012, SC-002: zero pieces lost).
   *
   * This function is the single funnel every captured piece passes through on its way to the
   * server, and a silent drop here is the one failure shape that makes a loss invisible: the
   * entry saves, the draft is cleared, the sync succeeds, nothing logs, and the piece is simply
   * not there. So an unrecognised kind refuses the whole assembly instead.
   *
   * Refusing is the lossless outcome, not the harsh one. `data-model.md`'s draft lifecycle is
   * explicit that a save which fails leaves the draft `active (unchanged, error shown)` -- so a
   * throw keeps every piece on the device, where a drop destroys one the moment the save
   * succeeds. It is the same instinct as this project's "sharing fails closed": when the whole
   * cannot be determined, refuse rather than store a partial.
   */
  describe('an unrecognised kind is refused, never dropped (FR-012)', () => {
    it('refuses to assemble, naming the kind and the piece', () => {
      const pieces = [
        textAt(1, 'Set off at dawn'),
        { localId: 'x9', kind: 'voice', uri: 'x9.m4a', capturedAt: at(2) },
        photoAt(3),
      ];

      // Named in the message so the kind that drifted and the piece that carried it are both
      // in hand; a kind name that drifts is not hypothetical, it is what this whole case is for.
      expect(() => buildContentBlocks(pieces)).toThrow(/unknown piece kind "voice"/);
      expect(() => buildContentBlocks(pieces)).toThrow(/x9/);
    });

    it('still emits every known piece around it', () => {
      // The converse, so the refusal cannot be satisfied by refusing everything: the same walk
      // with the stranger taken out emits all three of its blocks.
      const blocks = buildContentBlocks([textAt(1, 'Set off at dawn'), photoAt(3), audioAt(4)]);

      expect(kinds(blocks)).toEqual(['text', 'photos', 'audio']);
      expect(blocks[0].content).toBe('Set off at dawn');
      expect(blocks[1].media[0].localPath).toBe('p3.jpg');
    });

    it('refuses a kind inherited from Object.prototype rather than emitting garbage', () => {
      // A plain `build[kind]` is a prototype-chain lookup: 'constructor' resolves to `Object`,
      // which called with the piece returns a truthy wrapper, and 'toString' returns the string
      // "[object Object]". Both would be pushed as blocks -- malformed rather than missing,
      // which is worse: the server would be handed something no reader can parse.
      expect(() => buildContentBlocks([{ localId: 'c1', kind: 'constructor', capturedAt: at(1) }]))
        .toThrow(/unknown piece kind "constructor"/);
      expect(() => buildContentBlocks([{ localId: 't1', kind: 'toString', capturedAt: at(1) }]))
        .toThrow(/unknown piece kind "toString"/);
      expect(() => buildContentBlocks([{ localId: 'h1', kind: 'hasOwnProperty', capturedAt: at(1) }]))
        .toThrow(/unknown piece kind "hasOwnProperty"/);
    });

    it('refuses a piece with no kind at all', () => {
      // `kind` is not optional in the data model, so a piece without one is a producer bug, and
      // the same reasoning applies: a drop here is a piece gone with nothing to debug from.
      expect(() => buildContentBlocks([{ localId: 'n1', capturedAt: at(1) }]))
        .toThrow(/unknown piece kind/);
    });

    it('refuses the gallery picker\'s "image", which is not one of the four kinds', () => {
      // `MediaPicker` labels a gallery asset `type: 'image'`, and a producer that copies that
      // straight onto a piece has not normalised it. This path used to quietly rewrite it to
      // 'photo', which fixed this one funnel and left every other reader -- the Capture screen's
      // renderer, `CaptureDraftStore.adoptMedia`, all of which go by `kind` -- still broken.
      // The data model's four kinds are a closed set; normalising belongs at the producer.
      expect(() => buildContentBlocks([{ localId: 'g1', kind: 'image', uri: 'g1.jpg', capturedAt: at(1) }]))
        .toThrow(/unknown piece kind "image"/);
    });
  });

  it('returns nothing for an empty list', () => {
    expect(buildContentBlocks([])).toEqual([]);
  });

  it('still accepts the legacy object form, which T068 removes', () => {
    // Breaking `JournalComposeModal` now would be a defect, not a simplification: it is the
    // only caller today (the one call site, src/components/journal/JournalComposeModal.js:341)
    // and T068 is the task that retires it.
    const blocks = buildContentBlocks({
      text: 'Left Gare du Nord',
      attachedMedia: [photo(1)],
      textNotes: [note(2)],
    });

    expect(kinds(blocks)).toEqual(['text', 'photos', 'text']);
    expect(blocks[0].content).toBe('Left Gare du Nord');
  });
});
