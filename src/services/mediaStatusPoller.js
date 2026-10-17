import { MediaApi } from '../api/MediaApi';

const fetchStatus = (ids) => MediaApi.status(ids);

/**
 * Media status poller (007, FR-026..FR-030).
 *
 * One coordinator per app session. Tiles whose display copy has not loaded `watch` their
 * media id; this asks the Hub about all of them in one `POST /api/v1/media/status` per tick
 * (chunked at 100) and tells each tile when its copy is ready, failed, or unavailable.
 *
 * Timing, from specs/007-media-derivatives/contracts/media-status.md and research R9:
 *  - Single flight: the next tick is scheduled only after the previous response settles.
 *  - Normal interval starts at 2 s, grows x1.5 per unchanged tick up to 15 s, and resets to
 *    2 s on any change.
 *  - Error backoff (network error, 5xx, or an id omitted under `partial: true`) is a separate
 *    2 s -> 30 s doubling. Nothing is surfaced to the user.
 *  - 401 halts polling (the shared request helper has already tried a token refresh) but keeps
 *    the watchers; the next watch() or resume() re-arms them all.
 *
 * App-state pause (AppState background) and off-screen gating belong to T080. They
 * plug in through `pause()` / `resume()`; nothing here reads AppState.
 */

export const MAX_IDS_PER_REQUEST = 100;
const START_INTERVAL_MS = 2000;
const GROWTH = 1.5;
const MAX_INTERVAL_MS = 15000;
const ERROR_START_MS = 2000;
const ERROR_GROWTH = 2;
const ERROR_MAX_MS = 30000;

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export function createMediaStatusPoller({ status = fetchStatus } = {}) {
  /**
   * id -> { gen, callbacks }. `gen` is fresh each time the id goes from unwatched to
   * watched, so a response requested for an earlier watch is never delivered to a later one.
   * @type {Map<string, {gen: number, callbacks: Set<Function>}>}
   */
  const watchers = new Map();
  let nextGen = 1;
  /** id -> last seen "status|updatedAt", to detect change between ticks */
  const lastSeen = new Map();
  let timer = null;
  let timerDeadline = 0;
  let halted = false; // a 401 stopped polling; watchers are retained
  let inFlight = false;
  let paused = false;
  let interval = START_INTERVAL_MS;
  let errorDelay = ERROR_START_MS;

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function schedule(delay) {
    clearTimer();
    if (inFlight || paused || halted || watchers.size === 0) return;
    timerDeadline = Date.now() + delay;
    timer = setTimeout(tick, delay);
  }

  function notify(id, payload) {
    const entry = watchers.get(id);
    watchers.delete(id);
    lastSeen.delete(id);
    if (!entry) return;
    for (const cb of entry.callbacks) {
      try {
        cb(payload);
      } catch {
        // One tile's handler must not stop the others being told.
      }
    }
  }

  async function tick() {
    timer = null;
    if (paused || watchers.size === 0) return;
    inFlight = true;

    const requested = [...watchers.keys()];
    const gens = new Map(requested.map((id) => [id, watchers.get(id).gen]));
    const chunks = chunk(requested, MAX_IDS_PER_REQUEST);
    const results = await Promise.allSettled(chunks.map((c) => status(c)));

    let changed = false;
    let errored = false;
    let retainedPartial = false;
    let unauthorized = false;

    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        if (result.reason?.status === 401) unauthorized = true;
        else errored = true; // network error or 5xx: stay quiet and back off
        return;
      }
      const body = result.value;
      // Fail closed: a body that does not say whether it is partial cannot tell us an id is
      // unavailable, so it is treated as an error rather than "everything omitted".
      if (!body || typeof body.partial !== 'boolean' || !Array.isArray(body.items)) {
        errored = true;
        return;
      }
      const byId = new Map(body.items.map((item) => [item.id, item]));
      for (const id of chunks[i]) {
        if (watchers.get(id)?.gen !== gens.get(id)) continue; // unwatched (or re-watched) while the request was out
        const item = byId.get(id);
        if (!item) {
          if (body.partial) {
            retainedPartial = true; // visibility undetermined: keep watching
          } else {
            notify(id, { id, status: 'unavailable' });
            changed = true;
          }
        } else if (item.status === 'ready' || item.status === 'failed') {
          notify(id, item);
          changed = true;
        } else {
          const key = `${item.status}|${item.updatedAt}`;
          const prev = lastSeen.get(id);
          if (prev !== undefined && prev !== key) changed = true;
          lastSeen.set(id, key);
        }
      }
    });

    inFlight = false;

    if (unauthorized) {
      errorDelay = ERROR_START_MS; // a fresh start when polling is re-armed
      halted = true; // no timer, no requests; watchers kept until watch() or resume()
      return;
    }

    let delay;
    if (errored || retainedPartial) {
      delay = errorDelay;
      errorDelay = Math.min(errorDelay * ERROR_GROWTH, ERROR_MAX_MS);
    } else {
      errorDelay = ERROR_START_MS;
      interval = changed ? START_INTERVAL_MS : Math.min(interval * GROWTH, MAX_INTERVAL_MS);
      delay = interval;
    }
    schedule(delay);
  }

  function watch(id, callback) {
    let entry = watchers.get(id);
    if (!entry) {
      entry = { gen: nextGen++, callbacks: new Set() };
      watchers.set(id, entry);
    }
    entry.callbacks.add(callback);
    const wasHalted = halted;
    halted = false; // a new watch re-arms everything a 401 halted
    // A new tile wants an answer soon: drop back to the fast interval, unless we are in
    // error backoff, which exists to stop us hammering a struggling server.
    if (!inFlight && (wasHalted || errorDelay === ERROR_START_MS)) {
      errorDelay = ERROR_START_MS;
      interval = START_INTERVAL_MS;
      // Keep the earliest deadline: re-arming on every watch would let a stream of
      // mounting tiles push the tick out indefinitely.
      const deadline = Date.now() + START_INTERVAL_MS;
      if (timer === null || deadline < timerDeadline) schedule(START_INTERVAL_MS);
    }
  }

  /** Remove one callback for the id, or every callback if none is given. */
  function unwatch(id, callback) {
    const entry = watchers.get(id);
    if (!entry) return;
    if (callback) entry.callbacks.delete(callback);
    else entry.callbacks.clear();
    if (entry.callbacks.size === 0) {
      watchers.delete(id);
      lastSeen.delete(id);
    }
    if (watchers.size === 0) clearTimer();
  }

  /** Stop entirely and forget everything watched. A later watch() starts afresh. */
  function stop() {
    clearTimer();
    halted = false;
    watchers.clear();
    lastSeen.clear();
    interval = START_INTERVAL_MS;
    errorDelay = ERROR_START_MS;
  }

  // Seams for T080 (app backgrounded / tile off-screen). A tick already in flight finishes.
  function pause() {
    paused = true;
    clearTimer();
  }

  function resume() {
    if (!paused && !halted) return;
    paused = false;
    halted = false;
    interval = START_INTERVAL_MS;
    schedule(START_INTERVAL_MS);
  }

  return { watch, unwatch, stop, pause, resume };
}

/** The one poller for the app session. */
export const mediaStatusPoller = createMediaStatusPoller();

export default mediaStatusPoller;
