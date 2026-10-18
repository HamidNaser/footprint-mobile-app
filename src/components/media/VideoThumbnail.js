/**
 * VideoThumbnail Component
 * 
 * Generates and displays thumbnails for video files.
 * Uses expo-video-thumbnails for thumbnail generation.
 *
 * 007 (FR-024, M12, final review I1): give it `media` and the poster frame is watched by media
 * id (VideoPosterTile + useMediaDerivative): "Preparing photo…" until ready, then the poster
 * under a play overlay, and the failed / unavailable states a photo tile has. Tapping calls
 * `onPress({ videoUri, thumbnailUri, duration, media })` with `videoUri` = `videoSource(media)`,
 * the ORIGINAL (or the device copy). The original is never an <Image> source: with no poster
 * yet, a frame is generated from the file on the device. A host that wraps the tile in its own
 * touchable passes `onFailedOwner` (FailedSlot). `videoUri` / `thumbnailUri` props still work
 * for callers that have not moved to `media`.
 */

import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import {
  View,
  Image,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Ionicons } from '@expo/vector-icons';
import { thumbnailSource, videoSource } from '../../utils/mediaSource';
import { VideoPosterTile, posterMediaOf } from './VideoPosterTile';

/**
 * Format duration in mm:ss
 */
const formatDuration = (millis) => {
  if (!millis || isNaN(millis)) return '';
  const totalSeconds = Math.floor(millis / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

/**
 * Thumbnail cache to avoid regenerating
 */
const thumbnailCache = new Map();

/**
 * Generate thumbnail for a video
 * @param {string} videoUri - Video URI
 * @param {object} options - Generation options
 * @returns {Promise<string|null>} Thumbnail URI or null
 */
export const generateThumbnail = async (videoUri, options = {}) => {
  const { time = 0, quality = 0.5 } = options;

  // Check cache
  const cacheKey = `${videoUri}_${time}`;
  if (thumbnailCache.has(cacheKey)) {
    return thumbnailCache.get(cacheKey);
  }

  try {
    const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, {
      time: time,
      quality: quality,
    });

    // Cache the result
    thumbnailCache.set(cacheKey, uri);
    return uri;
  } catch (error) {
    console.error('[VideoThumbnail] Generation error:', error);
    return null;
  }
};

/**
 * Clear thumbnail cache
 */
export const clearThumbnailCache = () => {
  thumbnailCache.clear();
};

/**
 * With a media item (007, final review I1): the poster is watched by media id through
 * VideoPosterTile (pending / ready / failed / unavailable). A video still on the device gets a
 * frame made from that file while the server's poster is not there yet.
 */
const MediaVideoThumbnail = ({ media, time = 0, quality = 0.5, onThumbnailGenerated, width = 120, height = 90, ...rest }) => {
  const devicePath =
    typeof media.localPath === 'string' && media.localPath && !/^https?:/i.test(media.localPath) ? media.localPath : null;
  const hasPoster = !!thumbnailSource(posterMediaOf(media));
  const [frame, setFrame] = useState(null);
  const onGeneratedRef = useRef(onThumbnailGenerated);
  onGeneratedRef.current = onThumbnailGenerated;

  useEffect(() => {
    let live = true;
    setFrame(null);
    if (devicePath && !hasPoster) {
      generateThumbnail(devicePath, { time, quality }).then((uri) => {
        if (live && uri) {
          setFrame(uri);
          onGeneratedRef.current?.(uri);
        }
      });
    }
    return () => {
      live = false;
    };
  }, [devicePath, hasPoster, time, quality]);

  return <VideoPosterTile media={media} localFrame={frame} width={width} height={height} {...rest} />;
};

/**
 * VideoThumbnail component
 */
export const VideoThumbnail = memo((props) =>
  props.media && props.thumbnailUri == null && props.videoUri == null ? (
    <MediaVideoThumbnail {...props} />
  ) : (
    <LegacyVideoThumbnail {...props} />
  ),
);

/** The older `videoUri` / `thumbnailUri` props (the compose preview): no media id, nothing to watch. */
const LegacyVideoThumbnail = ({
  media,
  videoUri: videoUriProp,
  thumbnailUri: thumbnailUriProp,
  duration,
  width = 120,
  height = 90,
  time = 0,
  quality = 0.5,
  showDuration = true,
  showPlayIcon = true,
  onPress,
  onThumbnailGenerated,
  style,
  imageStyle,
}) => {
  const videoUri = videoUriProp ?? videoSource(media);
  // A poster the device made is a file:// path; the server's is an https copy. Never the original.
  // For a video `localPath` is the VIDEO file, so it must never stand in as the poster image.
  const initialThumbnailUri = thumbnailUriProp ?? (media ? thumbnailSource({ ...media, localPath: null }) : null);
  const [thumbnailUri, setThumbnailUri] = useState(initialThumbnailUri);
  const [isLoading, setIsLoading] = useState(!initialThumbnailUri);
  const [hasError, setHasError] = useState(false);

  // Generate thumbnail on mount if not provided
  useEffect(() => {
    if (initialThumbnailUri) {
      setThumbnailUri(initialThumbnailUri);
      setIsLoading(false);
    } else if (videoUri && (!media || !/^https?:/i.test(videoUri))) {
      // With `media` the server makes the poster, so only a file already on the device is used
      // here; a whole remote video is not downloaded to make one.
      generateThumbnailForVideo();
    } else {
      setThumbnailUri(null);
      setHasError(true);
      setIsLoading(false);
    }
  }, [videoUri, initialThumbnailUri]);

  /**
   * Generate thumbnail
   */
  const generateThumbnailForVideo = async () => {
    setIsLoading(true);
    setHasError(false);

    const uri = await generateThumbnail(videoUri, { time, quality });

    if (uri) {
      setThumbnailUri(uri);
      onThumbnailGenerated?.(uri);
    } else {
      setHasError(true);
    }

    setIsLoading(false);
  };

  /**
   * Handle press
   */
  const handlePress = () => {
    onPress?.({ videoUri, thumbnailUri, duration, media });
  };

  /**
   * Retry thumbnail generation
   */
  const handleRetry = () => {
    generateThumbnailForVideo();
  };

  // Calculate aspect ratio
  const aspectRatio = width / height;

  // Render content
  const renderContent = () => {
    // Loading state
    if (isLoading) {
      return (
        <View style={[styles.placeholder, { width, height }]}>
          <ActivityIndicator size="small" color="#999" />
        </View>
      );
    }

    // Error state
    if (hasError || !thumbnailUri) {
      return (
        <TouchableOpacity
          style={[styles.placeholder, styles.errorPlaceholder, { width, height }]}
          onPress={handleRetry}
        >
          <Ionicons name="videocam-outline" size={24} color="#999" />
          <Text style={styles.errorText}>Tap to retry</Text>
        </TouchableOpacity>
      );
    }

    // Thumbnail loaded
    return (
      <Image
        source={{ uri: thumbnailUri }}
        style={[styles.thumbnail, { width, height }, imageStyle]}
        resizeMode="cover"
      />
    );
  };

  return (
    <TouchableOpacity
      style={[styles.container, { width, height }, style]}
      onPress={handlePress}
      activeOpacity={onPress ? 0.8 : 1}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel="Play video"
      testID="video-play-overlay"
    >
      {renderContent()}

      {/* Play icon overlay */}
      {showPlayIcon && thumbnailUri && !isLoading && !hasError && (
        <View style={styles.playIconContainer}>
          <View style={styles.playIcon}>
            <Ionicons name="play" size={20} color="#FFF" />
          </View>
        </View>
      )}

      {/* Duration badge */}
      {showDuration && duration && !isLoading && (
        <View style={styles.durationBadge}>
          <Text style={styles.durationText}>{formatDuration(duration)}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

/**
 * Video thumbnail grid item
 */
export const VideoThumbnailGridItem = memo(({
  videoUri,
  thumbnailUri,
  duration,
  title,
  subtitle,
  isSelected,
  onPress,
  onLongPress,
  size = 100,
  selectionColor = '#007AFF',
}) => {
  return (
    <TouchableOpacity
      style={[
        styles.gridItem,
        { width: size, height: size },
        isSelected && { borderColor: selectionColor, borderWidth: 3 },
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.8}
    >
      <VideoThumbnail
        videoUri={videoUri}
        thumbnailUri={thumbnailUri}
        duration={duration}
        width={size - (isSelected ? 6 : 0)}
        height={size - (isSelected ? 6 : 0)}
        showDuration={true}
        showPlayIcon={true}
      />

      {/* Selection checkmark */}
      {isSelected && (
        <View style={[styles.selectionCheck, { backgroundColor: selectionColor }]}>
          <Ionicons name="checkmark" size={14} color="#FFF" />
        </View>
      )}

      {/* Title overlay */}
      {title && (
        <View style={styles.titleOverlay}>
          <Text style={styles.titleText} numberOfLines={1}>
            {title}
          </Text>
          {subtitle && (
            <Text style={styles.subtitleText} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
});

/**
 * Generate multiple thumbnails at different timestamps
 * Useful for video scrubbing preview
 */
export const generateThumbnailStrip = async (videoUri, options = {}) => {
  const {
    count = 5,
    duration = 0, // Total video duration in ms
    quality = 0.3,
  } = options;

  if (!duration || duration <= 0) {
    return [];
  }

  const thumbnails = [];
  const interval = duration / count;

  for (let i = 0; i < count; i++) {
    const time = Math.floor(interval * i);
    const uri = await generateThumbnail(videoUri, { time, quality });
    if (uri) {
      thumbnails.push({ uri, time });
    }
  }

  return thumbnails;
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#F0F0F0',
  },
  thumbnail: {
    borderRadius: 8,
  },
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
  },
  errorPlaceholder: {
    backgroundColor: '#F5F5F5',
  },
  errorText: {
    fontSize: 10,
    color: '#999',
    marginTop: 4,
  },
  playIconContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 3, // Offset play icon to look centered
  },
  durationBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },

  // Grid item styles
  gridItem: {
    borderRadius: 8,
    overflow: 'hidden',
    margin: 2,
  },
  selectionCheck: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  titleOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  titleText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '500',
  },
  subtitleText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 9,
  },
});

export default VideoThumbnail;
