/**
 * Which copy of a photograph to load, and when.
 *
 * A media item can exist in three places at once, and the right one depends on what it is
 * for. A grid of thumbnails the size of a postage stamp should not download the full-size
 * original, which is what the journal did: measured against production, a grid image was
 * **76 KB** as the original and **7 KB** as the rendition the Hub now serves.
 *
 * Over a feed of forty entries that is the difference between a scroll that works on a
 * train and one that does not.
 */

/**
 * The source for a small image — a grid tile, a card, a strip.
 *
 * Order matters:
 *
 * 1. `localPath` — the device's own copy. Instant, free, and works with no signal. Always
 *    preferred, even though it is full-size, because loading it costs nothing.
 * 2. `thumbnailUri` — the small remote copy, which is what saves the bandwidth.
 * 3. `serverUrl` — the full-size original, only when nothing better exists.
 *
 * @param {object} media
 * @returns {string|null} null when the item has no loadable source at all, so callers can
 *   render a placeholder rather than an <Image> pointed at undefined.
 */
export function thumbnailSource(media) {
  if (!media) return null;
  return media.localPath || media.thumbnailUri || media.thumbnailUrl || media.serverUrl || null;
}

/**
 * The source for viewing a photograph properly — full screen, or a single hero image.
 *
 * Deliberately skips the thumbnail. Someone who has opened a photograph to look at it is
 * asking for the real thing, and a 320px rendition stretched across a phone screen is
 * visibly worse than waiting a moment for the original.
 */
export function fullSizeSource(media) {
  if (!media) return null;
  return media.localPath || media.serverUrl || media.url || null;
}

export default thumbnailSource;
