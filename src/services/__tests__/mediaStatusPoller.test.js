// The default status function comes from MediaApi; every test injects its own, so keep the
// real API client (AsyncStorage, NetworkMonitor, ...) out of this suite.
jest.mock('../../api/MediaApi', () => ({ MediaApi: { status: jest.fn() } }));


import { createMediaStatusPoller } from '../mediaStatusPoller';

// Contract: specs/007-media-derivatives/contracts/media-status.md (FR-026..FR-030, research R8/R9).

const ids = (n, prefix = 'm') => Array.from({ length: n }, (_, i) => `${prefix}${i}`);
const pending = (id, updatedAt = 't0') => ({ id, status: 'pending', updatedAt });
const ready = (id) => ({
  id,
  status: 'ready',
  updatedAt: 't1',
  gridUrl: `https://cdn/${id}/grid.webp`,
  displayUrl: `https://cdn/${id}/display.webp`,
});
const httpError = (status) => Object.assign(new Error(`HTTP ${status}`), { status });

describe('mediaStatusPoller', () => {
  let status;
  let poller;

  beforeEach(() => {
    jest.useFakeTimers();
    status = jest.fn();
    poller = createMediaStatusPoller({ status });
  });
  afterEach(() => {
    poller.stop();
    jest.useRealTimers();
  });

  const watchAll = (list, cb = jest.fn()) => {
    list.forEach((id) => poller.watch(id, cb));
    return cb;
  };

  it('sends one request per tick for all watched ids', async () => {
    const list = ids(20);
    status.mockResolvedValue({ items: list.map((id) => pending(id)), partial: false });
    watchAll(list);
    await jest.advanceTimersByTimeAsync(2000);
    expect(status).toHaveBeenCalledTimes(1);
    expect(status.mock.calls[0][0]).toEqual(list);
  });

  it('chunks requests at 100 ids', async () => {
    const list = ids(250);
    status.mockImplementation(async (chunk) => ({ items: chunk.map((id) => pending(id)), partial: false }));
    watchAll(list);
    await jest.advanceTimersByTimeAsync(2000);
    expect(status).toHaveBeenCalledTimes(3);
    expect(status.mock.calls.map((c) => c[0].length)).toEqual([100, 100, 50]);
  });

  it('is single flight: the next tick is scheduled only after the response settles', async () => {
    let resolve;
    status.mockImplementation(() => new Promise((r) => { resolve = r; }));
    watchAll(['a']);
    await jest.advanceTimersByTimeAsync(2000);
    expect(status).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(60000); // response still outstanding
    expect(status).toHaveBeenCalledTimes(1);
    resolve({ items: [pending('a')], partial: false });
    await jest.advanceTimersByTimeAsync(3000); // next interval is 3 s
    expect(status).toHaveBeenCalledTimes(2);
  });

  it('starts at 2 s, grows x1.5 per unchanged tick, and caps at 15 s', async () => {
    const times = [];
    let last = Date.now();
    status.mockImplementation(async () => {
      times.push(Date.now() - last);
      last = Date.now();
      return { items: [pending('a')], partial: false };
    });
    watchAll(['a']);
    await jest.advanceTimersByTimeAsync(120000);
    expect(times.slice(0, 7)).toEqual([2000, 3000, 4500, 6750, 10125, 15000, 15000]);
  });

  it('resets to 2 s when something changes', async () => {
    let n = 0;
    status.mockImplementation(async () => {
      n += 1;
      return { items: [pending('a', n === 4 ? 'changed' : 't0'), pending('b')], partial: false };
    });
    watchAll(['a', 'b']);
    await jest.advanceTimersByTimeAsync(2000); // tick 1 (baseline) -> 3000
    await jest.advanceTimersByTimeAsync(3000); // tick 2 -> 4500
    await jest.advanceTimersByTimeAsync(4500); // tick 3 -> 6750
    await jest.advanceTimersByTimeAsync(6750); // tick 4 sees a change -> 2000
    expect(status).toHaveBeenCalledTimes(4);
    await jest.advanceTimersByTimeAsync(1999);
    expect(status).toHaveBeenCalledTimes(4);
    await jest.advanceTimersByTimeAsync(1);
    expect(status).toHaveBeenCalledTimes(5);
  });

  it('notifies ready and failed, then drops the id', async () => {
    status.mockResolvedValue({
      items: [ready('a'), { id: 'b', status: 'failed', updatedAt: 't1', failureReason: 'corrupt' }, pending('c')],
      partial: false,
    });
    const cb = watchAll(['a', 'b', 'c']);
    await jest.advanceTimersByTimeAsync(2000);
    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a', status: 'ready', gridUrl: 'https://cdn/a/grid.webp', updatedAt: 't1' }),
    );
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ id: 'b', status: 'failed', failureReason: 'corrupt' }));
    expect(cb).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(2000); // reset to 2 s after a change
    expect(status.mock.calls[1][0]).toEqual(['c']);
  });

  it('notifies unavailable and drops an id omitted with partial:false', async () => {
    status.mockResolvedValue({ items: [pending('a')], partial: false });
    const cb = watchAll(['a', 'gone']);
    await jest.advanceTimersByTimeAsync(2000);
    expect(cb).toHaveBeenCalledWith({ id: 'gone', status: 'unavailable' });
    await jest.advanceTimersByTimeAsync(2000);
    expect(status.mock.calls[1][0]).toEqual(['a']);
  });

  it('keeps watching an id omitted with partial:true, using the error backoff', async () => {
    status.mockResolvedValue({ items: [], partial: true });
    const cb = watchAll(['a']);
    await jest.advanceTimersByTimeAsync(2000); // tick 1
    expect(cb).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(2000); // tick 2 after 2 s
    expect(status).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(3999);
    expect(status).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(1); // tick 3 after 4 s
    expect(status).toHaveBeenCalledTimes(3);
    expect(status.mock.calls[2][0]).toEqual(['a']);
  });

  it('backs off 2 s -> 30 s on network error or 5xx without surfacing an error', async () => {
    const cb = jest.fn();
    const errors = [new TypeError('Failed to fetch'), httpError(503), httpError(500)];
    const times = [];
    let last = Date.now();
    status.mockImplementation(async () => {
      times.push(Date.now() - last);
      last = Date.now();
      throw errors[Math.min(times.length - 1, errors.length - 1)];
    });
    poller.watch('a', cb);
    await jest.advanceTimersByTimeAsync(200000);
    expect(times.slice(0, 7)).toEqual([2000, 2000, 4000, 8000, 16000, 30000, 30000]);
    expect(cb).not.toHaveBeenCalled();
  });

  it('returns to the normal interval after an error clears', async () => {
    status.mockRejectedValueOnce(httpError(502)).mockResolvedValue({ items: [pending('a')], partial: false });
    watchAll(['a']);
    await jest.advanceTimersByTimeAsync(2000); // error -> 2000
    await jest.advanceTimersByTimeAsync(2000); // ok, baseline -> 3000
    await jest.advanceTimersByTimeAsync(2999);
    expect(status).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(1);
    expect(status).toHaveBeenCalledTimes(3);
  });

  it('stops entirely on 401', async () => {
    status.mockRejectedValue(httpError(401));
    const cb = watchAll(['a']);
    await jest.advanceTimersByTimeAsync(2000);
    await jest.advanceTimersByTimeAsync(120000);
    expect(status).toHaveBeenCalledTimes(1);
    expect(cb).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('sets no timer when nothing is watched, and clears it when the last id is unwatched', async () => {
    expect(jest.getTimerCount()).toBe(0);
    poller.watch('a', jest.fn());
    expect(jest.getTimerCount()).toBe(1);
    poller.unwatch('a');
    expect(jest.getTimerCount()).toBe(0);
    await jest.advanceTimersByTimeAsync(60000);
    expect(status).not.toHaveBeenCalled();
  });

  it('stops polling once every watched id has resolved', async () => {
    status.mockResolvedValue({ items: [ready('a')], partial: false });
    watchAll(['a']);
    await jest.advanceTimersByTimeAsync(2000);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('does not notify a callback that was unwatched', async () => {
    status.mockResolvedValue({ items: [ready('a'), pending('b')], partial: false });
    const cb = jest.fn();
    poller.watch('a', cb);
    poller.watch('b', jest.fn());
    poller.unwatch('a');
    await jest.advanceTimersByTimeAsync(2000);
    expect(cb).not.toHaveBeenCalled();
  });
  it('does not deliver a response requested before unwatch to a later watch of the same id', async () => {
    let resolve;
    status.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    const first = jest.fn();
    const second = jest.fn();
    poller.watch('x', first);
    await jest.advanceTimersByTimeAsync(2000); // request for x is out
    poller.unwatch('x');
    poller.watch('x', second); // a different tile, a later watch
    resolve({ items: [ready('x')], partial: false });
    await jest.advanceTimersByTimeAsync(0);
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
    // x is still watched and gets asked about afresh
    status.mockResolvedValue({ items: [ready('x')], partial: false });
    await jest.advanceTimersByTimeAsync(3000);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('halts on 401 but retains watchers; a later watch re-arms them all', async () => {
    status.mockRejectedValueOnce(httpError(401));
    const a = jest.fn();
    poller.watch('a', a);
    await jest.advanceTimersByTimeAsync(2000);
    await jest.advanceTimersByTimeAsync(60000);
    expect(status).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);

    status.mockResolvedValue({ items: [ready('a'), ready('b')], partial: false });
    const b = jest.fn();
    poller.watch('b', b);
    await jest.advanceTimersByTimeAsync(2000);
    expect(status.mock.calls[1][0]).toEqual(['a', 'b']);
    expect(a).toHaveBeenCalledWith(expect.objectContaining({ id: 'a', status: 'ready' }));
    expect(b).toHaveBeenCalled();
  });

  it('resume() re-arms retained watchers after a 401', async () => {
    status.mockRejectedValueOnce(httpError(401));
    const a = jest.fn();
    poller.watch('a', a);
    await jest.advanceTimersByTimeAsync(2000);
    status.mockResolvedValue({ items: [ready('a')], partial: false });
    poller.resume();
    await jest.advanceTimersByTimeAsync(2000);
    expect(a).toHaveBeenCalled();
  });

  it('keeps the earliest deadline so a stream of new watches cannot starve a tick', async () => {
    status.mockResolvedValue({ items: [pending('a'), pending('b'), pending('c')], partial: false });
    poller.watch('a', jest.fn());
    await jest.advanceTimersByTimeAsync(1500);
    poller.watch('b', jest.fn());
    await jest.advanceTimersByTimeAsync(400);
    poller.watch('c', jest.fn());
    await jest.advanceTimersByTimeAsync(100); // t = 2000
    expect(status).toHaveBeenCalledTimes(1);
    expect(status.mock.calls[0][0]).toEqual(['a', 'b', 'c']);
  });

  it('treats a body without a boolean partial as an error: nothing notified, ids kept, backoff', async () => {
    status.mockResolvedValue({ items: [] });
    const cb = watchAll(['a']);
    await jest.advanceTimersByTimeAsync(2000);
    expect(cb).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(2000);
    expect(status).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(3999);
    expect(status).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(1);
    expect(status).toHaveBeenCalledTimes(3);
    expect(cb).not.toHaveBeenCalled();
  });
  it('serves retained watchers after 503, then 401, then a new watch', async () => {
    status.mockRejectedValueOnce(httpError(503)).mockRejectedValueOnce(httpError(401));
    const a = jest.fn();
    poller.watch('a', a);
    await jest.advanceTimersByTimeAsync(2000); // 503: error backoff raised
    await jest.advanceTimersByTimeAsync(2000); // 401: halted
    expect(status).toHaveBeenCalledTimes(2);
    expect(jest.getTimerCount()).toBe(0);

    status.mockResolvedValue({ items: [ready('a'), ready('b')], partial: false });
    const b = jest.fn();
    poller.watch('b', b);
    await jest.advanceTimersByTimeAsync(2000);
    expect(status).toHaveBeenCalledTimes(3);
    expect(a).toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
  });

  it('notifies the chunks that succeeded when another chunk is 401, then halts', async () => {
    const list = ids(101);
    status.mockImplementation(async (chunkIds) => {
      if (chunkIds.length === 1) throw httpError(401);
      return { items: chunkIds.map((id) => ready(id)), partial: false };
    });
    const cb = watchAll(list);
    await jest.advanceTimersByTimeAsync(2000);
    expect(cb).toHaveBeenCalledTimes(100);
    expect(jest.getTimerCount()).toBe(0);
    await jest.advanceTimersByTimeAsync(60000);
    expect(status).toHaveBeenCalledTimes(2); // the two chunks of the one tick
  });
});
