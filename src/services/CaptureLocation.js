import LocationService, { LocationAccuracy } from './LocationService';

/**
 * Where the device is, at the moment something is captured.
 *
 * `PLACES-LOCATION-ARCHITECTURE.md` § 3.7, Decision 10:
 *
 * > Capture the device position **at the moment of capture**: taking a photo, starting an
 * > audio recording, recording video, saving a text note. One permission ask, honoured
 * > silently afterwards, defaulting on with a setting to disable.
 *
 * It was decided and never built. Today a photograph gets an independent position from
 * EXIF and everything else — audio, video, text — inherits whatever the entry-level picker
 * was set to, which for most entries is nothing at all. So somebody who recorded their
 * grandmother in Paris and typed a note about it has, as far as the timeline is concerned,
 * been nowhere.
 *
 * The urgency is asymmetric, and it is the reason this is worth doing before the features
 * that consume it: **capture is irreversible, geocoding is not.** A stored coordinate can
 * be resolved into any scheme invented later. A coordinate never captured is gone with the
 * moment.
 *
 * Three rules this file exists to enforce:
 *
 * 1. **It never throws.** A memory must save whether or not the satellites cooperated.
 *    Losing a grandparent's voice because the GPS was cold would be an absurd trade.
 * 2. **It never blocks for long.** A compose session is a person waiting; a location fix
 *    is not worth a spinner.
 * 3. **It caches.** A burst of eight photographs is one place, not eight fixes, and
 *    repeatedly waking the GPS is the fastest way to drain a battery.
 */

/**
 * How long a fix stays good enough to reuse. A compose session runs for minutes and a
 * person does not usually move far inside one, so this covers a whole session while still
 * expiring long before the next.
 */
const CACHE_TTL_MS = 2 * 60 * 1000;

/**
 * How long to wait for a fresh fix. Deliberately short: the fallbacks below are decent, and
 * a person tapping the shutter should not be kept waiting by a satellite.
 */
const FIX_TIMEOUT_MS = 4000;

let cached = null;
let cachedAt = 0;

/** Turned off by a user setting; when false nothing is captured and nothing is asked. */
let enabled = true;

/** The shape the backend stores, or null. Never a partial. */
function toCoordinate(location) {
  if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) {
    return null;
  }

  return {
    lat: location.latitude,
    lng: location.longitude,
    accuracy: Number.isFinite(location.accuracy) ? location.accuracy : null,
  };
}

/**
 * The device's position now, for stamping onto something being captured.
 *
 * @returns {Promise<{lat: number, lng: number, accuracy: number|null}|null>} null whenever
 *   a position cannot be had — no permission, no signal, disabled, timed out. Callers stamp
 *   what they get and carry on regardless.
 */
export async function stampLocation() {
  if (!enabled) {
    return null;
  }

  if (cached && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cached;
  }

  try {
    const fresh = await LocationService.getCurrentLocation({
      // Balanced rather than best: a memory needs to know which city, not which doorway,
      // and the privacy model coarsens it for viewers anyway.
      accuracy: LocationAccuracy.BALANCED,
      timeout: FIX_TIMEOUT_MS,
    });

    const coordinate = toCoordinate(fresh);
    if (coordinate) {
      cached = coordinate;
      cachedAt = Date.now();
      return coordinate;
    }
  } catch {
    // Expected often enough to be unremarkable: permission refused, indoors, aeroplane
    // mode, a cold start that outran the timeout.
  }

  try {
    // A stale fix beats no fix. Somewhere approximately right is far more useful to a
    // timeline than a memory that happened nowhere.
    const last = await LocationService.getLastKnownLocation();
    return toCoordinate(last);
  } catch {
    return null;
  }
}

/**
 * Stamp a capture with where it happened, preserving anything it already knew.
 *
 * A photograph's own EXIF coordinate is better than the device's current position — it is
 * where the shutter actually fell, which for an imported or older photograph may be years
 * and continents away from where the phone is standing now.
 *
 * @param {object} capture - the item being captured
 * @param {object} [existing] - a coordinate already known for it, e.g. from EXIF
 */
export async function withLocation(capture, existing = null) {
  if (existing?.lat != null && existing?.lng != null) {
    return { ...capture, location: existing };
  }

  const location = await stampLocation();
  return location ? { ...capture, location } : capture;
}

/** Honour the user's setting. Off means no capture and no permission prompt. */
export function setCaptureEnabled(value) {
  enabled = !!value;
  if (!enabled) {
    cached = null;
    cachedAt = 0;
  }
}

export function isCaptureEnabled() {
  return enabled;
}

/** Testing seam, and used when a session ends so the next one starts fresh. */
export function clearCachedLocation() {
  cached = null;
  cachedAt = 0;
}

export default { stampLocation, withLocation, setCaptureEnabled, isCaptureEnabled, clearCachedLocation };
