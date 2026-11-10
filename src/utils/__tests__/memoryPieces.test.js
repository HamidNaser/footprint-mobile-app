/**
 * memoryPieces (013 T045) -- the order, the numbers and the groups under a saved memory.
 *
 * `toNumberedPieces(entry, serverUpdatedAt)` is the one place that decides what every viewer
 * sees under a memory: which piece comes first, which number each piece carries, and which
 * pins share a marker. Three rules compose in it, and each has a case that is one character
 * away from a plausible wrong answer -- so each is tested on its boundary, not near it.
 *
 * **Ordering (FR-028, FR-029, contract *Client ordering rule*).** A piece's time is usable iff
 * it is present and not later than the server's `updatedAt` for the entry plus ten minutes.
 * With no server value every present time is usable, and the device's own clock is never
 * consulted -- a threshold of "now" would make the order a fact about when this phone happened
 * to look, so two phones would order the same memory differently (SC-007). An unusable time is
 * still kept on the piece: plausibility is a read-time ordering rule and never alters a
 * recorded fact (Principle III, contract C2).
 *
 * **Numbering (FR-023, owner's round-2 answer).** Only pieces with a place are numbered, 1…k
 * with no gaps, in the sorted order. A piece with no place carries no number, and a memory with
 * no places carries none at all, so it looks exactly as it does today (SC-008).
 *
 * **Merging (round-3 L2, round-4 I2).** One rule decides both which pins merge and how many
 * distinct places there are: the pieces whose latitude and longitude **round** (`toFixed(5)`,
 * about a metre) to the same single key share one marker. It is a rounding grid, not a distance:
 * 51.500014 and 51.500016 are two ten-millionths of a degree apart and fall either side of a key
 * boundary, and that is accepted -- FR-023's "about a metre" is judged by this grid.
 *
 * Nothing here mocks anything, because there is nothing to mock: the function is pure, with no
 * clock and no I/O. The one spy is on `Date.now`, and it is there to prove it is never called.
 */

import { toNumberedPieces } from '../memoryPieces';

// The server's record of the memory's last save. Every plausibility test is written against
// this one instant so the arithmetic is readable: +10 min is 15:20:00.000Z exactly.
const SAVED = '2026-11-01T15:10:00.000Z';
const TEN_MINUTES_AFTER = '2026-11-01T15:20:00.000Z';
const A_MILLISECOND_LATER = '2026-11-01T15:20:00.001Z';
const A_YEAR_AFTER = '2027-11-01T15:10:00.000Z';

const HERE = { lat: 51.5009, lng: -0.142 };

/** A text block: the one kind of block that carries its own capture time (contract C3). */
const text = (capturedAt, location = null, content = 'a note') => ({
  type: 'text',
  content,
  capturedAt,
  location,
  // `SocialService.adaptBlock` gives every block a `media` array, empty on a text block.
  media: [],
});

/** A photos block: one piece per photo, each with its own time and place. */
const photos = (items, blockExtras = {}) => ({
  type: 'photos',
  location: null,
  ...blockExtras,
  media: items.map(([capturedAt, location = null], i) => ({
    id: `m${i}`,
    capturedAt,
    location,
  })),
});

const mediaBlock = (type) => (capturedAt, location = null, blockExtras = {}) => ({
  type,
  location: null,
  ...blockExtras,
  media: [{ id: `${type}-1`, capturedAt, location }],
});

const video = mediaBlock('video');
const audio = mediaBlock('audio');

const entryOf = (...contentBlocks) => ({ contentBlocks });

/** The stored positions of the pieces, in the order the rule puts them. */
const orderOf = (result) => result.pieces.map((piece) => piece.storedIndex);

describe('expanding a memory into pieces', () => {
  it('gives one piece per text, audio and video block, and one per photo', () => {
    const entry = entryOf(
      text(SAVED),
      photos([[SAVED], [SAVED]]),
      video(SAVED),
      audio(SAVED),
    );

    const { pieces } = toNumberedPieces(entry, SAVED);

    expect(pieces.map((p) => p.kind)).toEqual(['text', 'photo', 'photo', 'video', 'audio']);
    expect(pieces.map((p) => p.storedIndex)).toEqual([0, 1, 2, 3, 4]);
  });

  it('points each piece back at the block, and each photo at its own tile', () => {
    // The card badges the piece itself, so a piece has to be findable in the block list it
    // came from: a photo tile is a block index and a media index (FR-023).
    const { pieces } = toNumberedPieces(entryOf(text(SAVED), photos([[SAVED], [SAVED]])), SAVED);

    expect(pieces.map((p) => [p.blockIndex, p.mediaIndex])).toEqual([
      [0, null],
      [1, 0],
      [1, 1],
    ]);
  });

  it("takes a media block's time from its media item, ignoring any block-level time", () => {
    // Contract C3: a block that carries media has no time of its own. A block-level value on
    // such a block is not a recorded fact about anything, so it is not used as the item's time
    // and not used as a fallback either -- the second photo below has no time at all, and
    // borrowing the block's would order it by a value no device agrees on.
    const entry = entryOf(photos(
      [['2026-11-01T14:57:02.004Z'], [null]],
      { capturedAt: A_YEAR_AFTER },
    ));

    expect(toNumberedPieces(entry, SAVED).pieces.map((p) => p.capturedAt))
      .toEqual(['2026-11-01T14:57:02.004Z', null]);
  });

  it('falls back to the block place for a media item that has none of its own', () => {
    // An older memory records a place on the block and nothing on the photo. The server has
    // already coarsened both for this viewer, so the block's place is this photo's place; the
    // alternative is a memory with places that shows no map at all (SC-008).
    const entry = entryOf(photos([[null]], { location: HERE }));

    expect(toNumberedPieces(entry, SAVED).pieces[0].location).toEqual(HERE);
  });

  it('does not mistake an inherited object property for a block type', () => {
    // `MEDIA_BLOCK_KINDS[block.type]` is a prototype-chain lookup, so a block whose type is
    // `'constructor'` or `'toString'` resolves to a *function* -- truthy, so the block is read
    // as a media block, and the function would travel on as the piece's `kind` and into the
    // group handed to the map. `journalBlocks.js` closes the same hole in `builderFor`, for the
    // same reason: a kind this file does not know is still a piece that must not be lost.
    const entry = entryOf(
      { type: 'constructor', content: 'a note', capturedAt: '2026-11-01T14:40:00.000Z', media: [] },
      { type: 'toString', content: 'another', capturedAt: '2026-11-01T14:50:00.000Z', media: [] },
    );

    const { pieces } = toNumberedPieces(entry, SAVED);

    expect(pieces.map((p) => p.kind)).toEqual(['constructor', 'toString']);
  });

  it('reads a memory with no blocks at all, or no memory at all, without complaint', () => {
    // A card is rendered while its entry is still arriving on more than one screen, and an
    // empty answer is the one that leaves the card looking exactly as it does today.
    const nothing = {
      pieces: [],
      groups: [],
      distinctPlaceCount: 0,
      withoutPlaceCount: 0,
    };

    expect(toNumberedPieces({}, SAVED)).toEqual(nothing);
    expect(toNumberedPieces({ contentBlocks: [] }, SAVED)).toEqual(nothing);
    expect(toNumberedPieces(undefined, SAVED)).toEqual(nothing);
  });
});

describe('the ordering rule', () => {
  it('puts all-timed pieces in capture order, whatever order they are stored in', () => {
    const entry = entryOf(
      text('2026-11-01T15:00:00.000Z'),
      text('2026-11-01T14:40:00.000Z'),
      text('2026-11-01T14:50:00.000Z'),
    );

    expect(orderOf(toNumberedPieces(entry, SAVED))).toEqual([1, 2, 0]);
  });

  it('leaves a memory with no times at all in its stored order', () => {
    const entry = entryOf(text(null), text(undefined), text(null));

    expect(orderOf(toNumberedPieces(entry, SAVED))).toEqual([0, 1, 2]);
  });

  it('keeps an untimed first piece first: its key is minus infinity', () => {
    // The first piece has no predecessor to inherit from, and minus infinity is what puts it
    // before every real time rather than after them.
    const entry = entryOf(
      text(null),
      text('2026-11-01T15:00:00.000Z'),
      text('2026-11-01T14:40:00.000Z'),
    );

    expect(orderOf(toNumberedPieces(entry, SAVED))).toEqual([0, 2, 1]);
  });

  it('keeps an untimed piece directly after the piece stored before it', () => {
    // Stored: A@15:00, B untimed, C@14:40. B inherits A's key, so it travels with A rather
    // than to either end of the memory (FR-028, the partly-timed edge case).
    const entry = entryOf(
      text('2026-11-01T15:00:00.000Z'),
      text(null),
      text('2026-11-01T14:40:00.000Z'),
    );

    expect(orderOf(toNumberedPieces(entry, SAVED))).toEqual([2, 0, 1]);
  });

  it('carries an inherited key down a run of untimed pieces', () => {
    // Stored: A@15:00, B untimed, C untimed, D@14:40. B and C both end up on A's key and in
    // their stored order behind it.
    const entry = entryOf(
      text('2026-11-01T15:00:00.000Z'),
      text(null),
      text(null),
      text('2026-11-01T14:40:00.000Z'),
    );

    expect(orderOf(toNumberedPieces(entry, SAVED))).toEqual([3, 0, 1, 2]);
  });

  it('keeps two pieces captured in the same millisecond in their stored order', () => {
    // A burst of taps produces this routinely. The stored index is the explicit tiebreaker,
    // so the answer does not depend on how one engine's sort happens to behave (SC-007).
    const sameMoment = '2026-11-01T14:40:00.000Z';
    const entry = entryOf(
      text('2026-11-01T15:00:00.000Z'),
      text(sameMoment, null, 'second'),
      text(sameMoment, null, 'third'),
    );

    expect(orderOf(toNumberedPieces(entry, SAVED))).toEqual([1, 2, 0]);
  });

  it('uses a time exactly ten minutes after the last save', () => {
    // The tolerance is inclusive: ten minutes is a clock difference, not an impossibility.
    const entry = entryOf(
      text(TEN_MINUTES_AFTER),
      text('2026-11-01T14:40:00.000Z'),
    );

    expect(orderOf(toNumberedPieces(entry, SAVED))).toEqual([1, 0]);
  });

  it('does not use a time one millisecond past the tolerance', () => {
    // One millisecond over and the piece is ordered as if it had no time at all: first,
    // because it is stored first and has no predecessor to inherit from.
    const entry = entryOf(
      text(A_MILLISECOND_LATER),
      text('2026-11-01T14:40:00.000Z'),
    );

    expect(orderOf(toNumberedPieces(entry, SAVED))).toEqual([0, 1]);
  });

  it('ignores a time a year after the last save, and keeps the value on the piece', () => {
    // The wrong-clock edge case. Stored: A@14:40, B a year ahead, C@14:50. B keeps A's key,
    // so it stays between its neighbours -- and its recorded time is returned untouched.
    const entry = entryOf(
      text('2026-11-01T14:40:00.000Z'),
      text(A_YEAR_AFTER),
      text('2026-11-01T14:50:00.000Z'),
    );

    const result = toNumberedPieces(entry, SAVED);

    expect(orderOf(result)).toEqual([0, 1, 2]);
    expect(result.pieces[1].capturedAt).toBe(A_YEAR_AFTER);
  });

  it('orders a piece added in a later edit normally', () => {
    // The memory was first saved at 14:45 and saved again at 15:10. The piece added in the
    // edit was captured at 15:05 -- after that first save, and so unusable if it were judged
    // against it, but it is judged against the *last* save and is simply late (FR-029).
    const entry = entryOf(
      text('2026-11-01T14:40:00.000Z'),
      text('2026-11-01T15:05:00.000Z'),   // added in the edit
      text('2026-11-01T14:42:00.000Z'),
    );

    expect(orderOf(toNumberedPieces(entry, SAVED))).toEqual([0, 2, 1]);
    expect(orderOf(toNumberedPieces(entry, '2026-11-01T14:45:00.000Z'))).toEqual([0, 1, 2]);
  });

  it('applies no threshold at all when the server value is missing', () => {
    // Until a device has the server's record of the save, no moment is treated as impossible
    // (FR-029). A time a year ahead therefore orders like any other.
    const entry = entryOf(
      text(A_YEAR_AFTER),
      text('2026-11-01T14:40:00.000Z'),
    );

    expect(orderOf(toNumberedPieces(entry, undefined))).toEqual([1, 0]);
    // The own-memory route reads the column as NULL rather than as absent; both mean the same.
    expect(orderOf(toNumberedPieces(entry, null))).toEqual([1, 0]);
  });

  it('never consults the device clock, with or without a server value', () => {
    const now = jest.spyOn(Date, 'now');
    const entry = entryOf(text(A_YEAR_AFTER), text('2026-11-01T14:40:00.000Z'));

    toNumberedPieces(entry, undefined);
    toNumberedPieces(entry, SAVED);

    expect(now).not.toHaveBeenCalled();
    now.mockRestore();
  });

  it('reads a server value with no milliseconds', () => {
    // The server need not send them, and assuming them would move the threshold.
    const entry = entryOf(
      text(TEN_MINUTES_AFTER),
      text(A_MILLISECOND_LATER),
      text('2026-11-01T14:40:00.000Z'),
    );

    // Stored: A at +10 min exactly (usable), B one millisecond over (inherits A's key), C
    // earliest. So C, then A with B behind it.
    expect(orderOf(toNumberedPieces(entry, '2026-11-01T15:10:00Z'))).toEqual([2, 0, 1]);
  });

  it('reads a timestamp with no zone as UTC, not as this device\'s local time', () => {
    // `Date.parse` reads an ISO date-time with no `Z` and no offset as **local** time. The
    // server's `updatedAt` is one `DateTime` serialisation away from arriving in that form (a
    // `Kind.Unspecified` value serialises with no suffix), and if it did, an untouched parse
    // would put the threshold hours from where the server put it -- a different number of
    // hours on every phone. The order would then be a fact about the viewer's timezone, which
    // is what SC-007 and FR-029's "every device identically" forbid.
    //
    // Both directions are asserted, because an eastern offset and a western one move the
    // threshold opposite ways: east of UTC an untouched parse makes it too early and a good
    // time unusable (`inside`), west of UTC too late and an impossible time usable (`past`).
    //
    // ⚠ The limit of this test: on a device already running in UTC a local reading and a UTC
    // reading are the same reading, so nothing here can tell them apart and it passes either
    // way. It has teeth on any other zone -- it was mutation-checked on America/Chicago.
    // `process.env.TZ` is no help: assigning it inside jest does not change how dates parse
    // (measured on this suite), so looping over zones would only look like coverage.
    const zonelessSave = '2026-11-01T15:10:00.000';   // 15:20:00.000Z once the tolerance is on

    // 15:19Z is a minute inside the tolerance and must order by its time; 18:00Z is hours
    // past it and must not.
    const inside = entryOf(
      text('2026-11-01T15:19:00.000Z'),
      text('2026-11-01T18:00:00.000Z'),
      text('2026-11-01T14:40:00.000Z'),
    );
    const past = entryOf(
      text('2026-11-01T18:00:00.000Z'),
      text('2026-11-01T14:40:00.000Z'),
    );

    expect(orderOf(toNumberedPieces(inside, zonelessSave))).toEqual([2, 0, 1]);
    expect(orderOf(toNumberedPieces(past, zonelessSave))).toEqual([0, 1]);
  });

  it('reads a server value with seven fractional digits', () => {
    // `System.Text.Json` writes a `DateTime` that has not round-tripped through Mongo with
    // 100-nanosecond precision. If this shape were rejected the threshold would be `null` and
    // the whole plausibility rule would quietly vanish -- with every other test still green,
    // because no other test would notice a missing threshold.
    const entry = entryOf(
      text(A_YEAR_AFTER),
      text('2026-11-01T14:40:00.000Z'),
    );

    expect(orderOf(toNumberedPieces(entry, '2026-11-01T15:10:00.1234567Z'))).toEqual([0, 1]);
  });

  it('reads a space-separated date and time as UTC, like any other zone-less value', () => {
    // The same SC-007 trap as the test above, on the shape that has no `T` in it. A guard that
    // asked "does it contain a `T`?" would send this one down the untouched path and read it in
    // local time -- `Date.parse('2026-11-01 15:10:00')` is 21:10Z on a machine at offset 360 --
    // so the guard asks "is it date-only?" instead. No producer emits this shape today; one
    // character class keeps it from being a device-local reading if one ever does.
    //
    // ⚠ Same limit as the test above: on a device running in UTC the two readings coincide and
    // nothing here can tell them apart. Mutation-checked on America/Chicago.
    const spacedSave = '2026-11-01 15:10:00';          // 15:20:00.000Z once the tolerance is on

    const inside = entryOf(
      text('2026-11-01T15:19:00.000Z'),
      text('2026-11-01T18:00:00.000Z'),
      text('2026-11-01T14:40:00.000Z'),
    );
    const past = entryOf(
      text('2026-11-01T18:00:00.000Z'),
      text('2026-11-01T14:40:00.000Z'),
    );

    expect(orderOf(toNumberedPieces(inside, spacedSave))).toEqual([2, 0, 1]);
    expect(orderOf(toNumberedPieces(past, spacedSave))).toEqual([0, 1]);
  });

  it('reads a date with no time of day as UTC midnight', () => {
    // An ISO value with no `T` is already UTC by the ES Date Time String Format, so it must be
    // parsed as it stands. Appending a `Z` builds `'2026-11-01Z'`, which is *outside* that
    // format: V8 happens to answer the same instant, Hermes need not, and a `NaN` there would
    // drop the threshold on the phone and on no CI run. So the production code appends only to
    // a value that has a time of day in it.
    //
    // Both assertions have teeth on any engine -- the second one fails if the value is read as
    // no value, because then nothing would be out of reach and the order would flip. What is
    // engine-dependent is only whether the *un*fixed code would also pass here.
    const entry = entryOf(
      text('2026-11-02T00:10:00.000Z'),            // past midnight + 10 min
      text('2026-11-01T14:40:00.000Z'),
    );

    expect(orderOf(toNumberedPieces(entry, '2026-11-02'))).toEqual([1, 0]);
    expect(orderOf(toNumberedPieces(entry, '2026-11-01'))).toEqual([0, 1]);
  });

  it('treats an unreadable time as no time, and an unreadable server value as none', () => {
    const entry = entryOf(text('not a time'), text('2026-11-01T14:40:00.000Z'));

    expect(orderOf(toNumberedPieces(entry, SAVED))).toEqual([0, 1]);
    // An unreadable server value means no threshold -- never a fall back to this phone's clock.
    expect(orderOf(toNumberedPieces(entryOf(text(A_YEAR_AFTER), text(SAVED)), 'nonsense')))
      .toEqual([1, 0]);
  });
});

describe('numbering', () => {
  const A = { lat: 51.5009, lng: -0.142 };
  const B = { lat: 51.5101, lng: -0.134 };
  const C = { lat: 51.52, lng: -0.1 };

  it('numbers only the pieces with a place, 1…k with no gaps, in capture order', () => {
    const entry = entryOf(
      text('2026-11-01T15:00:00.000Z', A),
      text('2026-11-01T14:40:00.000Z', B),
      text('2026-11-01T14:50:00.000Z', C),
    );

    const { pieces } = toNumberedPieces(entry, SAVED);

    expect(pieces.map((p) => [p.storedIndex, p.number])).toEqual([[1, 1], [2, 2], [0, 3]]);
  });

  it('gives a piece without a place no number, and leaves no gap behind it', () => {
    const entry = entryOf(
      text('2026-11-01T14:40:00.000Z', A),
      text('2026-11-01T14:45:00.000Z', null),
      text('2026-11-01T14:50:00.000Z', B),
    );

    const { pieces, withoutPlaceCount } = toNumberedPieces(entry, SAVED);

    expect(pieces.map((p) => p.number)).toEqual([1, undefined, 2]);
    expect(withoutPlaceCount).toBe(1);
  });

  it('yields no numbers at all for a memory with no places', () => {
    const entry = entryOf(text('2026-11-01T14:40:00.000Z'), photos([['2026-11-01T14:50:00.000Z']]));

    const result = toNumberedPieces(entry, SAVED);

    expect(result.pieces.every((p) => p.number === undefined)).toBe(true);
    expect(result.groups).toEqual([]);
    expect(result.distinctPlaceCount).toBe(0);
    expect(result.withoutPlaceCount).toBe(2);
  });

  it('counts the equator and the prime meridian as places', () => {
    // `lat: 0` and `lng: 0` are real coordinates. A falsy test drops a memory made on either
    // line and looks exactly like a memory with no place -- the bug `NumberedPin` was written
    // around (`EntryMarker` on release/1.0, `:182`).
    const entry = entryOf(text('2026-11-01T14:40:00.000Z', { lat: 0, lng: 0 }));

    const result = toNumberedPieces(entry, SAVED);

    expect(result.pieces[0].number).toBe(1);
    expect(result.withoutPlaceCount).toBe(0);
    expect(result.distinctPlaceCount).toBe(1);
  });

  it('treats a half-written coordinate as no place', () => {
    const entry = entryOf(
      text('2026-11-01T14:40:00.000Z', { lat: 51.5009, lng: null }),
      text('2026-11-01T14:50:00.000Z', A),
    );

    const { pieces, withoutPlaceCount } = toNumberedPieces(entry, SAVED);

    expect(pieces.map((p) => p.number)).toEqual([undefined, 1]);
    expect(withoutPlaceCount).toBe(1);
  });
});

describe('merging pins at practically the same spot', () => {
  const pieceAt = (minute, location) => text(`2026-11-01T14:${minute}:00.000Z`, location);

  it('puts the pieces whose coordinates round to the same key in one group', () => {
    // 51.500012 and 51.500014 both round to 51.50001, so they are one marker holding two
    // pieces (FR-023, round-4 I2).
    const entry = entryOf(
      pieceAt('40', { lat: 51.500012, lng: -0.142 }),
      pieceAt('50', { lat: 51.500014, lng: -0.142 }),
    );

    const { groups, distinctPlaceCount } = toNumberedPieces(entry, SAVED);

    expect(groups.map((g) => g.numbers)).toEqual([[1, 2]]);
    expect(distinctPlaceCount).toBe(1);
  });

  it('keeps pieces that round to different keys separate', () => {
    // 51.500014 rounds to 51.50001 and 51.500016 rounds to 51.50002, so these two stay apart
    // although they are far closer together than the pair above (round-4 I2). It is a
    // rounding grid, not a distance.
    const entry = entryOf(
      pieceAt('40', { lat: 51.500014, lng: -0.142 }),
      pieceAt('50', { lat: 51.500016, lng: -0.142 }),
    );

    const { groups, distinctPlaceCount } = toNumberedPieces(entry, SAVED);

    expect(groups.map((g) => g.numbers)).toEqual([[1], [2]]);
    expect(distinctPlaceCount).toBe(2);
  });

  it('groups on the longitude as well as the latitude', () => {
    const entry = entryOf(
      pieceAt('40', { lat: 51.5009, lng: -0.142 }),
      pieceAt('50', { lat: 51.5009, lng: -0.143 }),
    );

    expect(toNumberedPieces(entry, SAVED).distinctPlaceCount).toBe(2);
  });

  it('gives two places about 100 m apart two groups', () => {
    // 0.0009° of latitude is roughly 100 m.
    const entry = entryOf(
      pieceAt('40', { lat: 51.5009, lng: -0.142 }),
      pieceAt('50', { lat: 51.5018, lng: -0.142 }),
    );

    const { groups, distinctPlaceCount } = toNumberedPieces(entry, SAVED);

    expect(groups).toHaveLength(2);
    expect(distinctPlaceCount).toBe(2);
  });

  it('returns the groups in number order, each carrying its own numbers', () => {
    // The route line is drawn through `groups` in array order (FR-024), so this is the order a
    // viewer sees. The fixture is built so that **three** wrong answers each give a different
    // result from the right one, which is `[[1, 2], [3]]`:
    //
    // - numbering the pieces in stored order gives [[1, 3], [2]] -- the far piece is stored
    //   between the two near ones, so it would take the middle number and the near pair would
    //   no longer be consecutive;
    // - returning the groups in key order gives [[3], [1, 2]] -- `far`'s key is '51.4,-0.1',
    //   which sorts before the near pair's '51.50001,-0.142'. An earlier version of this
    //   fixture put `far` at 51.52, whose key sorts *after* the pair, so key order and number
    //   order coincided and the test could not tell them apart;
    // - pushing the numbers in stored order inside a group gives [[2, 1], [3]], because the
    //   near pair is stored in the reverse of its capture order.
    const far = { lat: 51.4, lng: -0.1 };
    const entry = entryOf(
      pieceAt('45', { lat: 51.500014, lng: -0.142 }),   // captured second  -> 2
      pieceAt('55', far),                               // captured last    -> 3
      pieceAt('40', { lat: 51.500012, lng: -0.142 }),   // captured first   -> 1
    );

    const { groups } = toNumberedPieces(entry, SAVED);

    expect(groups.map((g) => g.numbers)).toEqual([[1, 2], [3]]);
    // Each group's coordinate is its first-numbered piece's, which here is the one stored last.
    expect(groups.map((g) => [g.lat, g.lng])).toEqual([[51.500012, -0.142], [51.4, -0.1]]);
  });

  it('takes a merged group\'s kind from its first-numbered piece', () => {
    // A marker holding a note and a photo is coloured by one of them, and `NumberedPin` does not
    // derive which (its `kind` is the caller's choice). The rule is the first-numbered piece's
    // kind -- deterministic, so SC-007 holds either way, and T047 is where what a mixed marker
    // should look like is decided. The photo is stored first and the note captured first, so
    // neither "the stored-first piece" nor "whichever is media" would give this answer.
    const spot = { lat: 51.5101, lng: -0.134 };
    const entry = entryOf(
      photos([['2026-11-01T14:50:00.000Z', spot]]),
      text('2026-11-01T14:40:00.000Z', spot),
    );

    const { groups } = toNumberedPieces(entry, SAVED);

    expect(groups).toHaveLength(1);
    expect(groups[0].numbers).toEqual([1, 2]);
    expect(groups[0].kind).toBe('text');
  });

  it('puts two pieces either side of the prime meridian in one group', () => {
    // A coordinate that rounds to zero keeps its sign through `toFixed`: '-0.00000' and
    // '0.00000' are different strings for two places 20 cm apart. That would split a ~2 m strip
    // through Greenwich -- and the equator -- into two markers on a string artifact rather than
    // on the grid boundary the documents accept (FR-023, round-4 I2).
    const entry = entryOf(
      pieceAt('40', { lat: 51.5009, lng: -0.000001 }),
      pieceAt('50', { lat: 51.5009, lng: 0.000001 }),
    );

    const { groups, distinctPlaceCount } = toNumberedPieces(entry, SAVED);

    expect(groups.map((g) => g.numbers)).toEqual([[1, 2]]);
    expect(distinctPlaceCount).toBe(1);
  });

  it('hands the map the raw coordinate of the group, never the rounded key', () => {
    // FR-026: the server has already coarsened this location for this viewer. The rounding is
    // a grouping key and nothing else; rounding what the map is given would show a place more
    // precisely or less precisely than the viewer is allowed.
    const raw = { lat: 51.500012345, lng: -0.142067891 };
    const entry = entryOf(pieceAt('40', raw), pieceAt('50', { lat: 51.500014, lng: -0.142067 }));

    const { groups, pieces } = toNumberedPieces(entry, SAVED);

    expect(groups).toHaveLength(1);
    expect(groups[0].lat).toBe(51.500012345);
    expect(groups[0].lng).toBe(-0.142067891);
    expect(pieces[0].location).toEqual(raw);
  });

  it('groups the pieces of a photo burst at one spot into one marker with a count', () => {
    // The burst edge case: several photos a moment apart at one place share a marker, and
    // tapping it highlights all of them (FR-025).
    const spot = { lat: 51.5101, lng: -0.134 };
    const entry = entryOf(photos([
      ['2026-11-01T14:57:02.004Z', spot],
      ['2026-11-01T14:57:02.511Z', spot],
      ['2026-11-01T14:57:03.102Z', spot],
    ]));

    const { groups, distinctPlaceCount, withoutPlaceCount } = toNumberedPieces(entry, SAVED);

    expect(groups).toEqual([{
      // The key is the two rounded coordinates as numbers, so a value that rounds to zero
      // carries no sign into it (see `placeKey`) and trailing zeros are not padded back on.
      key: '51.5101,-0.134',
      lat: 51.5101,
      lng: -0.134,
      kind: 'photo',
      numbers: [1, 2, 3],
    }]);
    expect(distinctPlaceCount).toBe(1);
    expect(withoutPlaceCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Round-1 items 4 and 8 — two block shapes that are stored but never rendered as pieces
// ---------------------------------------------------------------------------

/**
 * Two shapes this rule has to survive rather than interpret.
 *
 * **A `media` that is not an array (item 4).** No producer in this repository emits one --
 * every `media:` assignment outside tests is an array literal or a `.map` result, and
 * `SocialService.adaptBlock` would itself throw on one, so the server route cannot deliver it.
 * But `DatabaseService._normalizeContentBlocks` (`:406`) passes a non-array `media` **through
 * untouched**, `ConflictResolver` (`:268`) merges server blocks into `content_blocks` with no
 * media normalisation, and three live components still *tolerate* a single object
 * (`EntryGalleryModal.js:174`, `.web.js:138`, `JournalEntryCard.js`'s audio case) -- so a
 * historical SQLite row of that shape cannot be ruled out by reading code. There is no error
 * boundary anywhere in `src`, and since 013 T050 this function runs for every memory a Journal
 * card renders, so a throw here takes the Journal down for **every** memory including every
 * pre-013 one. That is SC-008 with the widest blast radius available, and the fix is to read
 * such a block as carrying no media.
 *
 * **A `location` block (item 8).** `ContentBlock.location` (`JournalService.js:117-127`) stores
 * the entry's own place as a block with top-level `lat`/`lng`, and `JournalEntryCard`'s
 * `renderContentBlock` has no case for it, so the card renders nothing for it. Left in
 * `pieces` it is a piece with no place, and the map then says "1 piece without a place" about
 * something invisible (FR-026). Worse, the shape `EntryGalleryModal.js:175` and
 * `JournalEntryDetail.js:239` expect -- `{ type: 'location', location: {…} }` -- would be read
 * as a piece **with** a place and numbered, which would put a pin on the map pointing at a
 * piece the card does not draw at all. Neither is a piece of the memory: it is the entry's
 * single place, duplicated as a block, and `entry.location` is where that is read from.
 *
 * **And that block has a third, typeless shape (round-2 finding A).** Before
 * `ContentBlockType.LOCATION` existed, `ContentBlock.location` referenced a missing constant and
 * emitted `type: undefined` (`schema.js:308-312`, `JournalService.js:122`). `JSON.stringify` drops
 * an undefined key, so the stored row has no `type` property at all and a check on the type alone
 * cannot see it. It is recognised by what only that builder puts at the top level of a block --
 * `lat` and `lng` -- because "typeless" on its own is too wide: `ContentBlock.image` had the same
 * defect (`JournalService.js:44-47`), so a typeless block holding real photos is in history too.
 */
describe('block shapes that are stored but are not pieces', () => {
  it('reads a block whose media is a single object as carrying no media, rather than throwing', () => {
    const entry = entryOf(
      text(SAVED, HERE),
      { type: 'audio', location: HERE, media: { id: 'a1', capturedAt: SAVED, location: HERE } },
    );

    const result = toNumberedPieces(entry, SAVED);

    expect(result.pieces.map((p) => p.kind)).toEqual(['text']);
    expect(result.pieces[0].number).toBe(1);
    expect(result.withoutPlaceCount).toBe(0);
  });

  it('reads a null or missing media the same way, and numbers everything around it', () => {
    const entry = entryOf(
      { type: 'photos', location: HERE, media: null },
      text(SAVED, HERE),
      { type: 'video', location: HERE },
    );

    const result = toNumberedPieces(entry, SAVED);

    expect(result.pieces.map((p) => p.kind)).toEqual(['text']);
    expect(result.pieces[0].number).toBe(1);
  });

  it('leaves a location block out of the pieces, so nothing counts it as placeless', () => {
    // The shape `ContentBlock.location` really stores: top-level `lat`/`lng`, no `location`.
    const entry = entryOf(
      text(SAVED, HERE),
      { id: 'b2', type: 'location', lat: HERE.lat, lng: HERE.lng, name: 'Gare du Nord', order: 1 },
    );

    const result = toNumberedPieces(entry, SAVED);

    expect(result.pieces.map((p) => p.kind)).toEqual(['text']);
    expect(result.withoutPlaceCount).toBe(0);
    expect(result.distinctPlaceCount).toBe(1);
  });

  it('leaves it out even when it carries a place, so no pin points at nothing', () => {
    // The shape `EntryGalleryModal` and `JournalEntryDetail` read. Numbered, it would be pin 1
    // or 2 on the map with no piece in the card to find (FR-023, FR-025).
    const entry = entryOf(
      { id: 'b1', type: 'location', location: HERE },
      text(SAVED, HERE),
    );

    const result = toNumberedPieces(entry, SAVED);

    expect(result.pieces.map((p) => p.kind)).toEqual(['text']);
    expect(result.pieces[0].number).toBe(1);
    expect(result.distinctPlaceCount).toBe(1);
    expect(result.groups[0].numbers).toEqual([1]);
  });

  it('leaves out the legacy location block that was stored with no type at all', () => {
    // Before `ContentBlockType.LOCATION` existed, `ContentBlock.location` referenced a missing
    // constant and emitted `type: undefined` -- `schema.js:308-312` and `JournalService.js:122`
    // both say so. `JSON.stringify` drops an undefined key, so the row that reached SQLite and
    // the server has **no** `type` property, and `JSON.parse` gives it back that way. Built
    // through that round trip here rather than hand-written, so the shape is the stored one and
    // not an assumption about it.
    const stored = JSON.parse(JSON.stringify({
      id: 'b2',
      type: undefined,
      lat: HERE.lat,
      lng: HERE.lng,
      name: 'Gare du Nord',
      address: null,
      order: 1,
    }));
    expect('type' in stored).toBe(false);

    const entry = entryOf(text(SAVED, HERE), stored);

    const result = toNumberedPieces(entry, SAVED);

    // Length, not just the kinds: `toEqual` reads a trailing `undefined` in an array as absent,
    // so a kind-only assertion would not see the extra piece at all.
    expect(result.pieces).toHaveLength(1);
    expect(result.pieces[0].kind).toBe('text');
    // Counted, it would make the map say "1 piece without a place" about a block the card draws
    // nothing for (FR-026) -- the same defect as the typed shape above, on a historical row.
    expect(result.withoutPlaceCount).toBe(0);
    expect(result.distinctPlaceCount).toBe(1);
  });

  it('recognises the typeless shape on the equator and the prime meridian too', () => {
    // The pair of coordinates is tested with `!= null` and not for truthiness, for the reason
    // `hasPlace` gives: `lat: 0` is the equator and `lng: 0` is the prime meridian. A falsy test
    // would read a memory stored on either line as not this shape and count it as a piece.
    const stored = JSON.parse(JSON.stringify({ id: 0, type: undefined, lat: 0, lng: 0, order: 1 }));

    const entry = entryOf(text(SAVED, HERE), stored);

    const result = toNumberedPieces(entry, SAVED);

    expect(result.pieces).toHaveLength(1);
    expect(result.withoutPlaceCount).toBe(0);
  });

  it('still numbers a typeless block that carries no coordinate of its own', () => {
    // Why the rule above is "typeless **and** has top-level lat/lng" and not just "typeless".
    // `ContentBlock.image` carried the identical defect -- it referenced `ContentBlockType.IMAGE`,
    // which never existed (`JournalService.js:44-47`) -- so a typeless block holding real photos
    // is in history too, and so is any typeless block some other writer stored. Those are pieces
    // somebody captured, and dropping them would lose part of a memory.
    const entry = entryOf(JSON.parse(JSON.stringify({
      id: 'b1',
      type: undefined,
      capturedAt: SAVED,
      location: HERE,
      media: [{ localId: 'm0', localPath: 'file:///tmp/a.jpg' }],
    })));

    const result = toNumberedPieces(entry, SAVED);

    expect(result.pieces).toHaveLength(1);
    expect(result.pieces[0].number).toBe(1);
    expect(result.distinctPlaceCount).toBe(1);
  });

  it('still numbers a block of a kind it does not know, which is not the same thing', () => {
    // Dropping `location` is about one named shape the card never renders as a piece. A kind
    // nobody has heard of is still a piece in a place, and dropping those would lose a memory.
    const entry = entryOf({ type: 'something-new', capturedAt: SAVED, location: HERE, media: [] });

    const result = toNumberedPieces(entry, SAVED);

    expect(result.pieces.map((p) => [p.kind, p.number])).toEqual([['something-new', 1]]);
  });
});
