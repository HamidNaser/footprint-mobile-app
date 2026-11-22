/**
 * usePeopleCalendar -- the state of one open book on the Family and Friends screens (019 T007;
 * research R6, R7, R10; `data-model.md`).
 *
 * One book is a list of people (`BookPerson[]`, data-model), and everything these two screens
 * draw about it lives here: the calendar's index, which period is picked, that period's
 * memories, the rows a month or a year list is made of, who of the book's people is present in
 * the period, the loading/empty/failure states, and refresh. `PersonJournalScreen` and
 * `FamilySummaryScreen` draw what it answers and keep no calendar state of their own.
 *
 * ## Two indexes, not one (data-model *CalendarIndex*, FR-017)
 *
 * - **`bookIndex`** is the index for **everyone** the book covers. It is fetched once per book
 *   (and again on refresh), and it is what the book opens on, what "is this book empty?" is
 *   answered from, and what ◄ ► fall back to.
 * - **`index`** is the index for the **covered ids** -- the chosen people if any are chosen,
 *   and otherwise `bookIndex` *itself*, with **no second request**. Nobody chosen is the normal
 *   case, and it must cost one call, not two.
 *
 * ## The rules that are easy to get subtly wrong, and why each is written the way it is
 *
 * - **A page is fetched for everyone in the book; the choice filters on the phone** (R7). The
 *   faces row must dim a face that has nothing in the shown period whether or not it is chosen
 *   (FR-010), which needs every covered person's memories; and choosing a face then changes the
 *   list with no new fetch. Only the *index* is re-asked per choice.
 * - **"Empty" means no rows at any precision** -- `years.size === 0`, which every row of every
 *   precision reaches -- and **never** `days.size === 0`. Somebody whose memories are all dated
 *   to a month alone has no days at all and has plenty to read.
 * - **`bookEmpty` and `choiceEmpty` are different states**, reported separately (analyze I2).
 *   `bookEmpty`: no calendar, no faces, the screen's whole-book message. `choiceEmpty`: the
 *   faces stay, the sheet opens with every day faded, and the page says "Nothing from <names>
 *   yet".
 * - **A failed index is never a partial index, and never "empty"** (FR-011; CLAUDE.md *Sharing
 *   fails closed*). `index` is null unless it is ready, so the sheet cannot open on a half-read
 *   calendar. If `bookIndex` fails as the book opens there is no day to open on *and* emptiness
 *   cannot be known: `openFailed`, never `bookEmpty`. If only the chosen people's index fails,
 *   ◄ ► step over `bookIndex`, so the arrows never read as the end of the book.
 * - **`presentIds` is null while the page is loading and after it failed** (FR-010), so no face
 *   is dimmed. Dimming on a failure would render "could not load" as "recorded nothing".
 * - **A year page asks the whole year** at both precisions: a year-only memory may be stored on
 *   any day of its year, so asking 1 January alone would count it in the index and then fail to
 *   list it.
 * - **A screen still reading its people passes `peopleLoading: true`** and gets `loading`, never
 *   `bookEmpty`: a household that has not arrived is not an empty household.
 * - **A civil date is a day, never an instant** (CLAUDE.md). Every date here is a `'YYYY-MM-DD'`
 *   key or is built from calendar parts (`monthKey`, `daysInMonth`); no date string is ever
 *   passed to `new Date`, which would read a day early west of Greenwich.
 *
 * ## Inputs
 *
 * @param {object} options
 * @param {Array<{id: string, name?: string}>} options.people - the book's people, in book order,
 *   already de-duplicated and capped at the look-ups' 50 by the screen (data-model *Book*). A
 *   person without an account is never in this list.
 * @param {string[]} [options.chosen] - the chosen `BookPerson.id`s; empty means everyone
 *   (FR-016). Held by the screen (T013), because it is the faces row that changes it. Ids that
 *   are not in `people` are ignored, so a member who has left the book is never asked about.
 * @param {(day: string) => Promise<Array>} options.loadDay - the book's own way of reading one
 *   civil day, bound by the screen to **everyone in the book** (R5, R7): two period calls on a
 *   person, a friend group or a head-card household, and the one-day `/journal/book` on the
 *   family book. ⚠ **Its entries must carry `userId`**, which is what the choice filters on and
 *   what presence is read from; `adaptEntry` sets it on both routes.
 * @param {(a: object, b: object) => number} [options.compareInDay] - orders memories within one
 *   day (and a month's month-only group) in a month or year list: household position, then
 *   `createdAt`, on the family book and a head-card household. Omitted elsewhere, so those
 *   lists keep 016's `createdAt` order (R6).
 * @param {'newestFirst'|'compareInDay'} [options.dayOrder] - how a *single day* is ordered:
 *   newest first by `createdAt` for a person or a friend group (016 FR-004), or by
 *   `compareInDay` for a head-card household and the family book, whose day the server returns
 *   in household order with no tie-break (R6, FR-009). `getDay` and `/journal/book` both answer
 *   in an order that is **not** the page's, so the hook sorts either way.
 * @param {boolean} [options.peopleLoading] - the screen has not finished reading who is in the
 *   book yet.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '../context/AuthContext';
import { getCalendar, getPeriod } from '../services/JournalCalendarService';
import {
  buildIndex,
  buildRows,
  dayKeyOf,
  daysInMonth,
  fourDigitYear,
  monthKey,
  neighbourMonth,
  neighbourYear,
} from '../utils/calendarModel';
import { adjacentDateKey } from '../utils/journalDate';
import { formatPeriodDate } from '../utils/periodDate';

/** One shared empty `Set`, so "nothing open" never allocates and never changes identity. */
const NO_OPEN_MONTHS = new Set();

/** The state an index or a page is in before anything has been read for the current key. */
const LOADING_INDEX = { status: 'loading', index: null, error: null, key: null };
const LOADING_PAGE = { status: 'loading', entries: null, error: null, key: null };

const EMPTY_ENTRIES = [];
const EMPTY_ROWS = { rows: [], stickyIndices: [], open: NO_OPEN_MONTHS };

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * The ids of the people a book covers: in book order, de-duplicated, anything that is not a
 * non-empty string dropped. The screens already do this (two tree nodes can link to one
 * account), and it is done again here because an id repeated in a request would be counted
 * twice by nothing and a blank one would be a 400.
 */
function idsOf(people) {
  const seen = new Set();
  const ids = [];
  (Array.isArray(people) ? people : []).forEach((person) => {
    const id = person?.id;
    if (typeof id !== 'string' || id === '' || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  });
  return ids;
}

/**
 * A key that changes when the **set** of ids changes and not when their order does (R10): a
 * member joining or leaving is a different book and is re-asked; the same household read again
 * in another order is the same book and is not.
 */
const keyOf = (ids) => [...ids].sort().join(',');

/** The newest key of a counts map, or null. `YYYY-MM-DD`, `YYYY-MM` and `YYYY` all sort as they date. */
function newestKey(map) {
  if (!(map instanceof Map)) return null;
  let newest = null;
  map.forEach((_count, key) => {
    if (newest === null || key > newest) newest = key;
  });
  return newest;
}

/**
 * Where a book opens (R10, data-model *Opening period*): `bookIndex`'s newest **day-dated** key.
 *
 * `index.days` counts day-dated memories only, so a 1st holding nothing but month-dated
 * memories is never landed on -- it is reached through its month (016 FR-016). With no
 * day-dated memory at all the book opens on its newest month as a month page, or on its newest
 * year as a year page when every memory is known only to its year (spec edge case).
 *
 * Null for an index with no rows at all, which is `bookEmpty`, and for no index, which is a
 * failure -- the caller tells those two apart by the index's own state, never by this answer.
 */
function openingPeriod(index) {
  if (!index) return null;

  const day = newestKey(index.days);
  if (day) return { kind: 'day', day };

  const month = newestKey(index.months);
  if (month) {
    return {
      kind: 'month',
      year: Number(month.slice(0, 4)),
      month: Number(month.slice(5, 7)),
      day: null,
    };
  }

  const year = newestKey(index.years);
  if (year) return { kind: 'year', year: Number(year), day: null };

  return null;
}

/**
 * The civil-date range a period page is asked for, **built from calendar parts** -- `monthKey`
 * and `daysInMonth`, never a string through `new Date`. A month ends on the day that month
 * really has (29 February in a leap year); a year runs 1 January to 31 December, which is also
 * the server's own maximum range.
 *
 * Null for a period nothing can be read for, which is the same refusal `monthRows` and
 * `neighbourMonth` make: a period this cannot read is a period that never becomes the one on
 * screen.
 */
function rangeFor(period) {
  if (period?.kind === 'year') {
    if (!fourDigitYear(period.year)) return null;
    return { from: `${period.year}-01-01`, to: `${period.year}-12-31` };
  }

  if (period?.kind !== 'month') return null;
  const { year, month } = period;
  if (!fourDigitYear(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;

  const key = monthKey(year, month);
  return { from: `${key}-01`, to: `${key}-${pad2(daysInMonth(year, month))}` };
}

/**
 * What the date bar calls a picked period -- "March 2026", or "2026" -- through the one function
 * that words this feature's dates, so the bar and a month heading cannot word a month
 * differently (016 FR-007).
 */
function periodWords(picked) {
  const range = rangeFor(picked);
  return range ? formatPeriodDate(range.from, picked.kind) : null;
}

/** How the named empty message ends, per period (spec edge case). */
function periodPhrase(period) {
  if (period?.kind === 'month') return 'in this month';
  if (period?.kind === 'year') return 'in this year';
  return 'on this day';
}

/**
 * "Mother", "Mother and Akram", "Mother, Akram and Father".
 *
 * `FacesRow` words its own caption the same way and keeps its own copy: this hook must not
 * import from a component, and the words are three lines. If a third place ever needs them,
 * that is the moment to give them a home of their own.
 */
function joinNames(names) {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * One day's memories in the order that day is read in (FR-009, R6, data-model *dayOrder*).
 *
 * The sources answer in an order that is **not** the page's -- `getDay` concatenates the month
 * call's entries and the year call's, which is precision first, and `/journal/book` returns a
 * day in household position with no tie-break between one member's memories -- so a day is
 * always sorted here.
 *
 * `'compareInDay'` with no comparator falls back to `createdAt` **ascending**, which is
 * `buildRows`' own default: a book that asked for household order and gave none is better off
 * with its day reading the same way its month list does than with the two disagreeing, which is
 * the whole reason `dayOrder` exists.
 */
function orderedDay(entries, dayOrder, compareInDay) {
  const list = [...entries];
  if (dayOrder === 'compareInDay') {
    if (typeof compareInDay === 'function') return list.sort((a, b) => compareInDay(a, b));
    return list.sort((a, b) => (a?.createdAt ?? 0) - (b?.createdAt ?? 0));
  }
  // 016 FR-004: a single day is newest first. `Array#sort` is stable, so two memories saved in
  // the same millisecond keep the order the server gave them.
  return list.sort((a, b) => (b?.createdAt ?? 0) - (a?.createdAt ?? 0));
}

export function usePeopleCalendar({
  people,
  chosen,
  loadDay,
  compareInDay,
  dayOrder = 'newestFirst',
  peopleLoading = false,
} = {}) {
  const { accessToken } = useAuth();

  // ---------------------------------------------------------------------
  // Who the book covers, and who of them is chosen
  // ---------------------------------------------------------------------

  const bookIds = useMemo(() => idsOf(people), [people]);
  const bookKey = useMemo(() => keyOf(bookIds), [bookIds]);

  /**
   * The chosen ids that are still people in the book. A member who has left is dropped rather
   * than asked about (spec edge case "Someone joins or leaves"), and with nobody left chosen the
   * book reads as everyone again, which is FR-016's own meaning of an empty choice.
   */
  const chosenIds = useMemo(() => {
    const inBook = new Set(bookIds);
    const seen = new Set();
    const ids = [];
    (Array.isArray(chosen) ? chosen : []).forEach((id) => {
      if (!inBook.has(id) || seen.has(id)) return;
      seen.add(id);
      ids.push(id);
    });
    return ids;
  }, [chosen, bookIds]);

  const hasChoice = chosenIds.length > 0;
  // data-model *Chosen*: the covered ids are the chosen people, or everyone.
  const coveredIds = hasChoice ? chosenIds : bookIds;
  const coveredKey = useMemo(() => keyOf(coveredIds), [coveredIds]);

  // ---------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------

  const [bookIndexState, setBookIndexState] = useState(LOADING_INDEX);
  const [choiceIndexState, setChoiceIndexState] = useState(LOADING_INDEX);
  const [pageState, setPageState] = useState(LOADING_PAGE);

  /**
   * The period on screen, as one value rather than 016's two pieces of state, so that "is there
   * a period at all?" has one answer and the opening read below can settle it with a functional
   * update instead of racing a ref. It carries the selected day alongside a picked month or year
   * because 016's date bar keeps showing the day it was last on, and a book that opened on a
   * month page has no day to show at all.
   *
   * `null` means no period: the book has not opened yet, is empty, or its index failed.
   */
  const [period, setPeriod] = useState(null);

  /**
   * Which month headings of a year list are open (016 FR-006), exactly as `JournalScreen` holds
   * it: `null` until somebody taps one, which is what lets the **first** heading be the open one
   * on a freshly picked year -- an answer only the period's own rows can give. Once somebody has
   * tapped, their answer stands, including "all of them closed".
   */
  const [openMonths, setOpenMonths] = useState(null);

  const [reloadKey, setReloadKey] = useState(0);

  /**
   * One epoch per thing that can be in flight, bumped every time its own read starts. Each read
   * captures the value that was current when it began and compares again once its await settles,
   * so a response for a book, a choice or a period that is no longer shown is dropped rather
   * than applied (`FamilySummaryScreen`'s pattern). A shared "cancelled" boolean cannot do this:
   * cleared again when the next read starts, it tells an older in-flight read that it is still
   * current.
   */
  const bookEpochRef = useRef(0);
  const choiceEpochRef = useRef(0);
  const pageEpochRef = useRef(0);

  /**
   * The latest `loadDay`, read through a ref so that a screen passing an arrow function inline
   * -- which every screen does -- cannot re-read the day on every render. Assigned in an effect
   * declared **above** the page's own effect, so it is already the current one by the time that
   * effect runs in the same commit.
   *
   * ⚠ The consequence, deliberately: a `loadDay` that changes **what it does** without the book
   * or the period changing does not re-read the page by itself. On both screens what it does is
   * fixed by the book -- the household's `memberId`, or the book's own ids -- so a change to it
   * comes with a change of people or a new screen; anything else needs `refresh()`.
   */
  const loadDayRef = useRef(loadDay);
  useEffect(() => {
    loadDayRef.current = loadDay;
  });

  // ---------------------------------------------------------------------
  // bookIndex: everyone the book covers, once per book (and on refresh)
  // ---------------------------------------------------------------------

  useEffect(() => {
    bookEpochRef.current += 1;
    const myEpoch = bookEpochRef.current;

    // The screen has not read its people yet. Nothing is asked and nothing is concluded: a
    // household that has not arrived must never read as a household with nothing in it.
    if (peopleLoading) {
      setBookIndexState({ ...LOADING_INDEX, key: bookKey });
      return;
    }

    // Nobody to ask about. No request at all -- the look-ups refuse an empty list, and rightly:
    // omitting `authorIds` would ask about the reader themselves. An index with no rows is
    // exactly the truth here, and it is `bookEmpty`.
    if (bookIds.length === 0) {
      setBookIndexState({ status: 'ready', index: buildIndex([]), error: null, key: bookKey });
      return;
    }

    setBookIndexState({ ...LOADING_INDEX, key: bookKey });

    (async () => {
      try {
        const response = await getCalendar(accessToken, bookIds);
        if (myEpoch !== bookEpochRef.current) return;
        const index = buildIndex(response?.days);
        setBookIndexState({ status: 'ready', index, error: null, key: bookKey });

        /**
         * The opening period, decided from the index that has just landed -- and only when
         * there is no period on screen. A functional update rather than a read of the state,
         * so the decision cannot be made against a render older than this response: a refresh
         * and a member joining both keep the period the reader is on (FR-015, R10), while a
         * retry after `openFailed` has no period and so opens properly.
         */
        setPeriod((previous) => previous ?? openingPeriod(index));
      } catch (error) {
        if (myEpoch !== bookEpochRef.current) return;
        // Failed, with no index: never a partial one, and never "empty" (FR-011).
        setBookIndexState({ status: 'failed', index: null, error, key: bookKey });
      }
    })();
    // `bookIds` is read from the closure rather than depended on: `bookKey` changes with its
    // contents, and an identity that changed with the same contents would re-ask for nothing.
  }, [bookKey, accessToken, reloadKey, peopleLoading]);

  // ---------------------------------------------------------------------
  // index: the covered ids -- or bookIndex itself, with no second request
  // ---------------------------------------------------------------------

  useEffect(() => {
    // Nobody chosen: the covered ids *are* the book's, so the book's own index is the answer
    // (data-model). Asking again would double every book's calls for nothing.
    if (!hasChoice) return;

    choiceEpochRef.current += 1;
    const myEpoch = choiceEpochRef.current;

    setChoiceIndexState({ ...LOADING_INDEX, key: coveredKey });

    (async () => {
      try {
        const response = await getCalendar(accessToken, coveredIds);
        if (myEpoch !== choiceEpochRef.current) return;
        setChoiceIndexState({
          status: 'ready',
          index: buildIndex(response?.days),
          error: null,
          key: coveredKey,
        });
      } catch (error) {
        if (myEpoch !== choiceEpochRef.current) return;
        setChoiceIndexState({ status: 'failed', index: null, error, key: coveredKey });
      }
    })();
  }, [coveredKey, hasChoice, accessToken, reloadKey]);

  /**
   * The states as the current keys see them. A state whose key is not the current one belongs to
   * the book, choice or period that was on screen a moment ago: effects run after the render
   * that changed their inputs, so without this a single render would show the previous period's
   * rows, count and presence as though they were this one's.
   */
  const bookIndexNow = bookIndexState.key === bookKey ? bookIndexState : LOADING_INDEX;
  const indexNow = hasChoice
    ? (choiceIndexState.key === coveredKey ? choiceIndexState : LOADING_INDEX)
    : bookIndexNow;

  // ---------------------------------------------------------------------
  // The page: the shown period's memories, for everyone in the book (R7)
  // ---------------------------------------------------------------------

  /** One key per period *and* book: a member joining changes what the page should hold. */
  const pageKey = useMemo(() => {
    if (!period) return null;
    if (period.kind === 'day') return `${bookKey}|day:${period.day}`;
    if (period.kind === 'month') return `${bookKey}|month:${monthKey(period.year, period.month)}`;
    return `${bookKey}|year:${period.year}`;
  }, [period, bookKey]);

  useEffect(() => {
    pageEpochRef.current += 1;
    const myEpoch = pageEpochRef.current;

    // Nothing to read: no period yet (the book is opening, empty, or its index failed), or
    // nobody to read it for. Left loading rather than answered with an empty page, which would
    // claim a period holds nothing.
    if (!pageKey || peopleLoading || bookIds.length === 0) {
      setPageState({ ...LOADING_PAGE, key: pageKey });
      return;
    }

    setPageState({ ...LOADING_PAGE, key: pageKey });

    (async () => {
      try {
        const entries = await readPeriod(accessToken, period, bookIds, loadDayRef.current);
        if (myEpoch !== pageEpochRef.current) return;
        setPageState({ status: 'ready', entries, error: null, key: pageKey });
      } catch (error) {
        if (myEpoch !== pageEpochRef.current) return;
        // Fails closed: no entries at all, rather than part of a period read as the whole of it.
        setPageState({ status: 'failed', entries: null, error, key: pageKey });
      }
    })();
    // `period` and `bookIds` come from the closure: `pageKey` carries both of them.
  }, [pageKey, accessToken, reloadKey, peopleLoading]);

  const pageNow = pageState.key === pageKey ? pageState : LOADING_PAGE;

  // ---------------------------------------------------------------------
  // Derived, per render (data-model *Derived on the phone*)
  // ---------------------------------------------------------------------

  const picked = useMemo(() => {
    if (!period || period.kind === 'day') return null;
    if (period.kind === 'month') return { kind: 'month', year: period.year, month: period.month };
    return { kind: 'year', year: period.year };
  }, [period]);

  const allEntries = pageNow.status === 'ready' ? (pageNow.entries || EMPTY_ENTRIES) : null;

  /**
   * The memories of the covered people: the page filtered to the chosen ids.
   *
   * With nobody chosen the page was fetched for exactly the people the book covers, so the
   * filter is a no-op by contract and is skipped -- which also means an entry whose `userId` the
   * server did not send is still shown on a book where nobody is chosen, rather than silently
   * disappearing from a page that was asked for it.
   */
  const shown = useMemo(() => {
    if (allEntries === null) return EMPTY_ENTRIES;
    if (!hasChoice) return allEntries;
    const covered = new Set(chosenIds);
    return allEntries.filter((item) => covered.has(item?.userId));
  }, [allEntries, hasChoice, chosenIds]);

  /** A single day's cards, in the book's own in-day order (FR-009). */
  const entries = useMemo(
    () => (picked ? EMPTY_ENTRIES : orderedDay(shown, dayOrder, compareInDay)),
    [picked, shown, dayOrder, compareInDay],
  );

  /**
   * A month or year list's rows, and which month headings are open.
   *
   * The first heading of a freshly picked year is open (016 FR-006), and which month that is can
   * only be answered once the year's memories have been read -- so it is answered here, from the
   * rows, exactly as `JournalScreen` does, and at the same price: a second `buildRows` while
   * `openMonths` is still null.
   */
  const built = useMemo(() => {
    if (!picked) return null;

    const first = buildRows(shown, picked, openMonths, compareInDay);
    if (openMonths !== null || first.stickyIndices.length === 0) {
      return { ...first, open: openMonths || NO_OPEN_MONTHS };
    }

    const open = new Set([first.rows[first.stickyIndices[0]].key]);
    return { ...buildRows(shown, picked, open, compareInDay), open };
  }, [picked, shown, openMonths, compareInDay]);

  const rowsNow = built || EMPTY_ROWS;

  /**
   * Who of the book's people has a memory in the shown period (FR-010) -- read from the **whole**
   * page, not from the chosen people's share of it, because a face is dimmed by what its person
   * has in the period and not by whether they are chosen.
   *
   * **Null while the page is loading and after it failed**, which is how "could not load" stays
   * different from "recorded nothing": nothing is dimmed on either.
   */
  const presentIds = useMemo(() => {
    if (allEntries === null) return null;
    const ids = new Set();
    allEntries.forEach((item) => {
      if (item?.userId) ids.add(item.userId);
    });
    return ids;
  }, [allEntries]);

  // ---------------------------------------------------------------------
  // Stepping (FR-007, FR-014)
  // ---------------------------------------------------------------------

  /**
   * The index ◄ ► step over: the covered people's, and `bookIndex` while theirs is loading or
   * after it failed.
   *
   * Falling back is deliberate (R10): an index that could not be read must never be shown as an
   * index with nothing in it, because that is exactly what reaching the end of the book looks
   * like. A step that lands on a period holding none of the chosen people's memories shows the
   * named empty message instead, which is the spec's own answer for it.
   */
  const steppingIndex = indexNow.status === 'ready'
    ? indexNow.index
    : (bookIndexNow.status === 'ready' ? bookIndexNow.index : null);

  /** The days a step can stand on, sorted -- day keys sort as they date (data-model *Picked*). */
  const dayKeys = useMemo(
    () => (steppingIndex ? [...steppingIndex.days.keys()].sort() : []),
    [steppingIndex],
  );

  /** Where a step of `delta` would land, or null at that end of the book (FR-014). */
  const neighbourOf = useCallback((delta) => {
    if (!period || !steppingIndex) return null;
    if (period.kind === 'day') return adjacentDateKey(dayKeys, period.day, delta);
    if (period.kind === 'month') return neighbourMonth(steppingIndex, period, delta);
    return neighbourYear(steppingIndex, period, delta);
  }, [period, steppingIndex, dayKeys]);

  const earlier = neighbourOf(-1);
  const later = neighbourOf(1);

  /**
   * Move to the period on screen, opening a freshly picked year on its own first heading again
   * (016 FR-006): the months somebody opened belong to the year they opened them in.
   */
  const goTo = useCallback((nextPeriod) => {
    setPeriod(nextPeriod);
    setOpenMonths(null);
  }, []);

  const step = useCallback((delta) => {
    const target = neighbourOf(delta);
    // Nothing whatever at either end -- never a wrap, and never a period with no memories.
    if (!target || !period) return;
    if (period.kind === 'day') {
      goTo({ kind: 'day', day: target });
      return;
    }
    // The day the reader was last on travels with a month or year pick, as 016's date bar keeps
    // it: stepping to another month does not move anybody's day.
    goTo({ ...target, day: period.day ?? null });
  }, [neighbourOf, period, goTo]);

  /**
   * A pick from the calendar sheet: `{kind:'day', date}`, `{kind:'month', year, month}` or
   * `{kind:'year', year}` -- `CalendarSheetBody`'s own three shapes -- or a bare day key.
   *
   * A pick this cannot read **changes nothing whatever**, rather than clearing what is on
   * screen: somebody who tapped March must not be left looking at an arbitrary day because the
   * pick was malformed. `rangeFor` is the gate, so a period that becomes the one on screen is
   * always one a page can be read for.
   */
  const pick = useCallback((choice) => {
    if (typeof choice === 'string' || choice?.kind === 'day') {
      const day = dayKeyOf(typeof choice === 'string' ? choice : (choice.date ?? choice.day));
      if (day) goTo({ kind: 'day', day });
      return;
    }

    if (choice?.kind === 'month' && rangeFor(choice)) {
      goTo({
        kind: 'month',
        year: choice.year,
        month: choice.month,
        day: period?.day ?? null,
      });
      return;
    }

    if (choice?.kind === 'year' && rangeFor(choice)) {
      goTo({ kind: 'year', year: choice.year, day: period?.day ?? null });
    }
  }, [goTo, period]);

  /**
   * Open or close one month of a year list (016 FR-006).
   *
   * Resolved against what is **open on screen** rather than against the state, which is null
   * until the first tap: taking the state would leave the first heading open when it is the very
   * heading tapped, which is the one tap FR-006 spells out.
   */
  const toggleMonth = useCallback((key) => {
    const openNow = rowsNow.open || NO_OPEN_MONTHS;
    const nextOpen = new Set(openNow);
    if (nextOpen.has(key)) nextOpen.delete(key);
    else nextOpen.add(key);
    setOpenMonths(nextOpen);
  }, [rowsNow]);

  /**
   * Re-read both indexes and the page, keeping the choice and the period (FR-015). No
   * dependency, so its identity never moves: a focus or pull-to-refresh callback built on it
   * cannot turn into a retry loop.
   */
  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  // ---------------------------------------------------------------------
  // Empty, failed and loading (FR-011, analyze I2)
  // ---------------------------------------------------------------------

  /**
   * Whether an index that is **ready** has rows at **any** precision: every row of every
   * precision reaches `years`, which is why that one map answers it and `days` never does -- a
   * person whose memories are all dated to a month alone has no days and has plenty to read.
   *
   * Asked only of a ready index: an index that is loading or failed is not an index with
   * nothing in it, and the two states below are each gated on `status === 'ready'` for exactly
   * that reason.
   */
  const hasRows = (state) => state.status === 'ready' && state.index.years.size > 0;

  /**
   * The book itself has nothing the reader may see: no calendar, no faces, the screen's own
   * whole-book message. Never true while the people are still being read, and never true for a
   * failure -- a failed index cannot tell anybody a book is empty.
   */
  const bookEmpty = !peopleLoading
    && bookIndexNow.status === 'ready'
    && !hasRows(bookIndexNow);

  /**
   * The book has memories but the chosen people have none at all: the faces stay, the sheet
   * opens with every day faded, and the page says so (spec edge case, analyze I2).
   */
  const choiceEmpty = hasChoice
    && hasRows(bookIndexNow)
    && indexNow.status === 'ready'
    && !hasRows(indexNow);

  /**
   * The index failed when the book opened, so there is no day to open on and emptiness cannot be
   * known: the screen's own failure text with Try again, never the empty message (R10, FR-011).
   */
  const openFailed = bookIndexNow.status === 'failed' && period === null;

  const chosenNames = useMemo(() => {
    const byId = new Map((Array.isArray(people) ? people : [])
      .filter((person) => person?.id)
      .map((person) => [person.id, person.name]));
    return chosenIds.map((id) => byId.get(id)).filter(Boolean);
  }, [people, chosenIds]);

  /**
   * The page's own empty words, naming the chosen people (spec edge case): "Nothing from Mother
   * yet" when they have nothing at all, "Nothing from Mother on this day" when they have nothing
   * here.
   *
   * Null with nobody chosen: ◄ ► then only land on periods that have memories, so a period is
   * never empty -- and a book that is empty altogether is the **screen's** message to word, not
   * this hook's, because only the screen knows whether it is showing one person, a group or the
   * family.
   */
  const emptyMessage = useMemo(() => {
    if (!hasChoice) return null;
    const names = joinNames(chosenNames);
    if (!names) return null;
    if (choiceEmpty) return `Nothing from ${names} yet`;
    if (pageNow.status !== 'ready' || shown.length > 0) return null;
    return `Nothing from ${names} ${periodPhrase(period)}`;
  }, [hasChoice, chosenNames, choiceEmpty, pageNow.status, shown, period]);

  return {
    // The calendar sheet opens only on a ready index, and never on a partial one (FR-011).
    index: indexNow.status === 'ready' ? indexNow.index : null,
    indexStatus: indexNow.status,
    indexError: indexNow.error,

    // The period on screen, in 016's own shape.
    picked,
    selectedDay: period?.day ?? null,
    periodKind: period?.kind ?? 'day',
    label: picked ? periodWords(picked) : null,
    /** The date bar's count: the shown memories, and null until the page has answered. */
    count: pageNow.status === 'ready' ? shown.length : null,

    // The list: a day's cards, or a month or year list's rows.
    entries,
    rows: rowsNow.rows,
    stickyIndices: rowsNow.stickyIndices,
    openMonths: rowsNow.open || NO_OPEN_MONTHS,
    toggleMonth,

    pick,
    step,
    hasPrevious: earlier !== null,
    hasNext: later !== null,

    presentIds,
    pageStatus: pageNow.status,
    pageError: pageNow.error,

    loading: peopleLoading === true || bookIndexNow.status === 'loading',
    bookEmpty,
    choiceEmpty,
    openFailed,
    emptyMessage,
    refresh,
  };
}

/**
 * The shown period's memories, for **everyone** the book covers (R7, data-model *PeriodPage*).
 *
 * - **A day** goes through the book's own `loadDay`: two period calls on a person, a friend
 *   group or a head-card household, and the one-day `/journal/book` on the family book (R5).
 * - **A month** is one period call at `month` precision, which is day-dated and month-dated
 *   memories both, with the service following the cursor to the end.
 * - **A year** is the whole year at `month` precision **and** the whole year at `year`
 *   precision, concatenated. The second call cannot be narrowed to 1 January: a year-only
 *   memory may be stored on any day of its year, and one stored mid-year would be counted in
 *   the index and then missing from the page that is meant to list it.
 *
 * It either answers with the whole period or throws. Nothing partial is returned -- the service
 * fails closed on a page it could not fetch, and so does this.
 */
async function readPeriod(accessToken, period, authorIds, loadDay) {
  if (period.kind === 'day') return loadDay(period.day);

  const range = rangeFor(period);
  // `pick` and `step` both refuse a period `rangeFor` cannot read, so this is unreachable from
  // the screens; it throws rather than answering an empty period, which would read as a period
  // with nothing in it.
  if (!range) throw new Error(`usePeopleCalendar: unreadable period ${JSON.stringify(period)}`);

  if (period.kind === 'month') {
    return getPeriod(accessToken, {
      authorIds,
      from: range.from,
      to: range.to,
      precision: 'month',
    });
  }

  const [months, years] = await Promise.all([
    getPeriod(accessToken, { authorIds, from: range.from, to: range.to, precision: 'month' }),
    getPeriod(accessToken, { authorIds, from: range.from, to: range.to, precision: 'year' }),
  ]);
  return [...months, ...years];
}

export default usePeopleCalendar;
