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

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

// Components
import { JournalEntryCard } from '../components/journal/JournalEntryCard';
import { JournalComposeModal } from '../components/journal/JournalComposeModal';
import { JournalEntryDetail } from './JournalEntryDetail';
import { ConnectionStatusIndicator } from '../components/common/ConnectionStatusIndicator';
import { NotificationBadge } from '../components/common/NotificationBadge';
import { 
  CalendarCoils,
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
import { useRealtime } from '../context';
import { useAuth } from '../context/AuthContext';

// Services
import { SettingsService } from '../services/SettingsService';

// Mock data (dev only)
import { MOCK_ENTRIES, getMockUserById } from '../data/mockData';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Primary color
const PRIMARY_COLOR = '#4361ee';

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
const SyncStatusIndicator = ({ pendingCount, isOnline }) => {
  if (pendingCount === 0 && isOnline) {
    return (
      <View style={styles.syncStatus}>
        <Ionicons name="cloud-done" size={16} color="#34C759" />
        <Text style={[styles.syncText, { color: '#34C759' }]}>Synced</Text>
      </View>
    );
  }

  if (pendingCount > 0) {
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
  const [showComposeModal, setShowComposeModal] = useState(false);
  const [composeMode, setComposeMode] = useState('text');
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

  // Real-time context
  const { isConnected, unreadNotificationCount } = useRealtime();
  
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

  // User display info - uses authUser from context
  const user = useMemo(() => ({
    name: authUser?.name || 'You',
    avatarUrl: authUser?.avatarUrl || 'https://randomuser.me/api/portraits/women/47.jpg',
  }), [authUser]);

  /**
   * Check if a timestamp is on the same day as the selected date
   */
  const isSameDay = useCallback((timestamp, date) => {
    const entryDate = new Date(timestamp);
    return (
      entryDate.getFullYear() === date.getFullYear() &&
      entryDate.getMonth() === date.getMonth() &&
      entryDate.getDate() === date.getDate()
    );
  }, []);

  /**
   * Display entries logic:
   * - Production: only real entries from database
   * - Dev mode: show real entries + mock entries for rich demo data
   * - Filter by selected date
   */
  /**
   * All entries (real + mock in dev mode)
   * Used for both display and calendar marking
   */
  const allEntries = useMemo(() => {
    if (__DEV__) {
      return [...entries, ...MOCK_ENTRIES];
    }
    return entries;
  }, [entries]);

  const displayEntries = useMemo(() => {
    // Filter entries to only show those from the selected date
    return allEntries.filter(entry => isSameDay(entry.createdAt, selectedDate));
  }, [allEntries, selectedDate, isSameDay]);

  /**
   * Dates that have journal entries - for calendar marking
   * Returns object like { '2024-05-15': { marked: true }, ... }
   */
  const markedDates = useMemo(() => {
    const dates = {};
    allEntries.forEach(entry => {
      const date = new Date(entry.createdAt);
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      dates[dateStr] = { marked: true };
    });
    return dates;
  }, [allEntries]);
  
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
    
    // In dev mode, look up mock user by userId
    if (__DEV__ && entry.userId) {
      const mockUser = getMockUserById(entry.userId);
      if (mockUser) {
        return {
          name: mockUser.name,
          avatarUrl: mockUser.avatarUrl,
        };
      }
    }
    
    // Default to current auth user
    return user;
  }, [user]);
  
  // Calculate pending count from entries
  const pendingCount = displayEntries.filter(e => e.syncStatus === 'pending').length;
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
   * Navigate date
   */
  const navigateDate = useCallback((direction) => {
    setSelectedDate(prev => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() + direction);
      return newDate;
    });
  }, []);

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
   * Handle sending a message directly from the input bar (WhatsApp-style)
   */
  const handleSendMessage = useCallback(async (text, visibility = 'private') => {
    if (!text.trim()) return;
    
    console.log('[JournalScreen] Sending quick message:', text, 'visibility:', visibility);
    
    try {
      await createEntry({
        userId: authUser?.id || 'local_user',
        contentBlocks: [{ type: 'text', content: text }],
        visibility: visibility,
        date: new Date(),
      });
      console.log('[JournalScreen] Quick message saved');
    } catch (error) {
      console.error('[JournalScreen] Failed to save quick message:', error);
    }
  }, [createEntry, authUser]);

  const handleQuickCamera = useCallback(() => {
    setComposeMode('camera');
    setShowComposeModal(true);
  }, []);

  const handleQuickMic = useCallback(() => {
    setComposeMode('audio');
    setShowComposeModal(true);
  }, []);

  /**
   * Handle entry press
   */
  const handleEntryPress = useCallback((entry) => {
    setSelectedEntry(entry);
    setShowEntryDetail(true);
  }, []);

  /**
   * Handle save entry from compose modal
   */
  const handleSaveEntry = useCallback(async (entryData) => {
    console.log('[JournalScreen] Saving entry:', entryData);
    
    try {
      await createEntry({
        userId: authUser?.id || 'local_user',
        contentBlocks: entryData.contentBlocks,
        visibility: entryData.visibility,
        location: entryData.location,
        date: entryData.date,
      });
      
      setShowComposeModal(false);
      console.log('[JournalScreen] Entry saved successfully');
    } catch (error) {
      console.error('[JournalScreen] Failed to save entry:', error);
      // Error will be shown via the useJournal hook's error state
    }
  }, [createEntry, authUser]);

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
   * Render entry card
   */
  const renderEntry = useCallback(({ item }) => {
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
        primaryColor={PRIMARY_COLOR}
      />
    );
  }, [authUser?.id, getUserForEntry, handleEntryGalleryPress, handleGalleryPhotoPress, handleGalleryVideoPress]);

  /**
   * Key extractor
   */
  const keyExtractor = useCallback((item) => item.localId, []);

  // Show entry detail view
  if (showEntryDetail && selectedEntry) {
    const detailUser = getUserForEntry(selectedEntry);
    return (
      <JournalEntryDetail
        entry={selectedEntry}
        user={detailUser}
        onEdit={(entry) => {
          setShowEntryDetail(false);
          setComposeMode('text');
          setShowComposeModal(true);
        }}
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
          <SyncStatusIndicator pendingCount={pendingCount} isOnline={isOnline} />
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

      {/* Calendar Coils (decorative spiral binding) */}
      <CalendarCoils coilCount={7} color={PRIMARY_COLOR} />

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
      >
        {isInitializing || loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={PRIMARY_COLOR} />
            <Text style={styles.loadingText}>Loading journal...</Text>
          </View>
        ) : (
          <FlatList
            data={displayEntries}
            renderItem={renderEntry}
            keyExtractor={keyExtractor}
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

      {/* WhatsApp-style Input Bar */}
      <QuickCaptureBar
        onSend={handleSendMessage}
        onCameraPress={handleQuickCamera}
        onMicPress={handleQuickMic}
        placeholder="Message..."
        primaryColor={PRIMARY_COLOR}
      />

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
  container: {
    flex: 1,
    backgroundColor: '#F0F4FF',
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
