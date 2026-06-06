/**
 * ShareMemorySheet - Bottom sheet for sharing memory options
 * 
 * Allows users to share their memories via various channels.
 * 
 * Features:
 * - Share to social media
 * - Send to family/friends
 * - Create "Then & Now" comparison to share
 * - Copy link
 * - Save to device
 */

import React, { memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Modal,
  Share,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

// Theme colors
const PRIMARY_COLOR = '#4361ee';
const TEXT_COLOR = '#333333';
const TEXT_MUTED = '#666666';
const BORDER_COLOR = '#e0e0e0';
const SURFACE_COLOR = '#FFFFFF';

/**
 * Share option button
 */
const ShareOption = memo(({ icon, label, color, onPress }) => (
  <TouchableOpacity style={styles.shareOption} onPress={onPress}>
    <View style={[styles.shareIconContainer, { backgroundColor: color }]}>
      <Ionicons name={icon} size={24} color="#FFF" />
    </View>
    <Text style={styles.shareLabel}>{label}</Text>
  </TouchableOpacity>
));

/**
 * Send to person item
 */
const SendToPerson = memo(({ person, onPress }) => (
  <TouchableOpacity style={styles.personItem} onPress={() => onPress(person)}>
    <Image source={{ uri: person.avatar }} style={styles.personAvatar} />
    <Text style={styles.personName}>{person.firstName}</Text>
  </TouchableOpacity>
));

/**
 * Memory preview card
 */
const MemoryPreview = memo(({ memory }) => (
  <View style={styles.preview}>
    <Image 
      source={{ uri: memory.media[0].uri }} 
      style={styles.previewImage} 
    />
    <View style={styles.previewInfo}>
      <Text style={styles.previewCaption} numberOfLines={2}>
        {memory.caption || 'Memory'}
      </Text>
      <Text style={styles.previewDate}>{memory.year}</Text>
    </View>
  </View>
));

/**
 * Main ShareMemorySheet component
 */
const ShareMemorySheet = ({
  visible,
  memory,
  suggestedPeople = [],
  onClose,
  onShareNative,
  onSendToPerson,
  onSaveToDevice,
  onCopyLink,
  onCreateThenNow,
}) => {
  const handleNativeShare = async () => {
    try {
      await Share.share({
        message: memory?.caption 
          ? `Check out this memory: ${memory.caption}` 
          : 'Check out this memory from Footprint!',
        title: 'Share Memory',
      });
      onShareNative?.();
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const handleCopyLink = () => {
    // In a real app, this would copy a deep link
    Alert.alert('Link Copied', 'Memory link copied to clipboard');
    onCopyLink?.();
  };

  const handleSaveToDevice = () => {
    // In a real app, this would save the image
    Alert.alert('Saved', 'Memory saved to your device');
    onSaveToDevice?.();
  };

  if (!memory) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} onPress={onClose} />
        
        <View style={styles.sheet}>
          <SafeAreaView edges={['bottom']}>
            {/* Handle */}
            <View style={styles.handleContainer}>
              <View style={styles.handle} />
            </View>

            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Share Memory</Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={24} color={TEXT_MUTED} />
              </TouchableOpacity>
            </View>

            {/* Memory preview */}
            <MemoryPreview memory={memory} />

            {/* Share options */}
            <View style={styles.shareOptions}>
              <ShareOption 
                icon="share-social" 
                label="Share" 
                color="#1DA1F2"
                onPress={handleNativeShare}
              />
              <ShareOption 
                icon="link" 
                label="Copy Link" 
                color="#64748b"
                onPress={handleCopyLink}
              />
              <ShareOption 
                icon="download" 
                label="Save" 
                color="#10b981"
                onPress={handleSaveToDevice}
              />
              <ShareOption 
                icon="git-compare" 
                label="Then & Now" 
                color={PRIMARY_COLOR}
                onPress={onCreateThenNow}
              />
            </View>

            {/* Send to people */}
            {suggestedPeople.length > 0 && (
              <View style={styles.sendToSection}>
                <Text style={styles.sectionTitle}>Send to...</Text>
                <View style={styles.peopleRow}>
                  {suggestedPeople.map((person) => (
                    <SendToPerson 
                      key={person.id} 
                      person={person} 
                      onPress={onSendToPerson}
                    />
                  ))}
                </View>
              </View>
            )}

            {/* Quick actions */}
            <View style={styles.quickActions}>
              <TouchableOpacity style={styles.quickAction}>
                <Ionicons name="chatbubbles-outline" size={20} color={TEXT_COLOR} />
                <Text style={styles.quickActionText}>Send in Message</Text>
                <Ionicons name="chevron-forward" size={20} color={TEXT_MUTED} />
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.quickAction}>
                <Ionicons name="mail-outline" size={20} color={TEXT_COLOR} />
                <Text style={styles.quickActionText}>Send via Email</Text>
                <Ionicons name="chevron-forward" size={20} color={TEXT_MUTED} />
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.quickAction}>
                <Ionicons name="people-outline" size={20} color={TEXT_COLOR} />
                <Text style={styles.quickActionText}>Request Family Story</Text>
                <Ionicons name="chevron-forward" size={20} color={TEXT_MUTED} />
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: SURFACE_COLOR,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },

  // Handle
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: '#D1D5DB',
    borderRadius: 2,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_COLOR,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: TEXT_COLOR,
  },

  // Preview
  preview: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  previewImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
  },
  previewInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  previewCaption: {
    fontSize: 14,
    fontWeight: '500',
    color: TEXT_COLOR,
    marginBottom: 4,
  },
  previewDate: {
    fontSize: 12,
    color: TEXT_MUTED,
  },

  // Share options
  shareOptions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_COLOR,
  },
  shareOption: {
    alignItems: 'center',
    gap: 8,
  },
  shareIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareLabel: {
    fontSize: 11,
    color: TEXT_COLOR,
    fontWeight: '500',
  },

  // Send to section
  sendToSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_COLOR,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: TEXT_MUTED,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  peopleRow: {
    flexDirection: 'row',
    gap: 16,
  },
  personItem: {
    alignItems: 'center',
    gap: 6,
  },
  personAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: BORDER_COLOR,
  },
  personName: {
    fontSize: 12,
    color: TEXT_COLOR,
    fontWeight: '500',
  },

  // Quick actions
  quickActions: {
    padding: 8,
  },
  quickAction: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  quickActionText: {
    flex: 1,
    fontSize: 15,
    color: TEXT_COLOR,
  },
});

export default ShareMemorySheet;
