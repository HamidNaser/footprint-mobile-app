/**
 * memoryPieces (013 T046) -- the order, the numbers and the groups under a saved memory.
 *
 * One pure function, `toNumberedPieces(entry, serverUpdatedAt)`. It is what the map under a
 * memory and the number badges in the card are both drawn from, so it is also what makes them
 * agree: a pin's number and its piece's badge are the same number because one function decided
 * both (FR-023). No clock, no I/O, no state -- see *Why nothing device-local may reach it* below.
 *
 * Three rules compose in it.
 *
 * **1. Ordering (FR-028, FR-029, `contracts/capture-time.md` *Client ordering rule*).**
 * The blocks are expanded into pieces in stored order; a photos block yields one piece per
 * photo, and a media block's time is its media item's. A piece's time is *usable* iff it is
 * present and not later than the server's `updatedAt` for the entry plus ten minutes. The sort
 * key is that usable time, or else the key of the piece stored before it -- minus infinity for
 * the first -- and the sort breaks ties on the stored index. So a memory with no times keeps
 * its stored order, and an untimed piece in a part-timed memory never travels away from the
 * piece it was captured beside.
 *
 * An unusable time is **kept on the piece exactly as recorded**. Plausibility is a read-time
 * ordering rule and it never alters a recorded fact (Principle III, contract C2); a phone with a
 * wrong clock still saves what its clock said, and a later reader with a corrected view of the
 * same memory may well find that same value usable.
 *
 * **2. Numbering (FR-023, the owner's round-2 answer).** Only the pieces with a place are
 * numbered, 1…k with no gaps, in the sorted order. A piece without a place carries no number,
 * and a memory without places carries none at all, so it looks exactly as it does today
 * (SC-008). The count of pieces without a place is reported, because the map says how many
 * there are (FR-026).
 *
 * **3. Merging (round-3 L2, round-4 I2).** One rule decides both which pins share a marker and
 * how many distinct places a memory has: the placed pieces whose latitude and longitude
 * **round** (`toFixed(5)`, about a metre) to the same single key are one group. It is a rounding
 * grid and not a distance, so -- like any grid -- two points a few ten-millionths of a degree
 * apart can fall either side of a boundary and stay separate. That is accepted: FR-023's "about
 * a metre" is judged by this grid.
 *
 * ## Why nothing device-local may reach it
 *
 * SC-007 is that two different phones order the same memory **identically**. That rules out
 * more than it first appears to:
 *
 * - **No clock.** With no server value the rule applies *no* threshold rather than falling back
 *   to `Date.now()`, which would make the order a fact about when this phone happened to look.
 *   Until a device has the server's record of the save, no moment is treated as impossible
 *   (FR-029).
 * - **No local timezone.** `Date.parse` reads an ISO date-time with no `Z` and no offset as
 *   *local* time, so one such value would move the threshold by a different number of hours on
 *   every phone. A zone-less value is read as UTC (`asInstant`).
 * - **No reliance on sort stability.** The stored index is an explicit tiebreaker, not something
 *   inherited from whichever sort the engine provides.
 * - **No locale.** Keys are compared as numbers, never as strings through a collator.
 *
 * ## Why a coordinate is only ever rounded into a key
 *
 * FR-026 is that no viewer is shown a place more precisely than they may see it. The server has
 * already coarsened every location for this particular viewer, so the only safe thing a phone
 * can do with a coordinate is pass it through: a group hands the map the raw coordinate of its
 * first piece, and the rounded key is used for nothing but deciding which pieces share it.
 * Handing the map the key instead would show one viewer a place more precisely than they are
 * allowed and another less precisely than they are.
 */

/** The tolerance for a clock difference between the capturing device and the server. */
const CLOCK_TOLERANCE_MS = 10 * 60 * 1000;

/** The decimal places the merging grid rounds a coordinate to -- about a metre. */
const PLACE_KEY_DECIMALS = 5;

/**
 * A block type that carries media, and the kind of piece each of its media items is.
 *
 * `photos` is the only one that yields more than one piece. A block whose type is not here
 * carries no media and so carries its own capture time (contract C3's other half) -- `text`
 * today, and anything added later, which is numbered like any other piece rather than silently
 * dropped from the card's numbering.
 *
 * A `Map` rather than an object literal, because a plain `MEDIA_BLOCK_KINDS[block.type]` is a
 * prototype-chain lookup: a block whose type is `'constructor'` or `'toString'` would resolve to
 * a truthy *function*, be read as a media block, and travel on as the piece's `kind` and into
 * the group handed to the map. `journalBlocks.js` closes the same hole in `builderFor`.
 */
const MEDIA_BLOCK_KINDS = new Map([
  ['photos', 'photo'],
  ['video', 'video'],
  ['audio', 'audio'],
]);

/**
 * A block type that is stored on a memory but is not a piece of it (round-1 item 8).
 *
 * `ContentBlock.location` (`JournalService.js:117-127`) writes the entry's **own** place out as
 * a block, and `JournalEntryCard.renderContentBlock` has no case for it, so the card draws
 * nothing for it. It is not a captured piece: it is `entry.location` duplicated, and
 * `entry.location` is where that is read from.
 *
 * Left in, it goes wrong in both of the shapes that exist, and in opposite directions. The
 * shape the phone really writes has top-level `lat`/`lng` and no `location`, so it becomes a
 * piece **without** a place and the map says "1 piece without a place" about something
 * invisible (FR-026). The shape `EntryGalleryModal.js:175` and `JournalEntryDetail.js:239`
 * read -- `{ type: 'location', location: {…} }` -- becomes a piece **with** a place and is
 * numbered, which puts a pin on the map pointing at a piece the card never draws: a tap that
 * finds nothing (FR-023, FR-025).
 *
 * There is a **third** shape, stored before this type constant existed and carrying no `type`
 * at all, which a check on the type alone cannot see -- `isTypelessLocationBlock` below.
 *
 * Deliberately one named type and not "anything the card does not render": a block of a kind
 * this app has never heard of is still a piece somebody captured, and dropping those would
 * lose part of a memory. `expand` keeps numbering those.
 */
const NON_PIECE_BLOCK_TYPES = new Set(['location']);

/**
 * The same block, as it was stored before `ContentBlockType.LOCATION` existed (round-2 A).
 *
 * `ContentBlock.location` referenced a constant that did not exist and so emitted
 * `type: undefined` -- `schema.js:308-312` and `JournalService.js:122` each record the fix.
 * `JSON.stringify` drops an undefined key, so the row that reached SQLite and the server has
 * **no** `type` property at all, and `NON_PIECE_BLOCK_TYPES.has(block.type)` cannot see it:
 * `has(undefined)` is false, the block fell through to the non-media branch, and the map said
 * "1 piece without a place" about a block the card draws nothing for (FR-026).
 *
 * Recognised by the absent type **and** the top-level `lat`/`lng` together, not by the absent
 * type alone. `ContentBlock.location` is the only block builder in this repository that puts a
 * coordinate at the top level of a block -- every other place sits under `location` -- so the
 * pair identifies that one shape and nothing else. "Typeless" on its own would be too wide:
 * `ContentBlock.image` carried the identical defect (`JournalService.js:44-47`), so a typeless
 * block holding real photos is in history too, and dropping those would lose part of a memory,
 * which is exactly what `NON_PIECE_BLOCK_TYPES` is kept to one named type to avoid.
 *
 * `!= null` and not a falsy test, for the reason `hasPlace` gives below: `lat: 0` is the equator
 * and `lng: 0` is the prime meridian, and a memory stored on either line is still this shape.
 */
function isTypelessLocationBlock(block) {
  return !block.type && block.lat != null && block.lng != null;
}

/**
 * An ISO-8601 instant as a number of milliseconds, read the same way on every device.
 *
 * A value with a `Z` or an offset is unambiguous. A date-*time* without either is read as UTC
 * rather than as local time, which is what `Date.parse` would do: the server stores and sends
 * UTC, and a local reading would put a value hours from where the server put it, by a different
 * number of hours in every timezone. Anything unreadable is `null`, never a guess.
 *
 * **A date-only value** is the one exception, and it is left exactly as it is: that form is
 * already UTC by the ES Date Time String Format, and appending a `Z` would build
 * `'2026-11-01Z'`, which is outside that format -- V8 happens to answer the same instant, but
 * parsing outside the format is implementation-defined, so another engine may answer `NaN`,
 * which would drop the threshold on a phone and on no CI run.
 *
 * The exception is written as "is it date-only?" and **not** as "has it no `T`?". The second
 * question looks equivalent and is not: it sends `'2026-11-01 15:10:00'` down the untouched
 * path, where it is read in local time -- a device-local reading reaching the ordering
 * threshold, which is the one thing this file may not do (SC-007). Nothing emits that shape
 * today; the narrower question costs one character class.
 *
 * @param {string|null|undefined} iso
 * @returns {number|null} milliseconds since the epoch, or null
 */
function asInstant(iso) {
  if (typeof iso !== 'string' || iso.trim() === '') return null;

  const trimmed = iso.trim();
  // A zone is a trailing `Z`, or a `+hh:mm` / `-hh:mm` offset after the time. The test is
  // anchored at the end so a date's own hyphens are not mistaken for an offset's sign.
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
  const needsUtc = !hasZone && !isDateOnly;
  const parsed = Date.parse(needsUtc ? `${trimmed}Z` : trimmed);

  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Expand one entry's content blocks into pieces, in stored order.
 *
 * Each piece carries where it came from -- `blockIndex`, and `mediaIndex` for a photo tile --
 * because the card badges the piece itself and has to find it again in the block list
 * (FR-023). `storedIndex` is its position in this expansion, which is both the ordering rule's
 * tiebreaker and the stored order a memory with no times keeps.
 *
 * **A media item with no place of its own takes its block's.** On `origin/release/1.0`,
 * `journalBlocks.js:66` and `:83` put `location: blockLocation` on a photos block and on a video
 * block, so a block-level place is a shape that genuinely occurs in memories saved before this
 * feature. On the phone's **own** write path it cannot occur alone: the default resolver is
 * `mediaLocation = (m) => m?.location || blockLocation` (`:33`) and its only caller passes
 * `(m) => m.location || LocationService.extractLocationFromExif(m.exif) || blockLocation`
 * (`JournalComposeModal.js:336-337`), so a phone-written item is null only when its block is too.
 * This fallback is therefore **defensive cover for the write paths this repo does not own** --
 * the web client, the API, an importer -- rather than something load-bearing for phone-written
 * memories. What it buys where it does apply is SC-008: every such memory "still opens and
 * displays exactly as before, plus the map when it has places", and without it a memory whose
 * place sits on the block alone would show **no map at all**. Inheriting gives one pin per piece
 * at the block's spot, which FR-023 merges into a single marker with its count. The server has
 * already coarsened both values for this viewer, so nothing is revealed that the block did not
 * already reveal (FR-026).
 */
function expand(entry) {
  const pieces = [];

  (entry?.contentBlocks || []).forEach((block, blockIndex) => {
    if (!block) return;
    if (NON_PIECE_BLOCK_TYPES.has(block.type) || isTypelessLocationBlock(block)) return;

    const mediaKind = MEDIA_BLOCK_KINDS.get(block.type);

    if (mediaKind) {
      // `Array.isArray`, not `|| []` (round-1 item 4). A `media` that is a single object rather
      // than an array has no `forEach`, so this line would **throw** -- and since T050 put the
      // map in `JournalEntryCard` it runs for every memory the Journal renders, with no error
      // boundary anywhere in `src`, so one such row would take the whole Journal down for
      // every memory including every pre-013 one (SC-008).
      //
      // No producer in this repository emits that shape -- every `media:` assignment outside
      // tests is an array literal or a `.map` result, and `SocialService.adaptBlock` would
      // itself throw on one, so the server route cannot deliver it. But
      // `DatabaseService._normalizeContentBlocks` (`:406`) passes a non-array `media` through
      // untouched, `ConflictResolver` (`:268`) merges server blocks into `content_blocks` with
      // no media normalisation, and three live components still *tolerate* a single object
      // (`EntryGalleryModal.js:174`, `.web.js:138`, `JournalEntryCard`'s audio case) -- so a
      // historical SQLite row of that shape cannot be ruled out by reading code.
      //
      // Read as carrying **no media** rather than as one item: a `photos` or `video` block of
      // that shape draws no tile at all (`PhotoBlock` reads `photos.length`), so numbering it
      // would put a pin on the map with nothing in the card to find.
      (Array.isArray(block.media) ? block.media : []).forEach((item, mediaIndex) => {
        if (!item) return;
        pieces.push({
          kind: mediaKind,
          // Contract C3: a block with media has no time of its own, and a block-level value on
          // such a block is deliberately not consulted even as a fallback -- it is not a
          // recorded fact about this item.
          capturedAt: item.capturedAt ?? null,
          location: item.location ?? block.location ?? null,
          blockIndex,
          mediaIndex,
          storedIndex: pieces.length,
        });
      });
      return;
    }

    pieces.push({
      kind: block.type,
      capturedAt: block.capturedAt ?? null,
      location: block.location ?? null,
      blockIndex,
      mediaIndex: null,
      storedIndex: pieces.length,
    });
  });

  return pieces;
}

/**
 * Does this location name a place?
 *
 * `lat: 0` is the equator and `lng: 0` is the prime meridian, and both are real places, so this
 * is a `== null` test and not a falsy one. `EntryMarker` on `release/1.0` (`:182`) takes the
 * falsy route and drops a memory made on either line, which looks exactly like a memory with no
 * place at all. A coordinate that is not a finite number is no place either -- it could not be
 * drawn, and numbering it would put a badge in the card with no pin to tap.
 */
function hasPlace(location) {
  return Number.isFinite(location?.lat) && Number.isFinite(location?.lng);
}

/**
 * The single 5-decimal key both the merging and the distinct-place count are decided by.
 *
 * The unary `+` is not decoration: `(-0.000001).toFixed(5)` is `'-0.00000'` and
 * `(0.000001).toFixed(5)` is `'0.00000'`, so without it two pieces 20 cm apart either side of
 * the prime meridian -- or the equator -- would be two markers, split by a string artifact
 * rather than by the grid boundary the documents accept. Numbering them back through `+` folds
 * `-0` onto `0`; every other value is unchanged, because the string came from `toFixed` in the
 * first place.
 */
function placeKey(location) {
  const lat = +location.lat.toFixed(PLACE_KEY_DECIMALS);
  const lng = +location.lng.toFixed(PLACE_KEY_DECIMALS);

  return `${lat},${lng}`;
}

/**
 * The ordering, numbering and merging rule for the pieces of one saved memory.
 *
 * @param {object} entry The saved memory, as the card has it: `{ contentBlocks }`, each block
 *   with its `type`, its own `location`/`capturedAt`, and `media` items with theirs.
 * @param {string|null} [serverUpdatedAt] The server's own record of the memory's last save, as
 *   an ISO-8601 instant. Absent or null means the device does not have it yet, and then **no**
 *   threshold is applied -- never this device's clock (FR-029). Passed in rather than read off
 *   the entry so that both routes, `entry.serverUpdatedAt` from `SocialService.adaptEntry` and
 *   the `server_updated_at` column from `DatabaseService`, feed one rule one value.
 * @returns {{
 *   pieces: Array<{kind: string, capturedAt: string|null, location: object|null,
 *                  blockIndex: number, mediaIndex: number|null, storedIndex: number,
 *                  number?: number}>,
 *   groups: Array<{key: string, lat: number, lng: number, kind: string, numbers: number[]}>,
 *   distinctPlaceCount: number,
 *   withoutPlaceCount: number,
 * }} `pieces` in the order the rule puts them, each with its stored position and, when it has a
 *   place, its `number`; `groups` in number order, one per distinct place, each with the raw
 *   coordinate of its first piece and every number it holds; `distinctPlaceCount`, which is
 *   `groups.length`; and `withoutPlaceCount` for the line the map shows when some pieces have no
 *   place (FR-026).
 */
export function toNumberedPieces(entry, serverUpdatedAt) {
  const pieces = expand(entry);

  // The threshold, or null for no threshold at all. An unreadable server value is no value:
  // it leaves every present time usable, which is the same fall-back-to-nothing the contract
  // prescribes for a device that has not received the save yet.
  const savedAt = asInstant(serverUpdatedAt);
  const latestUsable = savedAt === null ? null : savedAt + CLOCK_TOLERANCE_MS;

  // The sort key of each piece, by stored position. A usable time, or else the key of the piece
  // stored before it; the first piece has no predecessor, and minus infinity is what puts an
  // untimed first piece before every timed one rather than after them.
  let previousKey = -Infinity;
  const keys = pieces.map((piece) => {
    const captured = asInstant(piece.capturedAt);
    const usable = captured !== null && (latestUsable === null || captured <= latestUsable);
    previousKey = usable ? captured : previousKey;
    return previousKey;
  });

  const ordered = pieces.slice().sort((a, b) => {
    const keyA = keys[a.storedIndex];
    const keyB = keys[b.storedIndex];
    // Compared, not subtracted: two first pieces both on minus infinity would subtract to NaN,
    // and a NaN comparator leaves the order to the engine. The stored index is the explicit
    // tiebreaker rather than a reliance on the sort being stable (SC-007).
    if (keyA < keyB) return -1;
    if (keyA > keyB) return 1;
    return a.storedIndex - b.storedIndex;
  });

  const numbered = [];
  const groups = [];
  const groupByKey = new Map();
  let number = 0;
  let withoutPlaceCount = 0;

  // A `forEach` building both lists, rather than a `map` whose callback also fills `groups` and
  // advances two counters -- the numbering and the grouping are one walk over the sorted pieces,
  // and this says so. Every piece is copied on the way out, placed or not, so a caller never
  // holds one of this walk's own objects.
  ordered.forEach((piece) => {
    if (!hasPlace(piece.location)) {
      withoutPlaceCount += 1;
      numbered.push({ ...piece });
      return;
    }

    number += 1;
    const key = placeKey(piece.location);
    const existing = groupByKey.get(key);

    if (existing) {
      existing.numbers.push(number);
    } else {
      // The group's coordinate is its first piece's, exactly as the server sent it. The key is
      // for grouping and for nothing else (FR-026). `kind` is the first piece's too: the pin is
      // coloured by it, and a group of one is the overwhelmingly common case.
      const group = {
        key,
        lat: piece.location.lat,
        lng: piece.location.lng,
        kind: piece.kind,
        numbers: [number],
      };
      groupByKey.set(key, group);
      groups.push(group);
    }

    numbered.push({ ...piece, number });
  });

  return {
    pieces: numbered,
    groups,
    distinctPlaceCount: groups.length,
    withoutPlaceCount,
  };
}

export default toNumberedPieces;
