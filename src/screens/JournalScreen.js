/**
 * JournalScreen - Enhanced Journal View
 * 
 * Displays journal entries in a feed format with:
 * - Calendar coils header
 * - Date navigation
 * - Entry cards with threaded content
 * - Per-entry gallery view (map + media)
 * - Full-screen media viewer
 * - FAB for new entries
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Alert,
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Image,
  Dimensions,
  Platform,
  Animated,
  ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import { v4 as uuidv4 } from 'uuid';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';

// Components
// `isOwnMemory` is the card's own rule for whose memory a card shows, shared rather than
// written out a second time here: it decides both whether Edit is offered on a card and
// whether `openEdit` will open one, and those two must agree (round-1 Minor 3).
import { JournalEntryCard, isOwnMemory } from '../components/journal/JournalEntryCard';
import { ViewportFlatList } from '../components/media/ViewportLists';
// The same viewability helper the media tiles use (007 FR-027), for the same reason: a card
// off screen should not mount a native map view (013 research R10 *Lazy rendering*). Until the
// list has reported anything every row counts as on screen, which is what makes the card's own
// `isVisible` default of true and this screen agree.
import { useViewableKeys } from '../hooks/mediaVisibility';
import { JournalComposeModal } from '../components/journal/JournalComposeModal';
import { JournalEntryDetail } from './JournalEntryDetail';
import { ConnectionStatusIndicator } from '../components/common/ConnectionStatusIndicator';
import { NotificationBadge } from '../components/common/NotificationBadge';
import { SyncStatusBadge } from '../components/common/SyncStatusBadge';
import {
  toDateKey,
  parseDateKey,
  adjacentDateKey,
} from '../utils/journalDate';
import { syncBadgeStatus, SyncBadgeStatus } from '../utils/syncStatus';
import {
  DateSwipeContainer,
  QuickCaptureBar,
  EntryGalleryModal,
  FullScreenMediaViewer,
} from '../components/journal';
// 016 FR-001: the Journal's date bar opens the book-style calendar sheet, not the platform's own
// date picker. `CalendarPickerModal` is deliberately **not** imported here any more -- it stays
// exactly as it is for `PersonJournalScreen` and `events/DateTimeField`, which still use it
// (FR-015, research R6), and is still exported from `components/journal/index(.web).js`.
//
// Imported by its own path rather than through the barrel: the barrel does not export it, and the
// two platform entry points (`CalendarSheet.js`, `CalendarSheet.web.js`) are what metro resolves
// between, exactly as it does for `CalendarPickerModal`.
import { CalendarSheet } from '../components/journal/CalendarSheet';
// 016 FR-005: a month (and, with T007, a year) is this screen's own feed with headings threaded
// through it. `CalendarListHeading` draws the heading rows; `memoriesLabel` is the one home of
// the words a count is said in, which the date bar below says about the same period (FR-007).
import { CalendarListHeading, memoriesLabel } from '../components/journal/CalendarListHeading';

// Hooks
import { useJournalRealtime } from '../hooks/useJournalRealtime';
import { useJournal } from '../hooks/useJournal';

// Context
import { useRealtime, useSync } from '../context';
import { useAuth } from '../context/AuthContext';

// Services
import { SettingsService } from '../services/SettingsService';
import { JournalService } from '../services/JournalService';
// 016 FR-010: the calendar and the day it shows read the phone's **whole** journal. The feed
// hook above is paged (20 at a time), so neither question can be answered by filtering what it
// has loaded; these two queries are local and read everything.
import { DatabaseService } from '../services/DatabaseService';
// `buildIndex` turns `getCalendarIndexRows`'s rows into the counts behind the calendar's faded
// days; `dayKeyOf` is the one answer to "which civil day is this memory on" for this feature;
// `buildRows` turns a picked period's memories into the flat rows a month or year list draws
// (research R8); `neighbourMonth` and `neighbourYear` are what ◄ ► step over with a month or a
// year picked (FR-007, FR-008).
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
// FR-007's wording for the period on the date bar, from the one module that words this
// feature's dates -- so "March 2026" on the bar and "March 2026" on a heading cannot differ.
import { formatPeriodDate } from '../utils/periodDate';
import CaptureDraftStore, { DraftSlot } from '../services/CaptureDraftStore';
import CaptureLocation from '../services/CaptureLocation';

// API
import { ReactionsApi, CommentsApi } from '../api';
// Sync (adopt reconciled server journal id once the first pull completes)
import { SyncEngine, SyncEvent } from '../sync/SyncEngine';
import { entriesNeedingStory } from '../utils/entryNarrative';

// Mock data (dev only)


const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Primary color
const PRIMARY_COLOR = '#4361ee';

/**
 * What the screen says while a typed note is still being kept.
 *
 * `QuickCaptureBar` clears its input and dismisses the keyboard the moment Send is tapped, and
 * this screen then awaits a location fix before anything moves -- up to a few seconds on a cold
 * GPS, in which the words are gone and nothing has happened. That reads as "my note vanished",
 * so the screen says what it is doing instead.
 *
 * It is said here, and not in the bar: the Send button exists only while there is text
 * (`{hasText ? <send> : <mic>}`), so by the time this screen is awaiting anything the control
 * to disable is already gone. This screen owns the await, so this screen says so -- and the
 * bar's contract is untouched.
 */
const KEEPING_NOTE = 'Keeping that note…';

/** How much of an unsaved edit's first note the question that would discard it quotes. */
const DRAFT_WORDS_LIMIT = 40;

/**
 * One empty list, shared.
 *
 * The day's memories arrive asynchronously now, so there is a moment before the first read lands
 * in which the feed has nothing to draw. A fresh `[]` each render would be a new array identity
 * every time and would re-render the list for no reason; this one is stable. Never mutated.
 */
const NO_ENTRIES = [];

/**
 * One empty set of open months, shared -- `NO_ENTRIES`' counterpart for a year list.
 *
 * `buildRows` reads it to decide which month headings are open (FR-006). A fresh `new Set()` each
 * render would be a new identity every time, which is a rebuild of a year's rows on every render
 * for an answer that has not changed. Never mutated: a toggle builds a new set.
 */
const NO_OPEN_MONTHS = new Set();

/**
 * The first words of an unsaved edit, to name it in the question that would throw it away
 * (FR-013) -- or **null** when it has none.
 *
 * `contracts/ui-contract.md` asks for "[title or first words]"; a memory in this app has no
 * title, so the words are all there is, and an edit of photographs alone has not even those.
 * A null is answered with a question that names no memory rather than with an empty pair of
 * quotation marks, which reads as a defect at the one moment somebody is deciding whether to
 * lose work.
 *
 * The draft's own pieces, not the memory's: `startEdit` is given the memory's pieces and the
 * edit is kept on top of them, so these are the words as the person last left them.
 */
function draftFirstWords(draft) {
  const note = draft?.pieces?.find(
    (piece) => piece?.kind === 'text' && typeof piece.content === 'string' && piece.content.trim(),
  );
  if (!note) return null;
  const words = note.content.trim().replace(/\s+/g, ' ');
  return words.length > DRAFT_WORDS_LIMIT
    ? `${words.slice(0, DRAFT_WORDS_LIMIT).trimEnd()}…`
    : words;
}

/**
 * The civil-date range and precisions one picked period is read with (016 FR-005, FR-010).
 *
 * A month is its 1st to its last day, **day and month precision only**: a memory known only to
 * its year is stored on 1 January and belongs to its year, not to the January it happens to sit
 * in (FR-011, FR-016) -- the same answer `calendarModel.buildRows` gives, so the query and the
 * rows cannot disagree about which memories a month has.
 *
 * A year is its 1 January to its 31 December, and **every** precision -- it is the one period a
 * memory known only to its year belongs to, and `buildRows` puts those under "2026, month not
 * known" (FR-006) rather than in the January their stored 1st falls in. The three are named
 * rather than asked for as "all of them" (`null`), so a fourth precision added one day is not
 * silently swept into a year nobody taught it to.
 *
 * `null` for anything this cannot read, and that is the fail-closed answer: an unreadable period
 * must not become a query for some other range.
 *
 * ⚠ **The year test is `calendarModel`'s own `fourDigitYear`, and sharing it is the point** (fix
 * round 1, finding A). Three gates decide what a readable month is -- this one, and the model's
 * `neighbourMonth` and `monthRows` -- and a disagreement between them is not an inert one: a
 * month this accepted and the model then returned no rows for would be read, answered with
 * nothing, and drawn as a period that really holds nothing. `Number.isInteger(year)` alone let
 * `{year: 5, month: 3}` through, which `formatPeriodDate` has no words for either, so the bar
 * fell back to naming a **day** with *"No entries yet"* under it -- a claim about that day's
 * memories with no basis at all.
 *
 * `'ASC'` is the calendar order FR-005 asks for -- oldest first, within a day too. (Only a
 * single day reads `'DESC'`, which is the order the feed has today; `DatabaseService` reads the
 * word through `calendarModel.isDescending`, so anything else means ascending anyway.)
 */
function rangeFor(picked) {
  if (picked?.kind === 'year') {
    const { year } = picked;
    if (!fourDigitYear(year)) return null;

    return {
      from: `${year}-01-01`,
      to: `${year}-12-31`,
      precisions: ['day', 'month', 'year'],
      order: 'ASC',
    };
  }

  if (picked?.kind !== 'month') return null;

  const { year, month } = picked;
  if (!fourDigitYear(year) || !Number.isInteger(month)) return null;
  if (month < 1 || month > 12) return null;

  const key = monthKey(year, month);
  return {
    from: `${key}-01`,
    to: `${key}-${String(daysInMonth(year, month)).padStart(2, '0')}`,
    precisions: ['day', 'month'],
    order: 'ASC',
  };
}

/**
 * What the date bar calls a picked period (FR-007) -- "March 2026", or "2026" -- or null in day
 * mode.
 *
 * `formatPeriodDate` of a date of that precision, which is those exact words: the same call
 * `calendarModel` makes for a month heading, so the bar and a heading cannot word the same month
 * differently, and the date on a card beneath them agrees with both. A year goes through the same
 * function rather than being written out as `String(year)`, so the one module that words this
 * feature's dates keeps wording all of them.
 *
 * `picked.kind` is handed over as the precision because they are deliberately the same three
 * words: `data-model.md` names a pick `'day' | 'month' | 'year'` and a stored date's precision
 * the same, which is what lets a period be named at the precision it *is*. A fourth kind of pick
 * would need a word of its own here rather than a fourth precision in `periodDate`.
 *
 * Both read the range `rangeFor` gives, so a period this screen will not read is also a period it
 * will not name -- and a period with no name falls back to the day, which is why the two gates
 * must not be allowed to disagree (fix round 1, finding A).
 */
function periodLabel(picked) {
  if (picked?.kind !== 'month' && picked?.kind !== 'year') return null;
  const range = rangeFor(picked);
  return range ? formatPeriodDate(range.from, picked.kind) : null;
}

/**
 * The newest civil day the journal holds a day-dated memory on, or null (016 FR-012).
 *
 * **The calendar index, which is the whole journal** -- the same answer `datesWithEntries` gives
 * the arrows, taken from an index in hand rather than from the state, so that the day a save
 * lands on can be worked out from the index that read has *just* returned instead of waiting a
 * render for it.
 *
 * `index.days` counts **day-dated** memories only, which is deliberate and is FR-016's rule for
 * the arrows too: a 1st holding nothing but memories known to their month or year is reached
 * through that month, not by landing on it. So a memory saved as "sometime in 1998" does not
 * become the newest day, and the newest day is always a day ◄ ► can stand on.
 *
 * Null for no index, an index that could not be read, and a journal with no day-dated memory in
 * it -- three things with one honest answer: there is no day to show.
 */
function newestDayWithMemories(index) {
  if (!index?.days) return null;

  let newest = null;
  // Keys are `YYYY-MM-DD`, where lexicographic order *is* chronological order -- the property
  // this whole feature leans on, and the reason no date is parsed into an instant to compare it.
  index.days.forEach((_count, key) => {
    if (!newest || key > newest) newest = key;
  });
  return newest;
}

/**
 * When a memory was written, in milliseconds, or null when that cannot be read (research R5).
 *
 * `created_at` is a number everywhere it is written -- `Date.now()` for a memory saved on this
 * phone, `new Date(serverEntry.createdAt).getTime()` for one pulled from the server -- and
 * `_mapEntryRow` hands the column over untouched. Anything else answers **null**, and the one
 * caller reads null as "not a save": "cannot tell when this was written" must not become "written
 * at the beginning of time", which would make a memory of unknown age look like one just saved.
 */
function createdAtMs(entry) {
  const created = entry?.createdAt;
  return typeof created === 'number' && Number.isFinite(created) ? created : null;
}

/**
 * How many of the newest-written memories are compared across a visit to the capture screen.
 *
 * A memory just saved is the newest thing in the journal by `created_at`, so a window of the
 * newest few is all it takes to find it -- and all it takes to know it was not there before.
 * Reading the whole journal on every blur would be a per-row `JSON.parse` of every memory
 * somebody has ever written, for a question about one of them.
 *
 * Fifty rather than one, because the window has to be wide enough that a sync landing between
 * the two reads cannot push the saved memory out of it. Being wrong in that direction costs the
 * jump to the newest day and nothing else: the lists and the index are re-read either way.
 */
const SAVE_WINDOW = 50;

/**
 * Date selector component -- the date bar at the top of the feed.
 *
 * 016 FR-007: with a month (or, from T007, a year) picked, the bar **names the period and its
 * count** instead of a day -- "March 2026", and "4 memories" under it. `label` is what a period
 * is named; `count` is how many memories it holds. Neither is given in day mode, which is drawn
 * exactly as it has always been.
 *
 * ⚠ `count` is three-valued and the third value matters: `null` or `undefined` means *nobody has
 * read the period yet*, and nothing is said then. A `0` under a month whose memories are still a
 * microsecond away would be telling somebody a month of their life is empty when it is not --
 * which is the same mistake, in the same place, that the list's own empty state guards against.
 */
const DateSelector = ({ date, label = null, count = null, onPrevious, onNext, onDatePress }) => {
  const formattedDate = useMemo(() => {
    const d = new Date(date);
    return d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }, [date]);

  // `memoriesLabel` answers '' for a count there is not one of, which is how "say nothing" and
  // "say 0 memories" stay two different outcomes.
  const counted = label ? memoriesLabel(count) : '';

  return (
    <View style={styles.dateSelector}>
      {/*
        ⚠ The two arrows are named (T007). A year list draws a `chevron-forward` of its own on
        every closed month heading, so "the one button on screen with a forward chevron in it" is
        no longer the date bar's ► -- and a test that pressed the wrong one would browse somebody's
        months while believing it had moved the Journal. The names are also what T009's spoken
        labels will hang on.
      */}
      <TouchableOpacity testID="date-bar-previous" style={styles.dateArrow} onPress={onPrevious}>
        <Ionicons name="chevron-back" size={20} color="#666" />
      </TouchableOpacity>
      <TouchableOpacity testID="date-bar-period" onPress={onDatePress}>
        <Text style={styles.dateText}>{label || formattedDate}</Text>
        {counted ? <Text style={styles.dateCount}>{counted}</Text> : null}
      </TouchableOpacity>
      <TouchableOpacity testID="date-bar-next" style={styles.dateArrow} onPress={onNext}>
        <Ionicons name="chevron-forward" size={20} color="#666" />
      </TouchableOpacity>
    </View>
  );
};

/**
 * Sync status indicator
 */
const SyncStatusIndicator = ({ pendingCount, failedCount = 0, isOnline }) => {
  const status = syncBadgeStatus({ pendingCount, failedCount, isOnline });

  // Failures are not a backlog: they will not retry themselves and must not be
  // reported as either "pending" or "Synced".
  if (status === SyncBadgeStatus.FAILED) {
    return (
      <View style={styles.syncStatus}>
        <Ionicons name="alert-circle" size={16} color="#FF3B30" />
        <Text style={[styles.syncText, { color: '#FF3B30' }]}>
          {failedCount === 1 ? '1 not sent' : `${failedCount} not sent`}
        </Text>
      </View>
    );
  }

  if (status === SyncBadgeStatus.SYNCED) {
    return (
      <View style={styles.syncStatus}>
        <Ionicons name="cloud-done" size={16} color="#34C759" />
        <Text style={[styles.syncText, { color: '#34C759' }]}>Synced</Text>
      </View>
    );
  }

  if (status === SyncBadgeStatus.PENDING) {
    return (
      <View style={styles.syncStatus}>
        <Ionicons name="cloud-upload" size={16} color="#FF9500" />
        <Text style={[styles.syncText, { color: '#FF9500' }]}>
          {pendingCount} pending
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.syncStatus}>
      <Ionicons name="cloud-offline" size={16} color="#8E8E93" />
      <Text style={[styles.syncText, { color: '#8E8E93' }]}>Offline</Text>
    </View>
  );
};

/**
 * Empty state component
 */
const EmptyFeed = () => (
  <View style={styles.emptyState}>
    <View style={styles.emptyIcon}>
      <Ionicons name="book-outline" size={48} color={PRIMARY_COLOR} />
    </View>
    <Text style={styles.emptyTitle}>No entries yet</Text>
    <Text style={styles.emptySubtitle}>
      Start journaling your thoughts, photos, and memories
    </Text>
  </View>
);

/**
 * Main JournalScreen component
 */
export default function JournalScreen({ navigation }) {
  // Auth context for user info
  const { user: authUser, isAuthenticated } = useAuth();
  
  // State
  const [selectedDate, setSelectedDate] = useState(new Date());
  // The old composer. Nothing opens it any more -- T060 pointed its last opener, the detail
  // view's Edit, at the capture screen -- so no user action ever flips this true. T068
  // (which removed what this feature made dead elsewhere) left this mount and
  // `handleSaveEntry` in place on purpose: `entryLocationSharing.journey.test.js` reaches
  // them as `screen.root.findByType(JournalComposeModal).props.onSave(...)`, a backdoor into
  // this screen's own createEntry/DB/wire wiring that has nothing to do with opening the
  // modal. Removing the mount breaks that real regression coverage for no user-visible gain,
  // so it stays until that test is rewritten to exercise the same wiring another way.
  const [showComposeModal, setShowComposeModal] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [showEntryDetail, setShowEntryDetail] = useState(false);
  const [journalId, setJournalId] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [swipeGesturesEnabled, setSwipeGesturesEnabled] = useState(true);
  
  // Gallery modal state
  const [showEntryGallery, setShowEntryGallery] = useState(false);
  const [galleryEntry, setGalleryEntry] = useState(null);
  
  // Full-screen media viewer state
  const [showMediaViewer, setShowMediaViewer] = useState(false);
  const [viewerMedia, setViewerMedia] = useState([]);
  const [viewerMediaType, setViewerMediaType] = useState('photo');
  const [viewerInitialIndex, setViewerInitialIndex] = useState(0);
  
  // ---------------------------------------------------------------------------------------
  // The calendar sheet (016 User Story 1)
  // ---------------------------------------------------------------------------------------

  /** Whether the book-style calendar is up. Only ever set true with an index in hand -- see
   *  `openCalendar`. */
  const [showCalendarSheet, setShowCalendarSheet] = useState(false);

  /**
   * Which days, months and years hold memories, over the whole journal (`calendarIndex` in
   * `data-model.md`). Null until the first read lands, and never set back to null afterwards.
   */
  const [calendarIndex, setCalendarIndex] = useState(null);

  /**
   * The selected day's memories, read from the phone's own database (FR-004, FR-010).
   *
   * **`null` means "not read yet"**, which is a different thing from `[]` ("read, and there are
   * none"): the empty state below says *"No entries yet"*, and saying that about a day whose
   * memories are still a microsecond away would be telling somebody their day is empty when it
   * is not. The list's `ListEmptyComponent` is withheld until there is an answer.
   */
  const [dayEntries, setDayEntries] = useState(null);

  /**
   * The period the calendar put on screen instead of a single day (`picked` in `data-model.md`).
   *
   * `null` is day mode -- the Journal exactly as it has always been, on `selectedDate`. A month
   * is `{kind: 'month', year, month}` (FR-005); a year is `{kind: 'year', year}` (FR-006). A day
   * pick sets `selectedDate` and puts this back to `null`, which is what makes a day and a period
   * one choice rather than two that can both be on.
   */
  const [picked, setPicked] = useState(null);

  /**
   * Which months of a picked year are open (FR-006), or **null** for "nobody has chosen yet".
   *
   * Three-valued in the same spirit as `periodEntries`, and the third value is what FR-006's
   * *"the first heading MUST be open"* needs: which month is first cannot be known when the year
   * is picked, because its memories have not been read yet, so it is `displayRows` that opens the
   * first heading -- and it may only do that while nobody has said otherwise. A person who closes
   * every month is left with every month closed, and reopening the first under them would be the
   * screen overruling a tap.
   *
   * Month keys (`'2026-03'`, or `'2026:rough'` for the "month not known" heading), which is what
   * `buildRows` puts on a heading row, so they are the year's own keys and cannot be carried into
   * another year by accident -- and the set is let go of whenever the period changes anyway.
   */
  const [openMonths, setOpenMonths] = useState(null);

  /**
   * The picked period's memories, read from the phone's own database (FR-005, FR-010).
   *
   * **Three-valued, exactly as `dayEntries` is, and for the same reason.** `null` means "not read
   * yet, or a read that failed"; `[]` means "read, and there are none". A month that could not be
   * read must not be drawn as a month with nothing in it -- *"No entries yet"* over March, or a
   * date bar reading *"0 memories"*, is this screen making a claim about somebody's own memories
   * that it has no basis for. The list's empty state and the bar's count are both withheld until
   * there is an answer.
   */
  const [periodEntries, setPeriodEntries] = useState(null);

  // Whether a typed note is still being kept. See `handleSendMessage` and `KEEPING_NOTE`.
  const [keepingNote, setKeepingNote] = useState(false);

  // Real-time context
  const { isConnected, unreadNotificationCount } = useRealtime();

  // Sync context
  const { pendingCount, failedCount } = useSync();
  
  // Real-time journal updates
  const {
    hasNewEntries,
    newEntryCount,
    clearNewEntries,
    isConnected: realtimeConnected,
  } = useJournalRealtime({
    onNewEntry: (entry) => {
      console.log('[JournalScreen] New entry received:', entry);
      // Refresh entries when new one arrives
      if (journalId) {
        refresh();
      }
    },
  });

  // Initialize journal on mount
  useEffect(() => {
    initializeJournal();
  }, []);

  /**
   * Initialize or get the default journal
   */
  const initializeJournal = async () => {
    try {
      setIsInitializing(true);
      const userId = authUser?.id || null;
      const defaultJournalId = await SettingsService.getOrCreateDefaultJournal(userId);
      setJournalId(defaultJournalId);
      console.log('[JournalScreen] Initialized with journal:', defaultJournalId);
    } catch (error) {
      console.error('[JournalScreen] Failed to initialize journal:', error);
    } finally {
      setIsInitializing(false);
    }
  };

  // Use the journal hook with the journalId
  const {
    entries,
    loading,
    error,
    refreshing,
    hasMore,
    refresh,
    loadMore,
    createEntry,
    deleteEntry: deleteJournalEntry,
  } = useJournal(journalId, {
    autoFetch: !!journalId, // Only fetch when journalId is available
  });

  // The sync listener used to sit here, where its subject (`journalId`, `refresh`) is. It is now
  // below the two local reads, because T008 has it re-read those as well and a `const` declared
  // further down this function cannot be named in a dependency array up here.

  // User display info - uses authUser from context
  const user = useMemo(() => ({
    name: authUser?.name || 'You',
    avatarUrl: authUser?.avatarUrl || 'https://randomuser.me/api/portraits/women/47.jpg',
  }), [authUser]);

  // `isSameDay` -- a civil-day comparison over the loaded feed -- lived here, and T008 took its
  // last caller away: the day the Journal lands on is now asked of the calendar index, which
  // answers in `YYYY-MM-DD` keys and needs no comparison of its own. `journalDate.isSameDay` is
  // still the one place that rule lives, for everything else that needs it.

  /**
   * All entries used for both display and calendar marking. Always the user's
   * real entries from the local database — no mock/demo fallback, so an empty or
   * still-loading journal never renders another person's fabricated entries.
   */
  const allEntries = entries;

  // "Show me what I have never written about." A photograph without context decays into an
  // unidentifiable image, and this is how somebody finds theirs while they can still ask.
  const [noStoryOnly, setNoStoryOnly] = useState(false);

  const noStoryEntries = useMemo(() => entriesNeedingStory(allEntries), [allEntries]);

  /** The day on screen, as a civil-date key. `selectedDate` is a `Date`, so `toDateKey` is
   *  the right reader for it -- `dayKeyOf` answers about stored dates and whole entries. */
  const selectedDateKey = useMemo(() => toDateKey(selectedDate), [selectedDate]);

  // ---------------------------------------------------------------------------------------
  // The two local reads (016 FR-010): the calendar's index, and the open day's memories.
  //
  // Both go to the database rather than to `allEntries`. The feed hook above is paged -- it
  // asks for 20 and for 20 more at the end of the list -- so filtering what it has loaded
  // can only ever answer about the newest page. A journal of 100 memories had 80 of them
  // unreachable from the date bar, and the days they were on were not even arrow stops.
  // ---------------------------------------------------------------------------------------

  /**
   * Read the whole journal's index and keep it, answering with it.
   *
   * Answers `null` when there is nothing to read from yet **or** the read failed -- two
   * different things, which `openCalendar` tells apart for itself by asking about `journalId`
   * before it gets here, because only one of them is worth saying out loud.
   *
   * That null is what `openCalendar` below tests: a `CalendarSheet` given no index draws **every** day, month and
   * year faded and inert -- a calendar indistinguishable from an empty journal, with no way
   * forward but closing it again. Recorded rather than said here, because this runs on arrival
   * at the Journal without anybody having asked for anything; `openCalendar` is the explicit
   * action, and that is where a failure is said out loud.
   */
  const loadCalendarIndex = useCallback(async () => {
    if (!journalId) return null;
    try {
      const rows = await DatabaseService.getCalendarIndexRows(journalId);
      const next = buildIndex(rows);
      setCalendarIndex(next);
      return next;
    } catch (error) {
      console.warn('[JournalScreen] the calendar could not be read', error?.message);
      return null;
    }
  }, [journalId]);

  // The index loads when the journal loads. It is read again on the way into the sheet
  // (`openCalendar`) and, with the day and the picked period, by every freshness trigger --
  // a sync, the Journal coming back into view, an edit, a delete, pull-to-refresh, a card
  // action. All of them go through `reloadListsAndIndex`; see the block beside it.
  useEffect(() => {
    loadCalendarIndex();
  }, [loadCalendarIndex]);

  /**
   * **What the list is showing right now: the day, and the picked period.** The two reads below
   * ask these rather than the values they were made with.
   *
   * ⚠ **This is what stops one day's memories being drawn under another day's date** (fix round 1,
   * finding A), and it is not a tidiness question.
   *
   * `reloadDay` is a `useCallback`, so every copy of it closes over the day it was made with --
   * and the freshness triggers hold copies across an `await` of their own. `handleRefresh` awaits
   * the paged feed, the sync listener awaits `getDefaultJournalId`, and `handleReact` awaits a
   * **network** round trip; if the person steps a day during that await, the copy that resumes is
   * the one made for the day they have left. It then takes a *newer* token than the day change's
   * own read and writes the old day's memories, because the token counts reads and knows nothing
   * about days. The result is the previous day's cards under the new date, until some later
   * trigger happens to read again. Reproducible with one gesture: pull to refresh, then swipe.
   *
   * So the reads take the day and the pick from here, at the moment they run, and check them
   * **again** before writing. Taking it at the start alone would still leave the gap between a
   * commit and its effects, where a read can start before these refs have caught up; the check at
   * the write end closes that, by refusing to write an answer about a day that is no longer on
   * screen. The day change's own read provides the right one.
   *
   * Refs rather than dependencies, deliberately: that is what makes a stale copy of the function
   * safe instead of making the copies unique, and it leaves `reloadDay` and `reloadPeriod` -- and
   * so `reloadListsAndIndex` and every subscription keyed on it -- stable across a day change.
   */
  const dayOnScreenRef = useRef(selectedDateKey);
  const pickOnScreenRef = useRef(picked);
  useEffect(() => {
    dayOnScreenRef.current = selectedDateKey;
    pickOnScreenRef.current = picked;
  }, [selectedDateKey, picked]);

  /**
   * Which day read is the current one.
   *
   * Two reads can be outstanding at once -- ◄ ► pressed twice in quick succession -- and
   * without this the slower one would win and put the wrong day's memories under the date on
   * the bar. Only the newest token may write.
   *
   * It counts reads and says nothing about *which* day a read is about, which is why the day
   * itself is checked beside it -- see `dayOnScreenRef` above.
   */
  const dayReadRef = useRef(0);

  /**
   * The open day's memories, newest first, every precision: a day shows what is known to be
   * that day **and** what is known only to its month or year, which the holding area stores on
   * the 1st (FR-004, FR-016). `'DESC'` is the feed's own order, kept.
   */
  const reloadDay = useCallback(async () => {
    const token = dayReadRef.current + 1;
    dayReadRef.current = token;

    // **The day on screen now**, not the day this copy of the function was made for. See
    // `dayOnScreenRef`: a trigger that awaited something of its own may be resuming a day late.
    const day = dayOnScreenRef.current;

    // Nothing to read from yet. Deliberately **not** `setDayEntries(NO_ENTRIES)`: see the
    // `catch` below for why an absent answer must not be recorded as an empty one.
    if (!journalId || !day) return;

    try {
      const found = await DatabaseService.getEntriesInRange(
        journalId,
        day,
        day,
        null,
        'DESC',
      );
      // Newest read, **and** still about the day on screen. The second half is what refuses an
      // answer that arrived about a day the person has already left.
      if (dayReadRef.current === token && dayOnScreenRef.current === day) setDayEntries(found);
    } catch (error) {
      // ⚠ **`dayEntries` is left exactly as it was -- `null` after a day change, which the
      // list draws as nothing at all.**
      //
      // It used to be set to `[]` here, and `[]` means "read, and there are none": the empty
      // state under it then draws *"No entries yet -- Start journaling your thoughts, photos,
      // and memories"* over a day that may hold twenty. That is not an empty page a person can
      // read as a failure; it is this screen making a positive claim about somebody's own data
      // that it has no basis for. And it is reachable on its own: this query is different SQL
      // from the feed's -- its own `substr`, its own precision clause -- so it can fail while
      // the feed is perfectly healthy and the rest of the screen looks fine.
      //
      // A display that cannot determine its contents must not render as though it had. One
      // state fewer, too: `null` already means "no answer", which is the honest answer here.
      //
      // Recorded rather than said: this is a read the person did not ask for, and an alert over
      // somebody's memories on every failed day would be worse than a quiet page. The next day
      // change, card action or save reads again.
      console.warn('[JournalScreen] the day could not be read', error?.message);
    }
  }, [journalId]);

  // Whenever the day or the journal changes. The last day's memories are let go of first, so
  // that nothing is ever drawn under a date it does not belong to.
  //
  // `selectedDateKey` is named here rather than carried in `reloadDay`'s identity, which is what
  // the refs above cost: the function no longer changes when the day does, so the day has to be
  // the effect's own dependency. The journal comes in through `reloadDay`, which still closes
  // over it. The ref-sync effect above is declared first, so it has already run.
  useEffect(() => {
    setDayEntries(null);
    reloadDay();
  }, [reloadDay, selectedDateKey]);

  /**
   * Which period read is the current one -- `dayReadRef`'s counterpart for a month.
   *
   * The bug it prevents is the one the arrows make easy: ► pressed twice, or a month picked and
   * then another, leaves two reads outstanding, and without this the slower one would win and
   * draw March's memories under June's name on the bar. Only the newest token may write.
   */
  const periodReadRef = useRef(0);

  /**
   * The picked period's memories, oldest first (FR-005).
   *
   * Day **and** month precision for a month, and `rangeFor` is the one place that decides that:
   * a memory known only to its year sits on a stored 1 January and belongs to its year, not to
   * that January (FR-016).
   *
   * Nothing is read, and nothing is recorded, in day mode: `periodEntries` stays as it was and
   * `displayEntries` is not reading it. The token is still taken, so a period read that was
   * already outstanding when the person picked a day cannot land afterwards.
   */
  const reloadPeriod = useCallback(async () => {
    const token = periodReadRef.current + 1;
    periodReadRef.current = token;

    // The period on screen now, for the reason the day is read that way -- `dayOnScreenRef`.
    const period = pickOnScreenRef.current;
    const range = rangeFor(period);
    // Nothing to read, or nothing readable. Deliberately **not** `setPeriodEntries(NO_ENTRIES)`:
    // see the `catch` below, and `reloadDay`'s, for why an absent answer is not an empty one.
    if (!journalId || !range) return;

    try {
      const found = await DatabaseService.getEntriesInRange(
        journalId,
        range.from,
        range.to,
        range.precisions,
        range.order,
      );
      // Newest read, **and** still about the period on screen -- compared by identity, which is
      // exactly right: `picked` is replaced whole on every pick, so the same month picked again
      // is a different object and a new question.
      if (periodReadRef.current === token && pickOnScreenRef.current === period) {
        setPeriodEntries(found);
      }
    } catch (error) {
      // ⚠ Left exactly as it was -- `null` after a period change, which the list draws as nothing
      // at all and the date bar as a period with no count. This query is its own SQL, with its own
      // precision clause, so it can fail while the rest of the screen looks perfectly healthy;
      // answering `[]` here would put *"No entries yet"* over a March holding twenty memories.
      // Recorded rather than said, as the day's read is: nobody asked for this read, and an alert
      // over somebody's memories on every failed month would be worse than a quiet page.
      //
      // **"period", not "month"** (T007 fix round 1, A): this `catch` is the one a year's failed
      // read lands in too, and a line naming a month would send whoever read it in a production
      // console looking at the wrong half of the screen.
      console.warn('[JournalScreen] the period could not be read', error?.message);
    }
  }, [journalId]);

  // Whenever the picked period or the journal changes. The last period's memories are let go of
  // first, so that nothing is ever drawn under a period it does not belong to -- and so is which
  // of its months were open: they are that year's keys, and a new year opens at its own first
  // heading (FR-006) rather than at whichever months the last one was left on.
  //
  // Only from here, so a card action's own `reloadPeriod` does not shut a month under somebody.
  // `picked` is named rather than carried in `reloadPeriod`'s identity (fix round 1, A), and the
  // trigger set is unchanged by that: the pick and the journal, and nothing else.
  useEffect(() => {
    setPeriodEntries(null);
    setOpenMonths(null);
    reloadPeriod();
  }, [reloadPeriod, picked]);

  /**
   * **Everything this screen reads from the phone, read again: the open day, the picked period,
   * and the calendar's index.** Every freshness trigger below goes through here and nothing adds
   * a read of its own.
   *
   * **One function, because the three must not drift apart.** They were two calls and the second
   * was missed where it mattered most: a memory saved onto a day that had none appeared on the
   * day it was saved to, and then that day was *not* a stop for ◄ ►, and its tile in the
   * calendar was faded and untappable, until the sheet happened to be opened again. Before this
   * feature the arrows read the live feed and a new day became a stop at once, so that was a
   * loss. The day's memories and "which days hold memories" are two answers to one question and
   * are re-read together from here on.
   *
   * A card action does not change which days hold memories, so for a like or a reply the index
   * half is insurance rather than a fix -- and cheap, being one grouped read of the phone's own
   * database. Having one function spend it is worth more than having two that can diverge.
   *
   * ⚠ **It re-reads; it never resets.** The reads it calls are the token-guarded ones, and
   * neither of them touches `openMonths` -- which only the period-change effect above lets go
   * of. A freshness trigger that shut the months somebody had opened would be the most visible
   * regression available in this screen (T007's own case asserts they survive).
   *
   * **Renamed from `reloadDayAndIndex` (T008)**, which named two of its three reads: T006 added
   * the period to it and kept the old name deliberately, to preserve the line references the
   * remaining task briefs carried. This is the last task to edit these call sites.
   *
   * **It answers with the index it read**, or null if that read failed, so a caller that has to
   * know which day is newest can ask the answer it has just fetched rather than waiting a render
   * for the state to catch up. That is FR-012's whole difficulty: the day a save lands on is
   * decided from an index that includes the save.
   */
  const reloadListsAndIndex = useCallback(async () => {
    await reloadDay();
    // The picked period with them, for the same reason the index is here: a like tapped on a card
    // in a month list leaves that list a separate read, which would go on showing the counts it
    // was drawn with. Extended rather than paired with a second function of its own, so the three
    // reads behind one screen cannot drift apart -- which is the mistake this function was merged
    // to stop. `reloadPeriod` returns at once in day mode, and the day's read is worth making in
    // month mode: it is one grouped read of the phone's own database, and without it a person who
    // liked a memory in March and then picked its own day would be shown the count from before.
    await reloadPeriod();
    return loadCalendarIndex();
  }, [reloadDay, reloadPeriod, loadCalendarIndex]);

  /**
   * Show the newest day, closing any picked month or year (016 FR-012).
   *
   * **The one home of "the newest day"**, which two rules ask for: the Journal after a memory is
   * created (FR-012), and the "needs a story" chip being switched on over a month or a year
   * (FR-013's other half, the spec's Edge Cases -- *"shows the filtered memories on the newest
   * day, as from a day"*). Both mean the same thing and must not drift into meaning two.
   *
   * `index` is the index to decide the day from -- the one a re-read has just returned where a
   * memory has just been saved, and the one in hand where nothing has changed.
   *
   * **The period is closed whether or not there is a newest day to go to.** The two halves are
   * separate facts: a month left on screen after a save is how a memory saved outside that month
   * becomes invisible, which is what FR-012 exists to prevent, and that is true even when the
   * index could not be read. With no newest day the day underneath is left exactly as it was --
   * there is no day this screen could claim to know about -- and a day is at least a live list.
   */
  const showNewestDay = useCallback((index) => {
    setPicked(null);

    const newest = newestDayWithMemories(index);
    if (newest) setSelectedDate(parseDateKey(newest));
  }, []);

  // ---------------------------------------------------------------------------------------
  // Keeping all three fresh (016 FR-004, FR-012; research R5)
  //
  // ⚠ **The day used to be a live projection of the journal and is not any more**, and these
  // are what put that back. It was `allEntries.filter(sameDay)`, and `useJournal` keeps
  // `allEntries` live through `JournalService`'s events, so *every* mutation reached the day
  // instantly from anywhere -- the capture screen, a detail view, a sync pull. T005 replaced
  // that projection with an independent read of the database, which answers once and then sits
  // there. So a memory saved on the capture screen did not appear, and a deleted card stayed on
  // screen, which reads to a person as a delete that failed rather than as a list that is stale.
  //
  // Six triggers, every one of them through `reloadListsAndIndex` and none of them with a read
  // of its own:
  //
  //   1. the journal or the day changing            -- the two effects above
  //   2. a card action (a like, a reply, a reshare)  -- T005's call sites
  //   3. `SYNC_COMPLETED`                            -- below
  //   4. `entryUpdated` / `entryDeleted`             -- below (`entryCreated` is never emitted)
  //   5. the Journal coming back into view           -- below, which is also where a save is
  //                                                     detected (FR-012)
  //   6. pull-to-refresh and the "N new entries" banner -- `handleRefresh`
  // ---------------------------------------------------------------------------------------

  /**
   * A sync landing: the journal id adopted, the feed refreshed, and now the three local reads.
   *
   * The adoption half is pre-existing and unchanged. The sync bootstrap adopts the user's
   * *server* journal id as the default and stores it, and this screen reads the default once on
   * mount, which can race ahead of that reconciliation -- leaving it pointed at a stale local
   * journal id with no entries. Once the first pull completes, the default is re-read and
   * adopted so the screen queries the same journal the pulled entries were stored under.
   *
   * **Adopting a different journal needs nothing else**: all three reads are keyed on
   * `journalId`, so their own effects re-run and re-read everything. It is the other branch --
   * the same journal, with new memories in it -- that T008 adds the re-read to. A sync pull is
   * the one source of new memories nobody on this phone asked for, and this is the only thing
   * that announces it.
   *
   * Widened rather than given a second subscription of its own, so there is one listener and one
   * order of work after a sync.
   */
  useEffect(() => {
    const unsubscribe = SyncEngine.addListener(async (event) => {
      if (event !== SyncEvent.SYNC_COMPLETED) return;
      try {
        const latest = await SettingsService.getDefaultJournalId();
        if (latest && latest !== journalId) {
          setJournalId(latest);
          return;
        }
        if (journalId) {
          refresh();
          await reloadListsAndIndex();
        }
      } catch (err) {
        console.warn('[JournalScreen] post-sync journal adoption failed:', err?.message);
      }
    });
    return unsubscribe;
  }, [journalId, refresh, reloadListsAndIndex]);

  /**
   * A memory edited or deleted **anywhere**, as the service announces it.
   *
   * `useJournal` has listened to these two since long before this feature, and that is exactly
   * why the day stopped following them: it replaces the entry in `allEntries`, which the day is
   * no longer drawn from. The day, the picked period and the index are read again here, from the
   * one function that reads all three.
   *
   * **A delete is the one this matters most for.** A card still on the day after the memory has
   * gone reads as a delete that did not work -- and the delete may have happened anywhere: the
   * detail view, the capture screen, another device's delete arriving in a pull.
   *
   * There is no `entryCreated` to listen for: `JournalService` does not emit one (it says so at
   * its own create path, and `useJournal` synthesises it for itself), which is why a memory
   * created on the capture screen is detected by comparing the journal across a visit instead.
   *
   * Not filtered by journal: the reads are scoped to this screen's `journalId` anyway, so an
   * event about another journal costs one grouped local read and can change nothing on screen.
   */
  useEffect(() => {
    const unsubscribers = [
      JournalService.on('entryUpdated', () => { reloadListsAndIndex(); }),
      JournalService.on('entryDeleted', () => { reloadListsAndIndex(); }),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [reloadListsAndIndex]);

  /**
   * What the journal held the moment the Journal was last left, so a memory saved while it was
   * away can be told from one that merely arrived (research R5).
   *
   * `{at, ids}`: the instant of the blur, and a promise of the `local_id`s of the newest-written
   * memories at that instant. **A promise and not a set**, because a cleanup function cannot
   * wait for anything -- so the read is started at the blur and awaited on the way back in, which
   * is a second or more later in every case but a tab tapped twice.
   *
   * Null while the Journal is on screen and has not been left.
   */
  const whatTheJournalHeld = useRef(null);

  /**
   * Whether this screen is still mounted, for the blur below to ask.
   *
   * A focus effect's cleanup runs on a blur **and** on an unmount, and the two are
   * indistinguishable from inside it -- so leaving the app was taking a note of what the journal
   * held for a visit that will never come back, which is a real database query on every teardown
   * (fix round 1, finding D). Declared **before** the focus effect on purpose: React runs an
   * unmount's cleanups in the order their effects were declared, so this one has already said so
   * by the time the blur's runs.
   */
  const stillMountedRef = useRef(true);
  useEffect(() => () => {
    stillMountedRef.current = false;
  }, []);

  /**
   * The newest-written memories of this journal, or **null** if they cannot be read.
   *
   * Null is load-bearing: the one caller counts a save only against an answer it really has, so
   * a failed read means no save is counted -- the Journal stays where it is and the lists are
   * read again anyway. The opposite reading (an empty answer, "nothing was here") would make the
   * next memory a sync happened to bring look like something the person had just saved.
   *
   * Newest-written rather than the whole journal: see `SAVE_WINDOW`. `created_at` and not `date`,
   * because this is about when a memory was *written*, never about when it happened -- a memory
   * saved today of a day in 1998 is as much a save as any other.
   *
   * On the web build the database shim ignores an `ORDER BY` and a `LIMIT` and hands back the
   * journal whole (see `DatabaseService`'s note on it). That is a superset of this window and
   * answers the same question, so no second path is needed here.
   */
  const newestWritten = useCallback(async () => {
    if (!journalId) return null;
    try {
      return await DatabaseService.getEntriesByJournalId(journalId, {
        limit: SAVE_WINDOW,
        orderBy: 'created_at',
        order: 'DESC',
      });
    } catch (error) {
      // Recorded, not said: nobody asked for this read, and all it decides is whether the
      // Journal moves itself to the newest day.
      console.warn('[JournalScreen] could not tell what the journal held', error?.message);
      return null;
    }
  }, [journalId]);

  /**
   * The moving parts the focus effect below needs, as of the last render.
   *
   * ⚠ **A ref and not a dependency list, deliberately.** `reloadListsAndIndex`'s identity
   * changes with the journal, the day and the pick, and React Navigation's `useFocusEffect`
   * re-runs the whole effect -- cleanup and body -- whenever its callback's identity changes.
   * Depending on it would therefore record a blur and compare a journal against itself every
   * time somebody stepped a day, which is two database reads and a comparison for an event that
   * did not happen. The effect is keyed on nothing instead, so it runs once per real focus and
   * once per real blur, and reads the current values from here.
   */
  const onFocusWork = useRef(null);
  useEffect(() => {
    onFocusWork.current = {
      reloadListsAndIndex, newestWritten, showNewestDay, reader: authUser?.id,
    };
  });

  /**
   * Coming back to the Journal: read everything again, and if a memory was saved while it was
   * away, show the newest day (FR-012).
   *
   * **Both, in that order, and the first happens whether or not the second does.** A sync can
   * land while the screen is away, so the lists and the index are read again on every return;
   * and the day FR-012 lands on is decided from the index *that* read returned, so it is an
   * index that already holds the saved memory.
   *
   * **How a save is told from anything else** (research R5, round 4, N1). `JournalService` emits
   * no `entryCreated`, so there is nothing to listen for: creation moved to 013's capture screen,
   * which is a different screen, and the comparison across a blur/focus pair also catches a
   * memory saved while the app was in the background. A memory counts as just saved only when
   *
   *   - its `local_id` was **not** in the journal when the Journal was left, and
   *   - its `created_at` is **after** the moment it was left, and
   *   - its `user_id` is the **reader's own**,
   *
   * **whatever its sync status**, because the app syncs straight after saving and a saved memory
   * is "synced" within the second. All three, and each rules out something real: a friend's
   * memory arriving in a pull (the third), the reader's own older memory arriving from another
   * device (the second), and a memory already on screen whose stored `created_at` is in the
   * future -- a phone whose clock was wrong, or a server copy stamped ahead (the first).
   *
   * Discarding, closing the capture screen, or switching tabs and coming back changes nothing:
   * no new memory, no jump.
   *
   * **It fails closed towards not moving the screen.** No reader, no snapshot, a read that
   * failed: all of them mean "no save counted", which leaves somebody looking at the day they
   * chose. The opposite failure -- moving the Journal off the day somebody was reading because a
   * sync brought somebody else's memory -- is the one with something to lose.
   */
  useFocusEffect(
    useCallback(() => {
      const work = onFocusWork.current;
      const held = whatTheJournalHeld.current;
      whatTheJournalHeld.current = null;

      let left = false;

      // **Arriving for the first time is not coming back**, and nothing is read again for it.
      // With nothing held there was no blur, so this is the screen's own first focus and the
      // three effects above are reading all of it as this runs; reading it again here would
      // double every read on arrival. It is also the one focus at which no memory can have been
      // saved in between. (A memory saved from another tab before the Journal was ever opened is
      // not lost by this: the first index read lands the Journal on the newest day of the
      // journal, which is that memory's day.)
      if (held && work) {
        (async () => {
          const index = await work.reloadListsAndIndex();
          if (left) return;

          const before = await held.ids;
          const now = await work.newestWritten();
          if (left || !before || !now || !work.reader) return;

          const saved = now.some((entry) => {
            if (entry?.userId !== work.reader) return false;
            if (before.has(entry.localId)) return false;
            const written = createdAtMs(entry);
            return written !== null && written > held.at;
          });

          if (saved) work.showNewestDay(index);
        })();
      }

      return () => {
        // ⚠ Nothing started above may write after this point: the screen is not on screen any
        // more, and `showNewestDay` would move the Journal under somebody on their way back to
        // it. (The reads themselves are token-guarded for the same reason.)
        left = true;

        // Nothing to come back to: this is the screen going away, not the person. Asked before
        // the read rather than after it, because the read is the cost (finding D).
        if (!stillMountedRef.current) return;

        // What the journal holds, as it is left. The read is started and not waited for -- a
        // cleanup cannot wait -- and is awaited on the way back in. Recorded on **every** blur,
        // including the first, which is the whole point of registering a cleanup even where
        // there was nothing to compare on the way in.
        whatTheJournalHeld.current = {
          at: Date.now(),
          ids: onFocusWork.current
            ? onFocusWork.current
              .newestWritten()
              .then((rows) => (rows ? new Set(rows.map((entry) => entry.localId)) : null))
            : Promise.resolve(null),
        };
      };
    }, []),
  );

  /**
   * The "needs a story" worklist on or off (016 FR-013).
   *
   * **The chip and a picked period are mutually exclusive, and this is one of the two places
   * that makes them so.** The other is `handleCalendarPick`, which switches the chip off when a
   * day, a month or a year is picked. Here it is the other way round, which the spec's Edge
   * Cases spell out and which is easy to miss: *turning it on while a month or year is shown
   * closes that month or year and shows the filtered memories on the newest day, as from a day.*
   *
   * So the period is not merely dropped -- the day underneath is the newest day, exactly as a
   * save lands (FR-012), through the same `showNewestDay`. Dropping the pick alone would leave
   * the person on whatever day the calendar was last on, which is what they would be given back
   * when the chip went off again: a day they never chose.
   *
   * T006 kept the pick instead, and hid it: `periodOnScreen = noStoryOnly ? null : picked` made
   * the bar, the list, the arrows and the reopened sheet all go on showing the day, so the tap on
   * March looked dead and March surfaced later, when the chip happened to be switched off. That
   * guard is **gone** rather than guarding an unreachable state: with the two exclusive, there is
   * no `noStoryOnly && picked` left for anything to describe, and everything on this screen reads
   * `picked` directly.
   *
   * Switching the chip **off** moves nothing: the day underneath is the one the chip arrived on.
   */
  const toggleNoStory = useCallback(() => {
    if (noStoryOnly) {
      setNoStoryOnly(false);
      return;
    }

    // Nothing is re-read on the way: switching a filter on changes no memory, so the index in
    // hand is the index. (A period is only pickable at all because the index already holds it.)
    if (picked) showNewestDay(calendarIndex);
    setNoStoryOnly(true);
  }, [noStoryOnly, picked, showNewestDay, calendarIndex]);

  const displayEntries = useMemo(() => {
    // The worklist ignores the selected day on purpose. Somebody asking what they have
    // never written about wants every such memory, not the ones that happen to share a
    // date with whatever the calendar was left on -- which would usually be none. It reads
    // the loaded feed, exactly as it did before: widening it is not this task's.
    //
    // Asked first, and the order does not matter: FR-013 makes the chip and a pick exclusive, so
    // `noStoryOnly` and `picked` are never both on. It stays first because this is the branch a
    // reader expects to be checked first.
    if (noStoryOnly) return noStoryEntries;

    // A picked month or year, or the open day. **This is the one answer to "which memories are on
    // screen"**, which is what the card actions resolve a tapped memory from (finding G1) and
    // what the rows below are built out of -- so a like in a month list reaches the right memory
    // without a second notion of what is on screen to keep in step.
    if (picked) return periodEntries || NO_ENTRIES;

    return dayEntries || NO_ENTRIES;
  }, [noStoryOnly, noStoryEntries, picked, periodEntries, dayEntries]);

  /**
   * The rows of a month or year list, or **null** in day mode (research R8).
   *
   * One flat list, never a `SectionList`: a card's map pin scrolls by row index
   * (`scrollPieceIntoView`) and a section list has no `scrollToIndex` at all, so a month drawn as
   * one would call a function that does not exist the moment a pin is pressed. Every row -- a
   * grey day heading as much as a card -- is therefore a row of the same list, with a flat index
   * of its own.
   *
   * The shaping is `calendarModel.buildRows`': which day a memory is on, what a heading says, and
   * that a month's month-only memories come last under "March 2026". None of that is decided
   * here, so there is one implementation of it and it is the one with its own tests.
   *
   * Null rather than an empty array in day mode, because "no rows" and "this is not a list of
   * rows" are different things: a day draws its entries directly, exactly as it does today.
   */
  const displayRows = useMemo(() => {
    // A day, or the worklist -- which is a list of memories and not of a period, and cannot be
    // on with a period picked (FR-013). Either way the day feed's own shape.
    if (!picked) return null;

    const chosen = buildRows(displayEntries, picked, openMonths);

    /*
     * FR-006: **the first heading is open** when a year is picked -- and which month that is can
     * only be answered once the year's memories have been read, which is why it is answered here
     * and not where the year was picked. `stickyIndices` holds the month heading rows, so
     * `rows[stickyIndices[0]]` is the first of them; a month list has none and falls straight
     * through, as does a year with nothing in it.
     *
     * Only while `openMonths` is null, i.e. while nobody has opened or closed anything: once
     * somebody has, their answer stands, including "all of them closed".
     *
     * The second `buildRows` is the price of asking the model which heading is first rather than
     * working it out here, which would be row shaping in the screen in a second implementation to
     * keep in step.
     *
     * ⚠ **What repeats is more than the headings** (fix round 1, E): the second call re-places
     * every entry of the period (`entries.map(place)`) and re-groups them by month, not just the
     * one row per month with memories. What it does *not* repeat is the expensive half -- a closed
     * heading builds none of its rows, `yearRows` taking its children as a function for exactly
     * this reason -- so at SC-005's 300 memories it is sub-millisecond string work. And it happens
     * **once per pick and once per re-read, never on a scroll**: this memo's dependencies cannot
     * change while somebody scrolls, which is the property Task 6 measured and this keeps. It also
     * stops altogether the moment anybody taps a heading, because `openMonths` is no longer null.
     */
    if (openMonths !== null || chosen.stickyIndices.length === 0) {
      return { ...chosen, open: openMonths || NO_OPEN_MONTHS };
    }

    const open = new Set([chosen.rows[chosen.stickyIndices[0]].key]);
    return { ...buildRows(displayEntries, picked, open), open };
  }, [picked, displayEntries, openMonths]);

  /**
   * The months really open on screen -- which is `openMonths` once somebody has chosen, and
   * FR-006's first heading before that.
   *
   * Depended on rather than the whole of `displayRows`, which is the narrower dependency for the
   * toggle below. ⚠ **It is not a claim that the toggle's identity is stable** (fix round 1, E):
   * once somebody has tapped a heading this *is* the `openMonths` object and so is stable across
   * a re-read, but while `openMonths` is `null` -- every freshly picked year, until the first tap
   * -- the derivation allocates a fresh `Set` each time it runs, so this changes identity on a
   * re-read and `toggleMonth` and `renderRow` change with it. The consequence is nil either way:
   * a re-read hands the list a new `data` array, so its cells re-render regardless.
   */
  const openNow = displayRows?.open || NO_OPEN_MONTHS;

  /**
   * Open or close one month of a year (FR-006).
   *
   * Resolved against what is **open on screen** rather than against the state, because until
   * somebody taps something the state is `null` and the open first heading is not in any set.
   * Taking the state would therefore have left the first heading open when it was the very
   * heading tapped, which is the one tap FR-006 spells out.
   *
   * A set rather than one key: more than one month may be open, so opening a second month leaves
   * the first exactly as it was.
   */
  const toggleMonth = useCallback((key) => {
    const next = new Set(openNow);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setOpenMonths(next);
  }, [openNow]);

  /**
   * Whether what the list is showing has actually been read.
   *
   * `null` is "no answer yet" and `[]` is "read, and there are none" -- the distinction the two
   * reads above keep, and the one the empty state and the date bar's count both depend on.
   */
  const listAnswered = noStoryOnly || (picked ? periodEntries !== null : dayEntries !== null);

  /**
   * What the date bar calls the period on screen (FR-007), worked out once per period.
   *
   * Memoised rather than called in the JSX (fix round 1, finding B). This screen re-renders on
   * every change to the viewable-key set, which is to say repeatedly while somebody scrolls, and
   * the words behind it are not free: `monthKey`, `daysInMonth` and `formatPeriodDate`'s own
   * parsing, for an answer that can only change when the picked period does. SC-005 asks for a
   * month of 300 memories scrolling without visible stutter, measured on a real device at T011.
   */
  const periodName = useMemo(() => periodLabel(picked), [picked]);

  /**
   * Sorted civil dates that have entries. Drives ◄ ► and the left/right swipe, which move to
   * the next/previous day that actually has entries rather than to the adjacent calendar day.
   *
   * The calendar index, not the loaded feed (FR-004, FR-010): a day the feed has not reached is
   * a day the arrows must still stop on. `index.days` counts **day-dated** memories only, which
   * is also FR-016's rule for the arrows -- a 1st holding nothing but memories known to their
   * month or year is reached through that month, not by stepping onto it.
   *
   * Empty until the index lands, as it was empty until the feed landed before.
   */
  const datesWithEntries = useMemo(
    () => (calendarIndex ? [...calendarIndex.days.keys()].sort() : NO_ENTRIES),
    [calendarIndex],
  );

  /**
   * On first load, if today -- which is where `selectedDate` starts -- holds no memories but the
   * journal does, land on the newest day instead, so that what is on the phone is visible on
   * arrival. Memories are dated for when they happened, which may be years before today. Runs
   * once.
   *
   * **The calendar index, which is where everything else on this screen now comes from (T008).**
   * It was the paged feed: `entries.reduce(...)` over the twenty memories the first page held.
   * The feed is ordered by date and could usually answer this, but it is a page, it can fail on
   * its own, and it reads a 1st holding nothing but a memory known to its month as a day -- which
   * ◄ ► will not stand on (FR-016). The index answers all three the same way the arrows do, and
   * `newestDayWithMemories` is the one reading of "the newest day" that FR-012 and the chip rule
   * also use.
   *
   * ⚠ **With no index there is no jump**, where the feed used to offer one. That is the state in
   * which the arrows have no stops and the calendar refuses to open -- the screen cannot say
   * where this journal's memories are at all -- so landing somewhere on the strength of a page
   * would be a claim it cannot support. The day is read and drawn either way, and the next index
   * read (a sync, a pull-to-refresh) answers this again.
   */
  const didInitialDateJump = useRef(false);
  useEffect(() => {
    if (didInitialDateJump.current) return;

    const newestKey = newestDayWithMemories(calendarIndex);
    // Nothing to land on yet: no index, or a journal with no day-dated memory in it. Not
    // recorded as done, so the first index that has one still gets to answer -- which is what
    // the feed's own `entries.length === 0` guard did.
    if (!newestKey) return;

    didInitialDateJump.current = true;

    // Already on a day with memories -- today, or a day a `revealEntry` has already chosen:
    // stay there. A memory dated tomorrow would otherwise move the screen off a day that has
    // something on it.
    if (calendarIndex.days.has(selectedDateKey)) return;

    // Rebuilt from the key with `parseDateKey`, numeric parts and local: `new Date(key)` would
    // pick UTC midnight and land the screen on the previous day west of Greenwich.
    setSelectedDate(parseDateKey(newestKey));
  }, [calendarIndex, selectedDateKey]);

  /**
   * Get user info for an entry (for rendering cards)
   * In dev mode, looks up mock users; in production, uses authUser or entry.author
   */
  const getUserForEntry = useCallback((entry) => {
    // If entry has author info, use it
    if (entry.author) {
      return {
        name: entry.author.name,
        avatarUrl: entry.author.avatarUrl || entry.author.avatar,
      };
    }
    
    // Default to current auth user
    return user;
  }, [user]);
  
  // Pending work comes from the sync queue, not from the entries on screen. Counting
  // rendered entries missed two whole categories: queued media uploads, which are not
  // entries at all, and entries outside the current day's view. Photos could sit
  // unsent indefinitely while this read "Synced".
  const isOnline = isConnected;

  /**
   * The list pulled down, **and** the "N new entries -- tap to refresh" banner pressed: one
   * handler for both, which is why both are fixed by fixing this one (research R5, F1).
   *
   * It reloaded the paged feed and nothing else, which since T005 is not what the screen is drawn
   * from: the day, the picked period and the calendar index are reads of their own. So the one
   * gesture a person makes when they think the screen is stale was the gesture that left the
   * stale part of it alone (analyze round 2, finding U2).
   *
   * The feed first and the lists second, in that order: the feed is what the worklist chip and
   * its count are drawn from, and the lists are what is under them.
   */
  const handleRefresh = useCallback(async () => {
    // Clear new entry indicators
    clearNewEntries();
    // Refresh entries from local database
    await refresh();
    await reloadListsAndIndex();
  }, [clearNewEntries, refresh, reloadListsAndIndex]);

  /**
   * Navigate to the next/previous date that actually has entries.
   *
   * Deliberately not +/- one calendar day: journals are sparse, and stepping
   * through empty days one swipe at a time to cross a gap between trips is
   * unusable. `direction` is 1 for later, -1 for earlier.
   */
  const navigateDate = useCallback((direction) => {
    // 016 FR-007: with a month picked, ◄ ► move to the **earlier or later month with memories**,
    // over `calendarModel`'s month neighbours rather than over the day index -- so they skip the
    // months that hold nothing rather than stepping onto an empty one, and stop where there is no
    // further month at all rather than wrapping round. FR-008: +1 is the later one, in a month
    // exactly as in a day.
    if (picked?.kind === 'month') {
      const target = neighbourMonth(calendarIndex, picked, direction);
      if (target) setPicked(target);
      return;
    }
    // And the same for a year, over the years with memories (FR-007, FR-008). Both neighbour
    // functions answer for a period that is no longer in the index, which is what keeps ◄ ►
    // working from a month or a year that has just lost its last memory (spec Edge Cases).
    if (picked?.kind === 'year') {
      const target = neighbourYear(calendarIndex, picked, direction);
      if (target) setPicked(target);
      return;
    }
    // A period of some kind this does not step: it stays where it is rather than being stepped as
    // a day, which would move the bar off the thing the list is showing.
    if (picked) return;

    setSelectedDate(prev => {
      const target = adjacentDateKey(datesWithEntries, toDateKey(prev), direction);
      // No populated date that way -- stay put. The swipe container also guards
      // this, so reaching here means the two disagreed; preferring the current
      // date keeps the screen stable rather than jumping somewhere arbitrary.
      return target ? parseDateKey(target) : prev;
    });
  }, [datesWithEntries, picked, calendarIndex]);

  /**
   * Whether a period with memories exists in each direction, so the swipe container can refuse
   * the gesture at either end of the journal. The picked month's or year's neighbours, or the day
   * index's.
   */
  const hasNeighbour = useCallback((direction) => {
    if (picked?.kind === 'month') {
      return neighbourMonth(calendarIndex, picked, direction) !== null;
    }
    if (picked?.kind === 'year') {
      return neighbourYear(calendarIndex, picked, direction) !== null;
    }
    if (picked) return false;
    return adjacentDateKey(datesWithEntries, selectedDateKey, direction) !== null;
  }, [picked, calendarIndex, datesWithEntries, selectedDateKey]);

  const hasNextDate = useMemo(() => hasNeighbour(1), [hasNeighbour]);
  const hasPreviousDate = useMemo(() => hasNeighbour(-1), [hasNeighbour]);

  /**
   * Go to next date (for swipe gesture)
   */
  const goToNextDate = useCallback(() => {
    navigateDate(1);
  }, [navigateDate]);

  /**
   * Go to previous date (for swipe gesture)
   */
  const goToPreviousDate = useCallback(() => {
    navigateDate(-1);
  }, [navigateDate]);

  /**
   * Open the book-style calendar from the date bar (FR-001).
   *
   * The index is read again on the way in, so the calendar is never a picture of the journal as
   * it was when the screen loaded.
   *
   * ⚠ **It is resolved before the sheet can open, and that is load-bearing.** `CalendarSheet`'s
   * count is two-valued -- a tile with no count is faded and inert -- so a sheet opened with no
   * index at all draws every day, every month and every year faded: a wholly dead calendar,
   * indistinguishable from "you have no memories", with no way forward but closing it again. The
   * web's 014 calendar made its own count three-valued after hitting exactly that; the decision
   * taken here (T004's review) was to keep the component simple and put the obligation on this
   * screen. So `showCalendarSheet` is only ever set true with an index in hand, and
   * `setCalendarIndex` is never called with anything else -- which is what makes the `index` prop
   * below non-null for as long as the sheet is up.
   *
   * A re-read that fails over an index we already hold opens the calendar anyway: slightly stale
   * is a calendar, and refusing would take away a working control over a transient. Only with no
   * index at all does it refuse -- and it says so, rather than being a date that does nothing when
   * tapped.
   */
  const openCalendar = useCallback(async () => {
    // ⚠ **"The journal has not been found yet" is not a failure, and must not be reported as
    // one.** `loadCalendarIndex` answers null for both, and this could not tell them apart: a
    // tap in the moment before `initializeJournal` resolves got *"Could not open the calendar"*
    // where the picker this replaces simply opened. Asked here, where the difference is known.
    //
    // Nothing is said, and this is the one place on this screen where that is right: the body
    // of the screen is still showing the spinner and "Loading journal…", so the tap landed on a
    // screen that has not arrived rather than on a control that refused.
    if (!journalId) return;

    const fresh = await loadCalendarIndex();
    if (fresh || calendarIndex) {
      setShowCalendarSheet(true);
      return;
    }

    Alert.alert(
      'Could not open the calendar',
      'The phone could not read which days hold your memories, so the calendar has not been ' +
        'opened. Nothing has changed, and your memories are all still here. Please try again.',
    );
  }, [journalId, loadCalendarIndex, calendarIndex]);

  /**
   * A day, a month or a year really chosen in the calendar.
   *
   * **This screen closes the sheet**, and the sheet does not close itself: a pick calls `onPick`
   * alone, and `CalendarSheet.test.js` pins that side of it, so closing here is the whole of it
   * and nothing double-closes.
   *
   * A day and a period are **one** choice, not two: a day sets `selectedDate` and clears
   * `picked`, a month or a year sets `picked`. Otherwise both could be on, and the screen would
   * be showing a month under a date bar naming a day inside it.
   *
   * A pick this cannot read changes nothing whatever, rather than clearing what is on screen:
   * somebody who tapped March must not be left looking at an arbitrary day because the pick was
   * malformed.
   *
   * ⚠ **A pick that is honoured switches the "needs a story" filter off (FR-013)**, in all three
   * branches, and a pick that is refused leaves it exactly as it was -- the same rule as the rest
   * of this handler, which is that a refusal changes nothing whatever. The chip is a worklist
   * from across the whole journal, so leaving it on would mean the picked day or period was not
   * what came up: the tap would look dead, which is what it did until this landed.
   */
  const handleCalendarPick = useCallback((period) => {
    setShowCalendarSheet(false);

    if (period?.kind === 'day') {
      // `dayKeyOf` rather than a bare assignment: it is this feature's one answer to "which civil
      // day is this", and it refuses anything that is not one rather than passing it to the query.
      const key = dayKeyOf(period.date);
      if (key) {
        setNoStoryOnly(false);
        setPicked(null);
        setSelectedDate(parseDateKey(key));
      }
      return;
    }

    // Checked here as well as in `rangeFor`, so a period nothing could be read for never becomes
    // the thing on screen: the date bar would name it and the list would sit empty under it
    // for ever, with no read to answer and nothing said.
    if (period?.kind === 'month' && rangeFor(period)) {
      setNoStoryOnly(false);
      setPicked({ kind: 'month', year: period.year, month: period.month });
      return;
    }

    if (period?.kind === 'year' && rangeFor(period)) {
      setNoStoryOnly(false);
      setPicked({ kind: 'year', year: period.year });
    }
  }, []);

  const closeCalendar = useCallback(() => setShowCalendarSheet(false), []);

  /**
   * Extract photos from entries for the selected date
   */
  const photosForDate = useMemo(() => {
    const photos = [];
    displayEntries.forEach(entry => {
      if (entry.contentBlocks) {
        entry.contentBlocks.forEach(block => {
          if (block.type === 'image' || block.type === 'photo' || block.type === 'photos') {
            const mediaItems = block.media || [block];
            mediaItems.forEach(media => {
              photos.push({
                id: media.id || `${entry.localId}-${photos.length}`,
                localPath: media.localPath,
                serverUrl: media.serverUrl,
                thumbnailUri: media.thumbnailUri || media.localPath || media.serverUrl,
                location: media.location || entry.location,
                entryId: entry.localId,
                createdAt: entry.createdAt,
              });
            });
          }
        });
      }
    });
    return photos;
  }, [displayEntries]);

  /**
   * Extract videos from entries for the selected date
   */
  const videosForDate = useMemo(() => {
    const videos = [];
    displayEntries.forEach(entry => {
      if (entry.contentBlocks) {
        entry.contentBlocks.forEach(block => {
          if (block.type === 'video') {
            const mediaItems = block.media || [block];
            mediaItems.forEach(media => {
              videos.push({
                id: media.id || `${entry.localId}-${videos.length}`,
                localPath: media.localPath,
                serverUrl: media.serverUrl,
                thumbnailUri: media.thumbnailUri || media.localPath,
                location: media.location || entry.location,
                duration: media.duration,
                entryId: entry.localId,
                createdAt: entry.createdAt,
              });
            });
          }
        });
      }
    });
    return videos;
  }, [displayEntries]);

  /**
   * Handle gallery icon press on entry card - opens entry-specific gallery
   */
  const handleEntryGalleryPress = useCallback((entry) => {
    console.log('[JournalScreen] Open gallery for entry:', entry.localId);
    setGalleryEntry(entry);
    setShowEntryGallery(true);
  }, []);

  /**
   * Handle photo press from gallery modal - opens full screen viewer
   */
  const handleGalleryPhotoPress = useCallback((photos, index) => {
    console.log('[JournalScreen] Open photo viewer at index:', index);
    setViewerMedia(photos);
    setViewerMediaType('photo');
    setViewerInitialIndex(index);
    setShowMediaViewer(true);
  }, []);

  /**
   * Handle video press from gallery modal - opens full screen viewer
   */
  const handleGalleryVideoPress = useCallback((videos, index) => {
    console.log('[JournalScreen] Open video viewer at index:', index);
    setViewerMedia(videos);
    setViewerMediaType('video');
    setViewerInitialIndex(index);
    setShowMediaViewer(true);
  }, []);

  /**
   * Move the screen to the day a just-created entry belongs to, so a save is
   * always visibly confirmed. No-op when already on that day.
   */
  const revealEntry = useCallback((created) => {
    const key = toDateKey(created?.date || created?.createdAt);
    if (key) setSelectedDate(parseDateKey(key));
    // The day and the index are their own reads now, and choosing the day that is **already**
    // on screen changes no state, so nothing would re-read either: a memory saved onto today
    // would not appear, and "a save is always visibly confirmed" is the whole point of this
    // function. The index matters just as much -- a memory saved onto a day that had none has
    // to make that day a stop for the arrows and a tappable tile in the calendar, which is
    // what the live feed used to do by itself. A read for the day being left is harmless:
    // `dayReadRef` lets only the newest answer through, and the effect above starts a newer one
    // for the day being arrived at.
    reloadListsAndIndex();
  }, [reloadListsAndIndex]);

  /**
   * One tap from the quick bar into the capture screen, carrying the audience the bar's own
   * picker was left on (FR-001).
   *
   * The same route `CaptureFab` sends from the "+" over every tab, so there is one capture
   * screen and not two. The "+" carries no audience, because there is no picker beside it; all
   * **three** of the bar's controls do, because the picker sits on the bar with them (fix round
   * 2, item 3 -- it was Send alone, and a camera or microphone tap replaced the person's choice
   * with the sheet's wider default).
   *
   * It is a pre-selection for the save sheet and nothing more: a memory is still saved only on
   * an explicit choice there (FR-011).
   *
   * `typeof visibility === 'string'`, so a caller that hands this straight to a `TouchableOpacity`
   * -- which calls its handler with a press **event** -- cannot send that object to the capture
   * screen as a route parameter. `QuickCaptureBar` wraps all three of its controls so that does
   * not happen today; this is what stops it mattering if one is ever unwrapped.
   */
  const openCapture = useCallback((visibility) => {
    navigation.navigate('Capture', {
      mode: 'new',
      ...(typeof visibility === 'string' ? { audience: visibility } : null),
    });
  }, [navigation]);

  /**
   * The quick bar's typed note: the same one tap into the capture screen, with the note.
   *
   * `QuickCaptureBar` clears its input as it calls this, so by the time this runs the note
   * exists nowhere else -- which is the defect this feature exists to remove, and it must not
   * reappear here. The note is recorded in the unsaved memory first and the screen opened
   * second: it goes into the `new` draft slot through the same stamp-then-record order every
   * piece on the capture screen goes through (FR-004), so the capture screen's own mount reads
   * it back, and so it survives the app being closed on the way (FR-012).
   *
   * Nothing is saved: a memory is saved only on an explicit choice in the capture screen's save
   * sheet (FR-011). But the audience the bar's own picker was left on **is** carried, as the
   * sheet's pre-selection (fix round 1 after the whole-branch review, Important 2). It used to be
   * dropped here, which made that picker a dead control -- and worse than dead: somebody who
   * opened it, picked **Only me**, and tapped Send reached a sheet pre-selecting **Family**, so
   * the replacement for their discarded choice was *wider* than what they asked for. Of the two
   * ways to be wrong about an audience, silently widening one is the unsafe one, which is this
   * project's "sharing fails closed" rule in spirit. Carrying the choice is also the alternative
   * to hiding the picker, which would take away something people have today.
   *
   * It stays a pre-selection: the save sheet still has to be tapped, and nothing about this
   * value reaches the server unless it is. The bar's camera and microphone controls carry it
   * too, for the same reason (fix round 2, item 3) -- see `openCapture`.
   *
   * A note that cannot be recorded is said back to the person, with the words in it, rather than
   * logged to a console nobody is reading (FR-017).
   *
   * While that is happening the screen says so (`KEEPING_NOTE`). The stamping is the slow part
   * -- a cold GPS fix, up to a few seconds, though `stampLocation` caches one for two minutes
   * so this is the first send after the app has been idle -- and the bar has already taken the
   * words off the screen. The flag is cleared in a `finally`, so the line does not outlive the
   * attempt either way: a failure says what happened, and a spinner left under it would say
   * the opposite.
   */
  const handleSendMessage = useCallback(async (text, visibility) => {
    const note = text?.trim();
    if (!note) return;

    setKeepingNote(true);
    try {
      const stamped = await CaptureLocation.withLocation({
        localId: uuidv4(),
        kind: 'text',
        content: note,
        // An instant, exactly as the phone's clock reads it (research R8, Principle III) --
        // never a civil date.
        capturedAt: new Date().toISOString(),
      });
      await CaptureDraftStore.addPiece(DraftSlot.NEW, stamped);
    } catch (error) {
      console.warn('[JournalScreen] the typed note reached no draft', error);
      Alert.alert(
        'Could not keep that note',
        'This note has not been kept, so nothing has been added to your memory. Here it is, ' +
          `to write again:\n\n${note}`,
      );
      return;
    } finally {
      setKeepingNote(false);
    }

    openCapture(visibility);
  }, [openCapture]);

  /**
   * Handle entry press
   */
  const handleEntryPress = useCallback((entry) => {
    setSelectedEntry(entry);
    setShowEntryDetail(true);
  }, []);

  // ---------------------------------------------------------------------------------------
  // Editing a memory in place (FR-013, FR-018)
  // ---------------------------------------------------------------------------------------

  /**
   * Which memory the one unsaved edit belongs to, or null (FR-013).
   *
   * There is at most one `edit` draft slot and it names its memory, so this is one read for
   * the whole list: the card whose `localId` this is says "Unfinished edit — continue", and
   * every other card says nothing.
   */
  const [unfinishedEditOf, setUnfinishedEditOf] = useState(null);

  /**
   * Read the slot whenever the Journal comes into view.
   *
   * That is the moment that matters: the person has just closed the capture screen, and
   * whether they saved, discarded, or simply left decides what their card should say. A read
   * on mount alone would leave a card silent about an edit made seconds earlier until the app
   * was restarted -- the same divergence `PlacesScreen` uses this hook to avoid.
   *
   * `load` is a read, and it is also the store's own cleanup: an `edit` slot whose memory has
   * been deleted is discarded, folder and all, on the way past. So the line can never offer an
   * edit of a memory that is no longer there.
   *
   * A failed read changes nothing, in either direction. It is not evidence that an edit exists
   * and it is not evidence that one does not, and the slot is read again on the next visit.
   * Recorded rather than said: the person has not asked this screen for anything, and an alert
   * on arriving at the Journal would be noise over somebody's memories. Where a failure *is*
   * said is `openEdit` below, which is an explicit action with something to lose.
   */
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      (async () => {
        try {
          const draft = await CaptureDraftStore.load(DraftSlot.EDIT);
          if (!cancelled) setUnfinishedEditOf(draft?.entryLocalId ?? null);
        } catch (error) {
          console.warn('[JournalScreen] could not tell which memory has an unsaved edit', error);
        }
      })();

      return () => {
        cancelled = true;
      };
    }, []),
  );

  /**
   * Open the capture screen on a memory that is already saved (FR-018).
   *
   * One handler for every way in -- the ⋯ menu's Edit, the detail view's Edit, and the
   * "Unfinished edit — continue" line -- because each of them has the same thing to protect.
   *
   * **There is at most one unsaved edit** (FR-013), and `CaptureDraftStore.startEdit` replaces
   * the slot, so opening an edit of a *different* memory destroys the unsaved one the moment
   * anything in the new one changes. The capture screen deliberately does not ask about that
   * (T057/T058: "asking whether to discard it is the Journal's"), so if this does not ask,
   * nobody does, and somebody's unsaved changes go without a word. It asks, names the memory
   * the edit belongs to, and lets go of that edit itself when the person says to -- rather than
   * leaving it to be deleted silently by the first keystroke in the next one, which would mean
   * backing out of the new edit left the old one still sitting there after the person had
   * agreed to lose it.
   *
   * Nothing is opened if either step fails. The read failing means the question cannot be asked
   * at all; the discard failing means the slot still holds the old edit. In both cases opening
   * anyway would put the capture screen one change away from deleting an edit nobody was asked
   * about, so it fails closed and says so (FR-017).
   */
  const openEdit = useCallback(async (entry) => {
    const entryLocalId = entry?.localId;

    // Unreachable from the list -- every row is keyed by `localId` -- so this is the guard,
    // not a case. A bare `return` would be a silent no-op immediately after somebody chose
    // Edit, which is the one thing a refusal on this screen must never be.
    if (!entryLocalId) {
      Alert.alert(
        'Could not open that edit',
        'That memory could not be identified, so nothing has been opened and nothing has ' +
          'been changed.',
      );
      return;
    }

    // Whose memory it is, tested **here** and not only where Edit is offered (round-1
    // Important 1). This handler has three callers and the menu below is one of them: the
    // card's "Unfinished edit — continue" is wired to every card, and the detail view's Edit
    // comes from `JournalEntryDetail`'s own menu, which has no ownership test at all. Opening
    // a memory that is not the reader's as an edit would take them through a whole edit and
    // lose it at the far end, where `updateEntry` refuses the write -- so it is refused at the
    // near end, where nothing has been done yet. The menu's gate stays what it is: the
    // suppression of the *offer*, so a stranger's card shows no Edit rather than one that
    // refuses.
    if (!isOwnMemory(entry, authUser?.id)) {
      Alert.alert(
        'Could not open that edit',
        'This memory was written by somebody else, so it cannot be edited here. Nothing has ' +
          'been changed.',
      );
      return;
    }

    const open = () => {
      // The detail view, if that is where Edit was chosen: the capture screen opens over the
      // Journal, and coming back from it should land on the list the memory is in.
      setShowEntryDetail(false);
      navigation.navigate('Capture', { mode: 'edit', entryLocalId });
    };

    let other = null;
    try {
      const draft = await CaptureDraftStore.load(DraftSlot.EDIT);
      // An unsaved edit of this very memory is not in the way: it *is* what opening this
      // reopens (US2-7), and the capture screen reads it back for itself.
      other = draft && draft.entryLocalId !== entryLocalId ? draft : null;
    } catch (error) {
      console.warn('[JournalScreen] could not tell whether another edit is unsaved', error);
      Alert.alert(
        'Could not open that edit',
        'The phone could not check whether you have another edit that has not been saved, ' +
          'so nothing has been opened and nothing has been changed. Please try again.',
      );
      return;
    }

    if (!other) {
      open();
      return;
    }

    const words = draftFirstWords(other);
    Alert.alert(
      words
        ? `Discard your unsaved edit of “${words}”?`
        : 'Discard your unsaved edit of your other memory?',
      'Only one unsaved edit is kept at a time, so opening this one removes the changes you ' +
        'have not saved. That memory itself stays exactly as it was.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          // Returns its promise, so whatever drives this button can wait for the discard to
          // land before the next screen is open. Its one failure is answered below.
          onPress: async () => {
            try {
              await CaptureDraftStore.discard(DraftSlot.EDIT);
            } catch (error) {
              console.warn('[JournalScreen] the unsaved edit could not be discarded', error);
              Alert.alert(
                'Could not open that edit',
                'Your unsaved edit of the other memory is still here, and nothing has been ' +
                  'opened. Please try again.',
              );
              return;
            }
            // Said on the cards straight away, rather than at the next visit: the person
            // agreed to lose that edit, so no card should still be offering it.
            setUnfinishedEditOf(null);
            open();
          },
        },
      ],
    );
  }, [authUser?.id, navigation]);

  /**
   * The ⋯ on a card, which was wired to nothing at all before this: Edit, on the author's own
   * memory (FR-018, FR-021).
   *
   * **Nothing at all on anybody else's.** There is nothing in another person's memory for the
   * reader to edit -- an edit saves through `updateEntry`, which is their memory's to accept --
   * so a menu here would be a menu of one thing that cannot work. This is the suppression of
   * the *offer* only: `openEdit` applies the same rule itself, by the same `isOwnMemory`, so
   * the two cannot disagree and the handler holds even for a caller that offers no menu.
   *
   * The cost of that rule, named: a memory saved while nobody was signed in carries
   * `local_user` as its author and is not matched, so Edit is not offered on it. It is the same
   * cost the card's own share line carries, for the same reason -- there is no other definition
   * of "the author's own memory" available here -- and offering an edit that `updateEntry`
   * would refuse is worse than not offering one.
   */
  const handleMenuPress = useCallback((entry) => {
    if (!isOwnMemory(entry, authUser?.id)) return;

    Alert.alert('Memory options', null, [
      { text: 'Edit', onPress: () => openEdit(entry) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [authUser?.id, openEdit]);

  /**
   * Handle save entry from the compose modal, which **nothing on this screen now opens**: the
   * detail view's Edit was its last opener and T060 re-points that at the capture screen. A new
   * memory does not come through here either: it is captured and saved on `CaptureScreen`.
   *
   * T068 (removing what this feature made dead) checked `git grep` for a caller before
   * removing this, and found one: `entryLocationSharing.journey.test.js` reaches this handler
   * via `screen.root.findByType(JournalComposeModal).props.onSave(...)`, with nothing in the UI
   * ever pressed to get there. That is not the dead path it is checking for -- it is real
   * coverage of `createEntry`/the local DB/the wire serialiser -- so the mount and this handler
   * stay until that test is rewritten to reach the same wiring another way.
   */
  const handleSaveEntry = useCallback(async (entryData) => {
    try {
      const created = await createEntry({
        userId: authUser?.id || 'local_user',
        contentBlocks: entryData.contentBlocks,
        visibility: entryData.visibility,
        location: entryData.location,
        // Who may see the exact coordinates, as the compose screen's picker was set. This
        // handler copied four fields and dropped this one, so every tap on that control was
        // thrown away here: nothing reached the database, nothing reached the server, and the
        // account-wide default applied instead -- which for somebody who had set that default
        // to Everyone meant the opposite of what they had just chosen.
        locationSharing: entryData.locationSharing,
        date: entryData.date,
      });

      setShowComposeModal(false);
      // Land on the day the entry belongs to. Saving while looking at another
      // date would otherwise drop the user back onto a screen that does not
      // contain what they just captured.
      revealEntry(created);
    } catch (error) {
      // This caught the rejection, logged it, and left the person looking at a screen that
      // showed no memory and said nothing -- the comment here claimed the hook's error state
      // would show it, and that state never reaches this screen. A failure is said, and the
      // modal is left open with everything that was written still in it (FR-017).
      console.warn('[JournalScreen] the memory could not be saved', error);
      Alert.alert(
        'Could not save',
        'Your memory could not be saved and is still here. Try again.',
      );
    }
  }, [createEntry, authUser, revealEntry]);

  /**
   * Handle delete entry
   */
  const handleDeleteEntry = useCallback(async (entry) => {
    console.log('[JournalScreen] Deleting entry:', entry.localId);
    
    try {
      await deleteJournalEntry(entry.localId);
      setShowEntryDetail(false);
      setSelectedEntry(null);
      console.log('[JournalScreen] Entry deleted successfully');
    } catch (error) {
      console.error('[JournalScreen] Failed to delete entry:', error);
    }
  }, [deleteJournalEntry]);

  /**
   * Handle reaction on entry (like/unlike)
   * For entries with serverId, calls API; for local-only, updates in-memory
   */
  const handleReact = useCallback(async (entryId, reactionKey) => {
    console.log('[JournalScreen] React:', entryId, reactionKey);

    // The memory is resolved from the cards **on screen**, not from the loaded feed (analyze
    // round 3, finding G1). It was `allEntries`, which is the feed's current page: on a day the
    // feed has not reached -- now reachable, which is the whole point of this task -- the
    // memory was not in it, so this returned here and the like went nowhere at all. Silently:
    // the heart was tapped and nothing happened, on screen or on the server.
    const entry = displayEntries.find(e => e.localId === entryId || e.id === entryId);
    if (!entry) return;

    // Get server ID (for synced entries)
    const serverId = entry.serverId || entry.id;
    
    // If no server ID, this is a local-only entry - skip API call
    if (!serverId || serverId.startsWith('local_')) {
      console.log('[JournalScreen] Local-only entry, skipping API');
      return;
    }
    
    try {
      // Check if user already reacted
      const isLiked = entry.reactions?.likedByMe || 
        (entry.reactions?.heart && Array.isArray(entry.reactions.heart) && 
         entry.reactions.heart.some(u => u.id === authUser?.id));
      
      if (reactionKey === null || (reactionKey === 'heart' && isLiked)) {
        // Remove reaction
        await ReactionsApi.unlikeEntry(serverId);
        console.log('[JournalScreen] Unliked entry');
      } else {
        // Add reaction
        await ReactionsApi.likeEntry(serverId);
        console.log('[JournalScreen] Liked entry');
      }

      // The feed behind the worklist, and then the open day and the index, which are separate
      // reads and would otherwise go on showing the counts they were drawn with.
      await refresh();
      await reloadListsAndIndex();
    } catch (error) {
      console.error('[JournalScreen] Failed to react:', error);
    }
  }, [displayEntries, authUser?.id, refresh, reloadListsAndIndex]);

  /**
   * Handle adding a comment/response to an entry
   */
  const handleAddResponse = useCallback(async (entryId, text) => {
    console.log('[JournalScreen] Add response:', entryId, text);
    
    if (!text?.trim()) return;

    // From the cards on screen, for the same reason `handleReact` does (finding G1): a reply
    // typed on a card from a day beyond the loaded feed used to be dropped here.
    const entry = displayEntries.find(e => e.localId === entryId || e.id === entryId);
    if (!entry) return;

    // Get server ID
    const serverId = entry.serverId || entry.id;
    
    if (!serverId || serverId.startsWith('local_')) {
      console.log('[JournalScreen] Local-only entry, skipping API');
      return;
    }
    
    try {
      await CommentsApi.addComment(serverId, text.trim());
      console.log('[JournalScreen] Comment added');

      // The feed, and then the open day and the index, as above.
      await refresh();
      await reloadListsAndIndex();
    } catch (error) {
      console.error('[JournalScreen] Failed to add comment:', error);
    }
  }, [displayEntries, refresh, reloadListsAndIndex]);

  /**
   * The audience chosen again for a memory whose share the server would not apply (FR-011).
   *
   * The card offers the choice and reports it; the re-sharing itself is `reshareEntry`'s,
   * which stores the audience, queues the memory once and only then clears the refusal. The
   * card then stops saying "Not shared" because the service announces the change and this
   * screen reloads the day.
   *
   * A failure is said, not logged: the refusal is still on the card, so silence would leave
   * the person tapping a line that appears to do nothing (FR-017). Nothing is shared in that
   * case -- `reshareEntry` leaves the refusal exactly as it was.
   *
   * One failure gets its own words. In the Local Only storage mode nothing is ever sent, so
   * `reshareEntry` refuses rather than clear a refusal over a memory that can never go -- and
   * "please try again" would be advice that cannot work. The person is told what would have to
   * change instead.
   */
  const handleReshare = useCallback(async (entry, visibility) => {
    const localId = entry?.localId;
    // Unreachable from the Journal list -- `SaveAudienceSheet` reports an audience or nothing
    // at all -- but it was a bare `return`, which is a silent no-op immediately after the
    // person made an explicit choice. FR-011: a refusal is never silent, and that cuts both
    // ways. Nothing is shared either way, and the card goes on saying so.
    if (!localId || !visibility) {
      Alert.alert(
        'Could not share that memory',
        'No audience came through with that choice, so nothing has changed: it is still on ' +
          'this phone and still not shared with anyone. Please try again.',
      );
      return;
    }

    try {
      await JournalService.reshareEntry(localId, visibility);
      // The feed, and then the open day and the index: a re-share is a card action like the two
      // above, and the card it was tapped on is in the day's own list, which is a separate read.
      // Without this the card goes on saying "Not shared" about a memory just shared.
      await refresh();
      await reloadListsAndIndex();
    } catch (error) {
      console.warn('[JournalScreen] the memory could not be shared again', error);
      Alert.alert(
        'Could not share that memory',
        error?.code === 'local_only_storage'
          ? 'Your storage is set to Local Only, so nothing is sent from this phone. This ' +
              'memory is still here, and still not shared with anyone. Turn syncing back on ' +
              'in Settings to share it.'
          : 'It is still on this phone and still not shared with anyone. Please try again.',
      );
    }
  }, [refresh, reloadListsAndIndex]);

  /**
   * Key extractor -- for a day's entry, and for a month or year list's rows (research R8).
   *
   * **An entry row keeps keying by its own `localId`**, which is what a day has always keyed by,
   * so `useViewableKeys` and the `isVisible` it answers see exactly the keys they see today and a
   * card does not lose track of whether it is on screen when the same memory appears in a month.
   * A heading row keys as `heading:<period>`, which no `localId` can collide with.
   */
  const keyExtractor = useCallback((item) => {
    if (item?.kind === 'entry') return item.key;
    if (item?.kind) return `heading:${item.key}`;
    return item.localId;
  }, []);

  /**
   * Which cards are on screen, and the list itself (013 T052).
   *
   * `MemoryRouteMap` mounts a native map view, and the Journal is a list of cards: one map per
   * card would cost a map for every memory in a day whether anybody can see it or not. The
   * list reports its viewable rows and each card is told, so an off-screen card holds the
   * map's height open instead (research R10 *Lazy rendering*).
   *
   * `useViewableKeys` is the helper the media tiles already use, and its rule is the one this
   * needs: until the list has reported anything every row counts as on screen, so nothing is
   * held back before React Native has measured a thing. `ViewportFlatList` composes this
   * callback with its own -- React Native forbids changing `onViewableItemsChanged` on a live
   * list, and both are stable.
   */
  const { onViewableItemsChanged, isViewable } = useViewableKeys(keyExtractor);
  const listRef = useRef(null);

  /**
   * How tall each month heading of a year list is, **by heading**, as each one last reported it.
   *
   * Refs and not state, because nothing on screen is drawn from them: they are read at the one
   * moment a pin is pressed, and holding them as state would re-render the whole list the first
   * time a heading measured itself, for no visible change (SC-005 asks for 300 memories scrolling
   * without stutter).
   *
   * ⚠ **By heading, and that is not pedantry** (T007 fix round 1, B). One shared number would hold
   * whichever heading laid out most recently, and the month headings are *not* all the same
   * height: `"2026, month not known"` is a longer label than `"March 2026"` and wraps to a second
   * line at a large text size on a narrow screen. With one number, that heading laying out last
   * would make a pin pressed in March clear a gap a line too big. The pinned heading above a row
   * is the one that has to be cleared, so it is the one measured and the one read.
   *
   * `lastHeadingHeightRef` is the fallback for a heading that has somehow not reported yet --
   * better than nothing, since every month heading is within a line of the others -- and `0`, the
   * month list's own offset, is the fallback for a list with no heading above the row at all.
   */
  const headingHeightsRef = useRef(new Map());
  const lastHeadingHeightRef = useRef(0);

  /** One month heading reporting its own height (FR-017). Nothing else can measure it. */
  const measurePinnedHeading = useCallback((key, event) => {
    const height = event?.nativeEvent?.layout?.height;
    if (typeof height !== 'number' || height <= 0) return;
    headingHeightsRef.current.set(key, height);
    lastHeadingHeightRef.current = height;
  }, []);

  /**
   * How tall the heading pinned above row `rowIndex` is -- the nearest month heading at or above
   * it, which is the one `stickyHeaderIndices` has stuck to the top of the screen while that row
   * is being looked at.
   *
   * The walk is backwards from the row and stops at the first heading, so it is a few steps in a
   * year of twelve months and it happens once, on a press, never on a render or a scroll.
   */
  const pinnedHeadingHeight = useCallback((rowIndex) => {
    const rows = displayRows?.rows;
    if (!rows) return 0;

    for (let i = Math.min(rowIndex, rows.length - 1); i >= 0; i -= 1) {
      if (rows[i]?.kind === 'monthHeading') {
        const measured = headingHeightsRef.current.get(rows[i].key);
        return measured || lastHeadingHeightRef.current;
      }
    }
    return 0;
  }, [displayRows]);

  /**
   * Bring a piece into view, for a pin pressed on the card in row `index` (FR-025).
   *
   * The two halves of the measurement meet here. The card knows where the piece sits inside
   * itself and hands up that offset; it cannot know where it sits in the *list*, because
   * `FlatList` lays every card inside a cell of its own, so a card's own `onLayout` reports a
   * position relative to that cell and not to the list's content. The row index supplies the
   * rest, which is what `scrollToIndex`'s `viewOffset` is for: the row is placed `offset`
   * points above the top of the screen, which brings the piece itself to the top.
   *
   * ⚠ A deliberate deviation from tasks.md's wording ("scrolls the list to the given offset").
   * `scrollToOffset` would need the row's own position in the list's content, which no public
   * API on `FlatList` reports.
   *
   * `scrollToIndex` only refuses an index the list has not laid out, and this row has been -- a
   * pin can only be pressed on a map, and a card mounts its map only while the list says the
   * card is on screen. `onScrollToIndexFailed` on the list below is there because being wrong
   * about that would be a **crash** rather than a missed scroll: without `getItemLayout` and
   * without that handler, `VirtualizedList` throws an invariant, and there is no error boundary
   * anywhere in this app to contain it (round-1 item 5).
   */
  const scrollPieceIntoView = useCallback((index, offset) => {
    /*
     * ⚠ **A year is the one list with something already at the top of it** (research R8's one
     * adjustment, analyze round 3's finding C1). `viewOffset: -offset` puts the pressed piece at
     * the very top of the list -- which in a year is exactly where the pinned month heading sits,
     * so the piece lands *under* the words naming its month. The measured height of **that row's
     * own** pinned heading is added, and the piece lands just below it (FR-017).
     *
     * **A day and a month pass the offset unchanged**, because neither has a pinned heading: it is
     * asked of the period on screen rather than of the measurement, so a height left over from a
     * year cannot push a month's pressed pin a heading too far.
     */
    const pinned = picked?.kind === 'year' ? pinnedHeadingHeight(index) : 0;
    listRef.current?.scrollToIndex({ index, viewOffset: pinned - offset, animated: true });
  }, [picked, pinnedHeadingHeight]);

  /**
   * A row the list had not laid out after all: the memory stays where it is.
   *
   * Deliberately silent to the person. They pressed a pin and the Journal did not move, which
   * is the honest outcome and is self-evident on screen; an alert over a memory would be worse
   * than the missed scroll. The highlight on the piece still happens -- the card does that
   * itself -- so the pin is not completely without an answer.
   */
  const handleScrollToIndexFailed = useCallback((info) => {
    console.warn('[JournalScreen] could not scroll to a pressed pin’s piece', info);
  }, []);

  /**
   * Render entry card
   */
  const renderEntry = useCallback(({ item, index: rowIndex }) => {
    // Get the appropriate user info for this entry
    const entryUser = getUserForEntry(item);

    return (
      <JournalEntryCard
        entry={item}
        user={entryUser}
        currentUserId={authUser?.id}
        onGalleryPress={handleEntryGalleryPress}
        onPhotoPress={(photos, index) => {
          handleGalleryPhotoPress(photos, index);
        }}
        onVideoPress={(videos, index) => {
          handleGalleryVideoPress(videos, index);
        }}
        onReact={handleReact}
        onAddResponse={handleAddResponse}
        onReshare={handleReshare}
        onMenuPress={handleMenuPress}
        // The one unsaved edit belongs to one memory, so one card says so (FR-013).
        hasUnfinishedEdit={unfinishedEditOf === item.localId}
        onContinueEdit={openEdit}
        isVisible={isViewable(item.localId)}
        onRequestScrollTo={(offset) => scrollPieceIntoView(rowIndex, offset)}
        primaryColor={PRIMARY_COLOR}
      />
    );
  }, [authUser?.id, getUserForEntry, handleEntryGalleryPress, handleGalleryPhotoPress, handleGalleryVideoPress, handleReact, handleAddResponse, handleReshare, handleMenuPress, unfinishedEditOf, openEdit, isViewable, scrollPieceIntoView]);

  /**
   * One row of the one list: a heading, or a memory drawn by the card above (research R8).
   *
   * ⚠ **A memory is rendered by `renderEntry` and by nothing else, in a day and in a month
   * alike.** FR-009 and this feature's governing rule -- *we should not change how journal
   * entries are shown* -- mean a month list is the same card with the same props, including the
   * row index it hands `scrollPieceIntoView`: that index counts **rows**, so a pressed pin brings
   * the piece into view past the day headings rather than landing short of it by one heading per
   * day above it.
   *
   * A day's `data` is entries and a period's is rows, so a row arrives either way and is unwrapped
   * here. `row.entry` is where a period's memory lives, which is also the only place a card action
   * can resolve one from -- the rows themselves carry no `localId` (finding G1).
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
          // A month heading of a year, and only that, opens and closes (FR-006) and is the row
          // that gets pinned -- so it is the one measured (FR-017). A grey day heading is neither:
          // it is told nothing, and so draws itself as the plain text it is.
          onPress={isMonth ? () => toggleMonth(item.key) : undefined}
          onLayout={isMonth ? (event) => measurePinnedHeading(item.key, event) : undefined}
        />
      );
    }

    return renderEntry({ item: item?.kind === 'entry' ? item.entry : item, index: rowIndex });
  }, [renderEntry, toggleMonth, measurePinnedHeading]);

  // Show entry detail view
  if (showEntryDetail && selectedEntry) {
    const detailUser = getUserForEntry(selectedEntry);
    return (
      <JournalEntryDetail
        entry={selectedEntry}
        user={detailUser}
        // Edit opens the capture screen on this very memory, and saving there updates it
        // rather than creating a second one (FR-018). It used to open an *empty* composer,
        // which saved a new memory and left the one being edited untouched.
        onEdit={openEdit}
        onDelete={handleDeleteEntry}
        onBack={() => {
          setShowEntryDetail(false);
          setSelectedEntry(null);
        }}
        onLocationPress={(location) => {
          console.log('Open map:', location);
        }}
        primaryColor={PRIMARY_COLOR}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Top Header - Avatar in top-right */}
      <View style={styles.topHeader}>
        <View style={styles.topHeaderLeft}>
          <SyncStatusIndicator
            pendingCount={pendingCount}
            failedCount={failedCount}
            isOnline={isOnline}
          />
          {/* Only offered when there is something to find. A filter that always returns
              nothing reads as broken rather than as good news. */}
          {noStoryEntries.length > 0 && (
            <TouchableOpacity
              onPress={toggleNoStory}
              accessibilityRole="button"
              accessibilityState={{ selected: noStoryOnly }}
              accessibilityLabel={`No story yet, ${noStoryEntries.length} memories`}
              style={[styles.noStoryChip, noStoryOnly && styles.noStoryChipActive]}
            >
              <Ionicons
                name="mic-outline"
                size={13}
                color={noStoryOnly ? '#FFF' : PRIMARY_COLOR}
              />
              <Text style={[styles.noStoryChipText, noStoryOnly && styles.noStoryChipTextActive]}>
                No story yet · {noStoryEntries.length}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.topHeaderRight}>
          <TouchableOpacity style={styles.headerIcon}>
            <Ionicons name="notifications-outline" size={24} color="#333" />
            {unreadNotificationCount > 0 && (
              <NotificationBadge size="small" />
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
            <Image
              source={{ uri: user.avatarUrl }}
              style={styles.headerAvatar}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Connection Status Banner */}
      <ConnectionStatusIndicator 
        variant="banner" 
        showReconnectButton 
      />

      {/* Sync Status Badge - shows syncing/error states */}
      <SyncStatusBadge 
        variant="banner" 
        showLastSync
        showRetryButton
      />

      {/* New Entries Banner */}
      {hasNewEntries && (
        <TouchableOpacity 
          style={styles.newEntriesBanner}
          onPress={handleRefresh}
        >
          <Ionicons name="arrow-up" size={16} color="#FFF" />
          <Text style={styles.newEntriesText}>
            {newEntryCount} new {newEntryCount === 1 ? 'entry' : 'entries'} - Tap to refresh
          </Text>
        </TouchableOpacity>
      )}

      {/* Date Selector */}
      {/*
        FR-007: with a month picked the bar names the period and its count ("March 2026",
        "4 memories") instead of a day. The count is the memories really read for it, not the
        calendar index's tally -- so it is what is on screen beneath it, and it is `null` until
        the read lands, which is how a month nobody could read says nothing rather than "0".
      */}
      <DateSelector
        date={selectedDate}
        label={periodName}
        count={picked && listAnswered ? displayEntries.length : null}
        onPrevious={() => navigateDate(-1)}
        onNext={() => navigateDate(1)}
        onDatePress={openCalendar}
      />

      {/* Content - Journal Entries Feed */}
      <DateSwipeContainer
        enabled={swipeGesturesEnabled}
        onNextDate={goToNextDate}
        onPreviousDate={goToPreviousDate}
        hasNext={hasNextDate}
        hasPrevious={hasPreviousDate}
      >
        {isInitializing || loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={PRIMARY_COLOR} />
            <Text style={styles.loadingText}>Loading journal...</Text>
          </View>
        ) : (
          <ViewportFlatList
            ref={listRef}
            /*
              The day's memories, or a month's rows -- **the same list either way** (research
              R8). One `ViewportFlatList`, with the props it has always had: a card's map pin
              scrolls by row index and only a `FlatList` has `scrollToIndex` at all, so a month
              drawn as a `SectionList` would call a function that does not exist the moment
              somebody pressed a pin.
            */
            data={displayRows ? displayRows.rows : displayEntries}
            renderItem={renderRow}
            keyExtractor={keyExtractor}
            /*
              FR-006: an open month heading **stays pinned while its month scrolls**.
              `buildRows` fills `stickyIndices` with the month heading rows and nothing else, so a
              grey day heading never sticks (research R8) -- two labels piling up on each other
              would cover the memory being read. A month list's is empty and a day's is nothing at
              all, which is how neither grows a pinned anything.
            */
            stickyHeaderIndices={displayRows ? displayRows.stickyIndices : undefined}
            onViewableItemsChanged={onViewableItemsChanged}
            onScrollToIndexFailed={handleScrollToIndexFailed}
            contentContainerStyle={styles.feedContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={PRIMARY_COLOR}
              />
            }
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            /*
              "No entries yet" is withheld until the day has actually been read. The day's
              memories now come from the database rather than from a filter over the loaded
              feed, so there is a moment between a day being chosen and its memories arriving --
              and telling somebody their day is empty during it would be saying the one thing
              this task exists to stop the screen saying. `dayEntries === null` is "not read
              yet"; `[]` is "read, and there are none", which does get the empty state. A picked
              month answers the same question through `periodEntries`, and for the same reason:
              a month that could not be read must not be drawn as a month with nothing in it.
            */
            ListEmptyComponent={listAnswered ? <EmptyFeed /> : null}
          />
        )}
      </DateSwipeContainer>

      {/*
        WhatsApp-style Input Bar.

        Wrapped so the keyboard pushes it up rather than covering it. There was no keyboard
        handling here at all: the bar is anchored to the bottom of the screen, and on iOS the
        keyboard is drawn over anything it overlaps unless something moves it. So the moment
        you started typing, the field you were typing into went behind the keyboard -- along
        with the send button and the paste target.

        `padding` on iOS, `height` on Android, which is the combination that behaves for a
        bottom-anchored bar. The SafeAreaView above claims only the top edge, so there is no
        bottom inset to offset against.
      */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* The one sign that a sent note is still being dealt with. Above the bar rather than
            inside it, because the bar has already cleared itself (see `KEEPING_NOTE`). */}
        {keepingNote && (
          <View style={styles.keepingNoteRow}>
            <ActivityIndicator size="small" color={PRIMARY_COLOR} />
            <Text style={styles.keepingNoteText}>{KEEPING_NOTE}</Text>
          </View>
        )}
        <QuickCaptureBar
          onSend={handleSendMessage}
          onCameraPress={openCapture}
          onMicPress={openCapture}
          placeholder="Message..."
          primaryColor={PRIMARY_COLOR}
        />
      </KeyboardAvoidingView>

      {/* Entry Gallery Modal - Shows map + photos/videos for a specific entry */}
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

      {/* Compose Modal */}
      <JournalComposeModal
        visible={showComposeModal}
        onClose={() => setShowComposeModal(false)}
        onSave={handleSaveEntry}
        primaryColor={PRIMARY_COLOR}
      />

      {/*
        The book-style calendar (FR-001), in place of the platform's own white date picker.

        `picked` is one prop with three kinds, and `data-model.md` keeps `selectedDate` for day
        mode beside `picked`, so the two are mapped into it here: a picked month or year as it is,
        and otherwise the day on screen. The sheet reads it to decide which view it opens in, so
        reopening it over a month puts somebody back in Month view on that month rather than
        making them find it again (`initialView`).

        The pick itself is enough now that FR-013 makes the chip and a period exclusive: with the
        worklist on there is never a pick to be reopened over (T008). T006's `periodOnScreen`
        guard was here for the state in between, which no longer exists.

        `index` cannot be null while `visible` is true: `openCalendar` resolves one first, and
        nothing ever sets it back. See its comment for why that matters.
      */}
      <CalendarSheet
        visible={showCalendarSheet}
        picked={picked || { kind: 'day', date: selectedDateKey }}
        index={calendarIndex}
        onPick={handleCalendarPick}
        onClose={closeCalendar}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  noStoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginLeft: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: PRIMARY_COLOR,
    backgroundColor: '#FFF',
  },
  noStoryChipActive: {
    backgroundColor: PRIMARY_COLOR,
  },
  noStoryChipText: {
    color: PRIMARY_COLOR,
    fontSize: 12,
    fontWeight: '600',
  },
  noStoryChipTextActive: {
    color: '#FFF',
  },
  container: {
    flex: 1,
    backgroundColor: '#F0F4FF',
  },

  // The transient row above the quick bar while a typed note is being kept.
  keepingNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#FFF',
  },
  keepingNoteText: {
    fontSize: 13,
    color: '#8E8E93',
  },

  // New entries banner
  newEntriesBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PRIMARY_COLOR,
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 8,
  },
  newEntriesText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },

  // Header
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#F0F4FF',
  },
  topHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  topHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIcon: {
    padding: 4,
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: PRIMARY_COLOR,
  },

  // Sync status
  syncStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
  },
  syncText: {
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 4,
  },

  // Date selector
  dateSelector: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 16,
  },
  dateArrow: {
    padding: 8,
  },
  dateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  // FR-007's count, under the period it is a count of, and quieter than it.
  dateCount: {
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'center',
  },

  // Feed content
  feedContent: {
    paddingTop: 8,
    paddingBottom: 120,
  },

  // Empty state
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    marginTop: 60,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: PRIMARY_COLOR + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 22,
  },

  // Loading state
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    fontSize: 16,
    color: '#8E8E93',
    marginTop: 12,
  },
});
