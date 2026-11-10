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
import { JournalEntryCard } from '../components/journal/JournalEntryCard';
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
  isSameDay as isSameCivilDay,
} from '../utils/journalDate';
import { syncBadgeStatus, SyncBadgeStatus } from '../utils/syncStatus';
import { 
  DateSwipeContainer,
  QuickCaptureBar,
  EntryGalleryModal,
  FullScreenMediaViewer,
  CalendarPickerModal,
} from '../components/journal';

// Hooks
import { useJournalRealtime } from '../hooks/useJournalRealtime';
import { useJournal } from '../hooks/useJournal';

// Context
import { useRealtime, useSync } from '../context';
import { useAuth } from '../context/AuthContext';

// Services
import { SettingsService } from '../services/SettingsService';
import { JournalService } from '../services/JournalService';
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
 * Date selector component
 */
const DateSelector = ({ date, onPrevious, onNext, onDatePress }) => {
  const formattedDate = useMemo(() => {
    const d = new Date(date);
    return d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }, [date]);

  return (
    <View style={styles.dateSelector}>
      <TouchableOpacity style={styles.dateArrow} onPress={onPrevious}>
        <Ionicons name="chevron-back" size={20} color="#666" />
      </TouchableOpacity>
      <TouchableOpacity onPress={onDatePress}>
        <Text style={styles.dateText}>{formattedDate}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.dateArrow} onPress={onNext}>
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
  // view's Edit, at the capture screen -- so this state and the modal below are dead, and
  // deliberately left for T068 to remove with the rest of what this feature made dead.
  const [showComposeModal, setShowComposeModal] = useState(false);
  const [composeMode] = useState('text');
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
  
  // Calendar picker state
  const [showCalendarPicker, setShowCalendarPicker] = useState(false);

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

  // The sync bootstrap adopts the user's *server* journal id as the default and
  // stores it. JournalScreen reads the default once on mount, which can race
  // ahead of that reconciliation (leaving it pointed at a stale local journal id
  // with no entries). Once the first pull completes, re-read the default journal
  // id and adopt it so the screen queries the same journal the pulled entries
  // were stored under; otherwise just refresh in place.
  useEffect(() => {
    const unsubscribe = SyncEngine.addListener(async (event) => {
      if (event !== SyncEvent.SYNC_COMPLETED) return;
      try {
        const latest = await SettingsService.getDefaultJournalId();
        if (latest && latest !== journalId) {
          setJournalId(latest);
        } else if (journalId) {
          refresh();
        }
      } catch (err) {
        console.warn('[JournalScreen] post-sync journal adoption failed:', err?.message);
      }
    });
    return unsubscribe;
  }, [journalId, refresh]);

  // User display info - uses authUser from context
  const user = useMemo(() => ({
    name: authUser?.name || 'You',
    avatarUrl: authUser?.avatarUrl || 'https://randomuser.me/api/portraits/women/47.jpg',
  }), [authUser]);

  /**
   * Check if a timestamp is on the same day as the selected date
   */
  // Entry dates are floating civil dates, compared as YYYY-MM-DD keys so a
  // stored date is never re-parsed as an instant. Re-parsing was what made
  // entries land on the wrong day west of Greenwich, and would also slide them
  // when the user crosses timezones. See src/utils/journalDate.js.
  const isSameDay = useCallback((value, date) => isSameCivilDay(value, date), []);

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

  const displayEntries = useMemo(() => {
    // The worklist ignores the selected day on purpose. Somebody asking what they have
    // never written about wants every such memory, not the ones that happen to share a
    // date with whatever the calendar was left on -- which would usually be none.
    if (noStoryOnly) return noStoryEntries;

    // Filter entries to only show those from the selected date. Use the entry's
    // journal `date` (when the memory happened) rather than `createdAt` (when the
    // row was written/synced) so entries land on the correct calendar day. Fall
    // back to createdAt for legacy/mock entries that have no explicit date.
    return allEntries.filter(entry => isSameDay(entry.date || entry.createdAt, selectedDate));
  }, [allEntries, selectedDate, isSameDay, noStoryOnly, noStoryEntries]);

  /**
   * Dates that have journal entries - for calendar marking
   * Returns object like { '2024-05-15': { marked: true }, ... }
   */
  const markedDates = useMemo(() => {
    const dates = {};
    allEntries.forEach(entry => {
      const key = toDateKey(entry.date || entry.createdAt);
      if (key) dates[key] = { marked: true };
    });
    return dates;
  }, [allEntries]);

  /**
   * Sorted civil dates that have entries. Drives the left/right swipe, which
   * moves to the next/previous day that actually has entries rather than to the
   * adjacent calendar day.
   */
  const datesWithEntries = useMemo(
    () => Object.keys(markedDates).sort(),
    [markedDates],
  );

  // On first load, if the currently selected date (defaults to today) has no
  // entries but the journal does, jump to the most recent entry's date so the
  // synced data is visible immediately. Entries are date-stamped for when the
  // memory happened, which may be well before today. Runs once.
  const didInitialDateJump = useRef(false);
  useEffect(() => {
    if (didInitialDateJump.current) return;
    if (!entries || entries.length === 0) return;

    const hasEntryOnSelected = entries.some(
      (e) => isSameDay(e.date || e.createdAt, selectedDate),
    );
    if (hasEntryOnSelected) {
      didInitialDateJump.current = true;
      return;
    }

    // Compare as civil-date keys (lexicographic == chronological) and rebuild a
    // local Date from the winner. Going via new Date(key).getTime() would pick
    // UTC midnight and land the screen on the previous day west of Greenwich.
    const newestKey = entries.reduce((latest, e) => {
      const key = toDateKey(e.date || e.createdAt);
      return key && key > latest ? key : latest;
    }, '');
    if (newestKey) {
      setSelectedDate(parseDateKey(newestKey));
    }
    didInitialDateJump.current = true;
  }, [entries, selectedDate, isSameDay]);
  
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
   * Handle refresh
   */
  const handleRefresh = useCallback(async () => {
    // Clear new entry indicators
    clearNewEntries();
    // Refresh entries from local database
    await refresh();
  }, [clearNewEntries, refresh]);

  /**
   * Navigate to the next/previous date that actually has entries.
   *
   * Deliberately not +/- one calendar day: journals are sparse, and stepping
   * through empty days one swipe at a time to cross a gap between trips is
   * unusable. `direction` is 1 for later, -1 for earlier.
   */
  const navigateDate = useCallback((direction) => {
    setSelectedDate(prev => {
      const target = adjacentDateKey(datesWithEntries, toDateKey(prev), direction);
      // No populated date that way -- stay put. The swipe container also guards
      // this, so reaching here means the two disagreed; preferring the current
      // date keeps the screen stable rather than jumping somewhere arbitrary.
      return target ? parseDateKey(target) : prev;
    });
  }, [datesWithEntries]);

  /**
   * Whether a populated date exists in each direction, so the swipe container
   * can refuse the gesture at either end of the journal.
   */
  const selectedDateKey = useMemo(() => toDateKey(selectedDate), [selectedDate]);
  const hasNextDate = useMemo(
    () => adjacentDateKey(datesWithEntries, selectedDateKey, 1) !== null,
    [datesWithEntries, selectedDateKey],
  );
  const hasPreviousDate = useMemo(
    () => adjacentDateKey(datesWithEntries, selectedDateKey, -1) !== null,
    [datesWithEntries, selectedDateKey],
  );

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
  }, []);

  /**
   * The quick bar's camera and microphone: one tap into the capture screen (FR-001).
   *
   * The same route and the same parameters `CaptureFab` sends from the "+" over every tab, so
   * there is one capture screen and not two. Nothing is carried here -- not the bar's own
   * audience picker above all, because a memory is saved only on an explicit choice in the
   * capture screen's save sheet (FR-011).
   */
  const openCapture = useCallback(() => {
    navigation.navigate('Capture', { mode: 'new' });
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
   * Nothing is saved, and the audience the bar's own picker was left on is deliberately not
   * carried: a memory is saved only on an explicit choice in the capture screen's save sheet
   * (FR-011). A note that cannot be recorded is said back to the person, with the words in it,
   * rather than logged to a console nobody is reading (FR-017).
   *
   * While that is happening the screen says so (`KEEPING_NOTE`). The stamping is the slow part
   * -- a cold GPS fix, up to a few seconds, though `stampLocation` caches one for two minutes
   * so this is the first send after the app has been idle -- and the bar has already taken the
   * words off the screen. The flag is cleared in a `finally`, so the line does not outlive the
   * attempt either way: a failure says what happened, and a spinner left under it would say
   * the opposite.
   */
  const handleSendMessage = useCallback(async (text) => {
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

    openCapture();
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
  }, [navigation]);

  /**
   * The ⋯ on a card, which was wired to nothing at all before this: Edit, on the author's own
   * memory (FR-018, FR-021).
   *
   * **Nothing at all on anybody else's.** There is nothing in another person's memory for the
   * reader to edit -- an edit saves through `updateEntry`, which is their memory's to accept --
   * so a menu here would be a menu of one thing that cannot work. Whose memory it is, is the
   * same question and the same answer as `JournalEntryCard`'s own `isOwnEntry`, and the two
   * have to agree: the card shows the ⋯ and this decides what it offers.
   *
   * The cost of that rule, named: a memory saved while nobody was signed in carries
   * `local_user` as its author and is not matched, so Edit is not offered on it. It is the same
   * cost the card's own share line carries, for the same reason -- there is no other definition
   * of "the author's own memory" available here -- and offering an edit that `updateEntry`
   * would refuse is worse than not offering one.
   */
  const handleMenuPress = useCallback((entry) => {
    const isOwnEntry =
      !!authUser?.id && (entry?.userId === authUser.id || entry?.authorId === authUser.id);
    if (!isOwnEntry) return;

    Alert.alert('Memory options', null, [
      { text: 'Edit', onPress: () => openEdit(entry) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [authUser?.id, openEdit]);

  /**
   * Handle save entry from the compose modal, which **nothing on this screen now opens**: the
   * detail view's Edit was its last opener and T060 re-points that at the capture screen. The
   * modal and this handler are left where they are for T068, which is the task that removes
   * what this feature made dead, once `git grep` proves no caller remains anywhere. A new
   * memory does not come through here either: it is captured and saved on `CaptureScreen`.
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
    
    // Find the entry
    const entry = allEntries.find(e => e.localId === entryId || e.id === entryId);
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
      
      // Refresh to get updated reaction counts
      await refresh();
    } catch (error) {
      console.error('[JournalScreen] Failed to react:', error);
    }
  }, [allEntries, authUser?.id, refresh]);

  /**
   * Handle adding a comment/response to an entry
   */
  const handleAddResponse = useCallback(async (entryId, text) => {
    console.log('[JournalScreen] Add response:', entryId, text);
    
    if (!text?.trim()) return;
    
    // Find the entry
    const entry = allEntries.find(e => e.localId === entryId || e.id === entryId);
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
      
      // Refresh to get updated comments
      await refresh();
    } catch (error) {
      console.error('[JournalScreen] Failed to add comment:', error);
    }
  }, [allEntries, refresh]);

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
      await refresh();
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
  }, [refresh]);

  /**
   * Key extractor
   */
  const keyExtractor = useCallback((item) => item.localId, []);

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
    listRef.current?.scrollToIndex({ index, viewOffset: -offset, animated: true });
  }, []);

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
              onPress={() => setNoStoryOnly(on => !on)}
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
      <DateSelector
        date={selectedDate}
        onPrevious={() => navigateDate(-1)}
        onNext={() => navigateDate(1)}
        onDatePress={() => setShowCalendarPicker(true)}
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
            data={displayEntries}
            renderItem={renderEntry}
            keyExtractor={keyExtractor}
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
            ListEmptyComponent={<EmptyFeed />}
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
        initialMode={composeMode}
        primaryColor={PRIMARY_COLOR}
      />

      {/* Calendar Picker Modal */}
      <CalendarPickerModal
        visible={showCalendarPicker}
        selectedDate={selectedDate}
        onSelectDate={(date) => setSelectedDate(date)}
        onClose={() => setShowCalendarPicker(false)}
        markedDates={markedDates}
        primaryColor={PRIMARY_COLOR}
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
