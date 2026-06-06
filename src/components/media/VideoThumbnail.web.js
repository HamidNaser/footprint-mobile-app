/**
 * VideoThumbnail Component - Web Version
 * 
 * Web-compatible stub. Video thumbnails use expo-video-thumbnails on native.
 */

import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * Generate thumbnail - returns null on web
 */
export const generateThumbnail = async (videoUri, options = {}) => {
  // On web, we can't generate video thumbnails easily
  return null;
};

/**
 * Generate thumbnail strip - returns empty array on web
 */
export const generateThumbnailStrip = async (videoUri, count = 5) => {
  return [];
};

/**
 * Clear thumbnail cache - no-op on web
 */
export const clearThumbnailCache = async () => {
  // No-op on web
};

/**
 * VideoThumbnail component
 */
export const VideoThumbnail = ({
  videoUri,
  duration,
  width = 100,
  height = 100,
  showDuration = true,
  style,
}) => {
  const formatDuration = (ms) => {
    if (!ms) return '';
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View style={[styles.container, { width, height }, style]}>
      <View style={styles.placeholder}>
        <Ionicons name="videocam" size={24} color="#8E8E93" />
      </View>
      {showDuration && duration && (
        <View style={styles.durationBadge}>
          <Text style={styles.durationText}>{formatDuration(duration)}</Text>
        </View>
      )}
      <View style={styles.playIcon}>
        <Ionicons name="play" size={16} color="#FFF" />
      </View>
    </View>
  );
};

/**
 * VideoThumbnailGridItem component
 */
export const VideoThumbnailGridItem = ({
  videoUri,
  duration,
  onPress,
  selected = false,
  selectionIndex,
  style,
}) => {
  return (
    <View style={[styles.gridItem, selected && styles.gridItemSelected, style]}>
      <VideoThumbnail
        videoUri={videoUri}
        duration={duration}
        width={100}
        height={100}
      />
      {selected && selectionIndex !== undefined && (
        <View style={styles.selectionBadge}>
          <Text style={styles.selectionText}>{selectionIndex + 1}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#2C2C2E',
    borderRadius: 8,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationText: {
    fontSize: 11,
    color: '#FFF',
    fontWeight: '500',
  },
  playIcon: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridItem: {
    margin: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  gridItemSelected: {
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  selectionBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
  },
});

export default VideoThumbnail;
