/** 007 T080 -- FR-031: no polling while the app is in the background; a 401 halt is never undone by it. */
jest.mock('../../api/MediaApi', () => ({ MediaApi: { status: jest.fn() } }));

import { createMediaStatusPoller } from '../mediaStatusPoller';

const pending = (id) => ({ id, status: 'pending', updatedAt: 't0' });
const ready = (id) => ({ id, status: 'ready', updatedAt: 't1', gridUrl: 'g', displayUrl: 'd' });
const httpError = (status) => Object.assign(new Error(`HTTP ${status}`), { status });

function fakeAppState(initial = 'active') {
  const handlers = new Set();
  const subs = [];
  const api = {
    currentState: initial,
    addEventListener: jest.fn((type, fn) => {
      handlers.add(fn);
      const sub = { remove: jest.fn(() => handlers.delete(fn)) };
      subs.push(sub);
      return sub;
    }),
    set(next) {
      api.currentState = next;
      handlers.forEach((fn) => fn(next));
    },
    handlers,
    subs,
  };
  return api;
}

describe('mediaStatusPoller: AppState (FR-031)', () => {
  let status;
  let appState;
  let poller;
  beforeEach(() => {
    jest.useFakeTimers();
    status = jest.fn();
    appState = fakeAppState();
    poller = createMediaStatusPoller({ status, appState });
  });
  afterEach(() => {
    poller.stop();
    jest.useRealTimers();
  });

  it('sends nothing while backgrounded, and resumes when active again', async () => {
    status.mockResolvedValue({ items: [pending('a')], partial: false });
    poller.watch('a', jest.fn());
    await jest.advanceTimersByTimeAsync(2000);
    expect(status).toHaveBeenCalledTimes(1);

    appState.set('background');
    expect(jest.getTimerCount()).toBe(0);
    await jest.advanceTimersByTimeAsync(120000);
    expect(status).toHaveBeenCalledTimes(1);

    appState.set('active');
    await jest.advanceTimersByTimeAsync(2000);
    expect(status).toHaveBeenCalledTimes(2);
  });

  it('inactive (the iOS app-switcher) does not pause; only background does', async () => {
    status.mockResolvedValue({ items: [pending('a')], partial: false });
    poller.watch('a', jest.fn());
    appState.set('inactive');
    await jest.advanceTimersByTimeAsync(2000);
    expect(status).toHaveBeenCalledTimes(1);
  });

  it('registers the listener once, however many watches', () => {
    poller.watch('a', jest.fn());
    poller.watch('b', jest.fn());
    poller.watch('c', jest.fn());
    expect(appState.addEventListener).toHaveBeenCalledTimes(1);
    expect(appState.addEventListener.mock.calls[0][0]).toBe('change');
  });

  it('stop() removes the listener, and a later watch registers it again', () => {
    poller.watch('a', jest.fn());
    poller.stop();
    expect(appState.subs[0].remove).toHaveBeenCalledTimes(1);
    poller.watch('a', jest.fn());
    expect(appState.addEventListener).toHaveBeenCalledTimes(2);
  });

  it('a watch made while already in the background sends nothing until active', async () => {
    appState = fakeAppState('background');
    poller = createMediaStatusPoller({ status, appState });
    status.mockResolvedValue({ items: [ready('a')], partial: false });
    poller.watch('a', jest.fn());
    await jest.advanceTimersByTimeAsync(60000);
    expect(status).not.toHaveBeenCalled();
    appState.set('active');
    await jest.advanceTimersByTimeAsync(2000);
    expect(status).toHaveBeenCalledTimes(1);
  });

  it('coming back to the foreground never un-halts a 401', async () => {
    status.mockRejectedValueOnce(httpError(401));
    poller.watch('a', jest.fn());
    await jest.advanceTimersByTimeAsync(2000);
    expect(status).toHaveBeenCalledTimes(1);

    appState.set('background');
    appState.set('active');
    await jest.advanceTimersByTimeAsync(120000);
    expect(status).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);

    // A new watch is still what re-arms it.
    status.mockResolvedValue({ items: [ready('a'), ready('b')], partial: false });
    poller.watch('b', jest.fn());
    await jest.advanceTimersByTimeAsync(2000);
    expect(status).toHaveBeenCalledTimes(2);
  });

  it('a 401 while backgrounded stays halted on return', async () => {
    status.mockRejectedValueOnce(httpError(401));
    poller.watch('a', jest.fn());
    appState.set('background');
    await jest.advanceTimersByTimeAsync(0);
    appState.set('active');
    await jest.advanceTimersByTimeAsync(2000); // the first tick fires now, and 401s
    await jest.advanceTimersByTimeAsync(120000);
    expect(status).toHaveBeenCalledTimes(1);
  });

  it('does not stop an explicit pause() (a viewport pause) from the app coming back', async () => {
    status.mockResolvedValue({ items: [pending('a')], partial: false });
    poller.watch('a', jest.fn());
    poller.pause();
    appState.set('background');
    appState.set('active');
    await jest.advanceTimersByTimeAsync(60000);
    expect(status).not.toHaveBeenCalled();
  });
});
