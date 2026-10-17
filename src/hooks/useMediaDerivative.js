import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { mediaStatusPoller } from '../services/mediaStatusPoller';
import { MediaApi } from '../api/MediaApi';
import { useTileVisibility } from './mediaVisibility';
import { thumbnailSource, fullSizeSource } from '../utils/mediaSource';

/**
 * Drives one tile's image through the 007 display-copy lifecycle. Mobile port of the web
 * hook of the same name; the states and timings are the same (research R8, R10).
 *
 * Usage: `const { src, state, onError } = useMediaDerivative(media, { variant });`
 * `variant` is 'grid' (default, small tiles: `thumbnailSource`) or 'display' (single-photo and
 * full views: `fullSizeSource`). Render an <Image> from `src` only while `state` is 'idle' or
 * 'ready'; every other state has its own placeholder (see DerivativeImage).
 *
 * state:
 *  - 'idle'        showing the first source (the device copy, or a server copy not yet tried)
 *  - 'pending'     no source yet, or it failed to load; watching for the display copy
 *  - 'ready'       src is the ready copy (`{grid|display}Url?v={updatedAt}`)
 *  - 'failed'      the server reported that it could not prepare the photo (FR-022)
 *  - 'loadFailed'  the server said ready but the copy would not load, even after re-asking
 *                  (a CDN/network fault, not a server verdict; render as "Photo unavailable")
 *  - 'unavailable' the server says this media is not visible to us, does not exist, or the
 *                  reference is unresolved
 *
 * Local-first (R10): a tile rendering from `localPath` never engages the poller. A remote
 * source that does not exist yet is `null`, never the original: the tile is 'pending' and
 * the poller is asked about it straight away, because there is no image to error.
 *
 * Try again (FR-018, FR-022): `tryAgain()` asks the server to prepare a failed photo again;
 * `retrying` / `retryError` are for the owner's failed tile.
 *
 * Viewport (FR-027, SC-007): a tile that is off screen does not watch. `visible` comes from the
 * option, else from the nearest <TileVisibility> a list host provides, else true. Leaving the
 * screen unwatches; coming back watches again. The loadFailed cycle count survives both.
 * App-state pause lives in the poller.
 */

export const RETRY_DELAY_MS = 2000;
/** How many times a tile re-asks the server after a ready copy will not load. */
export const MAX_REWATCH_CYCLES = 2;

function withParam(url, name, value) {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}${name}=${encodeURIComponent(value)}`;
}

function sourceFor(media, variant) {
  return variant === 'display' ? fullSizeSource(media) : thumbnailSource(media);
}

function startPhase(media, base) {
  if (base) return 'idle';
  return media?.unresolved ? 'unavailable' : 'pending';
}

export function useMediaDerivative(media, { variant = 'grid', visible: visibleOption } = {}) {
  const hostVisible = useTileVisibility();
  const visible = visibleOption === undefined ? hostVisible : visibleOption !== false;
  const base = sourceFor(media, variant);
  // A photo that never left the device (uploadFailed / missingFile) has nothing to ask the
  // server about, so it is never watched.
  const neverUploaded = !!(media?.uploadFailed || media?.missingFile);
  const mediaId = neverUploaded ? null : media?.mediaId || media?.id || null;
  const isLocal = !!base && typeof media?.localPath === 'string' && base === media.localPath;

  const [view, setView] = useState(() => ({
    phase: startPhase(media, base),
    src: base,
    failureReason: null,
  }));

  const callbackRef = useRef(null); // the callback currently registered with the poller
  const readyRef = useRef(null); // { copyUrl, updatedAt } once ready
  const retriedRef = useRef(false);
  const rewatchesRef = useRef(0);
  const timerRef = useRef(null);
  const phaseRef = useRef(view.phase);
  const propsRef = useRef({ mediaId, base, variant, isLocal, unresolved: !!media?.unresolved, media });
  const localFailedRef = useRef(false); // the device file would not load: use the server copy
  // The id actually handed to the poller, so teardown unwatches that one even after props move on.
  const watchedIdRef = useRef(null);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const wantWatchRef = useRef(false); // the tile is waiting on the server but is off screen
  useLayoutEffect(() => {
    propsRef.current = { mediaId, base, variant, isLocal, unresolved: !!media?.unresolved, media };
  });

  const commit = useCallback((next) => {
    phaseRef.current = next.phase;
    setView(next);
  }, []);

  const teardown = useCallback(() => {
    if (callbackRef.current) {
      mediaStatusPoller.unwatch(watchedIdRef.current, callbackRef.current);
      callbackRef.current = null;
    }
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Created once; everything is read through refs. `teardown` unregisters the current
  // callback, and `onStatus` ignores anything that is not the current watch's callback.
  const apiRef = useRef(null);
  if (apiRef.current === null) {
    const startWatch = () => {
      const { mediaId: id, base: orig } = propsRef.current;
      // A fresh callback per watch: a late answer to an earlier watch carries the old one
      // and is ignored (generation-safe).
      const cb = (update) => onStatus(update, cb);
      callbackRef.current = cb;
      commit({ phase: 'pending', src: orig, failureReason: null });
      if (!visibleRef.current) {
        // Off screen: remember that an answer is wanted and ask when the tile is seen.
        callbackRef.current = null;
        wantWatchRef.current = true;
        return;
      }
      wantWatchRef.current = false;
      watchedIdRef.current = id;
      mediaStatusPoller.watch(id, cb);
    };

    // The server said ready (or we thought it did) but the copy cannot be shown. That is a
    // delivery problem, not a conversion failure, so it never becomes 'failed'.
    const loadFailure = () => {
      readyRef.current = null;
      retriedRef.current = false;
      if (rewatchesRef.current < MAX_REWATCH_CYCLES) {
        rewatchesRef.current += 1;
        startWatch();
      } else {
        commit({ phase: 'loadFailed', src: propsRef.current.base, failureReason: null });
      }
    };

    function onStatus(update, cb) {
      if (callbackRef.current !== cb) return; // torn down, or not the current watch
      callbackRef.current = null; // the poller drops the id once it has answered
      const orig = propsRef.current.base;
      if (update.status === 'ready') {
        const copyUrl = propsRef.current.variant === 'display' ? update.displayUrl : update.gridUrl;
        if (!copyUrl) {
          loadFailure();
          return;
        }
        readyRef.current = { copyUrl, updatedAt: update.updatedAt };
        retriedRef.current = false;
        commit({ phase: 'ready', src: withParam(copyUrl, 'v', update.updatedAt), failureReason: null });
      } else if (update.status === 'failed') {
        // Seam for T070/T071: the owner's failed tile with Try again hangs off this state.
        commit({ phase: 'failed', src: orig, failureReason: update.failureReason ?? null });
      } else {
        commit({ phase: 'unavailable', src: orig, failureReason: null });
      }
    }

    apiRef.current = { startWatch, loadFailure, onStatus };
  }

  // A different photo (or a changed source) starts again from the beginning.
  useEffect(() => {
    readyRef.current = null;
    retriedRef.current = false;
    rewatchesRef.current = 0;
    localFailedRef.current = false;
    wantWatchRef.current = false;
    const p = propsRef.current;
    if (p.base) {
      commit({ phase: 'idle', src: p.base, failureReason: null });
    } else if (p.unresolved) {
      commit({ phase: 'unavailable', src: null, failureReason: null });
    } else if (p.mediaId) {
      // Nothing to render and so nothing to error: ask the server straight away.
      apiRef.current.startWatch();
    } else {
      commit({ phase: 'pending', src: null, failureReason: null });
    }
    return teardown;
  }, [mediaId, base, commit, teardown]);

  const onError = useCallback(() => {
    const phase = phaseRef.current;
    const { startWatch, loadFailure } = apiRef.current;
    const p = propsRef.current;

    if (phase === 'idle') {
      if (!p.mediaId) return;
      if (p.isLocal && !localFailedRef.current) {
        // The device copy never engages the poller while it loads (R10). If the file has
        // gone, fall back to the server copy: local first, not local only.
        localFailedRef.current = true;
        const remote = sourceFor({ ...p.media, localPath: null }, p.variant);
        if (remote) {
          commit({ phase: 'idle', src: remote, failureReason: null });
        } else {
          startWatch();
        }
        return;
      }
      startWatch();
      return;
    }

    if (phase === 'ready' && readyRef.current) {
      if (retriedRef.current) {
        loadFailure();
        return;
      }
      if (timerRef.current !== null) return; // retry already scheduled
      retriedRef.current = true;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const { copyUrl, updatedAt } = readyRef.current;
        commit({
          phase: 'ready',
          src: withParam(withParam(copyUrl, 'v', updatedAt), 'retry', 1),
          failureReason: null,
        });
      }, RETRY_DELAY_MS);
    }
    // pending / failed / unavailable / loadFailed: another error changes nothing.
  }, [commit]);

  // Off screen: stop asking. On return: ask again if we were still waiting. Nothing else is
  // reset, in particular not the loadFailed cycle count (a flicker must not buy more tries).
  const firstVisibility = useRef(true);
  useEffect(() => {
    if (firstVisibility.current) {
      firstVisibility.current = false;
      return;
    }
    if (!visible) {
      if (callbackRef.current) {
        mediaStatusPoller.unwatch(watchedIdRef.current, callbackRef.current);
        callbackRef.current = null;
        wantWatchRef.current = true;
      }
    } else if (wantWatchRef.current && phaseRef.current === 'pending' && propsRef.current.mediaId) {
      apiRef.current.startWatch();
    }
  }, [visible]);

  // Back to watching from any state: used after the owner's Try again (FR-018, T070/T071).
  const rewatch = useCallback(() => {
    teardown();
    readyRef.current = null;
    retriedRef.current = false;
    rewatchesRef.current = 0;
    if (propsRef.current.mediaId) apiRef.current.startWatch();
  }, [teardown]);

  // The owner's Try again. One request at a time; stays `retrying` until the tile leaves the
  // failed state so the button cannot flash back and invite a second POST.
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState(false);
  const inFlightRef = useRef(false);
  useEffect(() => {
    inFlightRef.current = false;
    setRetrying(false);
    setRetryError(false);
  }, [mediaId]);
  useEffect(() => {
    if (view.phase !== 'failed') {
      inFlightRef.current = false;
      setRetrying(false);
    }
  }, [view.phase]);

  const tryAgain = useCallback(async () => {
    const id = propsRef.current.mediaId;
    if (!id || inFlightRef.current) return;
    inFlightRef.current = true;
    setRetrying(true);
    setRetryError(false);
    try {
      await MediaApi.retry(id);
      rewatch();
    } catch (e) {
      if (e && e.status === 409) {
        // Not failed any more (someone retried, or it finished): just look again.
        rewatch();
      } else {
        inFlightRef.current = false;
        setRetrying(false);
        setRetryError(true);
      }
    }
  }, [rewatch]);

  return {
    src: view.src,
    state: view.phase,
    failureReason: view.failureReason,
    onError,
    rewatch,
    tryAgain,
    retrying,
    retryError,
  };
}

export default useMediaDerivative;
