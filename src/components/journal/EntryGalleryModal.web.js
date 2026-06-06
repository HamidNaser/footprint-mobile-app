/**
 * EntryGalleryModal Component (Web Version)
 * 
 * Shows a full-screen modal with:
 * - Map placeholder (showing coordinates) at the top
 * - Photos row (scrollable)
 * - Videos row (scrollable)
 * 
 * Tapping on a photo/video opens the full-screen viewer.
 * 
 * Note: This is the web version without react-native-maps
 */

import React, { memo, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VideoThumbnail } from '../media/VideoThumbnail';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const MAP_HEIGHT = 200;
const MEDIA_ITEM_SIZE = 120;

/**
 * Map placeholder for web (shows coordinates)
 */
const MapSection = memo(({ location }) => {
  if (!location) {
    return (
      <View style={styles.mapPlaceholder}>
        <Ionicons name="location-outline" size={32} color="#8E8E93" />
        <Text style={styles.mapPlaceholderText}>No location data</Text>
      </View>
    );
  }

  return (
    <View style={styles.mapPlaceholder}>
      <Ionicons name="map-outline" size={40} color="#007AFF" />
      <Text style={styles.mapLocationName}>{location.name || 'Location'}</Text>
      <Text style={styles.mapCoordinates}>
        {location.lat?.toFixed(4)}, {location.lng?.toFixed(4)}
      </Text>
    </View>
  );
});

/**
 * Media row component for photos or videos
 */
const MediaRow = memo(({ 
  title, 
  items, 
  type, 
  onItemPress, 
  primaryColor 
}) => {
  if (!items || items.length === 0) return null;

  return (
    <View style={styles.mediaSection}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.mediaScrollContent}
      >
        {items.map((item, index) => (
          <TouchableOpacity
            key={item.id || index}
            style={styles.mediaItem}
            onPress={() => onItemPress?.(items, index)}
            activeOpacity={0.8}
          >
            {type === 'photo' ? (
              <Image
                source={{ uri: item.localPath || item.serverUrl }}
                style={styles.mediaImage}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.videoThumbnailContainer}>
                <VideoThumbnail
                  video={item}
                  width={MEDIA_ITEM_SIZE}
                  height={MEDIA_ITEM_SIZE}
                />
                <View style={styles.playOverlay}>
                  <Ionicons name="play-circle" size={36} color="#FFF" />
                </View>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
});

/**
 * Main EntryGalleryModal component (Web Version)
 */
export const EntryGalleryModal = memo(({
  visible,
  entry,
  onClose,
  onPhotoPress,
  onVideoPress,
  primaryColor = '#007AFF',
}) => {
  // Extract photos and videos from content blocks
  const { photos, videos, location } = useMemo(() => {
    const photos = [];
    const videos = [];
    let location = entry?.location || null;

    entry?.contentBlocks?.forEach(block => {
      if (block.type === 'photos' && block.media) {
        photos.push(...block.media);
      } else if (block.type === 'video' && block.media) {
        videos.push(...(Array.isArray(block.media) ? block.media : [block.media]));
      } else if (block.type === 'location' && block.location) {
        location = block.location;
      }
    });

    return { photos, videos, location };
  }, [entry]);

  // Format entry date
  const entryDate = useMemo(() => {
    if (!entry?.createdAt) return '';
    const date = new Date(entry.createdAt);
    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, [entry?.createdAt]);

  if (!entry) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={28} color="#333" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Gallery</Text>
            <Text style={styles.headerDate}>{entryDate}</Text>
          </View>
          <View style={styles.headerRight} />
        </View>

        <ScrollView 
          style={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Map Section */}
          <MapSection location={location} />

          {/* Photos Section */}
          <MediaRow
            title={`Photos (${photos.length})`}
            items={photos}
            type="photo"
            onItemPress={onPhotoPress}
            primaryColor={primaryColor}
          />

          {/* Videos Section */}
          <MediaRow
            title={`Videos (${videos.length})`}
            items={videos}
            type="video"
            onItemPress={onVideoPress}
            primaryColor={primaryColor}
          />

          {/* Empty state if no media */}
          {photos.length === 0 && videos.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="images-outline" size={48} color="#C7C7CC" />
              <Text style={styles.emptyText}>No media in this entry</Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5E5',
    backgroundColor: '#FFF',
  },
  closeButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
  },
  headerDate: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  headerRight: {
    width: 44,
  },

  // Content
  content: {
    flex: 1,
  },

  // Map section placeholder
  mapPlaceholder: {
    height: MAP_HEIGHT,
    backgroundColor: '#E8ECEF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapPlaceholderText: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 8,
  },
  mapLocationName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginTop: 8,
  },
  mapCoordinates: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 4,
  },

  // Media sections
  mediaSection: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  mediaScrollContent: {
    paddingHorizontal: 16,
    gap: 10,
  },
  mediaItem: {
    width: MEDIA_ITEM_SIZE,
    height: MEDIA_ITEM_SIZE,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#E5E5E5',
  },
  mediaImage: {
    width: '100%',
    height: '100%',
  },
  videoThumbnailContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Empty state
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 15,
    color: '#8E8E93',
    marginTop: 12,
  },
});

export default EntryGalleryModal;
