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
import { buildContentBlocks } from '../../utils/journalBlocks';

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
  // Voice notes and typed notes captured during the session. Each carries a
  // `capturedAt` sequence number so blocks are emitted in the order they were
  // actually taken -- photo, then note, then voice, then video -- rather than
  // grouped by kind. A session can hold several of each.
  const [audioRecordings, setAudioRecordings] = useState([]);
  const [textNotes, setTextNotes] = useState([]);
  const captureSeqRef = useRef(0);
  const nextSeq = useCallback(() => { captureSeqRef.current += 1; return captureSeqRef.current; }, []);
  const [visibility, setVisibility] = useState(VisibilityOptions.PRIVATE);
  const [isSaving, setIsSaving] = useState(false);
  const [activeMode, setActiveMode] = useState(initialMode);
  const [showCamera, setShowCamera] = useState(initialMode === 'camera');
  const [showAudioRecorder, setShowAudioRecorder] = useState(initialMode === 'audio');
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [showTextNoteInput, setShowTextNoteInput] = useState(initialMode === 'text-note');
  const [pendingNote, setPendingNote] = useState('');
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
        setAudioRecordings([]);
        setTextNotes([]);
        captureSeqRef.current = 0;
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
    audioRecordings.length > 0 ||
    textNotes.length > 0;

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

      // Prefer a media item's own coordinate: an already-extracted `location`,
      // else its EXIF (camera captures carry `exif` but no pre-parsed location),
      // else the entry-level fix.
      const mediaLocation = (m) =>
        m.location || LocationService.extractLocationFromExif(m.exif) || blockLocation;

      // Ordering lives in src/utils/journalBlocks.js so it can be tested
      // without mounting this modal.
      contentBlocks.push(...buildContentBlocks({
        text,
        attachedMedia,
        audioRecordings,
        textNotes,
        blockLocation,
        mediaLocation,
      }));

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
        // Stamped like camera captures so gallery picks sort into the same
        // capture timeline rather than always landing first.
        setAttachedMedia(prev => [
          ...prev,
          ...newMedia.map(m => ({ ...m, capturedAt: nextSeq() })),
        ]);
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
    // Stay in the camera. Closing after every shot was the friction: capturing
    // three things meant three round trips out to the compose form. The Done
    // button in the camera header is how you leave.
    setAttachedMedia(prev => [...prev, { ...media, capturedAt: nextSeq() }]);
  };

  /**
   * Add a typed note as its own block, in sequence with the other captures.
   */
  const handleAddTextNote = useCallback((note) => {
    const content = (note || '').trim();
    if (!content) return;
    setTextNotes(prev => [...prev, { content, capturedAt: nextSeq() }]);
  }, [nextSeq]);

  /**
   * Handle audio recording complete
   */
  const handleAudioComplete = (recording) => {
    // Append rather than replace: recording a second voice note used to
    // silently discard the first.
    setAudioRecordings(prev => [...prev, { ...recording, capturedAt: nextSeq() }]);
    setShowAudioRecorder(false);
  };

  // Show camera full screen
  if (showCamera) {
    return (
      <Modal visible={visible} animationType="slide">
        <CameraCapture
          onCapture={handleCameraCapture}
          onClose={() => setShowCamera(false)}
          onDone={() => setShowCamera(false)}
          captureCount={attachedMedia.length}
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

            {/* Audio attachments -- a session can hold several voice notes */}
            {audioRecordings.map((rec, index) => (
              <AudioAttachment
                key={rec.localId || rec.uri || index}
                recording={rec}
                onRemove={() =>
                  setAudioRecordings(prev => prev.filter((_, i) => i !== index))
                }
                onPlay={() => {/* TODO: Play audio */}}
                primaryColor={primaryColor}
              />
            ))}

            {/* Typed notes captured in sequence with the other captures */}
            {textNotes.map((note, index) => (
              <View key={`note-${index}`} style={styles.textNote}>
                <Ionicons name="document-text-outline" size={18} color={primaryColor} />
                <Text style={styles.textNoteContent} numberOfLines={3}>
                  {note.content}
                </Text>
                <TouchableOpacity
                  onPress={() => setTextNotes(prev => prev.filter((_, i) => i !== index))}
                >
                  <Ionicons name="close-circle" size={22} color="#FF3B30" />
                </TouchableOpacity>
              </View>
            ))}

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

              {/* Text note. The toolbar had photo, gallery, audio and location
                  but no way to add a note mid-sequence -- the only text was the
                  field at the top, which always sorts first. */}
              <TouchableOpacity
                style={styles.toolbarButton}
                onPress={() => setShowTextNoteInput(true)}
              >
                <Ionicons name="text-outline" size={24} color={primaryColor} />
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

      {/* Text note input. Deliberately a light sheet rather than a full screen:
          adding a note between two photos should not feel like leaving the
          capture session. */}
      <Modal visible={showTextNoteInput} transparent animationType="fade">
        <View style={styles.noteOverlay}>
          <View style={styles.noteSheet}>
            <Text style={styles.noteTitle}>Add a note</Text>
            <TextInput
              style={styles.noteInput}
              value={pendingNote}
              onChangeText={setPendingNote}
              placeholder="What's happening?"
              placeholderTextColor="#9E9E9E"
              multiline
              autoFocus
            />
            <View style={styles.noteActions}>
              <TouchableOpacity
                style={styles.noteCancel}
                onPress={() => { setPendingNote(''); setShowTextNoteInput(false); }}
              >
                <Text style={styles.noteCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.noteAdd,
                  { backgroundColor: primaryColor },
                  !pendingNote.trim() && styles.noteAddDisabled,
                ]}
                disabled={!pendingNote.trim()}
                onPress={() => {
                  handleAddTextNote(pendingNote);
                  setPendingNote('');
                  setShowTextNoteInput(false);
                }}
              >
                <Text style={styles.noteAddText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
  },

  // Typed note preview in the attachment list
  textNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#F5F5F7',
  },

  textNoteContent: {
    flex: 1,
    fontSize: 14,
    color: '#1C1C1E',
  },

  // Text note input sheet
  noteOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },

  noteSheet: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    gap: 14,
  },

  noteTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1C1C1E',
  },

  noteInput: {
    minHeight: 96,
    maxHeight: 200,
    fontSize: 16,
    color: '#1C1C1E',
    textAlignVertical: 'top',
  },

  noteActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },

  noteCancel: {
    paddingVertical: 10,
    paddingHorizontal: 18,
  },

  noteCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#8E8E93',
  },

  noteAdd: {
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 20,
  },

  noteAddDisabled: {
    opacity: 0.4,
  },

  noteAddText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
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
