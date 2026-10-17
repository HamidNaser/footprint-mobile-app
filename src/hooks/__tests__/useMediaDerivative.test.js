/**
 * 007 T060 -- the mobile port of the web useMediaDerivative hook (research R8, R10).
 * States: pending, ready, failed, unavailable, loadFailed. A tile rendering from localPath
 * never engages the poller; a missing remote source renders the pending placeholder (src null).
 */
import React from 'react';
import renderer, { act } from 'react-test-renderer';

// useMediaDerivative reaches MediaApi (retry); keep the real API client out of this suite.
jest.mock('../../api/MediaApi', () => ({ MediaApi: { retry: jest.fn() } }));
jest.mock('../../services/mediaStatusPoller', () => {
  const poller = { watch: jest.fn(), unwatch: jest.fn() };
  return { mediaStatusPoller: poller, default: poller };
});

import { mediaStatusPoller } from '../../services/mediaStatusPoller';
import { useMediaDerivative } from '../useMediaDerivative';

global.IS_REACT_ACT_ENVIRONMENT = true;

const READY = {
  id: 'm1',
  status: 'ready',
  updatedAt: '2026-10-17T09:12:03Z',
  gridUrl: 'https://cdn/m1/grid.webp',
  displayUrl: 'https://cdn/m1/display.webp',
};
const REMOTE = { id: 'm1', thumbnailUrl: 'https://cdn/m1/grid.webp', displayUrl: 'https://cdn/m1/display.webp' };
const NOT_YET = { id: 'm1', thumbnailUrl: null, displayUrl: null };

function setup(initialMedia, options) {
  const out = { current: null };
  function Probe({ media }) {
    out.current = useMediaDerivative(media, options);
    return null;
  }
  let tree;
  act(() => {
    tree = renderer.create(<Probe media={initialMedia} />);
  });
  return {
    result: out,
    rerender: (media) => act(() => tree.update(<Probe media={media} />)),
    unmount: () => act(() => tree.unmount()),
  };
}

const deliver = (payload) => {
  const cb = mediaStatusPoller.watch.mock.calls.at(-1)[1];
  act(() => cb(payload));
};
const exhaustReadyCopy = (result) => {
  act(() => result.current.onError());
  act(() => jest.advanceTimersByTime(2000));
  act(() => result.current.onError());
};

beforeEach(() => {
  jest.useFakeTimers();
  mediaStatusPoller.watch.mockClear();
  mediaStatusPoller.unwatch.mockClear();
});
afterEach(() => jest.useRealTimers());

describe('useMediaDerivative: sources', () => {
  it('a tile rendering from localPath uses it and never engages the poller', () => {
    const { result } = setup({ ...REMOTE, localPath: 'file:///a.jpg' });
    expect(result.current.src).toBe('file:///a.jpg');
    expect(result.current.state).toBe('idle');
    act(() => result.current.onError());
    expect(mediaStatusPoller.watch).not.toHaveBeenCalled();
  });

  it('a device file that has gone falls back to the server copy: local first, not local only', () => {
    const { result } = setup({ ...REMOTE, localPath: 'file:///deleted.jpg' });
    act(() => result.current.onError());
    expect(result.current.src).toBe(REMOTE.thumbnailUrl);
    expect(result.current.state).toBe('idle');
    expect(mediaStatusPoller.watch).not.toHaveBeenCalled();
    act(() => result.current.onError()); // the server copy is not there either
    expect(result.current.state).toBe('pending');
    expect(mediaStatusPoller.watch).toHaveBeenCalledTimes(1);
  });

  it('a device file that has gone, with no server copy yet, watches for one', () => {
    const { result } = setup({ ...NOT_YET, localPath: 'file:///deleted.jpg' });
    act(() => result.current.onError());
    expect(result.current.state).toBe('pending');
    expect(mediaStatusPoller.watch).toHaveBeenCalledTimes(1);
    deliver(READY);
    expect(result.current.src).toBe(`${READY.gridUrl}?v=${encodeURIComponent(READY.updatedAt)}`);
  });

  it('a device file that has gone, with no server id, has nothing to fall back to', () => {
    const { result } = setup({ localPath: 'file:///deleted.jpg' });
    act(() => result.current.onError());
    expect(mediaStatusPoller.watch).not.toHaveBeenCalled();
  });

  it('uses the grid copy for tiles and the display copy for the full view', () => {
    expect(setup(REMOTE).result.current.src).toBe(REMOTE.thumbnailUrl);
    expect(setup(REMOTE, { variant: 'display' }).result.current.src).toBe(REMOTE.displayUrl);
  });

  it('never falls back to the original (serverUrl)', () => {
    const { result } = setup({ ...NOT_YET, serverUrl: 'https://cdn/original.heic' });
    expect(result.current.src).toBeNull();
  });

  it('no source yet: src is null, state pending, and it watches the media id straight away', () => {
    const { result } = setup(NOT_YET);
    expect(result.current.src).toBeNull();
    expect(result.current.state).toBe('pending');
    expect(mediaStatusPoller.watch).toHaveBeenCalledTimes(1);
    expect(mediaStatusPoller.watch.mock.calls[0][0]).toBe('m1');
  });

  it('no source and no id: pending placeholder, nothing to watch', () => {
    const { result } = setup({ id: null });
    expect(result.current.src).toBeNull();
    expect(result.current.state).toBe('pending');
    expect(mediaStatusPoller.watch).not.toHaveBeenCalled();
  });

  it('an unresolved reference is unavailable at once, never watched', () => {
    const { result } = setup({ id: null, unresolved: true, thumbnailUrl: null });
    expect(result.current.state).toBe('unavailable');
    expect(mediaStatusPoller.watch).not.toHaveBeenCalled();
  });

  it('ignores a cached old-route address', () => {
    const { result } = setup({ id: 'm1', thumbnailUrl: 'https://x/api/v1/media/t/grid/a.jpg' });
    expect(result.current.src).toBeNull();
    expect(result.current.state).toBe('pending');
  });
});

describe('useMediaDerivative: lifecycle', () => {
  it('a remote copy that fails to load starts watching, once', () => {
    const { result } = setup(REMOTE);
    expect(mediaStatusPoller.watch).not.toHaveBeenCalled();
    act(() => result.current.onError());
    act(() => result.current.onError());
    expect(mediaStatusPoller.watch).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe('pending');
  });

  it('swaps to the copy url with ?v=updatedAt on ready', () => {
    const { result } = setup(NOT_YET);
    deliver(READY);
    expect(result.current.state).toBe('ready');
    expect(result.current.src).toBe(`${READY.gridUrl}?v=${encodeURIComponent(READY.updatedAt)}`);
  });

  it('uses & when the url already has a query, and displayUrl for the display variant', () => {
    const { result } = setup(NOT_YET, { variant: 'display' });
    deliver({ ...READY, displayUrl: 'https://cdn/d.webp?x=1' });
    expect(result.current.src).toBe(`https://cdn/d.webp?x=1&v=${encodeURIComponent(READY.updatedAt)}`);
  });

  it('retries once after 2 s if the ready copy errors', () => {
    const { result } = setup(NOT_YET);
    deliver(READY);
    const first = result.current.src;
    act(() => result.current.onError());
    act(() => jest.advanceTimersByTime(1999));
    expect(result.current.src).toBe(first);
    act(() => jest.advanceTimersByTime(1));
    expect(result.current.src).not.toBe(first);
    expect(result.current.src).toContain(READY.gridUrl);
    expect(result.current.state).toBe('ready');
  });

  it('settles on loadFailed (never failed) after two re-watch cycles', () => {
    const { result } = setup(NOT_YET);
    deliver(READY);
    exhaustReadyCopy(result); // re-watch 1
    deliver(READY);
    exhaustReadyCopy(result); // re-watch 2
    deliver(READY);
    expect(mediaStatusPoller.watch).toHaveBeenCalledTimes(3); // mount + 2 re-watches
    exhaustReadyCopy(result);
    expect(result.current.state).toBe('loadFailed');
    expect(mediaStatusPoller.watch).toHaveBeenCalledTimes(3);
    act(() => jest.advanceTimersByTime(10000));
    expect(result.current.state).toBe('loadFailed');
  });

  it('a ready payload with no copy url is a load failure, never undefined?v=', () => {
    const { result } = setup(NOT_YET);
    deliver({ id: 'm1', status: 'ready', updatedAt: 't' });
    expect(String(result.current.src)).not.toContain('undefined');
    expect(result.current.state).toBe('pending');
  });

  it('exposes failed (server verdict only) and unavailable', () => {
    const a = setup(NOT_YET);
    deliver({ id: 'm1', status: 'failed', updatedAt: 't', failureReason: 'corrupt' });
    expect(a.result.current.state).toBe('failed');
    expect(a.result.current.failureReason).toBe('corrupt');
    const b = setup(NOT_YET);
    deliver({ id: 'm1', status: 'unavailable' });
    expect(b.result.current.state).toBe('unavailable');
  });

  it('cancels a pending retry on unmount', () => {
    const { result, unmount } = setup(NOT_YET);
    deliver(READY);
    act(() => result.current.onError());
    unmount();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('unwatches on unmount', () => {
    const { unmount } = setup(NOT_YET);
    const cb = mediaStatusPoller.watch.mock.calls[0][1];
    unmount();
    expect(mediaStatusPoller.unwatch).toHaveBeenCalledWith('m1', cb);
  });

  it('unwatches the old id, not the new one, when the media changes', () => {
    const { rerender } = setup(NOT_YET);
    const cb = mediaStatusPoller.watch.mock.calls[0][1];
    rerender({ id: 'm2', thumbnailUrl: null });
    expect(mediaStatusPoller.unwatch).toHaveBeenCalledWith('m1', cb);
    expect(mediaStatusPoller.watch.mock.calls.at(-1)[0]).toBe('m2');
  });

  it('a late answer for an earlier watch does not reach the new media (generation-safe)', () => {
    const { result, rerender } = setup(NOT_YET);
    const stale = mediaStatusPoller.watch.mock.calls[0][1];
    rerender({ id: 'm2', thumbnailUrl: null });
    act(() => stale(READY));
    expect(result.current.state).toBe('pending');
    expect(result.current.src).toBeNull();
  });
});
