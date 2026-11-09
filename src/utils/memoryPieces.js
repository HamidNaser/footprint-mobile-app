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
 */
const MEDIA_BLOCK_KINDS = {
  photos: 'photo',
  video: 'video',
  audio: 'audio',
};

/**
 * An ISO-8601 instant as a number of milliseconds, read the same way on every device.
 *
 * A value with a `Z` or an offset is unambiguous. One without either is read as UTC rather than
 * as local time, which is what `Date.parse` would do: the server stores and sends UTC, and a
 * local reading would put a value hours from where the server put it, by a different number of
 * hours in every timezone. Anything unreadable is `null`, never a guess.
 *
 * @param {string|null|undefined} iso
 * @returns {number|null} milliseconds since the epoch, or null
 */
function asInstant(iso) {
  if (typeof iso !== 'string' || iso.trim() === '') return null;

  const trimmed = iso.trim();
  // A zone is a trailing `Z`, or a `+hh:mm` / `-hh:mm` offset after the time. The search starts
  // past the date so a date's own hyphens are not mistaken for an offset's sign.
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
  const parsed = Date.parse(hasZone ? trimmed : `${trimmed}Z`);

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
 * A media item with no place of its own takes its block's. The server has already coarsened
 * both for this viewer, so this reveals nothing the block did not; and an older memory that
 * recorded one place for a whole block would otherwise be a memory with places that shows no
 * map at all (SC-008).
 */
function expand(entry) {
  const pieces = [];

  (entry?.contentBlocks || []).forEach((block, blockIndex) => {
    if (!block) return;

    const mediaKind = MEDIA_BLOCK_KINDS[block.type];

    if (mediaKind) {
      (block.media || []).forEach((item, mediaIndex) => {
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

/** The single 5-decimal key both the merging and the distinct-place count are decided by. */
function placeKey(location) {
  return `${location.lat.toFixed(PLACE_KEY_DECIMALS)},${location.lng.toFixed(PLACE_KEY_DECIMALS)}`;
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

  const groups = [];
  const groupByKey = new Map();
  let number = 0;
  let withoutPlaceCount = 0;

  const numbered = ordered.map((piece) => {
    if (!hasPlace(piece.location)) {
      withoutPlaceCount += 1;
      return piece;
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

    return { ...piece, number };
  });

  return {
    pieces: numbered,
    groups,
    distinctPlaceCount: groups.length,
    withoutPlaceCount,
  };
}

export default toNumberedPieces;
