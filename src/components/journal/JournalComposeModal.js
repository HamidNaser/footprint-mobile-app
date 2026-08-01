/**
 * JournalComposeModal Component
 * 
 * Modal for creating and editing journal entries with:
 * - Text input
 * - Photo/video attachment
 * - Audio recording
 * - Location tagging
 * - Visibility settings
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  Image,
  Alert,
  Modal,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AudioRecorder } from '../media/AudioRecorder';
import { CameraCapture } from '../media/CameraCapture';
import { MediaPicker, pickMedia, MediaPickerType } from '../media/MediaPicker';
import { VideoThumbnail } from '../media/VideoThumbnail';
import { LocationPicker, LocationDisplay } from '../map/LocationPicker';
import LocationService from '../../services/LocationService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * Visibility options - Facebook-style audience selector
 */
export const VisibilityOptions = {
  PRIVATE: 'private',
  FAMILY: 'family',
  FRIENDS: 'friends',
  FAMILY_FRIENDS: 'family_friends',
};

export const VISIBILITY_CONFIG = {
  [VisibilityOptions.PRIVATE]: { icon: 'lock-closed', label: 'Only Me', emoji: '🔒' },
  [VisibilityOptions.FAMILY]: { icon: 'people', label: 'Family', emoji: '👨‍👩‍👧‍👦' },
  [VisibilityOptions.FRIENDS]: { icon: 'person-add', label: 'Friends', emoji: '👥' },
  [VisibilityOptions.FAMILY_FRIENDS]: { icon: 'globe-outline', label: 'Family & Friends', emoji: '🌐' },
};

/**
 * Location sharing options — controls who sees the EXACT coordinates.
 * Mirrors the backend LocationSharingLevels (private | family | everyone).
 * Non-owners below the chosen level see a coarsened (~1km) location instead.
 */
export const LocationSharingOptions = {
  PRIVATE: 'private',
  FAMILY: 'family',
  EVERYONE: 'everyone',
};

export const LOCATION_SHARING_CONFIG = {
  [LocationSharingOptions.PRIVATE]: { icon: 'lock-closed', label: 'Only Me' },
  [LocationSharingOptions.FAMILY]: { icon: 'people', label: 'Family' },
  [LocationSharingOptions.EVERYONE]: { icon: 'globe-outline', label: 'Everyone' },
};

/**
 * Attached media preview
 */
const AttachedMediaPreview = ({ media, onRemove }) => {
  const isVideo = media.type === 'video';

  return (
    <View style={styles.attachedMedia}>
      {isVideo ? (
        <VideoThumbnail
          videoUri={media.uri}
          duration={media.duration}
          width={80}
          height={80}
          showDuration
        />
      ) : (
        <Image
          source={{ uri: media.uri }}
          style={styles.attachedImage}
          resizeMode="cover"
        />
      )}
      <TouchableOpacity
        style={styles.removeMediaButton}
        onPress={() => onRemove(media)}
      >
        <Ionicons name="close-circle" size={22} color="#FF3B30" />
      </TouchableOpacity>
    </View>
  );
};

/**
 * Audio recording preview
 */
const AudioAttachment = ({ recording, onRemove, onPlay, primaryColor }) => {
  const formatDuration = (ms) => {
    if (!ms) return '0:00';
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View style={[styles.audioAttachment, { borderColor: primaryColor + '40' }]}>
      <View style={[styles.audioIcon, { backgroundColor: primaryColor + '20' }]}>
        <Ionicons name="mic" size={20} color={primaryColor} />
      </View>
      <View style={styles.audioInfo}>
        <Text style={styles.audioLabel}>Voice recording</Text>
        <Text style={styles.audioDuration}>{formatDuration(recording.duration)}</Text>
      </View>
      <TouchableOpacity onPress={onPlay}>
        <Ionicons name="play-circle" size={28} color={primaryColor} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.audioRemove} onPress={onRemove}>
        <Ionicons name="close-circle" size={22} color="#FF3B30" />
      </TouchableOpacity>
    </View>
  );
};

/**
 * Visibility selector
 */
const VisibilitySelector = ({ value, onChange, primaryColor }) => {
  const [isOpen, setIsOpen] = useState(false);
  const config = VISIBILITY_CONFIG[value];

  return (
    <>
      <TouchableOpacity
        style={styles.visibilityButton}
        onPress={() => setIsOpen(true)}
      >
        <Ionicons name={config.icon} size={22} color={primaryColor} />
      </TouchableOpacity>

      <Modal visible={isOpen} transparent animationType="fade">
        <TouchableOpacity
          style={styles.visibilityOverlay}
          activeOpacity={1}
          onPress={() => setIsOpen(false)}
        >
          <View style={styles.visibilityMenu}>
            <Text style={styles.visibilityMenuTitle}>Who can see this?</Text>
            {Object.entries(VISIBILITY_CONFIG).map(([key, cfg]) => (
              <TouchableOpacity
                key={key}
                style={[
                  styles.visibilityOption,
                  value === key && { backgroundColor: primaryColor + '15' },
                ]}
                onPress={() => {
                  onChange(key);
                  setIsOpen(false);
                }}
              >
                <Ionicons 
                  name={cfg.icon} 
                  size={20} 
                  color={value === key ? primaryColor : '#8E8E93'} 
                />
                <Text style={[
                  styles.visibilityOptionText,
                  value === key && { color: primaryColor, fontWeight: '600' },
                ]}>
                  {cfg.label}
                </Text>
                {value === key && (
                  <Ionicons name="checkmark" size={20} color={primaryColor} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
};

/**
 * Main JournalComposeModal component
 */
export const JournalComposeModal = ({
  visible,
  onClose,
  onSave,
  entry = null, // For editing existing entry
  initialMode = 'text', // 'text' | 'camera' | 'audio' | 'gallery'
  primaryColor = '#007AFF',
}) => {
  // State
  const [text, setText] = useState('');
  const [attachedMedia, setAttachedMedia] = useState([]);
  const [audioRecording, setAudioRecording] = useState(null);
  const [visibility, setVisibility] = useState(VisibilityOptions.PRIVATE);
  const [isSaving, setIsSaving] = useState(false);
  const [activeMode, setActiveMode] = useState(initialMode);
  const [showCamera, setShowCamera] = useState(initialMode === 'camera');
  const [showAudioRecorder, setShowAudioRecorder] = useState(initialMode === 'audio');
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [locationSharing, setLocationSharing] = useState(LocationSharingOptions.PRIVATE);

  const textInputRef = useRef(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (visible) {
      if (entry) {
        // Editing mode - populate from existing entry
        const textContent = entry.contentBlocks
          ?.filter(b => b.type === 'text')
          .map(b => b.content)
          .join('\n') || '';
        setText(textContent);
        setVisibility(entry.visibility || VisibilityOptions.PRIVATE);
        setSelectedLocation(entry.location || null);
        setLocationSharing(entry.locationSharing || LocationSharingOptions.PRIVATE);
        // TODO: Load existing media
      } else {
        // New entry
        setText('');
        setAttachedMedia([]);
        setAudioRecording(null);
        setVisibility(VisibilityOptions.PRIVATE);
        setSelectedLocation(null);
        setLocationSharing(LocationSharingOptions.PRIVATE);
        
        // Set initial mode
        setShowCamera(initialMode === 'camera');
        setShowAudioRecorder(initialMode === 'audio');
        
        if (initialMode === 'gallery') {
          handlePickMedia();
        }
      }
    }
  }, [visible, entry, initialMode]);

  // Silently seed a NEW entry with the device's current location as the default,
  // but only when location permission is ALREADY granted (never prompts on open).
  // This gives text/audio blocks and non-geotagged media a real coordinate; each
  // photo/video still overrides with its own EXIF coordinate at save time.
  useEffect(() => {
    if (!visible || entry) return;
    let cancelled = false;

    (async () => {
      try {
        const { foreground } = await LocationService.checkPermissions();
        if (cancelled || foreground !== 'granted') return;

        const fix = await LocationService.getCurrentLocation();
        if (cancelled || !fix) return;

        let name;
        try {
          const addr = await LocationService.reverseGeocode(fix.latitude, fix.longitude);
          name = addr?.formattedAddress;
        } catch {
          // Name is best-effort; a coordinate alone still drops a pin.
        }
        if (cancelled) return;

        // Never override a location the user has already picked manually.
        setSelectedLocation(prev => prev || { lat: fix.latitude, lng: fix.longitude, name });
      } catch (error) {
        console.log('[JournalCompose] Auto location capture skipped:', error?.message);
      }
    })();

    return () => { cancelled = true; };
  }, [visible, entry]);

  /**
   * Check if entry has content
   */
  const hasContent = text.trim().length > 0 || 
    attachedMedia.length > 0 || 
    audioRecording !== null;

  /**
   * Handle save
   */
  const handleSave = async () => {
    if (!hasContent) {
      Alert.alert('Empty Entry', 'Please add some content to your journal entry.');
      return;
    }

    setIsSaving(true);

    try {
      // Build content blocks
      const contentBlocks = [];

      // The captured/tagged coordinate is stamped onto the entry AND every block
      // and media item, so each text/photo/video/audio block can render its own
      // map pin. Normalized to the backend's { lat, lng, name } shape.
      const blockLocation = selectedLocation
        ? { lat: selectedLocation.lat, lng: selectedLocation.lng, name: selectedLocation.name }
        : undefined;

      // Text block
      if (text.trim()) {
        contentBlocks.push({
          type: 'text',
          content: text.trim(),
          location: blockLocation,
        });
      }

      // Photo/video blocks.
      // Accept both 'image' (gallery / MediaPicker) and 'photo' (in-modal
      // CameraCapture) so camera shots aren't silently dropped at save.
      const photos = attachedMedia.filter(m => m.type === 'image' || m.type === 'photo');
      const videos = attachedMedia.filter(m => m.type === 'video');

      // Prefer a media item's own coordinate: an already-extracted `location`,
      // else its EXIF (camera captures carry `exif` but no pre-parsed location),
      // else the entry-level fix.
      const mediaLocation = (m) =>
        m.location || LocationService.extractLocationFromExif(m.exif) || blockLocation;

      if (photos.length > 0) {
        contentBlocks.push({
          type: 'photos',
          location: blockLocation,
          media: photos.map(p => ({
            localId: p.localId || `photo-${Date.now()}-${Math.random()}`,
            localPath: p.uri,
            width: p.width,
            height: p.height,
            location: mediaLocation(p),
          })),
        });
      }

      if (videos.length > 0) {
        videos.forEach(v => {
          contentBlocks.push({
            type: 'video',
            location: blockLocation,
            media: [{
              localId: v.localId || `video-${Date.now()}-${Math.random()}`,
              localPath: v.uri,
              width: v.width,
              height: v.height,
              duration: v.duration,
              location: mediaLocation(v),
            }],
            duration: v.duration,
          });
        });
      }

      // Audio block
      if (audioRecording) {
        contentBlocks.push({
          type: 'audio',
          location: blockLocation,
          media: [{
            localId: audioRecording.localId || `audio-${Date.now()}`,
            localPath: audioRecording.uri,
            location: blockLocation,
          }],
          duration: audioRecording.duration,
          waveform: audioRecording.waveform,
        });
      }

      await onSave?.({
        contentBlocks,
        visibility,
        location: selectedLocation,
        locationSharing,
        localId: entry?.localId,
      });

      onClose();
    } catch (error) {
      console.error('[JournalCompose] Save error:', error);
      Alert.alert('Error', 'Failed to save entry. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Handle close with confirmation
   */
  const handleClose = () => {
    if (hasContent) {
      Alert.alert(
        'Discard Entry?',
        'You have unsaved changes. Are you sure you want to discard them?',
        [
          { text: 'Keep Editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: onClose },
        ]
      );
    } else {
      onClose();
    }
  };

  /**
   * Pick media from gallery
   */
  const handlePickMedia = async () => {
    try {
      const result = await pickMedia({
        mediaType: MediaPickerType.ALL,
        allowMultiple: true,
        maxSelection: 10 - attachedMedia.length,
      });

      if (result) {
        const newMedia = Array.isArray(result) ? result : [result];
        setAttachedMedia(prev => [...prev, ...newMedia]);
      }
    } catch (error) {
      console.error('[JournalCompose] Pick media error:', error);
    }
  };

  /**
   * Remove attached media
   */
  const handleRemoveMedia = (media) => {
    setAttachedMedia(prev => prev.filter(m => m.uri !== media.uri));
  };

  /**
   * Handle camera capture
   */
  const handleCameraCapture = (media) => {
    setAttachedMedia(prev => [...prev, media]);
    setShowCamera(false);
  };

  /**
   * Handle audio recording complete
   */
  const handleAudioComplete = (recording) => {
    setAudioRecording(recording);
    setShowAudioRecorder(false);
  };

  // Show camera full screen
  if (showCamera) {
    return (
      <Modal visible={visible} animationType="slide">
        <CameraCapture
          onCapture={handleCameraCapture}
          onClose={() => setShowCamera(false)}
          primaryColor={primaryColor}
        />
      </Modal>
    );
  }

  // Show audio recorder full screen
  if (showAudioRecorder) {
    return (
      <Modal visible={visible} animationType="slide">
        <SafeAreaView style={styles.audioRecorderContainer}>
          <View style={styles.audioRecorderHeader}>
            <TouchableOpacity onPress={() => setShowAudioRecorder(false)}>
              <Ionicons name="close" size={28} color="#000" />
            </TouchableOpacity>
            <Text style={styles.audioRecorderTitle}>Voice Recording</Text>
            <View style={{ width: 28 }} />
          </View>
          <AudioRecorder
            onRecordingComplete={handleAudioComplete}
            onCancel={() => setShowAudioRecorder(false)}
            primaryColor={primaryColor}
          />
        </SafeAreaView>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType="slide">
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.headerButton} onPress={handleClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>
              {entry ? 'Edit Entry' : 'New Entry'}
            </Text>
            <TouchableOpacity
              style={[
                styles.saveButton,
                { backgroundColor: hasContent ? primaryColor : '#E5E5EA' },
              ]}
              onPress={handleSave}
              disabled={!hasContent || isSaving}
            >
              <Text style={[
                styles.saveText,
                !hasContent && styles.saveTextDisabled,
              ]}>
                {isSaving ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            keyboardShouldPersistTaps="handled"
          >
            {/* Text input */}
            <TextInput
              ref={textInputRef}
              style={styles.textInput}
              placeholder="What's on your mind?"
              placeholderTextColor="#8E8E93"
              value={text}
              onChangeText={setText}
              multiline
              textAlignVertical="top"
              autoFocus={initialMode === 'text'}
            />

            {/* Attached media */}
            {attachedMedia.length > 0 && (
              <View style={styles.attachedMediaContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {attachedMedia.map((media, index) => (
                    <AttachedMediaPreview
                      key={media.uri || index}
                      media={media}
                      onRemove={handleRemoveMedia}
                    />
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Audio attachment */}
            {audioRecording && (
              <AudioAttachment
                recording={audioRecording}
                onRemove={() => setAudioRecording(null)}
                onPlay={() => {/* TODO: Play audio */}}
                primaryColor={primaryColor}
              />
            )}

            {/* Location display */}
            {selectedLocation && (
              <View style={styles.locationContainer}>
                <LocationDisplay
                  location={selectedLocation}
                  onPress={() => setShowLocationPicker(true)}
                  onRemove={() => setSelectedLocation(null)}
                  primaryColor={primaryColor}
                />
                {/* Who can see the exact coordinates */}
                <View style={styles.sharingRow}>
                  <Text style={styles.sharingLabel}>Share exact location with</Text>
                  <View style={styles.sharingOptions}>
                    {Object.values(LocationSharingOptions).map((level) => {
                      const cfg = LOCATION_SHARING_CONFIG[level];
                      const active = locationSharing === level;
                      return (
                        <TouchableOpacity
                          key={level}
                          style={[
                            styles.sharingChip,
                            active && { backgroundColor: primaryColor + '20', borderColor: primaryColor },
                          ]}
                          onPress={() => setLocationSharing(level)}
                        >
                          <Ionicons
                            name={cfg.icon}
                            size={14}
                            color={active ? primaryColor : '#8E8E93'}
                          />
                          <Text style={[styles.sharingChipText, active && { color: primaryColor }]}>
                            {cfg.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Bottom toolbar */}
          <View style={styles.toolbar}>
            <View style={styles.toolbarActions}>
              <TouchableOpacity
                style={styles.toolbarButton}
                onPress={() => setShowCamera(true)}
              >
                <Ionicons name="camera-outline" size={24} color={primaryColor} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.toolbarButton}
                onPress={handlePickMedia}
              >
                <Ionicons name="images-outline" size={24} color={primaryColor} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.toolbarButton}
                onPress={() => setShowAudioRecorder(true)}
              >
                <Ionicons name="mic-outline" size={24} color={primaryColor} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.toolbarButton}
                onPress={() => setShowLocationPicker(true)}
              >
                <Ionicons 
                  name={selectedLocation ? "location" : "location-outline"} 
                  size={24} 
                  color={selectedLocation ? primaryColor : primaryColor} 
                />
              </TouchableOpacity>
            </View>

            <VisibilitySelector
              value={visibility}
              onChange={setVisibility}
              primaryColor={primaryColor}
            />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Location Picker Modal */}
      <LocationPicker
        visible={showLocationPicker}
        onClose={() => setShowLocationPicker(false)}
        onSelect={setSelectedLocation}
        initialLocation={selectedLocation}
        primaryColor={primaryColor}
      />
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  headerButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
  },
  cancelText: {
    fontSize: 16,
    color: '#007AFF',
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  saveText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
  saveTextDisabled: {
    color: '#8E8E93',
  },

  // Content
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  textInput: {
    fontSize: 17,
    lineHeight: 24,
    color: '#000',
    minHeight: 150,
    marginBottom: 16,
  },

  // Attached media
  attachedMediaContainer: {
    marginBottom: 16,
  },
  attachedMedia: {
    width: 80,
    height: 80,
    borderRadius: 8,
    marginRight: 8,
    overflow: 'hidden',
  },
  attachedImage: {
    width: '100%',
    height: '100%',
  },
  removeMediaButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#FFF',
    borderRadius: 11,
  },

  // Audio attachment
  audioAttachment: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  audioIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  audioInfo: {
    flex: 1,
    marginLeft: 12,
  },
  audioLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#000',
  },
  audioDuration: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  audioRemove: {
    marginLeft: 8,
  },

  // Location display
  locationContainer: {
    marginBottom: 16,
  },

  // Location sharing
  sharingRow: {
    marginTop: 8,
  },
  sharingLabel: {
    fontSize: 12,
    color: '#8E8E93',
    marginBottom: 6,
  },
  sharingOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  sharingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E5EA',
    marginRight: 8,
    marginBottom: 6,
  },
  sharingChipText: {
    fontSize: 12,
    color: '#8E8E93',
    marginLeft: 4,
  },

  // Toolbar
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E5EA',
  },
  toolbarActions: {
    flexDirection: 'row',
  },
  toolbarButton: {
    padding: 8,
    marginRight: 8,
  },

  // Visibility selector
  visibilityButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F2F2F7',
    borderRadius: 16,
  },
  visibilityText: {
    fontSize: 14,
    fontWeight: '500',
    marginHorizontal: 6,
  },
  visibilityOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  visibilityMenu: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  visibilityMenuTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
    marginBottom: 16,
  },
  visibilityOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  visibilityOptionText: {
    flex: 1,
    fontSize: 16,
    color: '#000',
    marginLeft: 12,
  },

  // Audio recorder container
  audioRecorderContainer: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  audioRecorderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  audioRecorderTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
  },
});

export default JournalComposeModal;
