/**
 * MediaGalleryTab Component
 * 
 * Displays all media (photos, videos, audio) from journal entries
 * in a grid format with filtering options.
 */

import React, { useState, useCallback, useMemo, memo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  Dimensions,
  RefreshControl,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VideoThumbnail } from '../media/VideoThumbnail';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_COLUMNS = 3;
const GRID_GAP = 2;
const ITEM_SIZE = (SCREEN_WIDTH - (GRID_GAP * (GRID_COLUMNS - 1))) / GRID_COLUMNS;

/**
 * Media filter types
 */
export const MediaFilter = {
  ALL: 'all',
  PHOTOS: 'photos',
  VIDEOS: 'videos',
  AUDIO: 'audio',
};

/**
 * Filter bar component
 */
const FilterBar = memo(({ activeFilter, onFilterChange, counts, primaryColor }) => {
  const filters = [
    { key: MediaFilter.ALL, label: 'All', icon: 'grid-outline' },
    { key: MediaFilter.PHOTOS, label: 'Photos', icon: 'image-outline' },
    { key: MediaFilter.VIDEOS, label: 'Videos', icon: 'videocam-outline' },
    { key: MediaFilter.AUDIO, label: 'Audio', icon: 'mic-outline' },
  ];

  return (
    <View style={styles.filterBar}>
      {filters.map(filter => {
        const isActive = activeFilter === filter.key;
        const count = counts[filter.key] || 0;
        
        return (
          <TouchableOpacity
            key={filter.key}
            style={[
              styles.filterButton,
              isActive && { backgroundColor: primaryColor },
            ]}
            onPress={() => onFilterChange(filter.key)}
          >
            <Ionicons 
              name={filter.icon} 
              size={16} 
              color={isActive ? '#FFF' : '#8E8E93'} 
            />
            <Text style={[
              styles.filterLabel,
              isActive && styles.filterLabelActive,
            ]}>
              {filter.label}
            </Text>
            {count > 0 && (
              <View style={[
                styles.filterCount,
                isActive && styles.filterCountActive,
              ]}>
                <Text style={[
                  styles.filterCountText,
                  isActive && styles.filterCountTextActive,
                ]}>
                  {count > 99 ? '99+' : count}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
});

/**
 * Photo grid item
 */
const PhotoGridItem = memo(({ item, onPress }) => (
  <TouchableOpacity
    style={styles.gridItem}
    onPress={() => onPress?.(item)}
    activeOpacity={0.8}
  >
    <Image
      source={{ uri: item.localPath || item.serverUrl }}
      style={styles.gridImage}
      resizeMode="cover"
    />
    {item.location && (
      <View style={styles.locationIndicator}>
        <Ionicons name="location" size={10} color="#FFF" />
      </View>
    )}
  </TouchableOpacity>
));

/**
 * Video grid item
 */
const VideoGridItem = memo(({ item, onPress }) => (
  <TouchableOpacity
    style={styles.gridItem}
    onPress={() => onPress?.(item)}
    activeOpacity={0.8}
  >
    <VideoThumbnail
      videoUri={item.localPath || item.serverUrl}
      thumbnailUri={item.thumbnailUrl}
      duration={item.duration}
      width={ITEM_SIZE}
      height={ITEM_SIZE}
      showDuration
      showPlayIcon
    />
  </TouchableOpacity>
));

/**
 * Audio list item
 */
const AudioListItem = memo(({ item, onPress, primaryColor }) => {
  const formatDuration = (ms) => {
    if (!ms) return '0:00';
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <TouchableOpacity
      style={styles.audioItem}
      onPress={() => onPress?.(item)}
      activeOpacity={0.8}
    >
      <View style={[styles.audioIcon, { backgroundColor: primaryColor + '20' }]}>
        <Ionicons name="mic" size={24} color={primaryColor} />
      </View>
      <View style={styles.audioInfo}>
        <Text style={styles.audioTitle} numberOfLines={1}>
          {item.title || 'Voice recording'}
        </Text>
        <Text style={styles.audioMeta}>
          {formatDuration(item.duration)} • {formatDate(item.createdAt)}
        </Text>
      </View>
      <Ionicons name="play-circle" size={32} color={primaryColor} />
    </TouchableOpacity>
  );
});

/**
 * Month header for grouped view
 */
const MonthHeader = memo(({ month, year, count }) => (
  <View style={styles.monthHeader}>
    <Text style={styles.monthTitle}>
      {new Date(year, month).toLocaleDateString(undefined, { 
        month: 'long', 
        year: 'numeric' 
      })}
    </Text>
    <Text style={styles.monthCount}>{count} items</Text>
  </View>
));

/**
 * Empty state component
 */
const EmptyState = ({ filter, primaryColor }) => {
  const getEmptyConfig = () => {
    switch (filter) {
      case MediaFilter.PHOTOS:
        return { 
          icon: 'image-outline', 
          title: 'No photos yet',
          subtitle: 'Photos you add to your journal will appear here',
        };
      case MediaFilter.VIDEOS:
        return { 
          icon: 'videocam-outline', 
          title: 'No videos yet',
          subtitle: 'Videos you record will appear here',
        };
      case MediaFilter.AUDIO:
        return { 
          icon: 'mic-outline', 
          title: 'No recordings yet',
          subtitle: 'Voice recordings will appear here',
        };
      default:
        return { 
          icon: 'images-outline', 
          title: 'No media yet',
          subtitle: 'Add photos, videos, and voice recordings to your journal',
        };
    }
  };

  const config = getEmptyConfig();

  return (
    <View style={styles.emptyState}>
      <View style={[styles.emptyIcon, { backgroundColor: primaryColor + '15' }]}>
        <Ionicons name={config.icon} size={48} color={primaryColor} />
      </View>
      <Text style={styles.emptyTitle}>{config.title}</Text>
      <Text style={styles.emptySubtitle}>{config.subtitle}</Text>
    </View>
  );
};

/**
 * Main MediaGalleryTab component
 */
export const MediaGalleryTab = ({
  entries = [],
  onPhotoPress,
  onVideoPress,
  onAudioPress,
  onRefresh,
  isRefreshing = false,
  primaryColor = '#007AFF',
  style,
}) => {
  const [activeFilter, setActiveFilter] = useState(MediaFilter.ALL);

  /**
   * Extract all media from entries
   */
  const allMedia = useMemo(() => {
    const photos = [];
    const videos = [];
    const audio = [];

    entries.forEach(entry => {
      entry.contentBlocks?.forEach(block => {
        if (block.type === 'photos') {
          block.media?.forEach(m => photos.push({
            ...m,
            entryId: entry.localId,
            createdAt: entry.createdAt,
          }));
        } else if (block.type === 'video') {
          block.media?.forEach(m => videos.push({
            ...m,
            entryId: entry.localId,
            createdAt: entry.createdAt,
          }));
        } else if (block.type === 'audio') {
          block.media?.forEach(m => audio.push({
            ...m,
            entryId: entry.localId,
            createdAt: entry.createdAt,
            duration: block.duration,
          }));
        }
      });
    });

    // Sort by date (newest first)
    const sortByDate = (a, b) => b.createdAt - a.createdAt;
    photos.sort(sortByDate);
    videos.sort(sortByDate);
    audio.sort(sortByDate);

    return { photos, videos, audio };
  }, [entries]);

  /**
   * Filter counts
   */
  const counts = useMemo(() => ({
    [MediaFilter.ALL]: allMedia.photos.length + allMedia.videos.length + allMedia.audio.length,
    [MediaFilter.PHOTOS]: allMedia.photos.length,
    [MediaFilter.VIDEOS]: allMedia.videos.length,
    [MediaFilter.AUDIO]: allMedia.audio.length,
  }), [allMedia]);

  /**
   * Get filtered media
   */
  const filteredMedia = useMemo(() => {
    switch (activeFilter) {
      case MediaFilter.PHOTOS:
        return { type: 'grid', data: allMedia.photos };
      case MediaFilter.VIDEOS:
        return { type: 'grid', data: allMedia.videos };
      case MediaFilter.AUDIO:
        return { type: 'list', data: allMedia.audio };
      default:
        // Combine photos and videos for grid, keep audio separate
        const gridItems = [...allMedia.photos, ...allMedia.videos]
          .sort((a, b) => b.createdAt - a.createdAt);
        return { type: 'grid', data: gridItems, audioData: allMedia.audio };
    }
  }, [activeFilter, allMedia]);

  /**
   * Render grid item
   */
  const renderGridItem = useCallback(({ item }) => {
    if (item.type === 'video' || item.duration) {
      return <VideoGridItem item={item} onPress={onVideoPress} />;
    }
    return <PhotoGridItem item={item} onPress={onPhotoPress} />;
  }, [onPhotoPress, onVideoPress]);

  /**
   * Render audio item
   */
  const renderAudioItem = useCallback(({ item }) => (
    <AudioListItem 
      item={item} 
      onPress={onAudioPress} 
      primaryColor={primaryColor}
    />
  ), [onAudioPress, primaryColor]);

  /**
   * Key extractor
   */
  const keyExtractor = useCallback((item, index) => 
    item.localId || item.serverId || `media-${index}`
  , []);

  // Check if empty
  const isEmpty = filteredMedia.data.length === 0 && 
    (!filteredMedia.audioData || filteredMedia.audioData.length === 0);

  return (
    <View style={[styles.container, style]}>
      {/* Filter bar */}
      <FilterBar
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        counts={counts}
        primaryColor={primaryColor}
      />

      {/* Empty state */}
      {isEmpty && (
        <EmptyState filter={activeFilter} primaryColor={primaryColor} />
      )}

      {/* Audio list view */}
      {activeFilter === MediaFilter.AUDIO && filteredMedia.data.length > 0 && (
        <FlatList
          data={filteredMedia.data}
          renderItem={renderAudioItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.audioList}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={primaryColor}
            />
          }
        />
      )}

      {/* Grid view for photos/videos */}
      {activeFilter !== MediaFilter.AUDIO && filteredMedia.data.length > 0 && (
        <FlatList
          data={filteredMedia.data}
          renderItem={renderGridItem}
          keyExtractor={keyExtractor}
          numColumns={GRID_COLUMNS}
          contentContainerStyle={styles.grid}
          showsVerticalScrollIndicator={false}
          columnWrapperStyle={styles.gridRow}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={primaryColor}
            />
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
  },

  // Filter bar
  filterBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    backgroundColor: '#F2F2F7',
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#8E8E93',
    marginLeft: 4,
  },
  filterLabelActive: {
    color: '#FFF',
  },
  filterCount: {
    backgroundColor: '#E5E5EA',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 4,
  },
  filterCountActive: {
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  filterCountText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8E8E93',
  },
  filterCountTextActive: {
    color: '#FFF',
  },

  // Grid
  grid: {
    padding: GRID_GAP / 2,
  },
  gridRow: {
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  gridItem: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderRadius: 4,
    overflow: 'hidden',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  locationIndicator: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 10,
    padding: 4,
  },

  // Audio list
  audioList: {
    padding: 16,
  },
  audioItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  audioIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  audioInfo: {
    flex: 1,
    marginLeft: 12,
  },
  audioTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1C1C1E',
  },
  audioMeta: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },

  // Month header
  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F2F2F7',
  },
  monthTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  monthCount: {
    fontSize: 13,
    color: '#8E8E93',
  },

  // Empty state
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default MediaGalleryTab;
