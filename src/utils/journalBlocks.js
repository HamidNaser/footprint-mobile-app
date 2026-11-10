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
 *
 * @throws {Error} if any piece carries a `kind` outside the four above. Nothing captured is ever
 *   lost (FR-012), and this is the single funnel every piece passes through on its way to the
 *   server, so a piece it cannot build refuses the whole entry rather than vanishing from it.
 *   See `builderFor`. A caller must let this surface, not swallow it: a failed save leaves the
 *   draft intact, so refusing keeps every piece on the device.
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
 * A kind with no builder throws, and never silently emits nothing -- see `builderFor`.
 *
 * @param {Array<{kind: string, item: object}>} captures - in the order they are to be emitted
 * @param {object} build - one builder per kind; `photos` takes the whole run. A builder may
 *   return nothing, which emits no block.
 * @throws {Error} if any capture's kind has no builder
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
      // Guarded like the branch below, because the contract above says a builder may return
      // nothing. An unguarded push would put `null` in the block list -- a malformed block
      // reaching the server, which is worse than a missing one. Neither `photos` builder
      // returns nothing today; the guard is what makes the contract one rule rather than two.
      const photoBlock = build.photos(run);
      if (photoBlock) blocks.push(photoBlock);
      continue;
    }

    const { item } = captures[i];
    const block = builderFor(build, kind, item)(item);
    if (block) blocks.push(block);
    i += 1;
  }

  return blocks;
}

/**
 * The builder for one kind, or a refusal -- never a silent nothing.
 *
 * Two defects this closes, both of which a plain `build[kind]?.(item)` has:
 *
 * 1. **An unrecognised kind was discarded in silence** -- no block, no warning, no error. This
 *    function is the single funnel every captured piece passes through on its way to the server,
 *    and FR-012 ("nothing captured is ever lost", SC-002: zero pieces lost) is load-bearing for
 *    this feature. A silent drop is the one failure shape that makes a loss invisible: the entry
 *    saves, the draft is cleared, the sync succeeds, nothing logs, and the piece is not there.
 *    The risk is not hypothetical -- kind names in this codebase do drift (`MediaPicker` calls a
 *    gallery photo an `'image'`), so the next kind added is the next piece lost.
 * 2. **`build[kind]` is a prototype-chain lookup.** `kind === 'constructor'` resolves to
 *    `Object`, which called with the piece returns a truthy wrapper and is pushed as a block;
 *    `'toString'` pushes the string `"[object Object]"`. Those are *malformed* blocks rather
 *    than missing ones, which is worse -- the server is handed something no reader can parse.
 *
 * **Why it throws rather than warning.** A `console.warn` reaches no screen and no crash
 * reporter on this app (see the repo's "no crash reporting" gap), so it is invisible to everyone
 * but a developer with Metro open -- the same invisibility the drop had. Refusing is also the
 * *lossless* outcome, not the harsh one: `data-model.md`'s draft lifecycle is explicit that
 * `Save + local write fails` leaves the draft `active (unchanged, error shown)`, so a throw keeps
 * every piece on the device, where a drop destroys one the moment the save succeeds. It is the
 * same instinct as this project's "sharing fails closed" rule: when the whole cannot be
 * determined, refuse rather than store a partial.
 *
 * It cannot fire on today's inputs. Both callers pass a closed set of kinds -- the pieces form
 * passes through the data model's four, and the legacy form's own mapping can only produce
 * `photo`, `video`, `audio` or `text` (every `attachedMedia` type that is not `'video'` becomes
 * `'photo'`, and the other two lists are hardcoded). So the throw is unreachable until a later
 * task adds a fifth kind and forgets this funnel, which is exactly when it should be heard. A
 * caller that assembles blocks must let it surface, not swallow it.
 */
function builderFor(build, kind, item) {
  // `hasOwnProperty.call`, not `build[kind]`: own keys only, so no inherited `Object` member can
  // be mistaken for a builder.
  if (Object.prototype.hasOwnProperty.call(build, kind) && typeof build[kind] === 'function') {
    return build[kind];
  }

  throw new Error(
    `buildContentBlocks: unknown piece kind "${kind}" on piece "${item?.localId}". Refusing to `
    + 'assemble the entry rather than dropping the piece, which would lose it with nothing to '
    + 'debug from. Add a builder for this kind, or normalise it at the producer.'
  );
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
 *
 * `kind` is the data model's closed set of four -- `text`, `audio`, `photo`, `video` -- and
 * nothing else is accepted or rewritten here. An earlier version quietly mapped the gallery
 * picker's `'image'` to `'photo'`, which fixed this one funnel and left every other reader of a
 * piece (the Capture screen's renderer, `CaptureDraftStore.adoptMedia`, all of which go by
 * `kind`) looking at a kind they do not know. Normalising a picker's label belongs at the
 * producer, before the piece is stored; an unrecognised kind reaching here is refused.
 */
function blocksFromPieces(pieces) {
  const captures = pieces
    .filter(Boolean)
    .map((piece) => ({ kind: piece.kind, item: piece }));

  return assembleInOrder(captures, {
    photos: (run) => ({
      ...blockIdOf(run[0]),
      type: 'photos',
      location: run[0].location,
      media: run.map(mediaItemFor),
    }),

    video: (piece) => ({
      ...blockIdOf(piece),
      type: 'video',
      location: piece.location,
      media: [mediaItemFor(piece)],
      duration: piece.duration,
    }),

    audio: (piece) => ({
      ...blockIdOf(piece),
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
        ...blockIdOf(piece),
        type: 'text',
        content: piece.content,
        location: piece.location,
        capturedAt: piece.capturedAt,
      }
      : null),
  });
}

/**
 * The id of the block a loaded piece came out of, for the rebuilt block to keep.
 *
 * `ConflictResolver._mergeContentBlocks` (`:462`, `:467`) keys a block on
 * `block.id || JSON.stringify(block)`, so a block that loses its id across an edit keys
 * differently from its own server twin and a MERGE resolution would hold both -- the memory's
 * blocks duplicated. Nothing for a newly captured piece, which came out of no block: the key is
 * then omitted entirely rather than set to undefined, so the shape is exactly what it has
 * always been for a new memory.
 */
function blockIdOf(piece) {
  return piece?.blockId ? { id: piece.blockId } : {};
}

/**
 * One media item from one piece.
 *
 * A piece loaded back by an edit is already on the server: it is referenced by its server
 * `id`/`url`, and it is never copied and never re-uploaded.
 *
 * **It keeps every other address the memory already had, `localPath` included** (013 T057/T058
 * fix round 1). An uploaded item carries two rendition addresses and the device's own copy as
 * well as its url, and the tiles read exactly those: `thumbnailSource` reads
 * `localPath, thumbnailUrl, thumbnailUri` and `fullSizeSource` reads
 * `localPath, displayUrl, displayUri`. Written back as `{id, url}` alone, a photograph answers
 * null to both -- and because it still has a media id,
 * `DatabaseService._normalizeContentBlocks` leaves `thumbnailUrl` null on purpose ("no
 * thumbnail means none yet"), so the tile draws the grey "Preparing photo…" plate and waits
 * for the poller. Offline the poller stays quiet and backs off, so the plate never resolves;
 * and no pull can restore a device path, so the memory is network-dependent from the edit on.
 * `piece.savedItem` is the item as the memory has it, and it is written back out underneath the
 * piece's own values.
 *
 * **Why both signals on one item is safe now.** Three things read a path on an item, and none
 * of them acts on this one:
 *
 *   - `JournalService._queueMediaBlockForUpload` (`:884`) skips on `item.serverUrl || item.url`
 *     **before** it looks at a path;
 *   - `SyncEngine._isUnuploadedItem` (`:658`) is
 *     `!!((localPath || uri) && !mediaId && !(serverUrl || url))`, so a server address excludes
 *     it there too -- and `_planEntryMedia` (`:699`) strips `localPath` from the wire copy, so
 *     the device path is never sent;
 *   - `JournalService._persistMediaBlocks` (`:238`) does read `item.localPath`, but through
 *     `FileService.persist`, which returns a path already inside `documentDirectory/media/`
 *     untouched (`FileService.js:240-244`, `isPersisted` `:228-230`) -- so no copy is made.
 *
 * This comment used to say the opposite: that `localPath` was omitted "so the two signals can
 * never disagree". That was written when they genuinely did -- the upload queue keyed only on
 * `serverUrl`, so a `url` alone did not exclude an item there -- and 013 T055/T056 closed it by
 * giving the queue its `|| item?.url`. With both gates reading either address, an item that
 * carries its server copy and its device copy is a complete record rather than a contradiction,
 * and keeping the device copy is what lets an edited memory still render with no signal.
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

  // Empty for anything captured here: a new piece came out of no stored item, so the shape is
  // exactly what it has always been for a new memory.
  const saved = piece.savedItem ?? {};

  if (piece.remote) {
    return { ...saved, ...common, id: piece.remote.id, url: piece.remote.url };
  }

  return { ...saved, ...common, localPath: piece.uri };
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
