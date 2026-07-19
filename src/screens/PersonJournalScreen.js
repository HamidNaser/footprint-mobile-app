/**
 * PersonJournalScreen - View Someone Else's Journal
 * 
 * Stack screen opened from FamilyScreen or FriendsScreen.
 * Shows journal entries from a person or group that are visible to the current user.
 * 
 * Features:
 * - Same UI as JournalScreen (calendar, date navigation, entry cards)
 * - Header with back button and person/group name
 * - View-only (no compose bar)
 * - Shows author info on cards when viewing a group
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Image,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

// Components
import { JournalEntryCard } from '../components/journal/JournalEntryCard';
import { 
  CalendarCoils,
  DateSwipeContainer,
  EntryGalleryModal,
  FullScreenMediaViewer,
  CalendarPickerModal,
} from '../components/journal';

// Context
import { useAuth } from '../context/AuthContext';

// Live data
import { getUserEntries } from '../services/SocialService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Theme colors
const PRIMARY_COLOR = '#4361ee';
const TEXT_COLOR = '#333';
const TEXT_MUTED = '#888';
const SURFACE_COLOR = '#fff';

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
 * Empty state component
 */
const EmptyState = ({ personName, isGroup }) => (
  <View style={styles.emptyState}>
    <View style={styles.emptyIcon}>
      <Ionicons name="book-outline" size={48} color={PRIMARY_COLOR} />
    </View>
    <Text style={styles.emptyTitle}>No entries for this day</Text>
    <Text style={styles.emptySubtitle}>
      {isGroup 
        ? "No family members have shared entries on this date"
        : `${personName} hasn't shared entries on this date`}
    </Text>
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
  
  // Route params
  const { 
    person,      // Single person: { id, name, avatar }
    persons,     // Group: array of persons
    isGroup,     // Boolean: viewing a group?
    groupName,   // Group name if viewing a group
  } = route.params || {};
  
  // State
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
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

  // Once entries load, jump to the person's most recent entry date (instead of
  // "today", which is almost always empty). Only auto-jumps once per person so
  // it never fights the user's manual date navigation or a pull-to-refresh.
  const didInitDateRef = useRef(false);

  // Display info
  const displayName = isGroup ? groupName : person?.name || 'Journal';
  const displayAvatar = isGroup ? null : person?.avatar;
  const displaySubtitle = isGroup ? `${persons?.length || 0} members` : null;

  /**
   * Get person IDs to fetch entries for
   */
  const personIds = useMemo(() => {
    if (isGroup && persons) {
      return persons.map(p => p.id).filter(Boolean);
    }
    if (person?.id) {
      return [person.id];
    }
    return [];
  }, [isGroup, persons, person]);

  /**
   * Lookup of person id -> { name, avatar } for author display in group views
   */
  const personById = useMemo(() => {
    const map = {};
    if (isGroup && persons) {
      persons.forEach(p => { if (p?.id) map[p.id] = p; });
    } else if (person?.id) {
      map[person.id] = person;
    }
    return map;
  }, [isGroup, persons, person]);

  /**
   * Fetch entries for the target person(s). The backend enforces per-entry
   * visibility, so no client-side filtering is required.
   */
  const loadEntries = useCallback(async () => {
    if (!accessToken || personIds.length === 0) {
      setEntries([]);
      setLoading(false);
      return;
    }
    try {
      setError(null);
      const results = await Promise.all(
        personIds.map(id => getUserEntries(accessToken, id))
      );
      const merged = results.flat().sort((a, b) => b.createdAt - a.createdAt);
      setEntries(merged);
      // On first successful load for this person, open on their latest entry so
      // the journal isn't stuck on an empty "today".
      if (!didInitDateRef.current && merged.length > 0) {
        didInitDateRef.current = true;
        setSelectedDate(new Date(merged[0].createdAt));
      }
    } catch (err) {
      setError(err.message || 'Failed to load journal');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [accessToken, personIds]);

  useEffect(() => {
    // New person selected: allow the next load to auto-jump to their latest entry.
    didInitDateRef.current = false;
  }, [personIds]);

  useEffect(() => {
    setLoading(true);
    loadEntries();
  }, [loadEntries]);

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
   * Filter entries for the selected date
   */
  const displayEntries = useMemo(() => {
    return entries.filter(entry => isSameDay(entry.createdAt, selectedDate));
  }, [entries, selectedDate, isSameDay]);

  /**
   * Dates that have journal entries - for calendar marking
   */
  const markedDates = useMemo(() => {
    const dates = {};
    entries.forEach(entry => {
      const date = new Date(entry.createdAt);
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      dates[dateStr] = { marked: true };
    });
    return dates;
  }, [entries]);

  /**
   * Get user info for an entry (for author display in group views)
   */
  const getUserForEntry = useCallback((entry) => {
    const p = personById[entry.userId];
    if (p) {
      return { name: p.name, avatarUrl: p.avatar };
    }
    if (entry.author?.name) {
      return { name: entry.author.name, avatarUrl: entry.author.avatarUrl };
    }
    return { name: 'Unknown', avatarUrl: null };
  }, [personById]);

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

  const goToNextDate = useCallback(() => navigateDate(1), [navigateDate]);
  const goToPreviousDate = useCallback(() => navigateDate(-1), [navigateDate]);

  /**
   * Handle refresh
   */
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadEntries();
    setRefreshing(false);
  }, [loadEntries]);

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
  const handleGalleryPhotoPress = useCallback((photos, index) => {
    setViewerMedia(photos);
    setViewerMediaType('photo');
    setViewerInitialIndex(index);
    setShowMediaViewer(true);
  }, []);

  /**
   * Handle video press from gallery modal
   */
  const handleGalleryVideoPress = useCallback((videos, index) => {
    setViewerMedia(videos);
    setViewerMediaType('video');
    setViewerInitialIndex(index);
    setShowMediaViewer(true);
  }, []);

  /**
   * Render entry card
   */
  const renderEntry = useCallback(({ item }) => {
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
        primaryColor={PRIMARY_COLOR}
      />
    );
  }, [authUser?.id, isGroup, getUserForEntry, handleEntryGalleryPress, handleGalleryPhotoPress, handleGalleryVideoPress]);

  /**
   * Key extractor
   */
  const keyExtractor = useCallback((item) => item.localId, []);

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

      {/* Date Selector */}
      <DateSelector
        date={selectedDate}
        onPrevious={goToPreviousDate}
        onNext={goToNextDate}
        onDatePress={() => setShowCalendarPicker(true)}
      />

      {/* Content */}
      <DateSwipeContainer
        enabled={swipeGesturesEnabled}
        onNextDate={goToNextDate}
        onPreviousDate={goToPreviousDate}
      >
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
          ListEmptyComponent={
            loading ? (
              <View style={styles.emptyState}>
                <ActivityIndicator size="large" color={PRIMARY_COLOR} />
              </View>
            ) : error ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="cloud-offline-outline" size={48} color={PRIMARY_COLOR} />
                </View>
                <Text style={styles.emptyTitle}>Couldn't load journal</Text>
                <Text style={styles.emptySubtitle}>{error}</Text>
              </View>
            ) : (
              <EmptyState 
                personName={displayName} 
                isGroup={isGroup} 
              />
            )
          }
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

      {/* Calendar Picker Modal */}
      <CalendarPickerModal
        visible={showCalendarPicker}
        selectedDate={selectedDate}
        markedDates={markedDates}
        onSelectDate={(date) => setSelectedDate(date)}
        onClose={() => setShowCalendarPicker(false)}
        primaryColor={PRIMARY_COLOR}
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

  // Date Selector
  dateSelector: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: SURFACE_COLOR,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  dateArrow: {
    padding: 8,
  },
  dateText: {
    fontSize: 16,
    fontWeight: '600',
    color: TEXT_COLOR,
    marginHorizontal: 16,
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
});
