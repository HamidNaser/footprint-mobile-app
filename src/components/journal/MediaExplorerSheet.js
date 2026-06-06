/**
 * MediaExplorerSheet Component (Native Version)
 * 
 * A Google Photos-style bottom sheet that shows:
 * - Map with location markers for media
 * - Horizontal scrolling photos row
 * - Horizontal scrolling videos row
 * 
 * Behavior:
 * - Drag handle to expand/collapse
 * - Tap thumbnail to show location on map
 * - Tap selected thumbnail again to view full-screen
 * 
 * Note: This is the native version. For web, see MediaExplorerSheet.web.js
 */

import React, { useState, useRef, useCallback, useEffect, memo, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  Dimensions,
  TouchableOpacity,
  FlatList,
  Image,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker } from 'react-native-maps';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Sheet snap points
const SHEET_COLLAPSED = SCREEN_HEIGHT * 0.6; // 60% from top (40% visible)
const SHEET_EXPANDED = SCREEN_HEIGHT * 0.1;  // 10% from top (90% visible)
const SHEET_HIDDEN = SCREEN_HEIGHT;

// Thumbnail sizes
const THUMBNAIL_SIZE = 100;
const THUMBNAIL_GAP = 8;

/**
 * Media thumbnail component
 */
const MediaThumbnail = memo(({ 
  item, 
  isSelected, 
  onPress, 
  type = 'photo',
}) => (
  <TouchableOpacity
    style={[
      styles.thumbnail,
      isSelected && styles.thumbnailSelected,
    ]}
    onPress={() => onPress(item)}
    activeOpacity={0.8}
  >
    <Image
      source={{ uri: item.thumbnailUri || item.localPath || item.serverUrl }}
      style={styles.thumbnailImage}
      resizeMode="cover"
    />
    
    {/* Video indicator */}
    {type === 'video' && (
      <View style={styles.videoIndicator}>
        <Ionicons name="play-circle" size={28} color="#FFF" />
        {item.duration && (
          <Text style={styles.videoDuration}>
            {formatDuration(item.duration)}
          </Text>
        )}
      </View>
    )}
    
    {/* Location indicator */}
    {item.location && (
      <View style={styles.locationBadge}>
        <Ionicons name="location" size={10} color="#FFF" />
      </View>
    )}
    
    {/* Selection indicator */}
    {isSelected && (
      <View style={styles.selectionOverlay}>
        <Ionicons name="checkmark-circle" size={24} color="#4361ee" />
      </View>
    )}
  </TouchableOpacity>
));

/**
 * Horizontal media row
 */
const MediaRow = memo(({ 
  title, 
  icon, 
  data, 
  selectedId, 
  onSelect, 
  type,
  emptyMessage,
}) => (
  <View style={styles.mediaRow}>
    <View style={styles.rowHeader}>
      <Ionicons name={icon} size={18} color="#333" />
      <Text style={styles.rowTitle}>{title}</Text>
      <Text style={styles.rowCount}>{data.length}</Text>
    </View>
    
    {data.length > 0 ? (
      <FlatList
        data={data}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id || item.localId}
        renderItem={({ item }) => (
          <MediaThumbnail
            item={item}
            isSelected={selectedId === (item.id || item.localId)}
            onPress={onSelect}
            type={type}
          />
        )}
        contentContainerStyle={styles.rowContent}
        ItemSeparatorComponent={() => <View style={{ width: THUMBNAIL_GAP }} />}
      />
    ) : (
      <View style={styles.emptyRow}>
        <Text style={styles.emptyRowText}>{emptyMessage}</Text>
      </View>
    )}
  </View>
));

/**
 * Format duration in seconds to mm:ss
 */
const formatDuration = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

/**
 * MediaExplorerSheet Component
 */
const MediaExplorerSheet = ({
  visible,
  onClose,
  photos = [],
  videos = [],
  selectedDate,
  onPhotoPress,
  onVideoPress,
  primaryColor = '#4361ee',
}) => {
  // Animation value for sheet position
  const translateY = useRef(new Animated.Value(SHEET_HIDDEN)).current;
  
  // State
  const [sheetState, setSheetState] = useState('collapsed'); // 'collapsed', 'expanded', 'hidden'
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [selectedMediaType, setSelectedMediaType] = useState(null);
  
  // Map region state
  const [mapRegion, setMapRegion] = useState({
    latitude: 38.9637,
    longitude: -94.6853,
    latitudeDelta: 0.5,
    longitudeDelta: 0.5,
  });

  // Get all media with locations for map markers
  const mediaWithLocations = useMemo(() => {
    const items = [];
    photos.forEach(p => {
      if (p.location) items.push({ ...p, type: 'photo' });
    });
    videos.forEach(v => {
      if (v.location) items.push({ ...v, type: 'video' });
    });
    return items;
  }, [photos, videos]);

  // Pan responder for drag gestures
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 5;
      },
      onPanResponderMove: (_, gestureState) => {
        const currentY = sheetState === 'expanded' ? SHEET_EXPANDED : SHEET_COLLAPSED;
        const newY = Math.max(SHEET_EXPANDED, Math.min(SHEET_HIDDEN, currentY + gestureState.dy));
        translateY.setValue(newY);
      },
      onPanResponderRelease: (_, gestureState) => {
        const currentY = sheetState === 'expanded' ? SHEET_EXPANDED : SHEET_COLLAPSED;
        const finalY = currentY + gestureState.dy;
        
        // Determine target state based on velocity and position
        if (gestureState.vy > 0.5 || finalY > SCREEN_HEIGHT * 0.7) {
          // Swipe down fast or past 70% - close
          closeSheet();
        } else if (gestureState.vy < -0.5 || finalY < SCREEN_HEIGHT * 0.35) {
          // Swipe up fast or past 35% - expand
          expandSheet();
        } else {
          // Return to collapsed state
          collapseSheet();
        }
      },
    })
  ).current;

  // Animate sheet to position
  const animateToPosition = useCallback((toValue, callback) => {
    Animated.spring(translateY, {
      toValue,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start(callback);
  }, [translateY]);

  const expandSheet = useCallback(() => {
    setSheetState('expanded');
    animateToPosition(SHEET_EXPANDED);
  }, [animateToPosition]);

  const collapseSheet = useCallback(() => {
    setSheetState('collapsed');
    animateToPosition(SHEET_COLLAPSED);
  }, [animateToPosition]);

  const closeSheet = useCallback(() => {
    setSheetState('hidden');
    animateToPosition(SHEET_HIDDEN, () => {
      onClose?.();
    });
  }, [animateToPosition, onClose]);

  // Show/hide sheet based on visible prop
  useEffect(() => {
    if (visible) {
      collapseSheet();
    } else {
      translateY.setValue(SHEET_HIDDEN);
      setSheetState('hidden');
    }
  }, [visible]);

  // Handle media selection
  const handleMediaSelect = useCallback((item, type) => {
    const itemId = item.id || item.localId;
    
    if (selectedMedia === itemId) {
      // Already selected - open full view
      if (type === 'photo') {
        onPhotoPress?.(item);
      } else {
        onVideoPress?.(item);
      }
    } else {
      // Select this item
      setSelectedMedia(itemId);
      setSelectedMediaType(type);
      
      // Update map to show this location
      if (item.location) {
        setMapRegion({
          latitude: item.location.latitude,
          longitude: item.location.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });
      }
    }
  }, [selectedMedia, onPhotoPress, onVideoPress]);

  // Selected location for map
  const selectedLocation = useMemo(() => {
    if (!selectedMedia) return null;
    const photo = photos.find(p => (p.id || p.localId) === selectedMedia);
    if (photo?.location) return photo.location;
    const video = videos.find(v => (v.id || v.localId) === selectedMedia);
    return video?.location || null;
  }, [selectedMedia, photos, videos]);

  // Format date for display
  const formattedDate = useMemo(() => {
    if (!selectedDate) return 'All Media';
    const d = new Date(selectedDate);
    return d.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }, [selectedDate]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={closeSheet}
    >
      {/* Backdrop */}
      <TouchableOpacity 
        style={styles.backdrop} 
        activeOpacity={1}
        onPress={closeSheet}
      />
      
      {/* Sheet */}
      <Animated.View 
        style={[
          styles.sheet,
          { transform: [{ translateY }] },
        ]}
      >
        {/* Drag handle */}
        <View {...panResponder.panHandlers} style={styles.handleContainer}>
          <View style={styles.handle} />
        </View>

        {/* Date header */}
        <View style={styles.dateHeader}>
          <Text style={styles.dateText}>{formattedDate}</Text>
          <TouchableOpacity onPress={closeSheet} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#333" />
          </TouchableOpacity>
        </View>

        {/* Map */}
        <View style={styles.mapContainer}>
          <MapView
            style={styles.map}
            region={mapRegion}
            onRegionChangeComplete={setMapRegion}
          >
            {/* Markers for all media with locations */}
            {mediaWithLocations.map((item, index) => (
              <Marker
                key={item.id || item.localId || index}
                coordinate={{
                  latitude: item.location.latitude,
                  longitude: item.location.longitude,
                }}
                pinColor={item.type === 'photo' ? primaryColor : '#FF2D55'}
                onPress={() => handleMediaSelect(item, item.type)}
              />
            ))}
            
            {/* Selected media marker (larger) */}
            {selectedLocation && (
              <Marker
                coordinate={selectedLocation}
                pinColor="#FFD700"
              />
            )}
          </MapView>
          
          {/* Current location button */}
          <TouchableOpacity style={styles.locationButton}>
            <Ionicons name="locate" size={22} color="#333" />
          </TouchableOpacity>
        </View>

        {/* Media rows */}
        <View style={styles.mediaContent}>
          {/* Photos row */}
          <MediaRow
            title="Photos"
            icon="camera-outline"
            data={photos}
            selectedId={selectedMediaType === 'photo' ? selectedMedia : null}
            onSelect={(item) => handleMediaSelect(item, 'photo')}
            type="photo"
            emptyMessage="No photos for this date"
          />

          {/* Videos row */}
          <MediaRow
            title="Videos"
            icon="videocam-outline"
            data={videos}
            selectedId={selectedMediaType === 'video' ? selectedMedia : null}
            onSelect={(item) => handleMediaSelect(item, 'video')}
            type="video"
            emptyMessage="No videos for this date"
          />
        </View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },

  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT,
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 10,
  },

  handleContainer: {
    alignItems: 'center',
    paddingVertical: 12,
  },

  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#DADADA',
    borderRadius: 2,
  },

  dateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5E5',
  },

  dateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },

  closeButton: {
    padding: 4,
  },

  mapContainer: {
    height: 220,
    margin: 16,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F0F4FF',
  },

  map: {
    flex: 1,
  },

  locationButton: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },

  mediaContent: {
    flex: 1,
    paddingTop: 8,
  },

  mediaRow: {
    marginBottom: 16,
  },

  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },

  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },

  rowCount: {
    fontSize: 14,
    color: '#8E8E93',
  },

  rowContent: {
    paddingHorizontal: 16,
  },

  emptyRow: {
    height: THUMBNAIL_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 16,
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
  },

  emptyRowText: {
    fontSize: 14,
    color: '#8E8E93',
  },

  thumbnail: {
    width: THUMBNAIL_SIZE,
    height: THUMBNAIL_SIZE,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#F0F0F0',
  },

  thumbnailSelected: {
    borderWidth: 3,
    borderColor: '#4361ee',
  },

  thumbnailImage: {
    width: '100%',
    height: '100%',
  },

  videoIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingVertical: 2,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },

  videoDuration: {
    fontSize: 11,
    color: '#FFF',
    fontWeight: '500',
  },

  locationBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  selectionOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(67, 97, 238, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export { MediaExplorerSheet };
export default MediaExplorerSheet;
