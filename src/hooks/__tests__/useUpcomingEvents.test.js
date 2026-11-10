/**
 * 013 T061 -- `useUpcomingEvents` (research R11), the hook behind Home's "Coming up" card and
 * the Timeline tab's Events pane (FR-031..034, SC-009).
 *
 * The one rule this file exists to pin: an event's `date` is a **civil date** (`YYYY-MM-DD`),
 * never an instant. FR-032 says a split that builds a `Date` from the civil value and compares
 * it against "now" can quietly misclassify a same-day event once the device's time zone and the
 * clock disagree about which side of UTC midnight they are on -- exactly the bug the constitution's
 * civil-date rule exists to rule out. The "FR-032 civil-date split" describe block below proves
 * two of the cases that bug fails: 00:05 local under UTC-10 (local day has barely started; the
 * UTC instant for "today" has already moved into tomorrow) and 23:55 local under UTC+13 (local
 * day is nearly over; the UTC instant for "today" is still comfortably "in the past" by the time
 * a wall-clock compare would run). Both are discriminating: an implementation that does
 * `new Date(event.date) >= new Date()` puts the same-day event in `past` for both, because the
 * UTC-midnight instant for "today" ends up earlier than the real current UTC instant. A correct
 * string compare of `'YYYY-MM-DD' >= localToday` never does.
 */

jest.mock('../../api', () => ({
  EventsApi: { getEvents: jest.fn(), isAuthenticated: jest.fn() },
}));

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { EventsApi } from '../../api';
import { useUpcomingEvents } from '../useUpcomingEvents';

global.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * A local, explicit time-zone shim for the two FR-032 cases below -- not a request to the
 * OS/ICU for a real zone.
 *
 * The documented ways to simulate a device in a different zone are reassigning
 * `process.env.TZ` mid-process, or `jest.useFakeTimers({ timezone })`. Both are reported to
 * work by a reviewer who redid this arithmetic independently. **On this machine, neither one
 * does** -- verified directly: a bare `node -e` script honours a mid-process `process.env.TZ`
 * change immediately (confirmed repeatedly, offsets 600 and -780, matching the reviewer), but
 * the identical reassignment made no difference at all once run through this project's Jest
 * (with or without fake timers, with or without `--runInBand`, in a from-scratch throwaway
 * Jest project with none of this project's config). `@sinonjs/fake-timers`' own `timezone`
 * option, exercised directly and outside Jest entirely, did not move `getTimezoneOffset()`
 * here either. Subclassing the installed fake `Date` doesn't work either, for a third,
 * independent reason verified the same way: `@sinonjs/fake-timers`' fake `Date` constructor
 * does not thread `new.target` through to a derived class, so `new Foo()` (`Foo extends
 * global.Date`) silently comes back as a plain fake `Date`, not a `Foo` -- `instanceof Foo` is
 * `false` and the subclass's overrides are never consulted. This is a genuine, verified gap on
 * this machine's Node/Jest/Windows combination, not a typo in a zone string -- and per Minor 3,
 * these two cases exist specifically to guard a bug this product has already shipped once, so
 * they must not pass for the wrong reason on whichever machine happens to run them.
 *
 * This shim sidesteps the OS/ICU/fake-timers mechanisms rather than depending on any of them:
 * a freestanding replacement for `global.Date` (no inheritance, so the `new.target` trap above
 * cannot recur) that returns a fixed instant for `new Date()` with no arguments -- the only
 * form the hook under test calls -- with `getFullYear`/`getMonth`/`getDate` computed from that
 * instant under an explicit offset, and `getTimezoneOffset`/`getTime`/`Date.now` reporting
 * consistently with it. Deterministic on every machine, this one included, without weakening
 * what the two cases prove: the fixed instant is still a real, correct absolute instant, so an
 * instant-based comparison (what these cases exist to catch) would compare against it exactly
 * as it would against a real device's clock. A `Date` constructed with arguments (none of this
 * file's own code does, but something else might) has its time computed by the real `Date`,
 * just not re-wrapped in it -- only the handful of methods this file needs are implemented.
 */
function installSimulatedNow(offsetMinutes, epochMs) {
  const RealDate = global.Date;

  function localPartsOf(ms) {
    // local = UTC - offset (offsetMinutes is minutes to ADD to local to reach UTC).
    const shifted = new RealDate(ms - offsetMinutes * 60000);
    return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth(), d: shifted.getUTCDate() };
  }

  class SimulatedDate {
    constructor(...args) {
      if (args.length === 0) {
        this._ms = epochMs;
      } else {
        this._ms = new RealDate(...args).getTime();
      }
    }
    getTime() {
      return this._ms;
    }
    valueOf() {
      return this._ms;
    }
    getTimezoneOffset() {
      return offsetMinutes;
    }
    getFullYear() {
      return localPartsOf(this._ms).y;
    }
    getMonth() {
      return localPartsOf(this._ms).m;
    }
    getDate() {
      return localPartsOf(this._ms).d;
    }
  }
  SimulatedDate.now = () => epochMs;

  global.Date = SimulatedDate;
  return () => {
    global.Date = RealDate;
  };
}

/** The UTC instant for a local wall-clock time under a given offset (minutes to add to local to reach UTC). */
function localInstant(offsetMinutes, year, month, day, hour, minute) {
  return Date.UTC(year, month, day, hour, minute) + offsetMinutes * 60000;
}

function setup() {
  const out = { current: null };
  function Probe() {
    out.current = useUpcomingEvents();
    return null;
  }
  return {
    result: out,
    mount: async () => {
      await act(async () => {
        renderer.create(<Probe />);
      });
      // A second flush: `load()`'s `Promise.all` resolves on a microtask the first `act` does
      // not always drain in one pass (the same reason `ImportScreen.test.js` double-flushes).
      await act(async () => {});
    },
  };
}

/** The three tabs `useUpcomingEvents` must read, each defaulting to an empty list. */
function mockTabs({ my = [], invites = [], drafts = [] } = {}) {
  EventsApi.getEvents.mockImplementation(async (tab) => {
    if (tab === 'my') return my;
    if (tab === 'invites') return invites;
    if (tab === 'drafts') return drafts;
    throw new Error(`unexpected tab: ${tab}`);
  });
}

const event = (overrides) => ({
  id: 'e1',
  status: 'published',
  date: '2099-01-01',
  title: 'Untitled',
  ...overrides,
});

beforeEach(() => {
  jest.useFakeTimers();
  EventsApi.getEvents.mockReset();
  EventsApi.isAuthenticated.mockReset();
  EventsApi.isAuthenticated.mockReturnValue(true);
  // A neutral instant, nowhere near a day boundary, so ordering/dedup/drafts cases are not
  // accidentally sensitive to the civil-date split under test elsewhere in this file.
  jest.setSystemTime(new Date(2026, 0, 1, 12, 0));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useUpcomingEvents: sources', () => {
  it("reads 'my', 'invites' and 'drafts'", async () => {
    mockTabs({});
    const { mount } = setup();
    await mount();

    expect(EventsApi.getEvents).toHaveBeenCalledWith('my');
    expect(EventsApi.getEvents).toHaveBeenCalledWith('invites');
    expect(EventsApi.getEvents).toHaveBeenCalledWith('drafts');
    expect(EventsApi.getEvents).toHaveBeenCalledTimes(3);
  });

  it('merges my + invites, de-duplicated by id, published only, host copy wins but its RSVP is carried over when it has none', async () => {
    mockTabs({
      my: [
        event({ id: 'hosted', date: '2099-01-01' }),
        // Co-hosted: same id as an invite below. The two copies differ (title, rsvp) so the
        // test can tell which one actually survived the merge, not just that one did.
        event({ id: 'shared', date: '2099-01-02', title: 'My Copy', rsvp: null }),
      ],
      invites: [
        event({ id: 'shared', date: '2099-01-02', title: 'Invite Copy', rsvp: 'going' }),
        event({ id: 'invited', date: '2099-01-03' }),
        // An invite that is not published (still a draft on the host's side) never appears.
        event({ id: 'unpublished-invite', date: '2099-01-04', status: 'draft' }),
      ],
      drafts: [],
    });
    const { result, mount } = setup();
    await mount();

    const merged = [...result.current.upcoming, ...result.current.past];
    expect(merged.map((e) => e.id).sort()).toEqual(['hosted', 'invited', 'shared']);

    const shared = merged.find((e) => e.id === 'shared');
    expect(shared.title).toBe('My Copy'); // the host's own copy is the base, not the invite's
    expect(shared.rsvp).toBe('going'); // ...but its missing RSVP is carried over from the invite
  });

  it("keeps the host's own RSVP when the host copy already has one", async () => {
    mockTabs({
      my: [event({ id: 'shared', date: '2099-01-02', rsvp: 'maybe' })],
      invites: [event({ id: 'shared', date: '2099-01-02', rsvp: 'going' })],
    });
    const { result, mount } = setup();
    await mount();

    const [shared] = [...result.current.upcoming, ...result.current.past];
    expect(shared.rsvp).toBe('maybe');
  });

  it('reports draftsCount from the drafts tab', async () => {
    mockTabs({ drafts: [event({ id: 'd1' }), event({ id: 'd2' }), event({ id: 'd3' })] });
    const { result, mount } = setup();
    await mount();

    expect(result.current.draftsCount).toBe(3);
  });
});

describe('useUpcomingEvents: ordering', () => {
  it('orders upcoming ascending (soonest first)', async () => {
    mockTabs({
      my: [
        event({ id: 'late', date: '2099-03-01' }),
        event({ id: 'soon', date: '2099-01-10' }),
        event({ id: 'mid', date: '2099-02-01' }),
      ],
    });
    const { result, mount } = setup();
    await mount();

    expect(result.current.upcoming.map((e) => e.id)).toEqual(['soon', 'mid', 'late']);
  });

  it('orders past descending (most recent first)', async () => {
    mockTabs({
      my: [
        event({ id: 'oldest', date: '2020-01-01' }),
        event({ id: 'mostRecent', date: '2025-12-31' }),
        event({ id: 'middle', date: '2023-06-15' }),
      ],
    });
    const { result, mount } = setup();
    await mount();

    expect(result.current.past.map((e) => e.id)).toEqual(['mostRecent', 'middle', 'oldest']);
  });
});

describe('useUpcomingEvents: FR-032 civil-date split (no Date built from the civil value)', () => {
  it('counts a same-day event as upcoming at 00:05 local under UTC-10', async () => {
    // Local day has barely begun; the real UTC instant is already 10h into "today" in UTC
    // terms (or past midnight into the next UTC day, depending on the date), so an
    // instant-based compare puts a UTC-midnight-parsed "today" behind "now" and calls it past.
    jest.useRealTimers(); // the shim supplies its own fixed "now"; no jest clock needed here.
    const UTC_MINUS_10 = 600; // minutes to ADD to local to reach UTC.
    const epoch = localInstant(UTC_MINUS_10, 2026, 10, 10, 0, 5); // 10 Nov 2026, 00:05 local.
    const restoreNow = installSimulatedNow(UTC_MINUS_10, epoch);
    try {
      // Guard the guard (Minor 3): if the shim were not actually wired up, both sides of the
      // split below would move together and this case would keep passing while silently no
      // longer exercising UTC-10 at all.
      expect(new Date().getTimezoneOffset()).toBe(600);
      mockTabs({ my: [event({ id: 'today', date: '2026-11-10' })] });

      const { result, mount } = setup();
      await mount();

      expect(result.current.upcoming.map((e) => e.id)).toEqual(['today']);
      expect(result.current.past).toEqual([]);
    } finally {
      restoreNow();
    }
  });

  it('counts a same-day event as upcoming at 23:55 local under UTC+13', async () => {
    // Local day is almost over; the real UTC instant for "now" is already well past the
    // UTC-midnight instant a civil-date parse would assign to "today", so the same
    // instant-based compare puts it in the past here too.
    jest.useRealTimers();
    const UTC_PLUS_13 = -780; // minutes to ADD to local to reach UTC.
    const epoch = localInstant(UTC_PLUS_13, 2026, 10, 10, 23, 55); // 10 Nov 2026, 23:55 local.
    const restoreNow = installSimulatedNow(UTC_PLUS_13, epoch);
    try {
      // Same guard as the UTC-10 case above.
      expect(new Date().getTimezoneOffset()).toBe(-780);
      mockTabs({ my: [event({ id: 'today', date: '2026-11-10' })] });

      const { result, mount } = setup();
      await mount();

      expect(result.current.upcoming.map((e) => e.id)).toEqual(['today']);
      expect(result.current.past).toEqual([]);
    } finally {
      restoreNow();
    }
  });
});

describe('useUpcomingEvents: a malformed date fails closed, not silent', () => {
  // The wire contract (`EventResponse.Date`) is non-nullable, so this should not happen -- but
  // of the three outcomes for a date that is not `YYYY-MM-DD`, "gone from both lists with no
  // signal" is exactly what this product's fail-closed rule exists to rule out. Visible-but-
  // misplaced beats invisible.
  it('an event with a non-civil-date date string is kept upcoming rather than vanishing from both lists', async () => {
    mockTabs({ my: [event({ id: 'bad-date', date: 'not-a-date' })] });
    const { result, mount } = setup();
    await mount();

    expect(result.current.upcoming.map((e) => e.id)).toEqual(['bad-date']);
    expect(result.current.past).toEqual([]);
  });

  it('an event with a missing date is also kept upcoming', async () => {
    mockTabs({ my: [event({ id: 'no-date', date: undefined })] });
    const { result, mount } = setup();
    await mount();

    expect(result.current.upcoming.map((e) => e.id)).toEqual(['no-date']);
    expect(result.current.past).toEqual([]);
  });

  it('never lets a garbage-dated event occupy the soonest slot ahead of a real one', async () => {
    // FR-034's "Coming up" card reads the first one or two of `upcoming`. The garbage date is
    // `''` specifically: an empty string sorts *before* any real `YYYY-MM-DD` string under a
    // naive string compare (ASCII '' < '2'), so a comparator that does not special-case an
    // invalid date would put this event first -- exactly the regression this case exists to
    // catch. (A letters-only garbage string like 'not-a-date' would not catch it: every ASCII
    // letter sorts after every digit, so it would land last by accident, not by the ordering
    // rule under test.)
    mockTabs({
      my: [
        event({ id: 'garbage-dated', date: '' }),
        event({ id: 'soonest-real', date: '2099-01-01' }),
        event({ id: 'later-real', date: '2099-06-01' }),
      ],
    });
    const { result, mount } = setup();
    await mount();

    expect(result.current.upcoming.map((e) => e.id)).toEqual([
      'soonest-real',
      'later-real',
      'garbage-dated',
    ]);
  });
});

describe('useUpcomingEvents: signed out', () => {
  it('asks no tab, fails closed with NOT_AUTHENTICATED, and never issues an unauthenticated request', async () => {
    EventsApi.isAuthenticated.mockReturnValue(false);
    mockTabs({ my: [event({ id: 'would-have-shown' })] });

    const { result, mount } = setup();
    await mount();

    expect(EventsApi.getEvents).not.toHaveBeenCalled();
    expect(result.current.error).toMatchObject({ code: 'NOT_AUTHENTICATED' });
    expect(result.current.upcoming).toEqual([]);
    expect(result.current.past).toEqual([]);
    expect(result.current.draftsCount).toBe(0);
    expect(result.current.isLoading).toBe(false);
  });
});

describe('useUpcomingEvents: failure is closed', () => {
  it('any failed call gives an error and no partial lists', async () => {
    mockTabs({ my: [event({ id: 'would-have-shown', date: '2099-01-01' })] });
    EventsApi.getEvents.mockImplementation(async (tab) => {
      if (tab === 'my') return [event({ id: 'would-have-shown', date: '2099-01-01' })];
      if (tab === 'invites') throw Object.assign(new Error('network down'), { status: 503 });
      return [];
    });

    const { result, mount } = setup();
    await mount();

    expect(result.current.error).toMatchObject({ message: 'network down', status: 503 });
    expect(result.current.upcoming).toEqual([]);
    expect(result.current.past).toEqual([]);
    expect(result.current.draftsCount).toBe(0);
  });

  it('stops loading once the failure is reported', async () => {
    EventsApi.getEvents.mockImplementation(async (tab) => {
      if (tab === 'drafts') throw new Error('nope');
      return [];
    });
    const { result, mount } = setup();
    await mount();

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).not.toBeNull();
  });
});

/**
 * `refresh()` (fix round 2): the Timeline tab's Events pane mirrors `EventsScreen` and so needs
 * the same recovery it offers -- `TimelineScreen` is a bottom-tab screen that never unmounts, so
 * without a `refresh()` here the one load on mount would be the only one for the rest of the app
 * session. Follows `useEvents`'s own `reloadKey` shape exactly, so the same rules this hook
 * already proves for the initial load (fail closed, signed-out short-circuit) apply unchanged
 * to a refresh -- these cases prove that holds, not just that `refresh` exists.
 */
describe('useUpcomingEvents: refresh', () => {
  it('a failed load followed by a successful refresh clears the error and shows the events', async () => {
    let shouldFail = true;
    EventsApi.getEvents.mockImplementation(async (tab) => {
      if (shouldFail) throw new Error('network down');
      if (tab === 'my') return [event({ id: 'e1', date: '2099-01-01' })];
      return [];
    });
    const { result, mount } = setup();
    await mount();

    expect(result.current.error).not.toBeNull();
    expect(result.current.upcoming).toEqual([]);

    shouldFail = false;
    await act(async () => {
      result.current.refresh();
    });
    await act(async () => {});

    expect(result.current.error).toBeNull();
    expect(result.current.upcoming.map((e) => e.id)).toEqual(['e1']);
  });

  it('a failed load followed by a failed refresh still shows the error, with empty lists (fail closed, never partial)', async () => {
    // A different message on the second attempt, not the first: proves the error on screen
    // after `refresh()` is the *second* load's result, not the first load's error state simply
    // left standing untouched (which a `refresh()` that silently did nothing would also satisfy,
    // the same message both times).
    let attempt = 0;
    EventsApi.getEvents.mockImplementation(async () => {
      throw new Error(attempt === 0 ? 'network down' : 'still down after retry');
    });
    const { result, mount } = setup();
    await mount();

    expect(result.current.error).toMatchObject({ message: 'network down' });
    expect(EventsApi.getEvents).toHaveBeenCalledTimes(3);

    attempt = 1;
    await act(async () => {
      result.current.refresh();
    });
    await act(async () => {});

    expect(EventsApi.getEvents).toHaveBeenCalledTimes(6); // refresh asked again, not a no-op
    expect(result.current.error).toMatchObject({ message: 'still down after retry' });
    expect(result.current.upcoming).toEqual([]);
    expect(result.current.past).toEqual([]);
    expect(result.current.draftsCount).toBe(0);
  });

  /**
   * Fix round 3 -- `refresh`'s own identity, across a re-render triggered by a *failed* load
   * (the state that actually produced the hazard below), not just what `refresh` does.
   *
   * `HomeScreen`'s focus-retry callback (fix round 2) depends on `refresh` alone, precisely so
   * its own identity stays stable across every failure and never re-triggers
   * `useFocusEffect`'s "callback identity changed while already focused" branch
   * (`@react-navigation/core`'s `useFocusEffect.tsx`) -- the mechanism behind the retry-storm
   * Critical that round fixed. If this hook ever made `refresh` identity-unstable (e.g. a
   * dependency added to its own `useCallback`, line 172), that loop reopens through the one
   * dependency `HomeScreen`'s callback still has -- and nothing would catch it:
   * `HomeScreen.comingUp.test.js` mocks this hook with its own always-stable `jest.fn()`, so a
   * real instability here is invisible from that side. Pinned at the source instead.
   */
  it("refresh's own identity is stable across a re-render caused by a failed load (fix round 3 -- HomeScreen's focus-retry depends on this)", async () => {
    let attempt = 0;
    EventsApi.getEvents.mockImplementation(async () => {
      throw new Error(attempt === 0 ? 'network down' : 'still down after retry');
    });
    const { result, mount } = setup();
    await mount();

    const firstRefresh = result.current.refresh;
    expect(result.current.error).not.toBeNull(); // the failing state this guard is actually for

    attempt = 1;
    await act(async () => {
      result.current.refresh();
    });
    await act(async () => {});

    expect(result.current.error).not.toBeNull(); // still failing, a fresh error object each time
    expect(result.current.refresh).toBe(firstRefresh);
  });

  it('a signed-out refresh still short-circuits with NOT_AUTHENTICATED and issues no network call', async () => {
    mockTabs({});
    const { result, mount } = setup();
    await mount();
    expect(EventsApi.getEvents).toHaveBeenCalledTimes(3);

    EventsApi.isAuthenticated.mockReturnValue(false);
    await act(async () => {
      result.current.refresh();
    });
    await act(async () => {});

    expect(EventsApi.getEvents).toHaveBeenCalledTimes(3); // no new calls on refresh
    expect(result.current.error).toMatchObject({ code: 'NOT_AUTHENTICATED' });
    expect(result.current.upcoming).toEqual([]);
    expect(result.current.past).toEqual([]);
  });
});
