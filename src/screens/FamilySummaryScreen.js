/**
 * FamilySummaryScreen -- the family-unit book, on the calendar (019 User Story 2).
 *
 * Opened from FamilyScreen when the signed-in user taps their own head card. It shows one
 * household's journal book: who is in the household, and their memories a **page** at a time --
 * a day, a month or a year -- read through `usePeopleCalendar`, exactly as the reader's own
 * Journal tab reads theirs (016) and as `PersonJournalScreen` now does.
 *
 * **What this replaced, and why it mattered.** The book used to be one continuous newest-first
 * scroll of days, paged backwards by `onEndReached` as somebody kept scrolling. March was
 * therefore reachable only by scrolling through everything recorded since, there was no calendar
 * to reach it from, and a long-lived family's older memories were in practice unreachable on the
 * phone (spec FR-008; the owner, 2026-11-21). The scroll and its paging are gone: the date bar
 * is the page's first row, the household's faces the second, and the calendar reaches any day,
 * month or year that has memories.
 *
 * ## The three rules that are easiest to get wrong here
 *
 * - **A day is `/journal/book` asked for one day, and its answer is used only when it is that
 *   day** (research R5). `before` is exclusive, so the endpoint answers the newest day *before*
 *   the cursor -- which for a day with nothing on it is an **earlier** day. Taking `days[0]` on
 *   trust would list one day's memories under another day's heading.
 * - **The cursor is the day after D, built from calendar parts** -- `parseDateKey`, `setDate(+1)`,
 *   `toDateKey` -- and never `new Date(D)`, which parses a bare `'YYYY-MM-DD'` as UTC midnight
 *   and so names the day before anywhere west of Greenwich (FR-013; a civil date is a day, not
 *   an instant).
 * - **Every card's author comes from the household**, on a day, a month and a year alike
 *   (research R6a). `/journal/book`'s entries carry a `memberId` and `/journal/period`'s do not,
 *   so matching on that would name a memory on its day page and leave it "Unknown" in the month
 *   list that lists it again. `authorFor` matches on `entry.userId`, which both routes carry.
 *
 * ## What a reader must never be shown
 *
 * Both are the project's *Sharing fails closed* discipline (`CLAUDE.md`):
 *
 * - **A calendar over a household nobody has read.** The household and the memories arrive
 *   separately; until the household has landed the screen passes `peopleLoading` and shows
 *   neither calendar, faces nor an empty message -- a household that has not arrived is not a
 *   household with nobody in it.
 * - **A failure drawn as emptiness.** The household failing, the calendar's marks failing as the
 *   book opens (`openFailed`) and a page failing all show this screen's own, unchanged
 *   "Couldn't load the family summary." with Try again -- never the empty message, and never a
 *   dimmed face, which would read as "recorded nothing". `bookEmpty` and `openFailed` are
 *   therefore read **before** `pageStatus`, which stays `'loading'` for ever in both, and the
 *   pull-to-refresh control is gated the same way.
 *
 * Everything renders in the app's own styling. This feature deliberately does not apply each
 * relative's own journal theme (015 FR-007) -- that waits on cross-platform theme persistence,
 * which does not exist on either client yet.
 *
 * ## Choosing faces (FR-016, FR-017, FR-018)
 *
 * Tapping a face shows only that person's memories; tapping it again un-chooses it, and with
 * nobody chosen the book shows everyone. The chosen ids are this screen's own state, and
 * everything that follows from them is the hook's: the list is filtered on the phone, and only
 * the **index** is asked for again, so the calendar's marks, faded days, counts, the date bar's
 * count and where ◄ ► step all cover the chosen people (research R7, FR-017). The page is still
 * `/journal/book` for the whole household, which is what lets a face be dimmed by what its
 * person has in the period whether or not they are chosen (FR-010).
 *
 * - **The choice lasts as long as the book is open** (FR-018). It is plain screen state, so
 *   going back out of this screen forgets it, while a pull to refresh -- which does not unmount
 *   the screen -- keeps it.
 * - **A chosen member who has left the household is dropped** by the refresh that re-reads it
 *   (spec edge case "Someone joins or leaves"), so somebody who comes back later is not quietly
 *   chosen again, and with nobody left chosen the book reads as everyone.
 * - **The ids are kept in household order**, not in the order they were tapped, so the row's
 *   caption ("Showing Huda and Karim") and the page's named message name the same people the
 *   same way round.
 * - **Two ways of having nothing to show, which must never be confused.** `bookEmpty` -- nobody
 *   in the family has anything -- has no calendar and no faces, and keeps today's "Nobody in
 *   your family has recorded anything yet." `choiceEmpty` -- the family has memories but the
 *   chosen people have none at all -- keeps the faces, opens the sheet with every day faded and
 *   says "Nothing from <names> yet", which the hook words.
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { JournalEntryCard } from '../components/journal/JournalEntryCard';
import { ViewportFlatList } from '../components/media/ViewportLists';
// The same viewability helper the Journal uses, for the same reason: `JournalEntryCard` mounts a
// native map view for a memory with places, and this screen is a list of those cards. Without
// gating, every card on screen mounts its map at once -- which research R10 *Lazy rendering* and
// plan.md's risk table treat as a requirement, not an optimisation.
import { useViewableKeys } from '../hooks/mediaVisibility';
// 016 FR-017's measured scroll, shared with `PersonJournalScreen` (T009 fix round 1).
import { usePinnedHeadingScroll } from '../hooks/usePinnedHeadingScroll';
import {
  CalendarCoils,
  DateSwipeContainer,
  FacesRow,
  JournalDateBar,
} from '../components/journal';
// Neither is exported from the barrel above, so both are imported by their own path.
import { CalendarSheet } from '../components/journal/CalendarSheet';
import CalendarListHeading from '../components/journal/CalendarListHeading';

import { useAuth } from '../context/AuthContext';
import { usePeopleCalendar } from '../hooks/usePeopleCalendar';
import { getJournalBook } from '../services/SocialService';
import { parseDateKey, toDateKey, todayKey } from '../utils/journalDate';

/**
 * The look-ups take 1-50 people, so a household larger than that is covered to its first 50, as
 * on `PersonJournalScreen` and as in 015. The cap is the screen's: `usePeopleCalendar` hands
 * every id it is given straight to `getCalendar`, which refuses more than 50 rather than quietly
 * deciding which of a family counts.
 */
const MAX_BOOK_PEOPLE = 50;

/** Nobody chosen, as one array, so an empty choice never changes identity between renders. */
const NOBODY_CHOSEN = [];

/**
 * The civil day after `day`, built from that day's own calendar parts (FR-013).
 *
 * ⚠ **Never `new Date(day)`.** A bare `'YYYY-MM-DD'` parses as UTC midnight, so west of
 * Greenwich it is already the day before, and the cursor would land on the very day being read --
 * which `/journal/book` answers by handing back the day before it, silently. The parts go
 * through `Date`'s own month-end arithmetic, so 31 March becomes 1 April and 31 December becomes
 * 1 January of the next year.
 */
export function nextDayKey(day) {
  const date = parseDateKey(day);
  if (!date) return null;
  date.setDate(date.getDate() + 1);
  return toDateKey(date);
}

/**
 * Nothing to read, in whatever words the caller has for it -- the whole book's, or the period's.
 * Drawn in this screen's own quiet style, as today.
 */
const NothingToRead = ({ message }) => (
  <View style={styles.centered}>
    <Text style={styles.statusText}>{message}</Text>
  </View>
);

/**
 * This screen's own failure message, with a way to try again -- **unchanged wording** (FR-011).
 *
 * It is what all three failures show -- the household, the marks failing as the book opened, and
 * a page -- because from the reader's side they are one thing: the family's journal did not
 * arrive. What must never appear in its place is the empty message.
 */
const CouldNotLoad = ({ onRetry }) => (
  <View style={styles.centered}>
    <Text style={styles.statusText}>Couldn't load the family summary.</Text>
    <TouchableOpacity
      onPress={onRetry}
      style={styles.retry}
      accessibilityRole="button"
      accessibilityLabel="Try again"
    >
      <Text style={styles.retryText}>Try again</Text>
    </TouchableOpacity>
  </View>
);

export default function FamilySummaryScreen({ navigation, route }) {
  const { user, accessToken } = useAuth();
  // Which household. A tree-node id, absent when it is your own.
  const memberId = route?.params?.memberId;
  const title = route?.params?.title || 'Family Journal';

  /**
   * The household, and the two things that can be said about reading it.
   *
   * - `household` is null until the first read lands, and then **stays** -- a refresh that fails
   *   leaves the family on screen rather than blanking it.
   * - `householdStatus` is about that first read alone: `'loading'` until it lands, then
   *   `'ready'` or `'failed'`. It is what the hook's `peopleLoading` is read from.
   * - `householdReading` is true whenever a read is in flight, the first one or a refresh's, and
   *   is what keeps the pull-to-refresh control turning until the household has been re-read.
   */
  const [household, setHousehold] = useState(null);
  const [householdStatus, setHouseholdStatus] = useState('loading');
  const [householdReading, setHouseholdReading] = useState(true);

  /**
   * The faces the reader has chosen (FR-016), empty meaning everyone.
   *
   * Plain screen state, which is the whole of FR-018: it lives exactly as long as the book is
   * open. Going back out of this screen unmounts it and forgets the choice; a pull to refresh
   * leaves the screen mounted and so keeps it.
   */
  const [chosenIds, setChosenIds] = useState(NOBODY_CHOSEN);

  /**
   * Which household's read is current. Bumped at the start of every read -- the first one and
   * every refresh -- and each read compares again once its await settles, so an answer for a
   * household the reader has since navigated away from, or for a read a refresh has superseded,
   * is dropped rather than applied.
   *
   * A shared "cancelled" boolean cannot do this: cleared again when the next read starts, it
   * tells an older in-flight read that it is still current. An epoch can only ever be behind.
   */
  const epochRef = useRef(0);

  /**
   * Read the household: `/journal/book` for one day, whose `household` is the answer (R5). The
   * day it also returns is ignored -- which day the book opens on is the calendar index's
   * answer, as on every book (R10).
   */
  const readHousehold = useCallback(async () => {
    epochRef.current += 1;
    const myEpoch = epochRef.current;
    setHouseholdReading(true);

    try {
      const result = await getJournalBook(accessToken, { memberId, days: 1 });
      if (myEpoch !== epochRef.current) return;
      const members = result?.household || [];
      setHousehold(members);
      setHouseholdStatus('ready');

      /*
       * Somebody who has left is no longer somebody to filter to (spec edge case "Someone joins
       * or leaves"), and with nobody left chosen the book reads as everyone again.
       *
       * ⚠ **It matters when they come back.** While they are gone, a choice that still held
       * their id looks identical -- `usePeopleCalendar` ignores an id that is not in the book,
       * and `FacesRow` names only the people it draws. Dropping it is what stops them being
       * quietly chosen again on rejoining, by no act of the reader's.
       *
       * The previous array is kept when nothing has changed, so an ordinary refresh does not
       * hand the hook and the row a new identity for the same choice.
       */
      const stillHere = new Set(members.map((member) => member.userId).filter(Boolean));
      setChosenIds((previous) => {
        if (previous.length === 0) return previous;
        const kept = previous.filter((id) => stillHere.has(id));
        if (kept.length === previous.length) return previous;
        return kept.length === 0 ? NOBODY_CHOSEN : kept;
      });
    } catch (error) {
      if (myEpoch !== epochRef.current) return;
      console.warn('[FamilySummaryScreen] failed to read the household:', error.message);
      // A refresh that fails leaves the family that is already on screen; only a first read with
      // nothing to fall back on becomes the failure message.
      setHouseholdStatus((previous) => (previous === 'ready' ? previous : 'failed'));
    } finally {
      if (myEpoch === epochRef.current) setHouseholdReading(false);
    }
  }, [accessToken, memberId]);

  useEffect(() => {
    setHousehold(null);
    setHouseholdStatus('loading');
    readHousehold();
  }, [readHousehold]);

  /**
   * The people this book covers (FR-002, data-model *Book*): the household's members with an
   * account, in household order, de-duplicated by account keeping the first -- two tree nodes can
   * link to one person -- and capped at the look-ups' 50.
   *
   * A relative without an account is simply not here, so the server is never asked about them:
   * their id is a *tree-node* id, and sending it as an account id answers 200 with nothing,
   * which reads as "they have recorded nothing" (research R2).
   */
  const people = useMemo(() => {
    const seen = new Set();
    const covered = [];

    (household || []).forEach((member) => {
      const id = member?.userId;
      if (typeof id !== 'string' || id === '' || seen.has(id)) return;
      seen.add(id);
      covered.push({ id, name: member.name, avatarUrl: member.avatarUrl ?? null });
    });

    return covered.slice(0, MAX_BOOK_PEOPLE);
  }, [household]);

  /**
   * Choose a face, or un-choose one already chosen (FR-016). A dimmed face toggles like any
   * other: choosing does not care whether somebody has anything in the period on screen.
   *
   * The answer is rebuilt in **household order** rather than appended in tap order, so the row's
   * caption and the page's named message list the same people the same way round. With nobody
   * left chosen it is the one shared empty array, so the identity of "everyone" never moves.
   */
  const toggleFace = useCallback((id) => {
    setChosenIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (next.size === 0) return NOBODY_CHOSEN;
      return people.filter((person) => next.has(person.id)).map((person) => person.id);
    });
  }, [people]);

  /** The row's own "Show everyone": the book shows everyone again (FR-016). */
  const showEveryone = useCallback(() => setChosenIds(NOBODY_CHOSEN), []);

  /**
   * One civil day of the family book: `/journal/book` for that day alone (R5).
   *
   * ⚠ **The answer is used only when it is the day that was asked for.** `before` is exclusive
   * and the endpoint answers the newest day before it, so a day with nothing on it comes back as
   * an *earlier* day's memories. Anything but `days[0].date === day` is an empty day.
   */
  const loadDay = useCallback(async (day) => {
    const before = nextDayKey(day);
    if (!before) return [];

    const result = await getJournalBook(accessToken, { memberId, before, days: 1 });
    const answered = result?.days?.[0];
    if (!answered || answered.date !== day) return [];
    return answered.entries || [];
  }, [accessToken, memberId]);

  /** Where each person stands in the household, which is the order the server listed them in. */
  const positionInHousehold = useMemo(() => {
    const at = new Map();
    people.forEach((person, position) => at.set(person.id, position));
    return at;
  }, [people]);

  /**
   * Household order for the memories of one day (FR-009, research R6): position in the household
   * first, then created time between one person's own memories.
   *
   * It orders a **single day** (through the hook's `dayOrder`, because `/journal/book` returns a
   * day in household position with no tie-break) and each day of a month or year list (through
   * `buildRows`) -- which is what makes the two agree, and the reason it is one function rather
   * than a sort in each place.
   *
   * ⚠ **Memoised deliberately.** `buildRows` cannot key on anything but this function's own
   * identity, so an inline arrow would rebuild every row of a 300-memory month on every render
   * (the hook's JSDoc calls it the one input it cannot protect a caller from).
   *
   * A memory whose author is not in the household sorts last rather than first: nothing should
   * normally be there at all, and last is the answer that cannot push a member's memory down.
   */
  const compareInHousehold = useCallback((a, b) => {
    // One past the last member, so anybody unplaced sorts after all of them.
    const unplaced = positionInHousehold.size;
    const first = positionInHousehold.has(a?.userId) ? positionInHousehold.get(a.userId) : unplaced;
    const second = positionInHousehold.has(b?.userId) ? positionInHousehold.get(b.userId) : unplaced;

    if (first !== second) return first - second;
    return (a?.createdAt ?? 0) - (b?.createdAt ?? 0);
  }, [positionInHousehold]);

  const {
    index,
    indexStatus,
    picked,
    selectedDay,
    periodKind,
    label,
    count,
    entries,
    rows,
    stickyIndices,
    toggleMonth,
    pick,
    step,
    hasPrevious,
    hasNext,
    presentIds,
    pageStatus,
    loading,
    bookEmpty,
    openFailed,
    emptyMessage,
    refresh,
  } = usePeopleCalendar({
    people,
    chosen: chosenIds,
    loadDay,
    // Both halves go together: `dayOrder` orders the day, `compareInDay` the days of a month or
    // year list. A book given one without the other would read two ways (FR-009).
    dayOrder: 'compareInDay',
    compareInDay: compareInHousehold,
    // A household that has not arrived is not a household with nothing in it.
    peopleLoading: householdStatus === 'loading',
  });

  /** Whether there is a period to name at all. With none, there is no calendar to offer. */
  const hasPeriod = picked !== null || selectedDay !== null;

  /** Lookup of account id -> household member, for the author shown on a card. */
  const personById = useMemo(() => {
    const byId = new Map();
    people.forEach((person) => byId.set(person.id, person));
    return byId;
  }, [people]);

  /**
   * Who a memory is by, on a day, a month and a year alike (research R6a, SC-004).
   *
   * The household member whose account wrote it, named and pictured from that member's own
   * entry in `people` above; failing that, whatever author the server itself sent. The
   * fallback is reached: `/journal/book` answers a **day** for the whole household, while the
   * book's own people stop at the look-ups' 50 -- so a memory by the 56th cousin is on screen
   * with nobody in the book to name it, and keeps the server's name rather than becoming
   * "Unknown".
   *
   * ⚠ **Matched on `entry.userId`, never on `memberId`.** Only `/journal/book` sends a
   * `memberId`, so matching on it would name a memory on its day page and leave the very same
   * memory unnamed in the month list that lists it again -- the difference SC-004 rules out.
   */
  const authorFor = useCallback((entry) => {
    const member = personById.get(entry?.userId);
    if (member) return { name: member.name, avatarUrl: member.avatarUrl };

    const author = entry?.author;
    if (author?.name) return { name: author.name, avatarUrl: author.avatarUrl ?? null };
    return { name: 'Unknown', avatarUrl: null };
  }, [personById]);

  /**
   * Pull to refresh: the household first, then the calendar's marks and the shown page (FR-015),
   * keeping the reader on the period they were reading.
   *
   * The household leads because everything else is read **for** it: a member who joined since the
   * book was opened has to be in the book before the marks and the page are asked for, or their
   * memories are fetched for a household they are not yet in and the next read throws them away
   * again (spec edge case "Someone joins or leaves").
   *
   * ⚠ **`pageStatus` is honoured only when there is a period** -- the same ordering rule the
   * empty and failure states below follow, and the one the hook's own JSDoc states. A book with
   * nothing in it, and one whose marks failed as it opened, have no period to read: the hook's
   * page effect answers `'loading'` and **nothing ever resolves it**, so a control read without
   * that gate spins for ever on the one screen where pulling to refresh is the obvious thing to
   * try.
   *
   * The phases exist because `refresh()` only bumps the hook's reload key: the commit that asks
   * still reports the *previous* answer, so clearing on "nothing is being read" there would turn
   * the control off before the re-read had begun. `asked` is given one commit of grace for that
   * reason; after it, a read that has not started is a read with nothing to do -- which is
   * exactly a household with nobody in it, where the hook asks the server nothing at all.
   */
  const [refreshPhase, setRefreshPhase] = useState('idle');

  const handleRefresh = useCallback(async () => {
    setRefreshPhase('asked');
    await readHousehold();
    refresh();
  }, [readHousehold, refresh]);

  const reading = householdReading
    || indexStatus === 'loading'
    || (hasPeriod && pageStatus === 'loading');

  useEffect(() => {
    if (refreshPhase === 'idle') return;
    if (reading) {
      if (refreshPhase !== 'running') setRefreshPhase('running');
      return;
    }
    setRefreshPhase(refreshPhase === 'asked' ? 'waiting' : 'idle');
  }, [refreshPhase, reading]);

  // The book-style calendar (016), in place of the continuous scroll.
  const [showCalendarSheet, setShowCalendarSheet] = useState(false);

  /**
   * Open the book-style calendar from the date bar (FR-001, FR-011).
   *
   * ⚠ **Only ever with an index in hand.** `CalendarSheet`'s count is two-valued -- a tile with
   * no count is faded and inert -- so a sheet opened on a null index draws every day, month and
   * year faded: a wholly dead calendar, indistinguishable from "nobody has recorded anything",
   * with no way forward but closing it again. `usePeopleCalendar` answers `index` only when it is
   * ready, never partly read, so this is the whole of the gate.
   *
   * A failed index says so and offers Try again. An index still being read says nothing: the tap
   * landed on a screen that has not arrived, which is self-evident, rather than on a control that
   * refused.
   */
  const openCalendar = useCallback(() => {
    if (index) {
      setShowCalendarSheet(true);
      return;
    }
    if (indexStatus !== 'failed') return;

    Alert.alert(
      "Couldn't load the calendar",
      'The phone could not read which days hold memories, so the calendar has not been opened. '
        + 'Nothing has changed.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Try again', onPress: handleRefresh },
      ],
    );
  }, [index, indexStatus, handleRefresh]);

  /**
   * A day, a month or a year really chosen in the calendar.
   *
   * **This screen closes the sheet**, and the sheet does not close itself: a pick calls `onPick`
   * alone. A pick the hook cannot read changes nothing whatever, rather than clearing what is on
   * screen.
   */
  const handleCalendarPick = useCallback((period) => {
    setShowCalendarSheet(false);
    pick(period);
  }, [pick]);

  /** Dismissed with nothing chosen (016 FR-003): the page is left exactly as it was. */
  const closeCalendar = useCallback(() => setShowCalendarSheet(false), []);

  const goToNextDate = useCallback(() => step(1), [step]);
  const goToPreviousDate = useCallback(() => step(-1), [step]);

  /**
   * Key extractor -- for a day's entry, and for a month or year list's rows (research R8).
   *
   * An entry row keeps keying by its own `localId`, which is what a day has always keyed by, so
   * `useViewableKeys` and the `isVisible` it answers see the same keys in a day and in a month.
   * A heading row keys as `heading:<period>`, which no `localId` can collide with.
   */
  const keyExtractor = useCallback((item) => {
    if (item?.kind === 'entry') return item.key;
    if (item?.kind) return `heading:${item.key}`;
    return item.localId;
  }, []);

  /**
   * Which cards are on screen.
   *
   * Declared before `renderEntry`, which closes over `isViewable`. `ViewportFlatList` composes
   * this callback with its own, and React Native forbids changing `onViewableItemsChanged` on a
   * live list, so both are stable. Until the list has reported anything every row counts as on
   * screen, which is what makes this agree with the card's own `isVisible` default of true.
   */
  const { onViewableItemsChanged, isViewable } = useViewableKeys(keyExtractor);

  /**
   * 016 FR-017: a pressed map pin's piece, brought into view clear of the month heading a year
   * list pins above it.
   *
   * ⚠ `headingsPinned` is asked of the **period on screen** -- a year pins its month headings and
   * nothing else does -- rather than of the rows or of what has been measured, so a height left
   * over from a year somebody was reading a moment ago cannot push a month's pressed pin a
   * heading too far.
   */
  const { listRef, measureHeading, scrollPieceIntoView, onScrollToIndexFailed } =
    usePinnedHeadingScroll({
      rows,
      headingsPinned: picked?.kind === 'year',
      screenName: 'FamilySummaryScreen',
    });

  const renderEntry = useCallback(({ item, index: rowIndex }) => (
    <JournalEntryCard
      entry={item}
      // Who the card draws in its header. The household names every memory, on a day and in a
      // month alike (R6a) -- without it, a book whose API sends no author per entry draws a '?'
      // avatar and the name 'Unknown' on every card.
      user={authorFor(item)}
      currentUserId={user?.id}
      showAuthor
      // Off screen, the card holds its map's height open instead of mounting one.
      isVisible={isViewable(item.localId)}
      onRequestScrollTo={(offset) => scrollPieceIntoView(rowIndex, offset)}
    />
  ), [authorFor, user?.id, isViewable, scrollPieceIntoView]);

  /**
   * One row of the one list: a heading, or a memory drawn by the card above (research R8).
   *
   * ⚠ **A memory is rendered by `renderEntry` and by nothing else**, in a day and in a month
   * alike -- FR-006: a memory is drawn exactly as today. The row index it hands
   * `scrollPieceIntoView` counts **rows**, so a pressed pin clears the day headings above it.
   */
  const renderRow = useCallback(({ item, index: rowIndex }) => {
    if (item?.kind === 'dayHeading' || item?.kind === 'monthHeading') {
      const isMonth = item.kind === 'monthHeading';
      return (
        <CalendarListHeading
          kind={item.kind}
          label={item.label}
          count={item.count}
          open={item.open}
          // A month heading of a year, and only that, opens and closes (016 FR-006) and is the
          // row that gets pinned -- so it is the one measured. A grey day heading is neither.
          onPress={isMonth ? () => toggleMonth(item.key) : undefined}
          onLayout={isMonth ? (event) => measureHeading(item.key, event) : undefined}
        />
      );
    }

    return renderEntry({ item: item?.kind === 'entry' ? item.entry : item, index: rowIndex });
  }, [renderEntry, toggleMonth, measureHeading]);

  /**
   * The whole-book message, in today's own words (spec edge case).
   *
   * A household with nobody in it keeps today's guidance, because the answer is to add somebody
   * rather than to wait; a household that has people but nothing recorded says so about the
   * family.
   */
  const wholeBookMessage = (household || []).length === 0
    ? 'No family recorded yet — add a spouse or child to your family tree to see their entries here.'
    : 'Nobody in your family has recorded anything yet.';

  /** How a period with nothing in it is worded, when nobody is chosen to name instead. */
  const periodPhrase = picked?.kind === 'month'
    ? 'in this month'
    : picked?.kind === 'year' ? 'in this year' : 'on this day';

  /**
   * What stands in place of the list, in the order the fail-closed rule requires.
   *
   * ⚠ **A failed household is read before `bookEmpty`, and `bookEmpty` and `openFailed` before
   * `pageStatus`.** A household that could not be read has no people, which the hook reports as a
   * book with nothing in it -- so asking emptiness first would tell a reader their family has
   * recorded nothing when the truth is that the phone could not ask. And neither an empty book
   * nor a failed index has a period to read, so the page stays `'loading'` for ever in both.
   */
  const listEmpty = () => {
    if (loading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator />
          <Text style={styles.statusText}>Loading your family&apos;s journals…</Text>
        </View>
      );
    }
    if (householdStatus === 'failed') return <CouldNotLoad onRetry={handleRefresh} />;
    if (openFailed) return <CouldNotLoad onRetry={handleRefresh} />;
    if (bookEmpty) return <NothingToRead message={wholeBookMessage} />;
    if (pageStatus === 'failed') return <CouldNotLoad onRetry={handleRefresh} />;
    if (pageStatus === 'loading') {
      return (
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      );
    }
    /*
     * The period on screen. `emptyMessage` names the chosen people once some are chosen --
     * "Nothing from Karim on this day" for a period of theirs that is empty, and "Nothing from
     * Karim yet" when they have nothing in the whole book (`choiceEmpty`). That second one is
     * **not** `bookEmpty` above: the faces stay and the calendar still opens, because the reader
     * has only picked a face, and telling them the family has recorded nothing would be false.
     *
     * With nobody chosen a period is normally never empty, because ◄ ► and the sheet's faded
     * days only ever land on periods that have memories -- so this last line is then for a
     * period emptied since the marks were read, and it says only what is true of the period
     * rather than of the family.
     */
    return <NothingToRead message={emptyMessage || `No memories ${periodPhrase}`} />;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={24} color="#4a453f" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
          {/* How many people this book is of, as the approved prototype's header shows it.
              ⚠ **`people`, not `household`**: the book's own people are the ones with an
              account, de-duplicated and capped at 50, and they are exactly the faces drawn
              below -- so a household holding a relative with no account, or two tree nodes on
              one account, would otherwise say "5 members" over three faces. Said only once the
              household has been read: a count of nobody would be a claim. */}
          {householdStatus === 'ready' && people.length > 0 ? (
            <Text style={styles.headerSubtitle}>
              {`${people.length} member${people.length === 1 ? '' : 's'}`}
            </Text>
          ) : null}
        </View>
        <View style={styles.backButton} />
      </View>

      <CalendarCoils coilCount={7} />

      {/*
        The date bar is the page's **first row** (the approved prototype), and it is drawn only
        when there is a period for it to name: a book that is empty, still opening, or whose
        household or marks could not be read has no day, month or year -- and no calendar to
        offer either.
      */}
      {hasPeriod && (
        <JournalDateBar
          // The `'YYYY-MM-DD'` key itself, never a `Date` built from it: the bar words it through
          // `parseDateKey`, which is a local calendar day (FR-013).
          date={selectedDay}
          label={label}
          count={count}
          periodKind={periodKind}
          hasPrevious={hasPrevious}
          hasNext={hasNext}
          onPrevious={goToPreviousDate}
          onNext={goToNextDate}
          onDatePress={openCalendar}
        />
      )}

      {/*
        The page's **second row** (FR-010): every person the book covers, once, in household
        order, on a day, a month and a year alike -- it is outside the list, so it stays put
        whatever the list is showing.

        It is drawn under the same condition as the bar above it, and for the same reason: with no
        period there is no book to read people out of. That covers the household still being read,
        the book with nothing in it (no calendar and no faces), and the household or marks that
        could not be read, where the whole page is a failure message.

        ⚠ **It stays when the chosen people have nothing** (`choiceEmpty`), which is the one
        state that looks like an empty book and is not: the row is how the reader changes a
        choice, and taking it away would leave them with no way back to everyone.

        `presentIds` comes straight from the hook -- it is null while the period is being read
        and after it failed, which is what dims nobody then.
      */}
      {hasPeriod && (
        <FacesRow
          people={people}
          presentIds={presentIds}
          chosenIds={chosenIds}
          onToggle={toggleFace}
          onShowEveryone={showEveryone}
        />
      )}

      <DateSwipeContainer
        enabled
        onNextDate={goToNextDate}
        onPreviousDate={goToPreviousDate}
        hasNext={hasNext}
        hasPrevious={hasPrevious}
      >
        <ViewportFlatList
          ref={listRef}
          /*
            A day's memories, or a month's or year's rows -- **the same list either way**
            (research R8). A card's map pin scrolls by row index and only a `FlatList` has
            `scrollToIndex` at all, so a month drawn as a `SectionList` -- which is what this
            screen used to be -- would call a function that does not exist the moment somebody
            pressed a pin.
          */
          data={picked ? rows : entries}
          renderItem={renderRow}
          keyExtractor={keyExtractor}
          /*
            016 FR-006: an open month heading stays pinned while its month scrolls. `buildRows`
            fills `stickyIndices` with the month heading rows and nothing else, so a grey day
            heading never sticks -- two labels piling up would cover the memory being read.
          */
          stickyHeaderIndices={picked ? stickyIndices : undefined}
          onViewableItemsChanged={onViewableItemsChanged}
          onScrollToIndexFailed={onScrollToIndexFailed}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshPhase !== 'idle'} onRefresh={handleRefresh} />
          }
          ListEmptyComponent={listEmpty()}
        />
      </DateSwipeContainer>

      {/*
        The book-style calendar, in place of the endless scroll (FR-012). `index` cannot be null
        while `visible` is true: `openCalendar` is the only thing that opens it, and it refuses
        without one.
      */}
      <CalendarSheet
        visible={showCalendarSheet}
        picked={picked || { kind: 'day', date: selectedDay }}
        index={index}
        today={todayKey()}
        onPick={handleCalendarPick}
        onClose={closeCalendar}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#faf8f4' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e6e1d8',
  },
  backButton: { width: 32, alignItems: 'flex-start' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '600', color: '#4a453f' },
  headerSubtitle: { fontSize: 12, color: '#948e86', marginTop: 2 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  statusText: { fontSize: 14, color: '#948e86', textAlign: 'center', lineHeight: 20 },
  retry: { paddingHorizontal: 16, paddingVertical: 8 },
  retryText: { fontSize: 14, fontWeight: '600', color: '#4a453f' },
  // `flexGrow` so an empty page's message sits in the middle of the screen rather than at the
  // top of a list with nothing in it.
  listContent: { paddingBottom: 32, flexGrow: 1 },
});
