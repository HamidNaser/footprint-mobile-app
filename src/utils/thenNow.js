/**
 * Then & Now — the two ends of a place's history.
 *
 * The feature shows the oldest and newest memory at a place side by side. Swansea in the
 * seeded data runs from 1940 to 2026, which is the shot it exists for.
 *
 * Ported from the web app unchanged so the two clients cannot disagree about which pair
 * counts as a then-and-now.
 *
 * On mobile the component existed -- `components/places/ThenNowComparison.js` -- and was
 * imported by nothing at all, so the feature had never once appeared on a screen.
 */

/**
 * @param {Array<{year: number}>} memories - memories at one place, any order
 * @returns {{then: object, now: object}|null} null when there is no meaningful pair
 */
export function pickThenNow(memories) {
  if (!Array.isArray(memories) || memories.length < 2) return null;

  const dated = memories.filter((m) => Number.isFinite(m?.year));
  if (dated.length < 2) return null;

  const sorted = [...dated].sort((a, b) => a.year - b.year);
  const then = sorted[0];
  const now = sorted[sorted.length - 1];

  // Two memories from the same year are not a "then and now" — the whole point is the
  // distance between them.
  return then.year === now.year ? null : { then, now };
}

export default pickThenNow;
