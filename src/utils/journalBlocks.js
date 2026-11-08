/**
 * Content-block assembly for a capture session.
 *
 * A capture session is a timeline: photo, note, voice note, video, note. The
 * entry should read back in that order. Grouping by kind (all photos, then all
 * videos, then the audio) misrepresents what happened -- a voice note recorded
 * *about* the photo before it ends up detached from it.
 *
 * Kept separate from the screens so the ordering rules can be tested without
 * mounting a modal or a camera.
 *
 * There are two forms, and both are supported on purpose:
 *
 *   buildContentBlocks(pieces)   -- the capture screen's ordered list of pieces. THE form.
 *   buildContentBlocks({ text, attachedMedia, audioRecordings, textNotes, ... })
 *                                -- the legacy composer's four separate lists, kept working
 *                                   for `JournalComposeModal` until T068 retires it.
 *
 * The legacy form is not just a different argument shape, it is a different behaviour: it
 * hoists `text` to the top of the entry and it orders by an integer sequence. FR-005 is that a
 * text note keeps its place in capture order rather than always appearing first, so the pieces
 * form does neither.
 */

/**
 * Where capture times do and do not go (FR-027, Principle II, contract C3).
 *
 * `capturedAt` is stored only where it is a recorded fact: on each media item, and on a block
 * that carries no media. A block WITH media gets no block-level time -- its time is its
 * media's, so a block-level copy would be derived data, and derived data is never stored. The
 * Hub holds the same rule and ignores a block-level time on a block with media.
 *
 * The value is an ISO-8601 instant, exactly as recorded, never a civil date and never
 * rewritten for being implausible. Plausibility is a read-time ordering rule only.
 */

/**
 * Assemble ordered content blocks from a capture session.
 *
 * @param {Array<object>|object} input - an ordered `pieces` array, or the legacy composer object
 * @returns {Array<object>} content blocks in capture order
 *
 * The pieces form takes an ordered array of `Piece` (see `specs/013-mobile-capture-map/data-model.md`):
 * `{localId, kind: 'text'|'audio'|'photo'|'video', capturedAt, location, content, uri, width,
 * height, duration, waveform, remote: {id, url}}`. The list IS the order.
 *
 * The legacy form takes `{text, attachedMedia, audioRecordings, textNotes, blockLocation,
 * mediaLocation}` and behaves exactly as it did before: `text` opens the entry, and the three
 * capture lists are merged by their integer `capturedAt` sequence.
 */
export function buildContentBlocks(input = {}) {
  return Array.isArray(input) ? blocksFromPieces(input) : blocksFromComposer(input);
}

// ============================================================
// The shared skeleton
// ============================================================

/**
 * Walk captures in order, collapsing each consecutive run of photos into one block.
 *
 * The run is what makes a grid of photos read as a grid rather than as five separate rows, and
 * breaking it on anything that is not a photo is what keeps a voice note between the photos it
 * sits between. Both forms need exactly this walk; only the block payloads differ, so they are
 * passed in.
 *
 * @param {Array<{kind: string, item: object}>} captures - in the order they are to be emitted
 * @param {object} build - one builder per kind; `photos` takes the whole run. A builder may
 *   return nothing, which emits no block.
 */
function assembleInOrder(captures, build) {
  const blocks = [];
  let i = 0;

  while (i < captures.length) {
    const { kind } = captures[i];

    if (kind === 'photo') {
      const run = [];
      while (i < captures.length && captures[i].kind === 'photo') {
        run.push(captures[i].item);
        i += 1;
      }
      blocks.push(build.photos(run));
      continue;
    }

    const block = build[kind]?.(captures[i].item);
    if (block) blocks.push(block);
    i += 1;
  }

  return blocks;
}

// ============================================================
// The pieces form
// ============================================================

/**
 * One ordered list of pieces, in the order they were captured.
 *
 * No sort. Research R8: the order is the list's, and a sort on the time -- even a stable one --
 * reorders two pieces whose stamps came out of the same millisecond, which a burst of taps
 * produces routinely. The list index already carries the only ordering that is true.
 */
function blocksFromPieces(pieces) {
  const captures = pieces
    .filter(Boolean)
    // 'image' is what the gallery picker calls a photo; 'photo' is what the camera calls one.
    .map((piece) => ({ kind: piece.kind === 'image' ? 'photo' : piece.kind, item: piece }));

  return assembleInOrder(captures, {
    photos: (run) => ({
      type: 'photos',
      location: run[0].location,
      media: run.map(mediaItemFor),
    }),

    video: (piece) => ({
      type: 'video',
      location: piece.location,
      media: [mediaItemFor(piece)],
      duration: piece.duration,
    }),

    audio: (piece) => ({
      type: 'audio',
      location: piece.location,
      media: [mediaItemFor(piece)],
      duration: piece.duration,
      waveform: piece.waveform,
    }),

    // A block with no media, so this is where its own capture time is a recorded fact. A note
    // recorded and then left empty is not a memory of anything, and is dropped rather than
    // saved blank -- the same rule the legacy form holds for blank composer text.
    text: (piece) => (piece.content?.trim()
      ? {
        type: 'text',
        content: piece.content,
        location: piece.location,
        capturedAt: piece.capturedAt,
      }
      : null),
  });
}

/**
 * One media item from one piece.
 *
 * A piece loaded back by an edit is already on the server: it is referenced by its server
 * `id`/`url` and carries **no** `localPath`, because a localPath is what marks an item as still
 * needing an upload (`SyncEngine._isUnuploadedItem`) -- one here would queue an upload of a file
 * that no longer exists, and hold the whole entry back waiting for it. Remote media is never
 * copied and never re-uploaded.
 */
function mediaItemFor(piece) {
  const common = {
    localId: piece.localId,
    width: piece.width,
    height: piece.height,
    location: piece.location,
    capturedAt: piece.capturedAt,
    // Duration on the item for a video, as the legacy form does; for audio it sits on the
    // block alone. Set for a remote video too, or an edit would drop it.
    ...(piece.kind === 'video' ? { duration: piece.duration } : {}),
  };

  if (piece.remote) {
    return { ...common, id: piece.remote.id, url: piece.remote.url };
  }

  return { ...common, localPath: piece.uri };
}

// ============================================================
// The legacy composer form -- unchanged behaviour, removed by T068
// ============================================================

/**
 * The old composer's four lists, merged by their integer `capturedAt` sequence.
 *
 * Deliberately left as it was, down to the text-first hoist and the sequence sort. Its
 * `capturedAt` is a per-session integer, not an instant, so it is **not** emitted onto blocks or
 * media: sending a sequence number as a capture time would put a meaningless value on the
 * server, where every other device would read it as a real one. Capture times arrive with the
 * pieces form.
 *
 * @param {object} params
 * @param {string} params.text - primary composer text; always opens the entry
 * @param {Array<object>} params.attachedMedia - photos/videos, each `{uri, type, capturedAt}`
 * @param {Array<object>} params.audioRecordings - `{uri, duration, capturedAt}`
 * @param {Array<object>} params.textNotes - `{content, capturedAt}`
 * @param {object} [params.blockLocation] - entry-level `{lat, lng, name}`
 * @param {(m: object) => object|undefined} [params.mediaLocation] - per-item coordinate resolver
 */
function blocksFromComposer({
  text = '',
  attachedMedia = [],
  audioRecordings = [],
  textNotes = [],
  blockLocation,
  // Consults the item first: an audio note or text note stamped at capture carries its own
  // position, and the entry-level location is only a fallback.
  mediaLocation = (m) => m?.location || blockLocation,
}) {
  const blocks = [];

  if (text.trim()) {
    blocks.push({ type: 'text', content: text.trim(), location: blockLocation });
  }

  // 'image' comes from the gallery picker, 'photo' from the in-modal camera.
  const captures = [
    ...attachedMedia.map((m) => ({
      kind: m.type === 'video' ? 'video' : 'photo',
      item: m,
      at: m.capturedAt ?? 0,
    })),
    ...audioRecordings.map((a) => ({ kind: 'audio', item: a, at: a.capturedAt ?? 0 })),
    ...textNotes.map((t) => ({ kind: 'text', item: t, at: t.capturedAt ?? 0 })),
  ].sort((a, b) => a.at - b.at);

  blocks.push(...assembleInOrder(captures, {
    // Collapse a consecutive run into one block so the card can lay them out as a grid. A photo
    // taken after a voice note starts a new block.
    photos: (run) => ({
      type: 'photos',
      location: blockLocation,
      media: run.map((p) => ({
        localId: p.localId || `photo-${p.capturedAt ?? 0}-${p.uri}`,
        localPath: p.uri,
        width: p.width,
        height: p.height,
        location: mediaLocation(p),
      })),
    }),

    video: (item) => ({
      type: 'video',
      location: blockLocation,
      media: [{
        localId: item.localId || `video-${item.capturedAt ?? 0}-${item.uri}`,
        localPath: item.uri,
        width: item.width,
        height: item.height,
        duration: item.duration,
        location: mediaLocation(item),
      }],
      duration: item.duration,
    }),

    // The recording's own position when it has one, per Decision 10. It used to inherit the
    // entry's single picked location, which for most entries is nothing -- so a grandmother
    // recorded in Paris was filed as having happened nowhere.
    audio: (item) => {
      const recordedAt = mediaLocation(item);
      return {
        type: 'audio',
        location: recordedAt,
        media: [{
          localId: item.localId || `audio-${item.capturedAt ?? 0}-${item.uri}`,
          localPath: item.uri,
          location: recordedAt,
        }],
        duration: item.duration,
        waveform: item.waveform,
      };
    },

    // Same for a typed note: where the thought was written, not where the entry was tagged
    // afterwards.
    text: (item) => ({ type: 'text', content: item.content, location: mediaLocation(item) }),
  }));

  return blocks;
}
