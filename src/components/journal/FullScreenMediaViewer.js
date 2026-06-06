/**
 * FullScreenMediaViewer Component
 * 
 * Full-screen viewer for photos and videos with:
 * - Swipe left/right to navigate between items
 * - Pinch to zoom (photos)
 * - Video playback controls
 * - Close button and counter
 */

import React, { memo, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  FlatList,
  StatusBar,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * Single photo item
 */
const PhotoItem = memo(({ photo, width }) => (
  <View style={[styles.mediaContainer, { width }]}>
    <Image
      source={{ uri: photo.localPath || photo.serverUrl }}
      style={styles.fullImage}
      resizeMode="contain"
    />
  </View>
));

/**
 * Single video item with playback controls
 */
const VideoItem = memo(({ video, width, isActive }) => {
  const videoRef = useRef(null);
  const [status, setStatus] = useState({});
  const [showControls, setShowControls] = useState(true);

  const togglePlayPause = useCallback(async () => {
    if (!videoRef.current) return;
    
    if (status.isPlaying) {
      await videoRef.current.pauseAsync();
    } else {
      await videoRef.current.playAsync();
    }
  }, [status.isPlaying]);

  // Pause when not active
  React.useEffect(() => {
    if (!isActive && videoRef.current && status.isPlaying) {
      videoRef.current.pauseAsync();
    }
  }, [isActive, status.isPlaying]);

  return (
    <TouchableOpacity 
      style={[styles.mediaContainer, { width }]}
      activeOpacity={1}
      onPress={() => setShowControls(!showControls)}
    >
      <Video
        ref={videoRef}
        source={{ uri: video.localPath || video.serverUrl }}
        style={styles.fullVideo}
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay={false}
        isLooping
        onPlaybackStatusUpdate={setStatus}
      />
      
      {/* Play/Pause overlay */}
      {showControls && (
        <TouchableOpacity 
          style={styles.videoControlOverlay}
          onPress={togglePlayPause}
          activeOpacity={0.8}
        >
          <View style={styles.playButton}>
            <Ionicons 
              name={status.isPlaying ? 'pause' : 'play'} 
              size={48} 
              color="#FFF" 
            />
          </View>
        </TouchableOpacity>
      )}

      {/* Progress bar */}
      {status.durationMillis > 0 && (
        <View style={styles.progressContainer}>
          <View 
            style={[
              styles.progressBar, 
              { 
                width: `${(status.positionMillis / status.durationMillis) * 100}%` 
              }
            ]} 
          />
        </View>
      )}
    </TouchableOpacity>
  );
});

/**
 * Main FullScreenMediaViewer component
 */
export const FullScreenMediaViewer = memo(({
  visible,
  media = [],
  initialIndex = 0,
  mediaType = 'photo', // 'photo' or 'video'
  onClose,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const flatListRef = useRef(null);

  // Reset index when modal opens
  React.useEffect(() => {
    if (visible) {
      setCurrentIndex(initialIndex);
      // Scroll to initial index after a small delay
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({ 
          index: initialIndex, 
          animated: false 
        });
      }, 100);
    }
  }, [visible, initialIndex]);

  const onViewableItemsChanged = useCallback(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index);
    }
  }, []);

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  const renderItem = useCallback(({ item, index }) => {
    if (mediaType === 'video') {
      return (
        <VideoItem 
          video={item} 
          width={SCREEN_WIDTH}
          isActive={index === currentIndex}
        />
      );
    }
    return <PhotoItem photo={item} width={SCREEN_WIDTH} />;
  }, [mediaType, currentIndex]);

  const keyExtractor = useCallback((item, index) => 
    item.id || `${mediaType}-${index}`, [mediaType]
  );

  const getItemLayout = useCallback((_, index) => ({
    length: SCREEN_WIDTH,
    offset: SCREEN_WIDTH * index,
    index,
  }), []);

  if (!visible || media.length === 0) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      
      <View style={styles.container}>
        {/* Media carousel */}
        <FlatList
          ref={flatListRef}
          data={media}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          getItemLayout={getItemLayout}
          initialScrollIndex={initialIndex}
          initialNumToRender={3}
          maxToRenderPerBatch={3}
          windowSize={5}
        />

        {/* Top bar with close button and counter */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={28} color="#FFF" />
          </TouchableOpacity>
          
          <Text style={styles.counter}>
            {currentIndex + 1} / {media.length}
          </Text>
          
          <View style={styles.placeholder} />
        </View>

        {/* Navigation hints */}
        {media.length > 1 && (
          <>
            {currentIndex > 0 && (
              <View style={[styles.navHint, styles.navHintLeft]}>
                <Ionicons name="chevron-back" size={24} color="rgba(255,255,255,0.5)" />
              </View>
            )}
            {currentIndex < media.length - 1 && (
              <View style={[styles.navHint, styles.navHintRight]}>
                <Ionicons name="chevron-forward" size={24} color="rgba(255,255,255,0.5)" />
              </View>
            )}
          </>
        )}
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },

  // Media container
  mediaContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    width: '100%',
    height: '100%',
  },
  fullVideo: {
    width: '100%',
    height: '100%',
  },

  // Video controls
  videoControlOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#007AFF',
  },

  // Top bar
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 50 : 40,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  closeButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  counter: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  placeholder: {
    width: 44,
  },

  // Navigation hints
  navHint: {
    position: 'absolute',
    top: '50%',
    marginTop: -20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navHintLeft: {
    left: 8,
  },
  navHintRight: {
    right: 8,
  },
});

export default FullScreenMediaViewer;
