/**
 * MediaPreview Component - Web Version
 * 
 * Web-compatible version for previewing images and videos.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export const PreviewMediaType = {
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
};

/**
 * MediaPreview component for single media item
 */
export const MediaPreview = ({
  uri,
  type = PreviewMediaType.IMAGE,
  style,
  resizeMode = 'contain',
  showControls = true,
  onClose,
}) => {
  if (type === PreviewMediaType.IMAGE) {
    return (
      <View style={[styles.container, style]}>
        <Image
          source={{ uri }}
          style={styles.image}
          resizeMode={resizeMode}
        />
        {showControls && onClose && (
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color="#FFF" />
          </TouchableOpacity>
        )}
      </View>
    );
  }

  if (type === PreviewMediaType.VIDEO) {
    return (
      <View style={[styles.container, styles.videoContainer, style]}>
        <View style={styles.videoPlaceholder}>
          <Ionicons name="videocam" size={48} color="#8E8E93" />
          <Text style={styles.videoText}>Video Preview</Text>
          <Text style={styles.videoSubtext}>Video playback not available on web</Text>
        </View>
        {showControls && onClose && (
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color="#FFF" />
          </TouchableOpacity>
        )}
      </View>
    );
  }

  if (type === PreviewMediaType.AUDIO) {
    return (
      <View style={[styles.audioContainer, style]}>
        <Ionicons name="musical-notes" size={32} color="#8E8E93" />
        <Text style={styles.audioText}>Audio file</Text>
      </View>
    );
  }

  return null;
};

/**
 * MediaPreviewCarousel for multiple media items
 */
export const MediaPreviewCarousel = ({
  items = [],
  initialIndex = 0,
  onClose,
  style,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  if (items.length === 0) return null;

  const currentItem = items[currentIndex];

  return (
    <View style={[styles.carouselContainer, style]}>
      <MediaPreview
        uri={currentItem.uri}
        type={currentItem.type}
        showControls={false}
      />
      
      {/* Navigation */}
      {items.length > 1 && (
        <View style={styles.carouselNav}>
          <TouchableOpacity
            style={[styles.navButton, currentIndex === 0 && styles.navButtonDisabled]}
            onPress={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
            disabled={currentIndex === 0}
          >
            <Ionicons name="chevron-back" size={24} color={currentIndex === 0 ? '#666' : '#FFF'} />
          </TouchableOpacity>
          <Text style={styles.navText}>
            {currentIndex + 1} / {items.length}
          </Text>
          <TouchableOpacity
            style={[styles.navButton, currentIndex === items.length - 1 && styles.navButtonDisabled]}
            onPress={() => setCurrentIndex(Math.min(items.length - 1, currentIndex + 1))}
            disabled={currentIndex === items.length - 1}
          >
            <Ionicons name="chevron-forward" size={24} color={currentIndex === items.length - 1 ? '#666' : '#FFF'} />
          </TouchableOpacity>
        </View>
      )}

      {onClose && (
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Ionicons name="close" size={24} color="#FFF" />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  image: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  videoContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoPlaceholder: {
    alignItems: 'center',
    padding: 24,
  },
  videoText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
    marginTop: 16,
  },
  videoSubtext: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 8,
  },
  audioContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F5F5F7',
    borderRadius: 8,
    gap: 12,
  },
  audioText: {
    fontSize: 15,
    color: '#1C1C1E',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  carouselContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  carouselNav: {
    position: 'absolute',
    bottom: 32,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
  },
  navButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  navText: {
    fontSize: 16,
    color: '#FFF',
    fontWeight: '500',
  },
});

export default MediaPreview;
