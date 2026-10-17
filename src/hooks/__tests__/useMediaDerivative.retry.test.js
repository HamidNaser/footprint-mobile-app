/**
 * 007 T070/T071 -- the owner's Try again (FR-018, FR-022), and T080 -- viewport gating
 * (FR-027, FR-031, SC-007) for useMediaDerivative.
 */
import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('../../services/mediaStatusPoller', () => {
  const poller = { watch: jest.fn(), unwatch: jest.fn() };
  return { mediaStatusPoller: poller, default: poller };
});
jest.mock('../../api/MediaApi', () => ({ MediaApi: { retry: jest.fn() } }));

import { mediaStatusPoller } from '../../services/mediaStatusPoller';
import { MediaApi } from '../../api/MediaApi';
import { useMediaDerivative } from '../useMediaDerivative';
import { TileVisibility } from '../mediaVisibility';

global.IS_REACT_ACT_ENVIRONMENT = true;

const READY = {
  id: 'm1',
  status: 'ready',
  updatedAt: '2026-10-17T09:12:03Z',
  gridUrl: 'https://cdn/m1/grid.webp',
  displayUrl: 'https://cdn/m1/display.webp',
};
const NOT_YET = { id: 'm1', thumbnailUrl: null, displayUrl: null };
const FAILED = { id: 'm1', status: 'failed', updatedAt: 't', failureReason: 'corrupt' };

function setup(media, options, wrapperVisible) {
  const out = { current: null };
  function Probe({ opts }) {
    out.current = useMediaDerivative(media, opts);
    return null;
  }
  const el = (opts, vis) => {
    const probe = <Probe opts={opts} />;
    return vis === undefined ? probe : <TileVisibility visible={vis}>{probe}</TileVisibility>;
  };
  let tree;
  act(() => {
    tree = renderer.create(el(options, wrapperVisible));
  });
  return {
    result: out,
    rerender: (opts = options, vis = wrapperVisible) => act(() => tree.update(el(opts, vis))),
  };
}

const deliver = (payload) => {
  const cb = mediaStatusPoller.watch.mock.calls.at(-1)[1];
  act(() => cb(payload));
};
const breakReadyCopy = (result) => {
  act(() => result.current.onError());
  act(() => jest.advanceTimersByTime(2000));
  act(() => result.current.onError());
};

beforeEach(() => {
  jest.useFakeTimers();
  mediaStatusPoller.watch.mockClear();
  mediaStatusPoller.unwatch.mockClear();
  MediaApi.retry.mockReset();
});
afterEach(() => jest.useRealTimers());

describe('useMediaDerivative: failed state and Try again', () => {
  const failedTile = () => {
    const h = setup(NOT_YET);
    deliver(FAILED);
    return h;
  };

  it('keeps the failure reason (present only for the owner)', () => {
    const { result } = failedTile();
    expect(result.current.state).toBe('failed');
    expect(result.current.failureReason).toBe('corrupt');
  });

  it('tryAgain posts the retry and goes back to watching, pending', async () => {
    MediaApi.retry.mockResolvedValue({ id: 'm1', status: 'pending', updatedAt: 't2' });
    const { result } = failedTile();
    mediaStatusPoller.watch.mockClear();
    await act(async () => {
      await result.current.tryAgain();
    });
    expect(MediaApi.retry).toHaveBeenCalledWith('m1');
    expect(result.current.state).toBe('pending');
    expect(mediaStatusPoller.watch).toHaveBeenCalledTimes(1);
    expect(result.current.retryError).toBe(false);
  });

  it('a 409 means it is not failed any more: just look again', async () => {
    MediaApi.retry.mockRejectedValue(Object.assign(new Error('conflict'), { status: 409 }));
    const { result } = failedTile();
    mediaStatusPoller.watch.mockClear();
    await act(async () => {
      await result.current.tryAgain();
    });
    expect(result.current.state).toBe('pending');
    expect(mediaStatusPoller.watch).toHaveBeenCalledTimes(1);
    expect(result.current.retryError).toBe(false);
  });

  it('any other error keeps the failed tile, shows an inline error, and allows another try', async () => {
    MediaApi.retry.mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 500 }));
    const { result } = failedTile();
    mediaStatusPoller.watch.mockClear();
    await act(async () => {
      await result.current.tryAgain();
    });
    expect(result.current.state).toBe('failed');
    expect(result.current.retryError).toBe(true);
    expect(result.current.retrying).toBe(false);
    expect(mediaStatusPoller.watch).not.toHaveBeenCalled();

    MediaApi.retry.mockResolvedValueOnce({});
    await act(async () => {
      await result.current.tryAgain();
    });
    expect(MediaApi.retry).toHaveBeenCalledTimes(2);
    expect(result.current.state).toBe('pending');
    expect(result.current.retryError).toBe(false);
  });

  it('a double tap sends one request', async () => {
    let resolve;
    MediaApi.retry.mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = failedTile();
    let first;
    act(() => {
      first = result.current.tryAgain();
      result.current.tryAgain();
    });
    expect(MediaApi.retry).toHaveBeenCalledTimes(1);
    expect(result.current.retrying).toBe(true);
    await act(async () => {
      resolve({});
      await first;
    });
  });
});

describe('useMediaDerivative: viewport (FR-027, SC-007)', () => {
  it('unwatches when the tile leaves the viewport, and watches again on return', () => {
    const { rerender, result } = setup(NOT_YET, undefined, true);
    expect(mediaStatusPoller.watch).toHaveBeenCalledTimes(1);
    rerender(undefined, false);
    expect(mediaStatusPoller.unwatch).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe('pending');
    rerender(undefined, true);
    expect(mediaStatusPoller.watch).toHaveBeenCalledTimes(2);
  });

  it('the visible option works without a host context', () => {
    const { rerender } = setup(NOT_YET, { visible: true });
    rerender({ visible: false });
    expect(mediaStatusPoller.unwatch).toHaveBeenCalledTimes(1);
  });

  it('a tile that starts off-screen does not watch until it is seen', () => {
    const { rerender } = setup(NOT_YET, undefined, false);
    expect(mediaStatusPoller.watch).not.toHaveBeenCalled();
    rerender(undefined, true);
    expect(mediaStatusPoller.watch).toHaveBeenCalledTimes(1);
  });

  it('a late answer to the abandoned watch is ignored', () => {
    const { rerender, result } = setup(NOT_YET, undefined, true);
    const stale = mediaStatusPoller.watch.mock.calls[0][1];
    rerender(undefined, false);
    act(() => stale(READY));
    expect(result.current.state).toBe('pending');
  });

  it('leaving and returning does not reset the loadFailed cycle count', () => {
    const { rerender, result } = setup(NOT_YET, undefined, true);
    deliver(READY);
    breakReadyCopy(result); // cycle 1 -> re-watch
    expect(mediaStatusPoller.watch).toHaveBeenCalledTimes(2);
    rerender(undefined, false);
    rerender(undefined, true);
    deliver(READY);
    breakReadyCopy(result); // cycle 2 -> re-watch
    rerender(undefined, false);
    rerender(undefined, true);
    deliver(READY);
    breakReadyCopy(result); // budget spent
    expect(result.current.state).toBe('loadFailed');
  });

  it('visibility does not touch a settled tile', () => {
    const { rerender, result } = setup(NOT_YET, undefined, true);
    deliver(READY);
    rerender(undefined, false);
    rerender(undefined, true);
    expect(result.current.state).toBe('ready');
    expect(mediaStatusPoller.watch).toHaveBeenCalledTimes(1);
  });

  it('defaults to visible when no host says otherwise', () => {
    setup(NOT_YET);
    expect(mediaStatusPoller.watch).toHaveBeenCalledTimes(1);
  });
});
