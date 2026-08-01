/**
 * MediaPicker Component
 * 
 * Select photos and videos from device gallery.
 * Uses expo-image-picker for media selection.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { Ionicons } from '@expo/vector-icons';
import LocationService from '../../services/LocationService';

/**
 * Media picker types
 */
export const MediaPickerType = {
  IMAGES: 'images',
  VIDEOS: 'videos',
  ALL: 'all',
};

/**
 * MediaPicker component
 */
export const MediaPicker = ({
  onMediaSelected,
  onCancel,
  mediaType = MediaPickerType.ALL,
  allowMultiple = false,
  maxSelection = 10,
  quality = 0.8,
  allowsEditing = false,
  videoMaxDuration = 60, // seconds
  primaryColor = '#007AFF',
  style,
}) => {
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Get image picker media type options
   */
  const getMediaTypeOptions = () => {
    switch (mediaType) {
      case MediaPickerType.IMAGES:
        return ImagePicker.MediaTypeOptions.Images;
      case MediaPickerType.VIDEOS:
        return ImagePicker.MediaTypeOptions.Videos;
      case MediaPickerType.ALL:
      default:
        return ImagePicker.MediaTypeOptions.All;
    }
  };

  /**
   * Request media library permissions
   */
  const requestPermissions = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Please allow access to your photo library to select media.',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Settings', 
            onPress: () => {
              // On iOS, this would open Settings
              // On Android, this might need Linking.openSettings()
            }
          },
        ]
      );
      return false;
    }
    return true;
  };

  /**
   * Request camera permissions
   */
  const requestCameraPermissions = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Please allow access to your camera to take photos or videos.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Settings' },
        ]
      );
      return false;
    }
    return true;
  };

  /**
   * Launch image library picker
   */
  const launchLibrary = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    try {
      setIsLoading(true);

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: getMediaTypeOptions(),
        allowsEditing: allowsEditing && !allowMultiple,
        allowsMultipleSelection: allowMultiple,
        selectionLimit: maxSelection,
        quality: quality,
        videoMaxDuration: videoMaxDuration,
        exif: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const selectedMedia = result.assets.map(asset => ({
          uri: asset.uri,
          type: asset.type || (asset.uri.includes('.mp4') || asset.uri.includes('.mov') ? 'video' : 'image'),
          width: asset.width,
          height: asset.height,
          duration: asset.duration, // For videos
          fileName: asset.fileName,
          fileSize: asset.fileSize,
          exif: asset.exif,
          // Per-photo GPS pulled from the photo's own EXIF (where the shot was taken).
          location: LocationService.extractLocationFromExif(asset.exif) || undefined,
        }));

        console.log('[MediaPicker] Selected:', selectedMedia.length, 'items');
        onMediaSelected?.(allowMultiple ? selectedMedia : selectedMedia[0]);
      }
    } catch (error) {
      console.error('[MediaPicker] Library error:', error);
      Alert.alert('Error', 'Failed to open media library. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Launch camera
   */
  const launchCamera = async (captureVideo = false) => {
    const hasPermission = await requestCameraPermissions();
    if (!hasPermission) return;

    try {
      setIsLoading(true);

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: captureVideo 
          ? ImagePicker.MediaTypeOptions.Videos 
          : ImagePicker.MediaTypeOptions.Images,
        allowsEditing: allowsEditing,
        quality: quality,
        videoMaxDuration: videoMaxDuration,
        exif: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const media = {
          uri: asset.uri,
          type: captureVideo ? 'video' : 'image',
          width: asset.width,
          height: asset.height,
          duration: asset.duration,
          fileName: asset.fileName,
          fileSize: asset.fileSize,
          exif: asset.exif,
          location: LocationService.extractLocationFromExif(asset.exif) || undefined,
        };

        console.log('[MediaPicker] Captured:', media.type);
        onMediaSelected?.(allowMultiple ? [media] : media);
      }
    } catch (error) {
      console.error('[MediaPicker] Camera error:', error);
      Alert.alert('Error', 'Failed to open camera. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Show action sheet with options
   */
  const showOptions = () => {
    const options = [];
    const handlers = [];

    // Photo library
    options.push('Choose from Library');
    handlers.push(launchLibrary);

    // Camera options based on media type
    if (mediaType !== MediaPickerType.VIDEOS) {
      options.push('Take Photo');
      handlers.push(() => launchCamera(false));
    }

    if (mediaType !== MediaPickerType.IMAGES) {
      options.push('Record Video');
      handlers.push(() => launchCamera(true));
    }

    options.push('Cancel');
    handlers.push(onCancel);

    Alert.alert(
      'Select Media',
      null,
      options.map((option, index) => ({
        text: option,
        style: option === 'Cancel' ? 'cancel' : 'default',
        onPress: handlers[index],
      }))
    );
  };

  // Render as a button that triggers the picker
  return (
    <View style={[styles.container, style]}>
      {isLoading ? (
        <ActivityIndicator size="large" color={primaryColor} />
      ) : (
        <View style={styles.buttonsContainer}>
          {/* Library button */}
          <TouchableOpacity
            style={[styles.optionButton, { borderColor: primaryColor }]}
            onPress={launchLibrary}
          >
            <Ionicons name="images-outline" size={32} color={primaryColor} />
            <Text style={[styles.optionText, { color: primaryColor }]}>
              Photo Library
            </Text>
          </TouchableOpacity>

          {/* Camera button */}
          {mediaType !== MediaPickerType.VIDEOS && (
            <TouchableOpacity
              style={[styles.optionButton, { borderColor: primaryColor }]}
              onPress={() => launchCamera(false)}
            >
              <Ionicons name="camera-outline" size={32} color={primaryColor} />
              <Text style={[styles.optionText, { color: primaryColor }]}>
                Take Photo
              </Text>
            </TouchableOpacity>
          )}

          {/* Video button */}
          {mediaType !== MediaPickerType.IMAGES && (
            <TouchableOpacity
              style={[styles.optionButton, { borderColor: primaryColor }]}
              onPress={() => launchCamera(true)}
            >
              <Ionicons name="videocam-outline" size={32} color={primaryColor} />
              <Text style={[styles.optionText, { color: primaryColor }]}>
                Record Video
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Cancel button */}
      {onCancel && (
        <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

/**
 * Quick picker function - launches picker directly
 */
export const pickMedia = async (options = {}) => {
  const {
    mediaType = MediaPickerType.ALL,
    allowMultiple = false,
    maxSelection = 10,
    quality = 0.8,
    allowsEditing = false,
    videoMaxDuration = 60,
  } = options;

  // Request permissions
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Media library permission not granted');
  }

  // Get media type options
  let mediaTypeOptions;
  switch (mediaType) {
    case MediaPickerType.IMAGES:
      mediaTypeOptions = ImagePicker.MediaTypeOptions.Images;
      break;
    case MediaPickerType.VIDEOS:
      mediaTypeOptions = ImagePicker.MediaTypeOptions.Videos;
      break;
    default:
      mediaTypeOptions = ImagePicker.MediaTypeOptions.All;
  }

  // Launch picker
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: mediaTypeOptions,
    allowsEditing: allowsEditing && !allowMultiple,
    allowsMultipleSelection: allowMultiple,
    selectionLimit: maxSelection,
    quality: quality,
    videoMaxDuration: videoMaxDuration,
    exif: true,
  });

  if (result.canceled) {
    return null;
  }

  const selectedMedia = result.assets.map(asset => ({
    uri: asset.uri,
    type: asset.type || (asset.uri.includes('.mp4') || asset.uri.includes('.mov') ? 'video' : 'image'),
    width: asset.width,
    height: asset.height,
    duration: asset.duration,
    fileName: asset.fileName,
    fileSize: asset.fileSize,
    exif: asset.exif,
    location: LocationService.extractLocationFromExif(asset.exif) || undefined,
  }));

  return allowMultiple ? selectedMedia : selectedMedia[0];
};

/**
 * Quick camera function - launches camera directly
 */
export const takePhoto = async (options = {}) => {
  const {
    quality = 0.8,
    allowsEditing = false,
  } = options;

  // Request permissions
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Camera permission not granted');
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: allowsEditing,
    quality: quality,
    exif: true,
  });

  if (result.canceled) {
    return null;
  }

  const asset = result.assets[0];
  return {
    uri: asset.uri,
    type: 'image',
    width: asset.width,
    height: asset.height,
    fileName: asset.fileName,
    fileSize: asset.fileSize,
    exif: asset.exif,
    location: LocationService.extractLocationFromExif(asset.exif) || undefined,
  };
};

/**
 * Quick video capture function
 */
export const recordVideo = async (options = {}) => {
  const {
    quality = 0.8,
    maxDuration = 60,
    allowsEditing = false,
  } = options;

  // Request permissions
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Camera permission not granted');
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Videos,
    allowsEditing: allowsEditing,
    quality: quality,
    videoMaxDuration: maxDuration,
    exif: true,
  });

  if (result.canceled) {
    return null;
  }

  const asset = result.assets[0];
  return {
    uri: asset.uri,
    type: 'video',
    width: asset.width,
    height: asset.height,
    duration: asset.duration,
    fileName: asset.fileName,
    fileSize: asset.fileSize,
    exif: asset.exif,
    location: LocationService.extractLocationFromExif(asset.exif) || undefined,
  };
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    alignItems: 'center',
  },
  buttonsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
  },
  optionButton: {
    width: 100,
    height: 100,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  optionText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  cancelButton: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  cancelText: {
    color: '#FF3B30',
    fontSize: 16,
  },
});

export default MediaPicker;
