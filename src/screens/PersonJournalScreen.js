/**
 * PersonJournalScreen -- somebody else's journal, on the calendar (019 User Story 1).
 *
 * Opened from Family or Friends, it shows four kinds of book: one person on Family, one friend on
 * Friends, a friend group on Friends, and a household opened from the family tree's head card.
 * All four now read the server's calendar look-ups through `usePeopleCalendar`, a day, a month or
 * a year at a time, exactly as the reader's own Journal tab does (016).
 *
 * **What this replaced, and why it mattered.** The screen used to load each person's newest 50
 * memories with `getUserEntries` and filter them by a day picked in the platform's own date
 * picker. A friend with 120 visible memories therefore had 70 of them unreachable on the phone,
 * and the days they were on were not even arrow stops (spec FR-005, SC-002). The calendar's
 * index is read from the server, so every memory the reader may see is reachable however old it
 * is, and ◄ ► step only to days, months and years that have memories.
 *
 * ## The two rules that are easiest to get wrong here
 *
 * - **One person's id is `route.params.userId` when the params have a `userId` key** -- which
 *   Family always sends -- and `person.id` only when they have no such key at all, as from
 *   Friends. The test is the **presence of the key**, never its truthiness: Family sends
 *   `userId: null` for a relative with no account, and `userId ?? id` would send that person's
 *   *tree-node* id to the server as though it were an account, which answers 200 with no days
 *   and reads as "they have recorded nothing" (research R2). The same rule, per person, builds a
 *   group book.
 * - **A page is read for everyone in the book**, never for a subset: `loadDay` is bound to
 *   `bookIds` (research R7). T013's choice of faces filters on the phone.
 *
 * ## What a reader must never be shown
 *
 * Both of these are the project's *Sharing fails closed* discipline (`CLAUDE.md`):
 *
 * - A book with nothing in it says so **about the whole book** -- "<Name> hasn't shared any
 *   memories with you yet", or "Nobody here has shared any memories with you yet" for a group --
 *   and offers no calendar. Today's "No entries for this day" spoke of a day when no day is
 *   shown.
 * - **A failure is never drawn as emptiness.** The calendar's marks failing as the book opens
 *   (`openFailed`) shows this screen's own "Couldn't load journal" with Try again, not the empty
 *   message; a failed page shows the same; and a failed index refuses to open the sheet at all
 *   rather than drawing a half-filled calendar (FR-011). `bookEmpty` and `openFailed` are
 *   therefore read **before** `pageStatus`, which stays `'loading'` for ever in both -- and that
 *   holds for the **pull-to-refresh control** as much as for the page, which is the one place it
 *   was missed (fix round 1, Important 1): a control that waited on that page spun for ever.
 *
 * ## Group mode (FR-002, FR-009, FR-010)
 *
 * A friend group's book and a household opened from the family tree's head card show **every**
 * person they cover as a row of faces, directly under the date bar -- the bar is the page's first
 * row and the faces the second -- on a day, a month and a year alike. A face whose person has
 * nothing in the period on screen is dimmed, and stays tappable; nothing is dimmed while that
 * period is being read or after it failed, so "could not load" is never drawn as "recorded
 * nothing" (FR-010).
 *
 * A **head-card household reads in household order** (`bookKind: 'household'`): a day, and each
 * day of a month or year list, runs down the household in the order its members are listed, with
 * created time breaking a tie between one person's memories (FR-009, research R6). A friend group
 * has no such order and keeps the Journal tab's own -- a day newest first (016 FR-004), a month
 * or year list oldest first (016 FR-005) -- which is why `compareInDay` is passed to the hook on
 * one of the two books and not the other.
 *
 * **Choosing a face is T013's**, not this screen's yet: the row is drawn with nobody chosen, so
 * the book shows everyone, and the hook is passed no `chosen`.
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  RefreshControl,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

// Components
import { JournalEntryCard } from '../components/journal/JournalEntryCard';
import { ViewportFlatList } from '../components/media/ViewportLists';
// The same viewability helper the Journal uses, for the same reason: `JournalEntryCard` mounts a
// native map view for a memory with places, and this screen is a list of those cards. Without
// gating, every card on screen mounts its map at once -- which research R10 *Lazy rendering* and
// plan.md's risk table treat as a requirement, not an optimisation (review fix, Important 3).
import { useViewableKeys } from '../hooks/mediaVisibility';
// 016 FR-017's measured scroll, shared with `FamilySummaryScreen` (T009 fix round 1).
import { usePinnedHeadingScroll } from '../hooks/usePinnedHeadingScroll';
import {
  CalendarCoils,
  DateSwipeContainer,
  EntryGalleryModal,
  FacesRow,
  FullScreenMediaViewer,
  JournalDateBar,
} from '../components/journal';
// Neither is exported from the barrel above, so both are imported by their own path.
import { CalendarSheet } from '../components/journal/CalendarSheet';
import CalendarListHeading from '../components/journal/CalendarListHeading';

// Context
import { useAuth } from '../context/AuthContext';

// Live data
import { usePeopleCalendar } from '../hooks/usePeopleCalendar';
import { getDay } from '../services/JournalCalendarService';
import { todayKey } from '../utils/journalDate';

// Theme colors
const PRIMARY_COLOR = '#4361ee';
const TEXT_COLOR = '#333';
const TEXT_MUTED = '#888';
const SURFACE_COLOR = '#fff';

/**
 * The look-ups take 1-50 people, so a group larger than that is covered to its first 50 (spec
 * edge case "A friend group with more than 50 friends", accepted for now as in 015). The cap is
 * the screen's: `usePeopleCalendar` hands every id it is given straight to `getCalendar`, which
 * refuses more than 50 rather than quietly deciding which of a reader's friends count.
 */
const MAX_BOOK_PEOPLE = 50;

/** Route params that are not there at all, as one object, so `useMemo` is not defeated by `{}`. */
const NO_PARAMS = {};

/**
 * The id of one person in a book, by the route's own rule (research R2).
 *
 * `holder` is whatever carries the `userId` key -- the route params for one person, the person
 * object itself in a group -- and `fallback` is whose `id` is used when there is no such key at
 * all, which is how Friends arrives.
 *
 * ⚠ **The test is whether the key is there, not whether it holds anything.** Family sends
 * `userId: null` for a relative with no account, and that is an answer -- "no account" -- not a
 * missing value to fall back from. `userId ?? id` and `userId || id` are both wrong here, and
 * both look right.
 */
function bookIdOf(holder, fallback) {
  if (holder && Object.prototype.hasOwnProperty.call(holder, 'userId')) return holder.userId;
  return fallback?.id;
}

/** Whether an id is one the server can be asked about at all. */
const askable = (id) => typeof id === 'string' && id !== '';

/**
 * Nothing to read, said in whatever words the caller has for it.
 *
 * The **words** are the whole of the difference between the two things it draws, which is why
 * there is one component and not two: a book with nothing in it is told about the whole book
 * ("<Name> hasn't shared any memories with you yet"), and a period with nothing in it is told
 * about the period. Today's "No entries for this day" is gone from both, because it spoke of a
 * day that is not necessarily on screen.
 */
const NothingToRead = ({ message }) => (
  <View style={styles.emptyState}>
    <View style={styles.emptyIcon}>
      <Ionicons name="book-outline" size={48} color={PRIMARY_COLOR} />
    </View>
    <Text style={styles.emptyTitle}>{message}</Text>
  </View>
);

/**
 * This screen's own failure message, with a way to try again (FR-011).
 *
 * It is what both failures show -- the marks failing as the book opened, and a page failing --
 * because from the reader's side they are the same thing: the journal did not arrive. What must
 * never appear in its place is the empty message.
 */
const CouldNotLoad = ({ detail, onRetry }) => (
  <View style={styles.emptyState}>
    <View style={styles.emptyIcon}>
      <Ionicons name="cloud-offline-outline" size={48} color={PRIMARY_COLOR} />
    </View>
    <Text style={styles.emptyTitle}>Couldn&apos;t load journal</Text>
    {detail ? <Text style={styles.emptySubtitle}>{detail}</Text> : null}
    <TouchableOpacity
      style={styles.retryButton}
      onPress={onRetry}
      accessibilityRole="button"
      accessibilityLabel="Try again"
    >
      <Text style={styles.retryText}>Try again</Text>
    </TouchableOpacity>
  </View>
);

/**
 * Header component with back button
 */
const Header = ({ title, subtitle, avatar, onBack, onAvatarPress }) => (
  <View style={styles.header}>
    <TouchableOpacity style={styles.backButton} onPress={onBack}>
      <Ionicons name="arrow-back" size={24} color={TEXT_COLOR} />
    </TouchableOpacity>

    <View style={styles.headerCenter}>
      <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
      {subtitle && (
        <Text style={styles.headerSubtitle}>{subtitle}</Text>
      )}
    </View>

    <TouchableOpacity onPress={onAvatarPress}>
      {avatar ? (
        <Image source={{ uri: avatar }} style={styles.headerAvatar} />
      ) : (
        <View style={styles.headerAvatarPlaceholder}>
          <Ionicons name="people" size={20} color="#fff" />
        </View>
      )}
    </TouchableOpacity>
  </View>
);

/**
 * Main PersonJournalScreen Component
 */
export default function PersonJournalScreen({ route, navigation }) {
  const { user: authUser, accessToken } = useAuth();

  const params = route?.params || NO_PARAMS;
  const {
    person,      // Single person: { id, name, avatar }
    persons,     // Group: array of persons
    isGroup,     // Boolean: viewing a group?
    groupName,   // Group name if viewing a group
    bookKind,    // 'household' for a household opened from the family tree's head card (R2)
  } = params;

  /**
   * A household opened from the family tree's **head card**, as against a friend group.
   *
   * It is the one thing that tells the two group books apart here, and the whole of what it
   * changes is the order: the same family must read the same way whichever card opened it
   * (owner, 2026-11-21; spec FR-009). The route says so itself -- the screen cannot infer it
   * from the people, because a friend group's persons and a household's look alike once their
   * ids are resolved.
   */
  const isHousehold = isGroup === true && bookKind === 'household';

  // Gallery modal state
  const [showEntryGallery, setShowEntryGallery] = useState(false);
  const [galleryEntry, setGalleryEntry] = useState(null);

  // Full-screen media viewer state
  const [showMediaViewer, setShowMediaViewer] = useState(false);
  const [viewerMedia, setViewerMedia] = useState([]);
  const [viewerMediaType, setViewerMediaType] = useState('photo');
  const [viewerInitialIndex, setViewerInitialIndex] = useState(0);

  // The book-style calendar (016), in place of the platform's own date picker.
  const [showCalendarSheet, setShowCalendarSheet] = useState(false);

  // Display info
  const displayName = isGroup ? groupName : person?.name || 'Journal';
  const displayAvatar = isGroup ? null : person?.avatar;
  const displaySubtitle = isGroup ? `${persons?.length || 0} members` : null;

  /**
   * The people this book covers (data-model *Book*), in book order, de-duplicated, capped at the
   * look-ups' 50.
   *
   * A person without an account is simply not in the list, so the server is never asked about
   * them -- and for a single person that leaves the book with nobody in it, which is the empty
   * book the whole-book message below speaks of.
   */
  const bookPeople = useMemo(() => {
    const sources = isGroup ? (Array.isArray(persons) ? persons : []) : [person];
    const seen = new Set();
    const people = [];

    sources.forEach((source) => {
      if (!source) return;
      // One person's `userId` sits on the route params, beside `person` (Family); a group
      // member's sits on the person object itself. The rule is the same either way.
      const id = isGroup ? bookIdOf(source, source) : bookIdOf(params, source);
      if (!askable(id) || seen.has(id)) return;
      seen.add(id);
      people.push({ id, name: source.name, avatarUrl: source.avatar ?? null });
    });

    return people.slice(0, MAX_BOOK_PEOPLE);
    // `params` is read for the single-person branch's `userId` key; `route.params` is a stable
    // object for as long as the screen is on the stack.
  }, [isGroup, persons, person, params]);

  const bookIds = useMemo(() => bookPeople.map((p) => p.id), [bookPeople]);

  /**
   * One civil day of this book, for **everyone** in it (research R7): the month call and the
   * year call for that one day, which is every precision the Journal tab would show there
   * (research R5).
   */
  const loadDay = useCallback(
    (day) => getDay(accessToken, bookIds, day),
    [accessToken, bookIds],
  );

  /** Where each person stands in the household, which is the order the route listed them in. */
  const positionInBook = useMemo(() => {
    const at = new Map();
    bookPeople.forEach((p, position) => at.set(p.id, position));
    return at;
  }, [bookPeople]);

  /**
   * Household order for the memories of one day (FR-009, research R6): position in the household
   * first, then created time between one person's own memories.
   *
   * It orders a **single day** (through the hook's `dayOrder`) and each day of a month or year
   * list (through `buildRows`), which is what makes the two agree -- 015 FR-009's rule, and the
   * reason the comparator is one function rather than a sort in each place.
   *
   * ⚠ **Memoised deliberately.** `buildRows` cannot key on anything but this function's own
   * identity, so an inline arrow would rebuild every row of a 300-memory month on every render
   * (the hook's JSDoc calls it the one input it cannot protect a caller from).
   *
   * A memory whose author is not in the book sorts last rather than first: nothing should
   * normally be there at all -- the page is fetched for the book's own people -- and last is the
   * answer that cannot push a real member's memory down the day.
   */
  const compareInHousehold = useCallback((a, b) => {
    // One past the last member, so anybody unplaced sorts after all of them.
    const unplaced = positionInBook.size;
    const first = positionInBook.has(a?.userId) ? positionInBook.get(a.userId) : unplaced;
    const second = positionInBook.has(b?.userId) ? positionInBook.get(b.userId) : unplaced;

    if (first !== second) return first - second;
    return (a?.createdAt ?? 0) - (b?.createdAt ?? 0);
  }, [positionInBook]);

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
    pageError,
    loading,
    bookEmpty,
    openFailed,
    emptyMessage,
    refresh,
  } = usePeopleCalendar({
    people: bookPeople,
    loadDay,
    // Household order on a head-card household, the Journal tab's own order everywhere else
    // (FR-009). Both halves go together: `dayOrder` orders the day, `compareInDay` the days of a
    // month or year list, and a book given one without the other would read two ways.
    dayOrder: isHousehold ? 'compareInDay' : 'newestFirst',
    compareInDay: isHousehold ? compareInHousehold : undefined,
  });

  /** Whether there is a period to name at all. With none, there is no calendar to offer. */
  const hasPeriod = picked !== null || selectedDay !== null;

  /**
   * Lookup of book id -> person, for the author shown on a card in a group.
   *
   * Built from the book's own people rather than from the raw route list, so it is keyed by the
   * very id the server attributes a memory to -- which is what keeps a month list's author the
   * same as the day page's (FR-009, SC-004).
   */
  const personById = useMemo(() => {
    const map = new Map();
    bookPeople.forEach((p) => map.set(p.id, p));
    return map;
  }, [bookPeople]);

  const getUserForEntry = useCallback((entry) => {
    const p = personById.get(entry?.userId);
    if (p) return { name: p.name, avatarUrl: p.avatarUrl };
    if (entry?.author?.name) return { name: entry.author.name, avatarUrl: entry.author.avatarUrl };
    return { name: 'Unknown', avatarUrl: null };
  }, [personById]);

  /**
   * Pull to refresh: both the calendar's marks and the shown page (FR-015), keeping the reader on
   * the period they were reading.
   *
   * ⚠ **`pageStatus` is honoured only when there is a period** -- the same ordering rule the
   * empty and failure states below follow, and the one the hook's own JSDoc states (fix round 1,
   * Important 1). A book with nothing in it, and one whose marks failed as it opened, have no
   * period to read: the hook's page effect answers `'loading'` and **nothing ever resolves it**.
   * Read without that gate, a pull to refresh on *"...hasn't shared any memories with you yet"* --
   * an obvious thing to try -- left the control spinning for ever, and so did a retry that was
   * still offline.
   *
   * The phases exist because `refresh()` only bumps the hook's reload key: the commit that asks
   * still reports the *previous* answer, so clearing on "nothing is being read" there would turn
   * the control off before the re-read had begun. `asked` is given one commit of grace for that
   * reason; after it, a read that has not started is a read with nothing to do -- which is
   * exactly a book with nobody in it, where the hook asks the server nothing at all.
   */
  const [refreshPhase, setRefreshPhase] = useState('idle');

  const handleRefresh = useCallback(() => {
    setRefreshPhase('asked');
    refresh();
  }, [refresh]);

  const reading = indexStatus === 'loading' || (hasPeriod && pageStatus === 'loading');

  useEffect(() => {
    if (refreshPhase === 'idle') return;
    if (reading) {
      if (refreshPhase !== 'running') setRefreshPhase('running');
      return;
    }
    setRefreshPhase(refreshPhase === 'asked' ? 'waiting' : 'idle');
  }, [refreshPhase, reading]);

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
        { text: 'Try again', onPress: refresh },
      ],
    );
  }, [index, indexStatus, refresh]);

  /**
   * A day, a month or a year really chosen in the calendar.
   *
   * **This screen closes the sheet**, and the sheet does not close itself: a pick calls `onPick`
   * alone (`CalendarSheet.test.js` pins that side of it), so closing here is the whole of it.
   * A pick the hook cannot read changes nothing whatever, rather than clearing what is on screen.
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
   * Handle gallery icon press on entry card
   */
  const handleEntryGalleryPress = useCallback((entry) => {
    setGalleryEntry(entry);
    setShowEntryGallery(true);
  }, []);

  /**
   * Handle photo press from gallery modal
   */
  // `startAt`, not `index`: the calendar's own index is in scope here, and a parameter shadowing
  // it would make the next change to either one a coin toss.
  const handleGalleryPhotoPress = useCallback((photos, startAt) => {
    setViewerMedia(photos);
    setViewerMediaType('photo');
    setViewerInitialIndex(startAt);
    setShowMediaViewer(true);
  }, []);

  /**
   * Handle video press from gallery modal
   */
  const handleGalleryVideoPress = useCallback((videos, startAt) => {
    setViewerMedia(videos);
    setViewerMediaType('video');
    setViewerInitialIndex(startAt);
    setShowMediaViewer(true);
  }, []);

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
   * Which cards are on screen (review fix, Important 3).
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
   * heading too far. The module's own suite pins that rule, and the arithmetic with it.
   */
  const { listRef, measureHeading, scrollPieceIntoView, onScrollToIndexFailed } =
    usePinnedHeadingScroll({
      rows,
      headingsPinned: picked?.kind === 'year',
      screenName: 'PersonJournalScreen',
    });

  /**
   * Render entry card
   */
  const renderEntry = useCallback(({ item, index: rowIndex }) => {
    const entryUser = getUserForEntry(item);

    return (
      <JournalEntryCard
        entry={item}
        user={entryUser}
        currentUserId={authUser?.id}
        showAuthor={isGroup} // Show author info when viewing group
        onGalleryPress={handleEntryGalleryPress}
        onPhotoPress={handleGalleryPhotoPress}
        onVideoPress={handleGalleryVideoPress}
        isVisible={isViewable(item.localId)}
        onRequestScrollTo={(offset) => scrollPieceIntoView(rowIndex, offset)}
        primaryColor={PRIMARY_COLOR}
      />
    );
  }, [authUser?.id, isGroup, getUserForEntry, handleEntryGalleryPress, handleGalleryPhotoPress, handleGalleryVideoPress, isViewable, scrollPieceIntoView]);

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
   * The whole-book message, worded for the kind of book this is (spec edge case).
   *
   * A group speaks of the group, because naming one of several people would be wrong about the
   * others; one person is named, because that is who the reader opened.
   *
   * ⚠ **One person is named from `displayName`, never from `person.name` directly** (fix round 1,
   * Minor 3). A route arriving without a name used to fall through to the *group's* wording,
   * which tells somebody looking at one person's journal that "nobody here" has shared anything.
   * `displayName` already carries this screen's one fallback and the header says those very
   * words, so there is no second answer to keep in step with it.
   */
  const wholeBookMessage = isGroup
    ? 'Nobody here has shared any memories with you yet'
    : `${displayName} hasn't shared any memories with you yet`;

  /** How a period with nothing in it is worded, when nobody is chosen to name instead. */
  const periodPhrase = picked?.kind === 'month'
    ? 'in this month'
    : picked?.kind === 'year' ? 'in this year' : 'on this day';

  /**
   * What stands in place of the list, in the order the hook's own contract requires.
   *
   * ⚠ **`bookEmpty` and `openFailed` are read before `pageStatus`.** Neither has a period to
   * read, so the page stays `'loading'` for ever in both; asking the page first would leave a
   * spinner over an empty book and over a failure alike.
   */
  const listEmpty = () => {
    if (loading) {
      return (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color={PRIMARY_COLOR} />
        </View>
      );
    }
    if (openFailed) return <CouldNotLoad onRetry={refresh} />;
    // The whole book, because there is no period on screen to speak of (spec edge case).
    if (bookEmpty) return <NothingToRead message={wholeBookMessage} />;
    if (pageStatus === 'failed') {
      return <CouldNotLoad detail={pageError?.message} onRetry={refresh} />;
    }
    if (pageStatus === 'loading') {
      return (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color={PRIMARY_COLOR} />
        </View>
      );
    }
    /*
     * The period on screen. `emptyMessage` names the chosen people when some are chosen
     * ("Nothing from Mother on this day", T013); with nobody chosen a period is normally never
     * empty, because ◄ ► and the sheet's faded days only ever land on periods that have
     * memories -- so this last line is for a period emptied since the index was read, and it
     * says only what is true of the period rather than of the book.
     */
    return <NothingToRead message={emptyMessage || `No memories ${periodPhrase}`} />;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header with Back Button */}
      <Header
        title={`${displayName}'s Journal`}
        subtitle={displaySubtitle}
        avatar={displayAvatar}
        onBack={() => navigation.goBack()}
        onAvatarPress={() => {}}
      />

      {/* Calendar Coils */}
      <CalendarCoils coilCount={7} color={PRIMARY_COLOR} />

      {/*
        The date bar is the page's **first row** (the approved prototype), and it is drawn only
        when there is a period for it to name: a book that is empty, still opening, or whose
        marks could not be read has no day, month or year -- and no calendar to offer either.
      */}
      {hasPeriod && (
        <JournalDateBar
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
        The page's **second row** on a group book (FR-010): every person the book covers, once,
        in book order, on a day, a month and a year alike -- it is outside the list, so it stays
        put whatever the list is showing.

        It is drawn under the same condition as the bar above it, and for the same reason: with
        no period there is no book to read people out of. That covers the book with nothing in it
        (`bookEmpty` -- no calendar and no faces), the one still opening, and the one whose marks
        could not be read, where the whole page is a failure message.

        Nobody is chosen yet, so the book shows everyone and a tap does nothing; choosing is
        T013's, and `chosenIds` and `onToggle` arrive with it. `presentIds` comes straight from
        the hook -- it is null while the period is being read and after it failed, which is what
        dims nobody then.
      */}
      {isGroup && hasPeriod && (
        <FacesRow people={bookPeople} presentIds={presentIds} />
      )}

      {/* Content */}
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
            `scrollToIndex` at all, so a month drawn as a `SectionList` would call a function
            that does not exist the moment somebody pressed a pin.
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
          contentContainerStyle={styles.feedContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshPhase !== 'idle'}
              onRefresh={handleRefresh}
              tintColor={PRIMARY_COLOR}
            />
          }
          ListEmptyComponent={listEmpty()}
        />
      </DateSwipeContainer>

      {/* Entry Gallery Modal */}
      <EntryGalleryModal
        visible={showEntryGallery}
        entry={galleryEntry}
        onClose={() => {
          setShowEntryGallery(false);
          setGalleryEntry(null);
        }}
        onPhotoPress={handleGalleryPhotoPress}
        onVideoPress={handleGalleryVideoPress}
        primaryColor={PRIMARY_COLOR}
      />

      {/* Full Screen Media Viewer */}
      <FullScreenMediaViewer
        visible={showMediaViewer}
        media={viewerMedia}
        initialIndex={viewerInitialIndex}
        mediaType={viewerMediaType}
        onClose={() => {
          setShowMediaViewer(false);
          setViewerMedia([]);
        }}
      />

      {/*
        The book-style calendar, in place of the platform's own picker (FR-012). `index` cannot
        be null while `visible` is true: `openCalendar` is the only thing that opens it, and it
        refuses without one.
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
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: SURFACE_COLOR,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerCenter: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: TEXT_COLOR,
  },
  headerSubtitle: {
    fontSize: 13,
    color: TEXT_MUTED,
    marginTop: 2,
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: PRIMARY_COLOR,
  },
  headerAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: PRIMARY_COLOR,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Feed Content
  feedContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
    flexGrow: 1,
  },

  // Empty State
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${PRIMARY_COLOR}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: TEXT_COLOR,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: TEXT_MUTED,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: PRIMARY_COLOR,
  },
  retryText: {
    fontSize: 15,
    fontWeight: '600',
    color: PRIMARY_COLOR,
  },
});
