/**
 * MediaPreview Component
 * 
 * Preview captured or selected media before confirming.
 * Supports images, videos, and audio with playback controls.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Image,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
  StatusBar,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { AudioPlayer } from './AudioPlayer';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * Media types
 */
export const PreviewMediaType = {
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
};

/**
 * MediaPreview component
 */
export const MediaPreview = ({
  media,
  onConfirm,
  onRetake,
  onCancel,
  confirmText = 'Use',
  retakeText = 'Retake',
  cancelText = 'Cancel',
  showMetadata = true,
  primaryColor = '#007AFF',
  style,
}) => {
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [error, setError] = useState(null);

  // Determine media type
  const mediaType = media?.type || 
    (media?.uri?.match(/\.(mp4|mov|avi|mkv)$/i) ? PreviewMediaType.VIDEO :
     media?.uri?.match(/\.(mp3|m4a|wav|aac)$/i) ? PreviewMediaType.AUDIO :
     PreviewMediaType.IMAGE);

  /**
   * Clean up video on unmount
   */
  useEffect(() => {
    return () => {
      if (videoRef.current) {
        videoRef.current.unloadAsync();
      }
    };
  }, []);

  /**
   * Handle video status updates
   */
  const handleVideoStatusUpdate = useCallback((status) => {
    setIsLoading(status.isBuffering);
    setIsPlaying(status.isPlaying);
    
    if (status.durationMillis) {
      setDuration(status.durationMillis);
    }
    if (status.positionMillis !== undefined) {
      setPosition(status.positionMillis);
    }
    
    if (status.didJustFinish) {
      setIsPlaying(false);
      videoRef.current?.setPositionAsync(0);
    }
  }, []);

  /**
   * Toggle video playback
   */
  const togglePlayback = async () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      await videoRef.current.pauseAsync();
    } else {
      await videoRef.current.playAsync();
    }
  };

  /**
   * Format duration in mm:ss
   */
  const formatDuration = (millis) => {
    if (!millis) return '0:00';
    const totalSeconds = Math.floor(millis / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  /**
   * Format file size
   */
  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  /**
   * Render image preview
   */
  const renderImagePreview = () => (
    <View style={styles.imageContainer}>
      <Image
        source={{ uri: media.uri }}
        style={styles.image}
        resizeMode="contain"
        onLoadStart={() => setIsLoading(true)}
        onLoadEnd={() => setIsLoading(false)}
        onError={(e) => setError(e.nativeEvent.error)}
      />
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#FFF" />
        </View>
      )}
    </View>
  );

  /**
   * Render video preview
   */
  const renderVideoPreview = () => (
    <View style={styles.videoContainer}>
      <Video
        ref={videoRef}
        source={{ uri: media.uri }}
        style={styles.video}
        resizeMode={ResizeMode.CONTAIN}
        isLooping={false}
        onPlaybackStatusUpdate={handleVideoStatusUpdate}
        onError={(error) => {
          console.error('[MediaPreview] Video error:', error);
          setError('Failed to load video');
        }}
      />

      {/* Play/Pause overlay */}
      <TouchableOpacity
        style={styles.videoOverlay}
        onPress={togglePlayback}
        activeOpacity={0.9}
      >
        {isLoading ? (
          <ActivityIndicator size="large" color="#FFF" />
        ) : !isPlaying ? (
          <View style={styles.playButton}>
            <Ionicons name="play" size={40} color="#FFF" />
          </View>
        ) : null}
      </TouchableOpacity>

      {/* Progress bar */}
      <View style={styles.progressContainer}>
        <View 
          style={[
            styles.progressBar, 
            { width: duration > 0 ? `${(position / duration) * 100}%` : '0%' }
          ]} 
        />
      </View>

      {/* Duration */}
      <View style={styles.videoDuration}>
        <Text style={styles.durationText}>
          {formatDuration(position)} / {formatDuration(duration)}
        </Text>
      </View>
    </View>
  );

  /**
   * Render audio preview
   */
  const renderAudioPreview = () => (
    <View style={styles.audioContainer}>
      <View style={styles.audioIconContainer}>
        <Ionicons name="musical-notes" size={60} color={primaryColor} />
      </View>
      <AudioPlayer
        uri={media.uri}
        primaryColor={primaryColor}
        style={styles.audioPlayer}
      />
    </View>
  );

  /**
   * Render media based on type
   */
  const renderMedia = () => {
    if (error) {
      return (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color="#FF3B30" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => setError(null)}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    switch (mediaType) {
      case PreviewMediaType.VIDEO:
        return renderVideoPreview();
      case PreviewMediaType.AUDIO:
        return renderAudioPreview();
      case PreviewMediaType.IMAGE:
      default:
        return renderImagePreview();
    }
  };

  /**
   * Render metadata info
   */
  const renderMetadata = () => {
    if (!showMetadata) return null;

    const metadata = [];

    if (media.width && media.height) {
      metadata.push(`${media.width} × ${media.height}`);
    }

    if (media.duration && mediaType !== PreviewMediaType.IMAGE) {
      metadata.push(formatDuration(media.duration));
    }

    if (media.fileSize) {
      metadata.push(formatFileSize(media.fileSize));
    }

    if (metadata.length === 0) return null;

    return (
      <View style={styles.metadataContainer}>
        <Text style={styles.metadataText}>{metadata.join(' • ')}</Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, style]}>
      <StatusBar barStyle="light-content" />

      {/* Header with cancel */}
      <View style={styles.header}>
        {onCancel && (
          <TouchableOpacity style={styles.headerButton} onPress={onCancel}>
            <Ionicons name="close" size={28} color="#FFF" />
          </TouchableOpacity>
        )}
        <View style={styles.headerSpacer} />
        {renderMetadata()}
      </View>

      {/* Media preview */}
      <View style={styles.previewContainer}>
        {renderMedia()}
      </View>

      {/* Action buttons */}
      <View style={styles.footer}>
        {onRetake && (
          <TouchableOpacity style={styles.footerButton} onPress={onRetake}>
            <Ionicons name="refresh-outline" size={24} color="#FFF" />
            <Text style={styles.footerButtonText}>{retakeText}</Text>
          </TouchableOpacity>
        )}

        {onConfirm && (
          <TouchableOpacity
            style={[styles.confirmButton, { backgroundColor: primaryColor }]}
            onPress={() => onConfirm(media)}
          >
            <Ionicons name="checkmark" size={24} color="#FFF" />
            <Text style={styles.confirmButtonText}>{confirmText}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

/**
 * Multi-media preview carousel
 */
export const MediaPreviewCarousel = ({
  mediaItems = [],
  initialIndex = 0,
  onConfirm,
  onRemove,
  onCancel,
  primaryColor = '#007AFF',
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const scrollViewRef = useRef(null);

  const currentMedia = mediaItems[currentIndex];

  /**
   * Navigate to next item
   */
  const goToNext = () => {
    if (currentIndex < mediaItems.length - 1) {
      setCurrentIndex(currentIndex + 1);
      scrollViewRef.current?.scrollTo({ x: (currentIndex + 1) * SCREEN_WIDTH });
    }
  };

  /**
   * Navigate to previous item
   */
  const goToPrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      scrollViewRef.current?.scrollTo({ x: (currentIndex - 1) * SCREEN_WIDTH });
    }
  };

  /**
   * Handle scroll end
   */
  const handleScrollEnd = (event) => {
    const newIndex = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setCurrentIndex(newIndex);
  };

  /**
   * Remove current item
   */
  const handleRemove = () => {
    onRemove?.(currentIndex, currentMedia);
  };

  if (mediaItems.length === 0) {
    return null;
  }

  return (
    <View style={styles.carouselContainer}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.carouselHeader}>
        <TouchableOpacity style={styles.headerButton} onPress={onCancel}>
          <Ionicons name="close" size={28} color="#FFF" />
        </TouchableOpacity>

        <Text style={styles.carouselCounter}>
          {currentIndex + 1} / {mediaItems.length}
        </Text>

        {onRemove && (
          <TouchableOpacity style={styles.headerButton} onPress={handleRemove}>
            <Ionicons name="trash-outline" size={24} color="#FF3B30" />
          </TouchableOpacity>
        )}
      </View>

      {/* Carousel */}
      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScrollEnd}
        contentOffset={{ x: initialIndex * SCREEN_WIDTH, y: 0 }}
      >
        {mediaItems.map((item, index) => (
          <View key={index} style={styles.carouselItem}>
            {item.type === 'video' ? (
              <Video
                source={{ uri: item.uri }}
                style={styles.carouselMedia}
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay={index === currentIndex}
                isLooping
              />
            ) : (
              <Image
                source={{ uri: item.uri }}
                style={styles.carouselMedia}
                resizeMode="contain"
              />
            )}
          </View>
        ))}
      </ScrollView>

      {/* Navigation arrows */}
      {mediaItems.length > 1 && (
        <>
          {currentIndex > 0 && (
            <TouchableOpacity
              style={[styles.navButton, styles.navButtonLeft]}
              onPress={goToPrevious}
            >
              <Ionicons name="chevron-back" size={30} color="#FFF" />
            </TouchableOpacity>
          )}
          {currentIndex < mediaItems.length - 1 && (
            <TouchableOpacity
              style={[styles.navButton, styles.navButtonRight]}
              onPress={goToNext}
            >
              <Ionicons name="chevron-forward" size={30} color="#FFF" />
            </TouchableOpacity>
          )}
        </>
      )}

      {/* Footer */}
      <View style={styles.carouselFooter}>
        <TouchableOpacity
          style={[styles.confirmButton, { backgroundColor: primaryColor }]}
          onPress={() => onConfirm?.(mediaItems)}
        >
          <Text style={styles.confirmButtonText}>
            Use {mediaItems.length === 1 ? 'Photo' : `${mediaItems.length} Items`}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 50 : 10,
    paddingHorizontal: 10,
    paddingBottom: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  headerButton: {
    padding: 10,
  },
  headerSpacer: {
    flex: 1,
  },

  // Metadata
  metadataContainer: {
    paddingHorizontal: 10,
  },
  metadataText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },

  // Preview
  previewContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Image
  imageContainer: {
    flex: 1,
    width: SCREEN_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT - 200,
  },

  // Video
  videoContainer: {
    flex: 1,
    width: SCREEN_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT - 200,
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 5,
  },
  progressContainer: {
    position: 'absolute',
    bottom: 60,
    left: 20,
    right: 20,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#FFF',
    borderRadius: 2,
  },
  videoDuration: {
    position: 'absolute',
    bottom: 70,
    right: 20,
  },
  durationText: {
    color: '#FFF',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },

  // Audio
  audioContainer: {
    flex: 1,
    width: SCREEN_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  audioIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
  },
  audioPlayer: {
    width: SCREEN_WIDTH - 40,
  },

  // Error
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 16,
    marginTop: 10,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFF',
    fontSize: 14,
  },

  // Loading
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },

  // Footer
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  footerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  footerButtonText: {
    color: '#FFF',
    fontSize: 16,
    marginLeft: 8,
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 25,
  },
  confirmButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },

  // Carousel
  carouselContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  carouselHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 50 : 10,
    paddingHorizontal: 10,
    paddingBottom: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  carouselCounter: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  carouselItem: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  carouselMedia: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT - 200,
  },
  navButton: {
    position: 'absolute',
    top: '50%',
    marginTop: -25,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  navButtonLeft: {
    left: 10,
  },
  navButtonRight: {
    right: 10,
  },
  carouselFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingVertical: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
});

export default MediaPreview;
