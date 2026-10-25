/**
 * Which copy of a media item to load, and when (007 research R10).
 *
 * A media item can exist in three places at once, and the right one depends on what it is
 * for:
 *
 * - small views (grid tile, card, strip) use the server-computed `thumbnailUrl`;
 * - full-size views use `displayUrl`;
 * - the original is for video playback and download only.
 *
 * `localPath`, the device's own copy, always comes first: instant, free, and works with no
 * signal. A remote source that does not exist yet yields null, so the caller renders a
 * placeholder (and watches mediaStatusPoller) rather than quietly loading the original.
 *
 * The SQLite cache holds server-sent addresses from before renditions were replaced,
 * pointing at the old `/api/v1/media/t/` route. Those are never used.
 */

const OLD_RENDITION_ROUTE = '/api/v1/media/t/';

/** The first candidate that is a string and not an address on the retired rendition route. */
function firstUsable(...candidates) {
  for (const c of candidates) {
    if (typeof c === 'string' && c && !c.includes(OLD_RENDITION_ROUTE)) return c;
  }
  return null;
}

/**
 * The source for a small image. localPath, then thumbnailUrl (or its SQLite mirror
 * `thumbnailUri`), else null -- never the display copy or the original.
 *
 * @param {object} media
 * @returns {string|null}
 */
export function thumbnailSource(media) {
  if (!media) return null;
  return firstUsable(media.localPath, media.thumbnailUrl, media.thumbnailUri);
}

/**
 * The source for viewing a photograph properly. localPath, then displayUrl (or its mirror
 * `displayUri`), else null -- never the original.
 */
export function fullSizeSource(media) {
  if (!media) return null;
  return firstUsable(media.localPath, media.displayUrl, media.displayUri);
}

/** The source for video playback: the device copy, else the original. */
export function videoSource(media) {
  if (!media) return null;
  return firstUsable(media.localPath, media.serverUrl, media.url);
}

export default thumbnailSource;
