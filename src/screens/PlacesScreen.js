/**
 * PlacesScreen - Matches web app design
 * 
 * Shows places with:
 * - Filter tabs (Everyone, Family, Friends, Following)
 * - Search box
 * - Place cards with years and visitor avatars
 * - Detail view with image carousel and map
 * - YearMemoriesModal showing memories from specific years
 * - "I was here" indicators
 * - Memory request functionality
 */

import React, { useState, memo, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  TextInput,
  Dimensions,
  Modal,
  FlatList,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { PLACE_FILTERS, PEOPLE, getStoryPrompts } from '../data/placesData';
import { getPlaces, getPlace } from '../api/PlacesApi';
import { YearMemoriesModal, IWasHereIndicator, ShareMemorySheet } from '../components/places';
import MemoryRequestCard from '../components/places/MemoryRequestCard';
import PlaceMapPreview from '../components/map/PlaceMapPreview';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Theme colors
const PRIMARY_COLOR = '#4361ee';
const SURFACE_COLOR = '#FFFFFF';
const TEXT_COLOR = '#333333';
const TEXT_MUTED = '#666666';
const BORDER_COLOR = '#e0e0e0';
const BACKGROUND_COLOR = '#F0F4FF';

/**
 * Header with search and avatar
 */
const Header = memo(({ user, searchQuery, onSearchChange, onAvatarPress }) => {
  return (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <Text style={styles.headerTitle}>Places</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.headerIcon}>
            <Ionicons name="notifications-outline" size={24} color="#333" />
          </TouchableOpacity>
          <TouchableOpacity onPress={onAvatarPress}>
            <Image
              source={{ uri: user?.avatarUrl || 'https://randomuser.me/api/portraits/women/47.jpg' }}
              style={styles.headerAvatar}
            />
          </TouchableOpacity>
        </View>
      </View>
      
      {/* Search Box */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={TEXT_MUTED} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search for a place..."
          placeholderTextColor={TEXT_MUTED}
          value={searchQuery}
          onChangeText={onSearchChange}
        />
      </View>
    </View>
  );
});

/**
 * Filter tab bar
 */
const FilterTabs = memo(({ activeFilter, onFilterChange }) => {
  return (
    <View style={styles.filterContainer}>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterScroll}
      >
        {PLACE_FILTERS.map((filter) => (
          <TouchableOpacity
            key={filter.id}
            style={[
              styles.filterTab,
              activeFilter === filter.id && styles.filterTabActive,
            ]}
            onPress={() => onFilterChange(filter.id)}
          >
            <Ionicons 
              name={filter.icon} 
              size={16} 
              color={activeFilter === filter.id ? '#FFF' : TEXT_MUTED} 
            />
            <Text 
              style={[
                styles.filterTabText,
                activeFilter === filter.id && styles.filterTabTextActive,
              ]}
            >
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
});

/**
 * Avatar group for year visitors
 */
const AvatarGroup = memo(({ avatars, maxVisible = 4 }) => {
  const visibleAvatars = avatars.slice(0, maxVisible);
  const extraCount = avatars.length - maxVisible;

  return (
    <View style={styles.avatarGroup}>
      {visibleAvatars.map((uri, index) => (
        <Image
          key={index}
          source={{ uri }}
          style={[
            styles.miniAvatar,
            { marginLeft: index === 0 ? 0 : -10, zIndex: avatars.length - index },
          ]}
        />
      ))}
      {extraCount > 0 && (
        <View style={[styles.miniAvatar, styles.avatarExtra, { marginLeft: -10 }]}>
          <Text style={styles.avatarExtraText}>+{extraCount}</Text>
        </View>
      )}
    </View>
  );
});

/**
 * Year row showing year and visitors
 */
const YearRow = memo(({ year, avatars, memoryCount, hasUntoldStory, onPress }) => {
  return (
    <TouchableOpacity style={styles.yearRow} onPress={onPress}>
      <View style={styles.yearLabelContainer}>
        <Text style={styles.yearLabel}>{year}</Text>
        {hasUntoldStory && (
          <View style={styles.storyIndicator}>
            <Ionicons name="mic" size={10} color="#FFF" />
          </View>
        )}
      </View>
      <AvatarGroup avatars={avatars} />
      <View style={styles.memoryBadge}>
        <Text style={styles.memoryBadgeText}>{memoryCount}</Text>
      </View>
    </TouchableOpacity>
  );
});

/**
 * Place card with image, name, and years panel
 */
const PlaceCard = memo(({ place, isSelected, onPress, onYearPress }) => {
  return (
    <View style={styles.placeCardContainer}>
      {/* Place Info Card */}
      <TouchableOpacity 
        style={[styles.placeCard, isSelected && styles.placeCardSelected]}
        onPress={() => onPress(place)}
      >
        <View style={styles.placeImageWrapper}>
          <Image source={{ uri: place.image }} style={styles.placeImage} />
          <View style={styles.placeBadge}>
            <Ionicons name="location" size={12} color="#FFF" />
          </View>
          {/* I was here indicator */}
          {place.iWasHere && (
            <View style={styles.iWasHerePosition}>
              <IWasHereIndicator iWasHere={true} size="small" />
            </View>
          )}
        </View>
        <Text style={styles.placeName} numberOfLines={1}>{place.name}</Text>
        <Text style={styles.placeSubtitle} numberOfLines={1}>{place.subtitle}</Text>
      </TouchableOpacity>

      {/* Horizontal Connector */}
      <View style={styles.horizontalConnector} />

      {/* Years Panel */}
      <View style={[styles.yearsPanel, isSelected && styles.yearsPanelSelected]}>
        {place.years.map((yearData) => (
          <YearRow
            key={yearData.year}
            year={yearData.year}
            avatars={yearData.avatars}
            memoryCount={yearData.memoryCount}
            hasUntoldStory={yearData.hasUntoldStory}
            onPress={() => onYearPress(place, yearData.year)}
          />
        ))}
      </View>
    </View>
  );
});

/**
 * Image carousel for place detail
 */
const ImageCarousel = memo(({ photos }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  const handleScroll = (event) => {
    const slideWidth = SCREEN_WIDTH - 32;
    const index = Math.round(event.nativeEvent.contentOffset.x / slideWidth);
    setCurrentIndex(index);
  };

  return (
    <View style={styles.carouselContainer}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {photos.map((photo, index) => (
          <Image
            key={index}
            source={{ uri: photo }}
            style={styles.carouselImage}
            resizeMode="cover"
          />
        ))}
      </ScrollView>
      
      {/* Pagination dots */}
      <View style={styles.paginationDots}>
        {photos.map((_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              currentIndex === index && styles.dotActive,
            ]}
          />
        ))}
      </View>
    </View>
  );
});

/**
 * Place detail modal
 */
const PlaceDetailModal = memo(({ place, visible, onClose }) => {
  if (!place) return null;

  const totalMemories = place.years.reduce((sum, y) => sum + y.memoryCount, 0);
  const totalVisitors = new Set(place.years.flatMap(y => y.avatars)).size;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.modalContainer} edges={['top']}>
        {/* Modal Header */}
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
            <Ionicons name="close" size={24} color={TEXT_COLOR} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>{place.name}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.modalContent}>
          {/* Image Carousel */}
          <ImageCarousel photos={place.photos} />

          {/* Place Info */}
          <View style={styles.placeInfo}>
            <View style={styles.placeInfoHeader}>
              <View>
                <Text style={styles.placeInfoName}>{place.name}</Text>
                <Text style={styles.placeInfoSubtitle}>{place.subtitle}</Text>
              </View>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Ionicons name="images-outline" size={18} color={PRIMARY_COLOR} />
                  <Text style={styles.statText}>{totalMemories}</Text>
                </View>
                <View style={styles.statItem}>
                  <Ionicons name="people-outline" size={18} color={PRIMARY_COLOR} />
                  <Text style={styles.statText}>{totalVisitors}</Text>
                </View>
              </View>
            </View>

            {/* Map Preview (only when we have coordinates) */}
            {place.location?.lat != null && place.location?.lng != null && (
              <PlaceMapPreview
                lat={place.location.lat}
                lng={place.location.lng}
              />
            )}

            {/* Years Timeline */}
            <Text style={styles.sectionTitle}>Timeline</Text>
            {place.years.map((yearData) => (
              <View key={yearData.year} style={styles.timelineYear}>
                <View style={styles.timelineYearHeader}>
                  <Text style={styles.timelineYearLabel}>{yearData.year}</Text>
                  <Text style={styles.timelineMemoryCount}>
                    {yearData.memoryCount} memories
                  </Text>
                </View>
                <AvatarGroup avatars={yearData.avatars} maxVisible={6} />
              </View>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
});

/**
 * PlacesScreen component
 */
export default function PlacesScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  
  const [activeFilter, setActiveFilter] = useState('everyone');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  
  // New state for YearMemoriesModal
  const [showYearMemories, setShowYearMemories] = useState(false);
  const [selectedYear, setSelectedYear] = useState(null);
  
  // Share sheet state
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [shareMemory, setShareMemory] = useState(null);

  // Live places from the Hub API (no mock fallback)
  const [places, setPlaces] = useState([]);
  const [isLoadingPlaces, setIsLoadingPlaces] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setIsLoadingPlaces(true);
        const data = await getPlaces();
        if (mounted) setPlaces(data);
      } catch (err) {
        console.warn('Failed to load places:', err?.message);
        if (mounted) setPlaces([]);
      } finally {
        if (mounted) setIsLoadingPlaces(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Filter places based on active filter and search
  const filteredPlaces = useMemo(() => {
    let result = places;

    // Filter by category
    if (activeFilter !== 'everyone') {
      result = result.filter(p => p.category === activeFilter || p.category === 'everyone');
    }

    // Filter by search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(p =>
        p.name.toLowerCase().includes(query) ||
        (p.subtitle || '').toLowerCase().includes(query)
      );
    }

    return result;
  }, [places, activeFilter, searchQuery]);

  const handleAvatarPress = useCallback(() => {
    navigation.navigate('Profile');
  }, [navigation]);

  // Fetch the full detail (photos, coordinates, per-year memories) for a place
  // and merge it into the selected place so both modals show live data.
  const enrichSelectedPlace = useCallback(async (place) => {
    try {
      const detail = await getPlace(place.id);
      setSelectedPlace((current) =>
        current?.id === place.id ? { ...place, ...detail } : current
      );
    } catch (err) {
      console.warn('Failed to load place detail:', err?.message);
    }
  }, []);

  const handlePlacePress = useCallback((place) => {
    setSelectedPlace(place);
    setShowDetail(true);
    enrichSelectedPlace(place);
  }, [enrichSelectedPlace]);

  const handleYearPress = useCallback((place, year) => {
    setSelectedPlace(place);
    setSelectedYear(year);
    setShowYearMemories(true);
    enrichSelectedPlace(place);
  }, [enrichSelectedPlace]);

  const handleCloseDetail = useCallback(() => {
    setShowDetail(false);
  }, []);

  const handleCloseYearMemories = useCallback(() => {
    setShowYearMemories(false);
    setSelectedYear(null);
  }, []);

  const handleMemoryPress = useCallback((memory) => {
    // Could open full memory view
    console.log('Memory pressed:', memory);
  }, []);

  const handleAddMemory = useCallback((place, year) => {
    Alert.alert(
      'Add Memory',
      `Add your memory from ${year} at ${place.name}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Take Photo', onPress: () => console.log('Take photo') },
        { text: 'Choose from Library', onPress: () => console.log('Choose photo') },
      ]
    );
  }, []);

  const handleStartInterview = useCallback((memory) => {
    // Navigate to interview mode with the person
    navigation.navigate('InterviewMode', {
      person: memory.author,
      place: selectedPlace,
      memory: memory,
    });
  }, [navigation, selectedPlace]);

  const handleShareMemory = useCallback((memory) => {
    setShareMemory(memory);
    setShowShareSheet(true);
  }, []);

  // Get potential people to request memories from
  const potentialRequestRecipients = useMemo(() => {
    return Object.values(PEOPLE).filter(p => 
      p.id !== 'me' && 
      (p.relationship === 'grandfather' || 
       p.relationship === 'grandmother' || 
       p.relationship === 'father' || 
       p.relationship === 'mother' ||
       p.relationship === 'uncle')
    );
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header with Search */}
      <Header 
        user={user} 
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onAvatarPress={handleAvatarPress} 
      />

      {/* Filter Tabs */}
      <FilterTabs 
        activeFilter={activeFilter} 
        onFilterChange={setActiveFilter} 
      />

      {/* Places List */}
      <ScrollView 
        style={styles.placesList}
        contentContainerStyle={styles.placesListContent}
        showsVerticalScrollIndicator={false}
      >
        {isLoadingPlaces ? (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color={PRIMARY_COLOR} />
          </View>
        ) : filteredPlaces.length > 0 ? (
          filteredPlaces.map((place, index) => (
            <PlaceCard
              key={place.id}
              place={place}
              isSelected={selectedPlace?.id === place.id}
              onPress={handlePlacePress}
              onYearPress={handleYearPress}
            />
          ))
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="location-outline" size={48} color={TEXT_MUTED} />
            <Text style={styles.emptyStateText}>No places found</Text>
            <Text style={styles.emptyStateSubtext}>
              {searchQuery ? 'Try a different search' : 'Add locations to your memories'}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Place Detail Modal */}
      <PlaceDetailModal
        place={selectedPlace}
        visible={showDetail}
        onClose={handleCloseDetail}
      />

      {/* Year Memories Modal */}
      <YearMemoriesModal
        visible={showYearMemories}
        place={selectedPlace}
        year={selectedYear}
        onClose={handleCloseYearMemories}
        onMemoryPress={handleMemoryPress}
        onAddMemory={handleAddMemory}
        onStartInterview={handleStartInterview}
      />

      {/* Share Memory Sheet */}
      <ShareMemorySheet
        visible={showShareSheet}
        memory={shareMemory}
        suggestedPeople={potentialRequestRecipients.slice(0, 4)}
        onClose={() => setShowShareSheet(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BACKGROUND_COLOR,
  },

  // Header
  header: {
    backgroundColor: SURFACE_COLOR,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_COLOR,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: TEXT_COLOR,
  },
  headerRight: {
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

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: TEXT_COLOR,
  },

  // Filter Tabs
  filterContainer: {
    backgroundColor: SURFACE_COLOR,
    paddingVertical: 8,
  },
  filterScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    gap: 6,
  },
  filterTabActive: {
    backgroundColor: PRIMARY_COLOR,
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: '500',
    color: TEXT_MUTED,
  },
  filterTabTextActive: {
    color: '#FFF',
  },

  // Places List
  placesList: {
    flex: 1,
  },
  placesListContent: {
    padding: 16,
    gap: 12,
  },

  // Place Card Container
  placeCardContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  // Place Card
  placeCard: {
    width: 90,
    backgroundColor: SURFACE_COLOR,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: BORDER_COLOR,
  },
  placeCardSelected: {
    borderColor: PRIMARY_COLOR,
    backgroundColor: '#F7FAFF',
  },
  placeImageWrapper: {
    position: 'relative',
    marginBottom: 6,
  },
  placeImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: BORDER_COLOR,
  },
  placeBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    backgroundColor: PRIMARY_COLOR,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  placeName: {
    fontSize: 12,
    fontWeight: '600',
    color: TEXT_COLOR,
    textAlign: 'center',
  },
  placeSubtitle: {
    fontSize: 10,
    color: TEXT_MUTED,
    textAlign: 'center',
  },

  // Horizontal Connector
  horizontalConnector: {
    width: 16,
    height: 2,
    backgroundColor: BORDER_COLOR,
    marginTop: 35,
  },

  // Years Panel
  yearsPanel: {
    flex: 1,
    backgroundColor: SURFACE_COLOR,
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
  },
  yearsPanelSelected: {
    borderColor: '#BCD8FF',
    backgroundColor: '#F7FAFF',
  },

  // Year Row
  yearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 6,
    gap: 8,
  },
  yearLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: PRIMARY_COLOR,
    minWidth: 36,
  },

  // Avatar Group
  avatarGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  miniAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#FFF',
  },
  avatarExtra: {
    backgroundColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarExtraText: {
    fontSize: 10,
    fontWeight: '600',
    color: TEXT_MUTED,
  },

  // Memory Badge
  memoryBadge: {
    backgroundColor: '#E8F0FE',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  memoryBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: PRIMARY_COLOR,
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: TEXT_COLOR,
    marginTop: 12,
  },
  emptyStateSubtext: {
    fontSize: 13,
    color: TEXT_MUTED,
    marginTop: 4,
  },

  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: BACKGROUND_COLOR,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: SURFACE_COLOR,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_COLOR,
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: TEXT_COLOR,
  },
  modalContent: {
    flex: 1,
  },

  // Image Carousel
  carouselContainer: {
    position: 'relative',
  },
  carouselImage: {
    width: SCREEN_WIDTH - 32,
    height: 200,
    marginHorizontal: 16,
    borderRadius: 12,
  },
  paginationDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 10,
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: BORDER_COLOR,
  },
  dotActive: {
    backgroundColor: PRIMARY_COLOR,
    width: 18,
  },

  // Place Info
  placeInfo: {
    padding: 16,
  },
  placeInfoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  placeInfoName: {
    fontSize: 22,
    fontWeight: '700',
    color: TEXT_COLOR,
  },
  placeInfoSubtitle: {
    fontSize: 14,
    color: TEXT_MUTED,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E8F0FE',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statText: {
    fontSize: 13,
    fontWeight: '600',
    color: PRIMARY_COLOR,
  },

  // Map Preview
  mapPreview: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  mapPreviewText: {
    fontSize: 12,
    color: TEXT_MUTED,
    marginTop: 8,
  },

  // Timeline
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: TEXT_COLOR,
    marginBottom: 12,
  },
  timelineYear: {
    backgroundColor: SURFACE_COLOR,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
  },
  timelineYearHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  timelineYearLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: PRIMARY_COLOR,
  },
  timelineMemoryCount: {
    fontSize: 12,
    color: TEXT_MUTED,
  },

  // Year label with story indicator
  yearLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 50,
  },
  storyIndicator: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#f97316',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // I was here position
  iWasHerePosition: {
    position: 'absolute',
    bottom: -4,
    right: -8,
  },
});
