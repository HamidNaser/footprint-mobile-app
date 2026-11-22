/**
 * 019 T007 -- `usePeopleCalendar`, the hook that holds one open book (data-model; research R6,
 * R7, R10).
 *
 * These cases are the specification of the hook's behaviour, and the ones that matter most are
 * the states that are easy to collapse into each other:
 *
 * - **"could not load" is never "nobody recorded anything"** (CLAUDE.md *Sharing fails closed*,
 *   FR-011). A failed index reports `openFailed`, never `bookEmpty`; a failed page leaves
 *   `presentIds` null so no face is dimmed (FR-010).
 * - **two indexes, not one** (data-model *CalendarIndex*): `bookIndex` covers everyone the book
 *   covers, `index` the chosen people -- and with nobody chosen the second one is `bookIndex`
 *   itself, with no second request (FR-017).
 * - **a page is fetched for everyone, the choice filters on the phone** (R7). Only the index is
 *   re-asked per choice.
 * - **"empty" means no rows at any precision** (`years.size === 0`), never `days.size === 0`:
 *   somebody whose memories are all dated to a month alone has no days and is not empty.
 *
 * The service is mocked (T004's own suite covers it); `calendarModel` and `journalDate` are the
 * real ones, because what is under test here is the hook's behaviour through them, not that it
 * called them.
 */

jest.mock('../../services/JournalCalendarService', () => ({
  getCalendar: jest.fn(),
  getPeriod: jest.fn(),
}));

// The real context pulls in storage, the API client and the token bridge, none of which this
// hook's behaviour depends on: it needs one access token.
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ accessToken: 'token-1' }),
}));

import React from 'react';
import renderer, { act } from 'react-test-renderer';

import { getCalendar, getPeriod } from '../../services/JournalCalendarService';
import { usePeopleCalendar } from '../usePeopleCalendar';

global.IS_REACT_ACT_ENVIRONMENT = true;

const PEOPLE = [
  { id: 'u1', name: 'Mother', avatarUrl: null, position: 0 },
  { id: 'u2', name: 'Akram', avatarUrl: null, position: 1 },
];

/** A calendar row as `/journal/calendar` returns it, and `buildIndex` reads it. */
const row = (date, precision = 'day', count = 1) => ({ date, precision, count });

/** An entry as `adaptEntry` returns it -- `localId`, `date`, `datePrecision`, `createdAt`. */
const entry = (overrides = {}) => ({
  localId: 'e-1',
  serverId: 'e-1',
  userId: 'u1',
  date: '2026-03-05',
  datePrecision: 'day',
  createdAt: 1000,
  contentBlocks: [],
  ...overrides,
});

/**
 * The index each list of people gets, keyed by their ids sorted and joined -- so a case can
 * give the book one index and the chosen people another, which is the whole of `bookIndex`
 * against `index`. A value that is an `Error` is thrown instead.
 */
function calendarReturns(byIds, fallback = []) {
  getCalendar.mockImplementation(async (token, ids) => {
    const key = [...ids].sort().join(',');
    const answer = Object.prototype.hasOwnProperty.call(byIds, key) ? byIds[key] : fallback;
    if (answer instanceof Error) throw answer;
    return { authorIds: ids, days: answer };
  });
}

/** `getPeriod`'s answer, decided per call from its own arguments. */
function periodReturns(answer) {
  getPeriod.mockImplementation(async (token, args) => (
    typeof answer === 'function' ? answer(args) : answer
  ));
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Mount the hook inside a probe component and keep its latest return value.
 *
 * `flush` runs several `act` passes: a book opens through two chained awaits (the index, then
 * the period the index decided to open on), and each one's `setState` needs its own pass.
 */
function setup(options) {
  const out = { current: null };
  let props = { loadDay: async () => [], ...options };
  let tree = null;

  const Probe = ({ o }) => {
    out.current = usePeopleCalendar(o);
    return null;
  };

  const flush = async (times = 5) => {
    for (let i = 0; i < times; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {});
    }
  };

  return {
    result: out,
    flush,
    mount: async () => {
      await act(async () => {
        tree = renderer.create(<Probe o={props} />);
      });
      await flush();
    },
    /** What a parent re-render with changed inputs does. */
    update: async (next) => {
      props = { ...props, ...next };
      await act(async () => {
        tree.update(<Probe o={props} />);
      });
      await flush();
    },
    /** A plain re-render with the same inputs, in a brand-new props object. */
    rerender: async () => {
      props = { ...props };
      await act(async () => {
        tree.update(<Probe o={props} />);
      });
      await flush();
    },
    /** Call one of the hook's own callbacks and let everything it starts settle. */
    run: async (fn) => {
      await act(async () => {
        fn(out.current);
      });
      await flush();
    },
  };
}

beforeEach(() => {
  getCalendar.mockReset();
  getPeriod.mockReset();
  calendarReturns({});
  periodReturns([]);
});

// ---------------------------------------------------------------------------
// Opening (R10, data-model *Opening period*)
// ---------------------------------------------------------------------------

describe('opening the book', () => {
  it('opens on the newest day-dated day, not on a 1st that holds only month-dated memories', async () => {
    // 1 April is in the index as a month, so it is reached through April -- never landed on
    // (016 FR-016). The newest day a reader can stand on is 5 March.
    calendarReturns({ 'u1,u2': [row('2026-03-05'), row('2026-04-01', 'month', 2)] });
    const loadDay = jest.fn(async () => []);
    const { result, mount } = setup({ people: PEOPLE, chosen: [], loadDay });
    await mount();

    expect(result.current.selectedDay).toBe('2026-03-05');
    expect(result.current.picked).toBeNull();
    expect(result.current.periodKind).toBe('day');
    expect(loadDay).toHaveBeenCalledWith('2026-03-05');
    expect(result.current.openFailed).toBe(false);
  });

  it('opens a book of only month-dated memories on its newest month, as a month page', async () => {
    calendarReturns({
      'u1,u2': [row('2026-02-01', 'month', 1), row('2026-03-01', 'month', 2)],
    });
    const loadDay = jest.fn(async () => []);
    const { result, mount } = setup({ people: PEOPLE, chosen: [], loadDay });
    await mount();

    expect(result.current.picked).toEqual({ kind: 'month', year: 2026, month: 3 });
    expect(result.current.selectedDay).toBeNull();
    expect(result.current.label).toBe('March 2026');
    expect(loadDay).not.toHaveBeenCalled();
    expect(getPeriod).toHaveBeenCalledWith('token-1', {
      authorIds: ['u1', 'u2'],
      from: '2026-03-01',
      to: '2026-03-31',
      precision: 'month',
    });
  });

  it('opens a book of only year-dated memories on its newest year, as a year page', async () => {
    calendarReturns({ 'u1,u2': [row('2025-06-04', 'year', 3)] });
    const { result, mount } = setup({ people: PEOPLE, chosen: [] });
    await mount();

    expect(result.current.picked).toEqual({ kind: 'year', year: 2025 });
    expect(result.current.label).toBe('2025');
  });

  it('reports openFailed, and never bookEmpty, when the index fails as the book opens', async () => {
    // Fails closed (CLAUDE.md): with no index there is no day to open on and emptiness cannot
    // be known, so the screen shows its own failure text -- never "nobody has recorded anything".
    calendarReturns({ 'u1,u2': new Error('offline') });
    const loadDay = jest.fn(async () => []);
    const { result, mount } = setup({ people: PEOPLE, chosen: [], loadDay });
    await mount();

    expect(result.current.openFailed).toBe(true);
    expect(result.current.bookEmpty).toBe(false);
    expect(result.current.choiceEmpty).toBe(false);
    expect(result.current.picked).toBeNull();
    expect(result.current.selectedDay).toBeNull();
    expect(result.current.indexStatus).toBe('failed');
    expect(result.current.index).toBeNull();
    expect(loadDay).not.toHaveBeenCalled();
    expect(getPeriod).not.toHaveBeenCalled();
  });

  it('asks nothing at all, and reports bookEmpty, for a book with nobody in it', async () => {
    const { result, mount } = setup({ people: [], chosen: [] });
    await mount();

    expect(getCalendar).not.toHaveBeenCalled();
    expect(getPeriod).not.toHaveBeenCalled();
    expect(result.current.bookEmpty).toBe(true);
    expect(result.current.loading).toBe(false);
  });

  it('is loading, never bookEmpty, while the screen is still reading its people', async () => {
    const { result, mount } = setup({ people: [], chosen: [], peopleLoading: true });
    await mount();

    expect(result.current.loading).toBe(true);
    expect(result.current.bookEmpty).toBe(false);
    expect(getCalendar).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Two indexes (data-model *CalendarIndex*; FR-017, R7)
// ---------------------------------------------------------------------------

describe('the index and the choice', () => {
  it('asks for one index only when nobody is chosen', async () => {
    calendarReturns({ 'u1,u2': [row('2026-03-05')] });
    const { mount } = setup({ people: PEOPLE, chosen: [] });
    await mount();

    expect(getCalendar).toHaveBeenCalledTimes(1);
    expect(getCalendar).toHaveBeenCalledWith('token-1', ['u1', 'u2']);
  });

  it('asks the index for the chosen people and the page for everyone', async () => {
    calendarReturns({
      'u1,u2': [row('2026-03-05'), row('2026-03-09')],
      u1: [row('2026-03-05')],
    });
    const { result, mount, run } = setup({ people: PEOPLE, chosen: ['u1'] });
    await mount();

    expect(getCalendar).toHaveBeenCalledWith('token-1', ['u1', 'u2']);
    expect(getCalendar).toHaveBeenCalledWith('token-1', ['u1']);
    expect(getCalendar).toHaveBeenCalledTimes(2);

    await run((hook) => hook.pick({ kind: 'month', year: 2026, month: 3 }));

    // R7: the page covers everyone the book covers, never the chosen ids.
    expect(getPeriod).toHaveBeenCalledWith('token-1', expect.objectContaining({
      authorIds: ['u1', 'u2'],
    }));
    expect(result.current.picked).toEqual({ kind: 'month', year: 2026, month: 3 });
  });

  it('re-asks only the index when the choice changes, never the page', async () => {
    calendarReturns({
      'u1,u2': [row('2026-03-01', 'month', 2)],
      u1: [row('2026-03-01', 'month', 1)],
    });
    periodReturns([entry()]);
    const { result, mount, update } = setup({ people: PEOPLE, chosen: [] });
    await mount();

    const pagesBefore = getPeriod.mock.calls.length;
    expect(pagesBefore).toBeGreaterThan(0);

    await update({ chosen: ['u1'] });

    expect(getCalendar).toHaveBeenCalledWith('token-1', ['u1']);
    expect(getPeriod).toHaveBeenCalledTimes(pagesBefore);
    expect(result.current.picked).toEqual({ kind: 'month', year: 2026, month: 3 });
  });

  it('never hands back a partial index, and keeps stepping over the book, when the chosen index fails', async () => {
    // FR-011 and *Sharing fails closed*: the sheet must not open on a half-read calendar, and
    // ◄ ► must not stop dead as though the end of the book had been reached.
    calendarReturns({
      'u1,u2': [row('2026-03-05'), row('2026-03-09')],
      u1: new Error('offline'),
    });
    const { result, mount, run } = setup({ people: PEOPLE, chosen: ['u1'] });
    await mount();

    expect(result.current.indexStatus).toBe('failed');
    expect(result.current.index).toBeNull();
    expect(result.current.bookEmpty).toBe(false);
    expect(result.current.choiceEmpty).toBe(false);
    expect(result.current.selectedDay).toBe('2026-03-09');
    expect(result.current.hasPrevious).toBe(true);

    await run((hook) => hook.step(-1));
    expect(result.current.selectedDay).toBe('2026-03-05');
  });

  it('separates bookEmpty from choiceEmpty', async () => {
    calendarReturns({
      'u1,u2': [row('2026-03-05')],
      u2: [],
    });
    const { result, mount, update } = setup({ people: PEOPLE, chosen: [] });
    await mount();

    expect(result.current.bookEmpty).toBe(false);
    expect(result.current.choiceEmpty).toBe(false);

    await update({ chosen: ['u2'] });

    expect(result.current.bookEmpty).toBe(false);
    expect(result.current.choiceEmpty).toBe(true);
    expect(result.current.emptyMessage).toBe('Nothing from Akram yet');
  });

  it('reports bookEmpty, and no calendar, for a book nobody has written in', async () => {
    calendarReturns({ 'u1,u2': [] });
    const { result, mount } = setup({ people: PEOPLE, chosen: [] });
    await mount();

    expect(result.current.bookEmpty).toBe(true);
    expect(result.current.choiceEmpty).toBe(false);
    expect(result.current.picked).toBeNull();
    expect(result.current.selectedDay).toBeNull();
    expect(getPeriod).not.toHaveBeenCalled();
  });

  it('does not call a chosen person with only month-dated memories empty', async () => {
    // `days.size === 0` and yet there is plenty to read: "empty" is `years.size === 0`.
    calendarReturns({
      'u1,u2': [row('2026-03-05')],
      u1: [row('2026-03-01', 'month', 4)],
    });
    const { result, mount } = setup({ people: PEOPLE, chosen: ['u1'] });
    await mount();

    expect(result.current.index.days.size).toBe(0);
    expect(result.current.choiceEmpty).toBe(false);
    expect(result.current.bookEmpty).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The page (data-model *PeriodPage*; R7)
// ---------------------------------------------------------------------------

describe('the page', () => {
  it('asks a whole year at both precisions, so a year-only memory stored mid-year is listed', async () => {
    // A year-only memory may be stored on any day of its year, so asking 1 January alone would
    // count it in the index and then fail to list it.
    calendarReturns({ 'u1,u2': [row('2026-07-13', 'year', 1)] });
    periodReturns(({ precision }) => (precision === 'year'
      ? [entry({ localId: 'e-year', date: '2026-07-13', datePrecision: 'year' })]
      : []));
    const { result, mount } = setup({ people: PEOPLE, chosen: [] });
    await mount();

    expect(result.current.picked).toEqual({ kind: 'year', year: 2026 });
    expect(getPeriod).toHaveBeenCalledWith('token-1', {
      authorIds: ['u1', 'u2'],
      from: '2026-01-01',
      to: '2026-12-31',
      precision: 'month',
    });
    expect(getPeriod).toHaveBeenCalledWith('token-1', {
      authorIds: ['u1', 'u2'],
      from: '2026-01-01',
      to: '2026-12-31',
      precision: 'year',
    });
    const keys = result.current.rows.filter((r) => r.kind === 'entry').map((r) => r.key);
    expect(keys).toContain('e-year');
  });

  it('asks a month page for the days that month really has, leap year included', async () => {
    // Built from parts (`daysInMonth`), never from a civil string through `new Date`.
    calendarReturns({ 'u1,u2': [row('2024-02-01', 'month', 1)] });
    const { mount } = setup({ people: PEOPLE, chosen: [] });
    await mount();

    expect(getPeriod).toHaveBeenCalledWith('token-1', {
      authorIds: ['u1', 'u2'],
      from: '2024-02-01',
      to: '2024-02-29',
      precision: 'month',
    });
  });

  it('shows only the chosen people, counts only them, but reads presence from everyone', async () => {
    calendarReturns({
      'u1,u2': [row('2026-03-05', 'day', 2)],
      u1: [row('2026-03-05')],
    });
    const loadDay = jest.fn(async () => [
      entry({ localId: 'mine', userId: 'u1', createdAt: 100 }),
      entry({ localId: 'theirs', userId: 'u2', createdAt: 200 }),
    ]);
    const { result, mount } = setup({ people: PEOPLE, chosen: ['u1'], loadDay });
    await mount();

    expect(result.current.entries.map((e) => e.localId)).toEqual(['mine']);
    expect(result.current.count).toBe(1);
    // FR-010: Akram wrote that day, so his face is not dimmed even though he is not chosen.
    expect([...result.current.presentIds].sort()).toEqual(['u1', 'u2']);
  });

  it('leaves presentIds null while the page is loading, so no face is dimmed', async () => {
    calendarReturns({ 'u1,u2': [row('2026-03-05')] });
    const pending = deferred();
    const loadDay = jest.fn(() => pending.promise);
    const { result, mount, flush } = setup({ people: PEOPLE, chosen: [], loadDay });
    await mount();

    expect(result.current.pageStatus).toBe('loading');
    expect(result.current.presentIds).toBeNull();
    expect(result.current.count).toBeNull();

    await act(async () => {
      pending.resolve([entry({ userId: 'u2' })]);
    });
    await flush();

    expect(result.current.pageStatus).toBe('ready');
    expect([...result.current.presentIds]).toEqual(['u2']);
  });

  it('leaves presentIds null after the page fails, so no face is dimmed', async () => {
    calendarReturns({ 'u1,u2': [row('2026-03-05')] });
    const loadDay = jest.fn(async () => {
      throw new Error('offline');
    });
    const { result, mount } = setup({ people: PEOPLE, chosen: [], loadDay });
    await mount();

    expect(result.current.pageStatus).toBe('failed');
    expect(result.current.pageError).toBeTruthy();
    expect(result.current.presentIds).toBeNull();
    expect(result.current.count).toBeNull();
    expect(result.current.bookEmpty).toBe(false);
  });

  it('drops a response that arrives after the book has changed', async () => {
    const slow = deferred();
    getCalendar.mockImplementation(async (token, ids) => {
      if (ids.length === 2) return slow.promise;
      return { authorIds: ids, days: [row('2026-05-20')] };
    });
    const { result, mount, update, flush } = setup({ people: PEOPLE, chosen: [] });
    await mount();

    expect(result.current.selectedDay).toBeNull();

    // A third member joins: a new book index, which answers first.
    await update({ people: [...PEOPLE, { id: 'u3', name: 'Father', position: 2 }] });
    expect(result.current.selectedDay).toBe('2026-05-20');

    // The first book's answer lands late and must change nothing.
    await act(async () => {
      slow.resolve({ authorIds: ['u1', 'u2'], days: [row('2020-01-01')] });
    });
    await flush();

    expect(result.current.selectedDay).toBe('2026-05-20');
  });
});

// ---------------------------------------------------------------------------
// Order within a day (FR-009; R6, data-model *dayOrder*)
// ---------------------------------------------------------------------------

describe('order within a day', () => {
  const dayFixture = () => {
    calendarReturns({ 'u1,u2': [row('2026-03-05', 'day', 2)] });
    // `getDay`'s own order: the month call's entries first, then the year call's -- the
    // server's precision-first order, which is not the page's.
    return jest.fn(async () => [
      entry({ localId: 'late', userId: 'u2', createdAt: 300, datePrecision: 'month' }),
      entry({ localId: 'early', userId: 'u1', createdAt: 100, datePrecision: 'year' }),
    ]);
  };

  it("'newestFirst' lists a day newest first by createdAt", async () => {
    const loadDay = dayFixture();
    const { result, mount } = setup({
      people: PEOPLE,
      chosen: [],
      loadDay,
      dayOrder: 'newestFirst',
    });
    await mount();

    expect(result.current.entries.map((e) => e.localId)).toEqual(['late', 'early']);
  });

  it("'compareInDay' lists a day in household order", async () => {
    const loadDay = dayFixture();
    const position = (id) => PEOPLE.findIndex((p) => p.id === id);
    const { result, mount } = setup({
      people: PEOPLE,
      chosen: [],
      loadDay,
      dayOrder: 'compareInDay',
      compareInDay: (a, b) => position(a.userId) - position(b.userId)
        || a.createdAt - b.createdAt,
    });
    await mount();

    expect(result.current.entries.map((e) => e.localId)).toEqual(['early', 'late']);
  });
});

// ---------------------------------------------------------------------------
// Picking, stepping and the open months (FR-006, FR-007, FR-014)
// ---------------------------------------------------------------------------

describe('picking and stepping', () => {
  it('steps over days with memories and reports both ends', async () => {
    calendarReturns({ 'u1,u2': [row('2026-03-05'), row('2026-03-09')] });
    const { result, mount, run } = setup({ people: PEOPLE, chosen: [] });
    await mount();

    expect(result.current.selectedDay).toBe('2026-03-09');
    expect(result.current.hasNext).toBe(false);
    expect(result.current.hasPrevious).toBe(true);

    await run((hook) => hook.step(-1));
    expect(result.current.selectedDay).toBe('2026-03-05');
    expect(result.current.hasPrevious).toBe(false);
    expect(result.current.hasNext).toBe(true);

    // A step at the end of the book changes nothing.
    await run((hook) => hook.step(-1));
    expect(result.current.selectedDay).toBe('2026-03-05');
  });

  it('steps over months and years with memories, skipping the empty ones', async () => {
    calendarReturns({
      'u1,u2': [row('2026-03-05'), row('2026-01-11'), row('2024-08-08')],
    });
    const { result, mount, run } = setup({ people: PEOPLE, chosen: [] });
    await mount();

    await run((hook) => hook.pick({ kind: 'month', year: 2026, month: 3 }));
    expect(result.current.picked).toEqual({ kind: 'month', year: 2026, month: 3 });
    expect(result.current.hasNext).toBe(false);

    // February 2026 holds nothing, so ◄ reaches January.
    await run((hook) => hook.step(-1));
    expect(result.current.picked).toEqual({ kind: 'month', year: 2026, month: 1 });
    await run((hook) => hook.step(-1));
    expect(result.current.picked).toEqual({ kind: 'month', year: 2024, month: 8 });
    expect(result.current.hasPrevious).toBe(false);

    await run((hook) => hook.pick({ kind: 'year', year: 2026 }));
    expect(result.current.label).toBe('2026');
    // 2025 holds nothing: ◄ steps to 2024.
    await run((hook) => hook.step(-1));
    expect(result.current.picked).toEqual({ kind: 'year', year: 2024 });
    expect(result.current.hasPrevious).toBe(false);
    expect(result.current.hasNext).toBe(true);
  });

  it('takes a day pick from the sheet, and refuses one it cannot read', async () => {
    calendarReturns({ 'u1,u2': [row('2026-03-05'), row('2026-03-09')] });
    const { result, mount, run } = setup({ people: PEOPLE, chosen: [] });
    await mount();

    await run((hook) => hook.pick({ kind: 'day', date: '2026-03-05' }));
    expect(result.current.selectedDay).toBe('2026-03-05');
    expect(result.current.picked).toBeNull();

    // A two-digit year is a period nothing can be read for: the pick changes nothing at all.
    await run((hook) => hook.pick({ kind: 'month', year: 26, month: 3 }));
    expect(result.current.selectedDay).toBe('2026-03-05');
    expect(result.current.picked).toBeNull();
  });

  it('opens a picked year on its first month heading, and toggleMonth opens and closes one', async () => {
    calendarReturns({ 'u1,u2': [row('2026-03-05'), row('2026-05-20')] });
    periodReturns(({ precision }) => (precision === 'month'
      ? [
        entry({ localId: 'march', date: '2026-03-05' }),
        entry({ localId: 'may', date: '2026-05-20' }),
      ]
      : []));
    const { result, mount, run } = setup({ people: PEOPLE, chosen: [] });
    await mount();

    await run((hook) => hook.pick({ kind: 'year', year: 2026 }));

    const entryKeys = () => result.current.rows
      .filter((r) => r.kind === 'entry')
      .map((r) => r.key);
    expect([...result.current.openMonths]).toEqual(['2026-03']);
    expect(entryKeys()).toEqual(['march']);
    expect(result.current.stickyIndices.length).toBe(2);

    await run((hook) => hook.toggleMonth('2026-05'));
    expect(entryKeys()).toEqual(['march', 'may']);

    await run((hook) => hook.toggleMonth('2026-03'));
    expect(entryKeys()).toEqual(['may']);
  });
});

// ---------------------------------------------------------------------------
// Refresh, people changes and the empty message (FR-015, FR-017, FR-018)
// ---------------------------------------------------------------------------

describe('refresh and changes of people', () => {
  it('reloads both indexes and the page, keeping the choice and the picked period', async () => {
    calendarReturns({
      'u1,u2': [row('2026-03-01', 'month', 2)],
      u1: [row('2026-03-01', 'month', 1)],
    });
    periodReturns([entry()]);
    const { result, mount, run } = setup({ people: PEOPLE, chosen: ['u1'] });
    await mount();

    const indexes = getCalendar.mock.calls.length;
    const pages = getPeriod.mock.calls.length;
    expect(indexes).toBe(2);

    await run((hook) => hook.refresh());

    expect(getCalendar.mock.calls.length).toBe(indexes + 2);
    expect(getPeriod.mock.calls.length).toBeGreaterThan(pages);
    expect(result.current.picked).toEqual({ kind: 'month', year: 2026, month: 3 });
  });

  it('re-asks the book index when the set of people changes, and keeps the picked period', async () => {
    calendarReturns({}, [row('2026-03-05')]);
    const { result, mount, update, rerender } = setup({ people: PEOPLE, chosen: [] });
    await mount();

    expect(result.current.selectedDay).toBe('2026-03-05');
    expect(getCalendar).toHaveBeenCalledTimes(1);

    await update({ people: [...PEOPLE, { id: 'u3', name: 'Father', position: 2 }] });
    expect(getCalendar).toHaveBeenCalledTimes(2);
    expect(getCalendar).toHaveBeenLastCalledWith('token-1', ['u1', 'u2', 'u3']);
    expect(result.current.selectedDay).toBe('2026-03-05');

    // The same people in another order, and then the same people in a new array: the same
    // book, so nothing is re-asked.
    await update({ people: [PEOPLE[1], PEOPLE[0], { id: 'u3', name: 'Father', position: 2 }] });
    await rerender();
    expect(getCalendar).toHaveBeenCalledTimes(2);
  });

  it('drops a chosen id whose person has left the book', async () => {
    calendarReturns({}, [row('2026-03-05')]);
    const { result, mount, update } = setup({ people: PEOPLE, chosen: ['u2'] });
    await mount();

    expect(getCalendar).toHaveBeenCalledWith('token-1', ['u2']);

    await update({ people: [PEOPLE[0]] });

    // Nobody in the book is chosen any more, so the index is the book's own -- and nothing is
    // ever asked about a person who is no longer here.
    expect(getCalendar).not.toHaveBeenCalledWith('token-1', []);
    expect(result.current.choiceEmpty).toBe(false);
    expect(result.current.emptyMessage).toBeNull();
  });

  it('names the chosen people in the empty message, per period', async () => {
    calendarReturns({}, [row('2026-03-05'), row('2026-03-09')]);
    periodReturns([entry({ userId: 'u2' })]);
    const loadDay = async () => [entry({ userId: 'u2' })];
    const { result, mount, run } = setup({ people: PEOPLE, chosen: ['u1'], loadDay });
    await mount();

    expect(result.current.entries).toEqual([]);
    expect(result.current.emptyMessage).toBe('Nothing from Mother on this day');

    await run((hook) => hook.pick({ kind: 'month', year: 2026, month: 3 }));
    expect(result.current.emptyMessage).toBe('Nothing from Mother in this month');

    await run((hook) => hook.pick({ kind: 'year', year: 2026 }));
    expect(result.current.emptyMessage).toBe('Nothing from Mother in this year');
  });

  it('says nothing about an empty period when nobody is chosen', async () => {
    // With nobody chosen ◄ ► only land on periods with memories, so there is no named
    // message to show -- and the screen's own whole-book text is not this hook's to pick.
    calendarReturns({}, [row('2026-03-05')]);
    const { result, mount } = setup({ people: PEOPLE, chosen: [], loadDay: async () => [] });
    await mount();

    expect(result.current.entries).toEqual([]);
    expect(result.current.emptyMessage).toBeNull();
  });

  it('names two chosen people together', async () => {
    calendarReturns({}, [row('2026-03-05')]);
    const { result, mount } = setup({
      people: PEOPLE,
      chosen: ['u1', 'u2'],
      loadDay: async () => [],
    });
    await mount();

    expect(result.current.emptyMessage).toBe('Nothing from Mother and Akram on this day');
  });
});
