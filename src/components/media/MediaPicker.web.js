/**
 * MediaPicker Component - Web Version
 * 
 * Web-compatible stub using HTML file input for basic functionality.
 */

import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export const MediaPickerType = {
  IMAGES: 'images',
  VIDEOS: 'videos',
  ALL: 'all',
};

/**
 * Pick media using web file input
 */
export const pickMedia = async (options = {}) => {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = options.mediaType === MediaPickerType.VIDEOS 
      ? 'video/*' 
      : options.mediaType === MediaPickerType.IMAGES 
        ? 'image/*' 
        : 'image/*,video/*';
    input.multiple = options.allowMultiple || false;

    input.onchange = (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) {
        resolve({ canceled: true, assets: null });
        return;
      }

      const assets = files.map(file => ({
        uri: URL.createObjectURL(file),
        type: file.type.startsWith('video') ? 'video' : 'image',
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        width: 0,
        height: 0,
      }));

      resolve({ canceled: false, assets });
    };

    input.oncancel = () => {
      resolve({ canceled: true, assets: null });
    };

    input.click();
  });
};

/**
 * Take photo - not available on web
 */
export const takePhoto = async () => {
  return { canceled: true, assets: null };
};

/**
 * Record video - not available on web
 */
export const recordVideo = async () => {
  return { canceled: true, assets: null };
};

/**
 * MediaPicker component for web
 */
export const MediaPicker = ({
  onMediaSelected,
  onCancel,
  mediaType = MediaPickerType.ALL,
  allowMultiple = false,
  maxSelection = 10,
  primaryColor = '#007AFF',
  style,
}) => {
  const handleSelectMedia = async () => {
    const result = await pickMedia({ mediaType, allowMultiple });
    if (!result.canceled && result.assets) {
      onMediaSelected?.(result.assets);
    }
  };

  return (
    <View style={[styles.container, style]}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="images-outline" size={48} color="#C7C7CC" />
        </View>
        <Text style={styles.title}>Select Media</Text>
        <Text style={styles.subtitle}>
          Camera and gallery browsing are limited on web. Use the button below to select files.
        </Text>
        <TouchableOpacity 
          style={[styles.selectButton, { backgroundColor: primaryColor }]}
          onPress={handleSelectMedia}
        >
          <Ionicons name="folder-open-outline" size={20} color="#FFF" />
          <Text style={styles.selectText}>Choose Files</Text>
        </TouchableOpacity>
        {onCancel && (
          <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
            <Text style={[styles.cancelText, { color: primaryColor }]}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 24,
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    maxWidth: 320,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F5F5F7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    gap: 8,
  },
  selectText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  cancelButton: {
    marginTop: 16,
    paddingVertical: 10,
  },
  cancelText: {
    fontSize: 16,
  },
});

export default MediaPicker;
