/**
 * JournalEntryCard Component
 * 
 * Displays a single journal entry in a threaded/sequential format:
 * - Content blocks render in order (text, photos, audio, etc.)
 * - Similar to WhatsApp/Instagram story where content appears in sequence
 * - Supports: text, photo grids, video thumbnails, audio players, location
 */

import React, { memo, useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VideoThumbnail } from '../media/VideoThumbnail';
import { AudioPlayer } from '../media/AudioPlayer';
import { EngagementSection } from './EngagementSection';
import { thumbnailSource } from '../../utils/mediaSource';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_PADDING = 16;
const CONTENT_WIDTH = SCREEN_WIDTH - (CARD_PADDING * 2);

/**
 * Sync status indicator
 */
const SyncStatusBadge = ({ status }) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'synced':
        return { icon: 'cloud-done-outline', color: '#34C759', label: 'Synced' };
      case 'syncing':
        return { icon: 'cloud-upload-outline', color: '#007AFF', label: 'Syncing' };
      case 'pending':
        return { icon: 'cloud-offline-outline', color: '#FF9500', label: 'Pending' };
      case 'conflict':
        return { icon: 'warning-outline', color: '#FF3B30', label: 'Conflict' };
      case 'local_only':
        return { icon: 'phone-portrait-outline', color: '#8E8E93', label: 'Local' };
      default:
        return { icon: 'cloud-outline', color: '#8E8E93', label: '' };
    }
  };

  const config = getStatusConfig();
  
  return (
    <View style={styles.syncBadge}>
      <Ionicons name={config.icon} size={12} color={config.color} />
    </View>
  );
};

/**
 * Text block component
 */
const TextBlock = memo(({ content, isFirst }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const MAX_LENGTH = 300;
  const shouldTruncate = content.length > MAX_LENGTH;
  const displayText = isExpanded ? content : content.slice(0, MAX_LENGTH);

  return (
    <View style={[styles.textBlock, !isFirst && styles.textBlockSpacing]}>
      <Text style={styles.textContent}>
        {displayText}
        {shouldTruncate && !isExpanded && '...'}
      </Text>
      {shouldTruncate && (
        <TouchableOpacity onPress={() => setIsExpanded(!isExpanded)}>
          <Text style={styles.readMore}>
            {isExpanded ? 'Show less' : 'Read more'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

/**
 * Photo block - displays photos in a grid
 * Uses native img on web (RN Image has issues), RN Image on native
 */
/**
 * A grid tile is a postage stamp. Loading the full-size original into one costs 76 KB
 * where the Hub will serve a 7 KB rendition -- and the person opening the photograph
 * properly still gets the original, because the viewer picks its own source.
 */
const PhotoBlock = memo(({ photos, onPhotoPress }) => {
  if (!photos || photos.length === 0) return null;

  const PHOTO_HEIGHT = 200;
  const GRID_GAP = 4;
  
  // Web-specific image component using native img element
  const WebImage = ({ uri, style, onPress }) => (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <img 
        src={uri}
        alt="photo"
        style={{ 
          width: '100%',
          height: style?.height || PHOTO_HEIGHT, 
          objectFit: 'cover',
          borderRadius: 12, 
          backgroundColor: '#E0E0E0',
          display: 'block',
        }}
      />
    </TouchableOpacity>
  );
  
  // Native image component
  const NativeImage = ({ uri, style, onPress }) => (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <Image
        source={{ uri }}
        style={[styles.photo, style]}
        resizeMode="cover"
      />
    </TouchableOpacity>
  );
  
  // Choose the appropriate image component
  const PhotoImage = Platform.OS === 'web' ? WebImage : NativeImage;

  const renderSinglePhoto = () => (
    <PhotoImage 
      uri={thumbnailSource(photos[0])}
      style={{ height: PHOTO_HEIGHT }}
      onPress={() => onPhotoPress?.(photos, 0)}
    />
  );

  const renderTwoPhotos = () => (
    <View style={styles.photoRow}>
      {photos.slice(0, 2).map((photo, index) => (
        <View 
          key={photo.localId || photo.id || index}
          style={{ flex: 1, marginLeft: index > 0 ? GRID_GAP : 0 }}
        >
          <PhotoImage
            uri={thumbnailSource(photo)}
            style={{ height: PHOTO_HEIGHT }}
            onPress={() => onPhotoPress?.(photos, index)}
          />
        </View>
      ))}
    </View>
  );

  const renderThreePhotos = () => (
    <View style={styles.photoRow}>
      <View style={{ flex: 2 }}>
        <PhotoImage
          uri={thumbnailSource(photos[0])}
          style={{ height: PHOTO_HEIGHT }}
          onPress={() => onPhotoPress?.(photos, 0)}
        />
      </View>
      <View style={{ flex: 1, marginLeft: GRID_GAP }}>
        {photos.slice(1, 3).map((photo, index) => (
          <View 
            key={photo.localId || photo.id || index}
            style={{ marginTop: index > 0 ? GRID_GAP : 0, flex: 1 }}
          >
            <PhotoImage
              uri={thumbnailSource(photo)}
              style={{ height: (PHOTO_HEIGHT - GRID_GAP) / 2 }}
              onPress={() => onPhotoPress?.(photos, index + 1)}
            />
          </View>
        ))}
      </View>
    </View>
  );

  const renderFourPlusPhotos = () => (
    <View style={styles.photoGrid}>
      {photos.slice(0, 4).map((photo, index) => (
        <View 
          key={photo.localId || photo.id || index}
          style={styles.gridPhotoContainer}
        >
          <PhotoImage
            uri={thumbnailSource(photo)}
            style={{ height: '100%' }}
            onPress={() => onPhotoPress?.(photos, index)}
          />
          {index === 3 && photos.length > 4 && (
            <View style={styles.moreOverlay}>
              <Text style={styles.moreText}>+{photos.length - 4}</Text>
            </View>
          )}
        </View>
      ))}
    </View>
  );

  return (
    <View style={styles.mediaBlock}>
      {photos.length === 1 && renderSinglePhoto()}
      {photos.length === 2 && renderTwoPhotos()}
      {photos.length === 3 && renderThreePhotos()}
      {photos.length >= 4 && renderFourPlusPhotos()}
    </View>
  );
});

/**
 * Video block - displays video thumbnails
 */
const VideoBlock = memo(({ videos, onVideoPress }) => {
  if (!videos || videos.length === 0) return null;

  return (
    <View style={styles.mediaBlock}>
      <View style={styles.videoGrid}>
        {videos.slice(0, 4).map((video, index) => (
          <View key={video.localId || video.id || index} style={styles.videoContainer}>
            <VideoThumbnail
              videoUri={video.localPath || video.serverUrl}
              thumbnailUri={video.thumbnailUrl}
              duration={video.duration}
              width={videos.length === 1 ? CONTENT_WIDTH - 32 : (CONTENT_WIDTH - 36) / 2}
              height={videos.length === 1 ? 200 : 100}
              onPress={() => onVideoPress?.(videos, index)}
            />
            {index === 3 && videos.length > 4 && (
              <View style={styles.moreOverlay}>
                <Text style={styles.moreText}>+{videos.length - 4}</Text>
              </View>
            )}
          </View>
        ))}
      </View>
    </View>
  );
});

/**
 * Audio block - displays audio player
 */
const AudioBlock = memo(({ audio, primaryColor }) => {
  if (!audio) return null;

  return (
    <View style={styles.audioBlock}>
      <View style={styles.audioWrapper}>
        <View style={styles.audioIcon}>
          <Ionicons name="mic" size={18} color="#FFF" />
        </View>
        <AudioPlayer
          uri={audio.localPath || audio.serverUrl}
          waveformData={audio.waveform}
          primaryColor={primaryColor}
          compact
          style={styles.audioPlayer}
        />
        {audio.duration && (
          <Text style={styles.audioDuration}>
            {Math.floor(audio.duration / 60)}:{String(Math.floor(audio.duration % 60)).padStart(2, '0')}
          </Text>
        )}
      </View>
    </View>
  );
});

/**
 * Format relative time
 */
const formatRelativeTime = (timestamp) => {
  const now = Date.now();
  const diff = now - timestamp;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  
  const date = new Date(timestamp);
  return date.toLocaleDateString();
};

/**
 * Visibility config for display
 */
const VISIBILITY_DISPLAY = {
  private: { icon: 'lock-closed', label: 'Only Me' },
  family: { icon: 'people', label: 'Family' },
  friends: { icon: 'person-add', label: 'Friends' },
  family_friends: { icon: 'globe-outline', label: 'Family & Friends' },
};

/**
 * Main JournalEntryCard component - Threaded/Sequential Layout
 */
export const JournalEntryCard = memo(({
  entry,
  user,
  currentUserId,  // To determine if this is user's own entry
  onGalleryPress,
  onPhotoPress,
  onVideoPress,
  onMenuPress,
  onReact,           // Callback when user reacts: (entryId, reactionKey) => void
  onAddResponse,     // Callback when user adds response: (entryId, text) => void
  onViewResponses,   // Callback to view all responses
  primaryColor = '#007AFF',
  showSyncStatus = true,
  showEngagement = true,  // Show reactions/comments section
  style,
}) => {
  // Determine if this is the current user's entry
  const isOwnEntry = currentUserId && (entry.userId === currentUserId || entry.authorId === currentUserId);
  // Check if entry has any media (photos, videos) for gallery button
  const hasMedia = entry.contentBlocks?.some(b => 
    b.type === 'photos' || b.type === 'video'
  );

  // Find current user's reaction (if any)
  // Handle new format: { heart: [users], thanks: [users] }
  const userReaction = entry.reactions ? 
    Object.entries(entry.reactions).find(([key, users]) => 
      Array.isArray(users) && users.some(u => u.id === currentUserId)
    )?.[0] : null;

  // Handlers for engagement
  const handleReact = useCallback((reactionKey) => {
    onReact?.(entry.id, reactionKey);
  }, [entry.id, onReact]);

  const handleAddResponse = useCallback((text) => {
    onAddResponse?.(entry.id, text);
  }, [entry.id, onAddResponse]);

  const handleViewResponses = useCallback(() => {
    onViewResponses?.(entry.id);
  }, [entry.id, onViewResponses]);

  /**
   * Render a single content block based on its type
   */
  const renderContentBlock = (block, index) => {
    const isFirst = index === 0;
    
    switch (block.type) {
      case 'text':
        return (
          <TextBlock 
            key={`text-${index}`} 
            content={block.content} 
            isFirst={isFirst}
          />
        );
      
      case 'photos':
        return (
          <PhotoBlock 
            key={`photos-${index}`} 
            photos={block.media} 
            onPhotoPress={onPhotoPress}
          />
        );
      
      case 'video':
        return (
          <VideoBlock 
            key={`video-${index}`} 
            videos={block.media} 
            onVideoPress={onVideoPress}
          />
        );
      
      case 'audio':
        // Handle both single audio and array of audio
        const audioItems = Array.isArray(block.media) ? block.media : [block.media];
        return audioItems.map((audio, audioIndex) => (
          <AudioBlock 
            key={`audio-${index}-${audioIndex}`} 
            audio={audio} 
            primaryColor={primaryColor}
          />
        ));
      
      default:
        return null;
    }
  };

  return (
    <View style={[styles.card, style]}>
      {/* Header */}
      <View style={styles.header}>
        <Image
          source={{ uri: user?.avatarUrl || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face' }}
          style={styles.avatar}
        />
        <View style={styles.headerInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.userName}>{user?.name || 'Alex Johnson'}</Text>
            {showSyncStatus && <SyncStatusBadge status={entry.syncStatus} />}
          </View>
          <View style={styles.timestampRow}>
            <Text style={styles.timestamp}>{formatRelativeTime(entry.createdAt)}</Text>
            {/* Visibility indicator - only show on own entries */}
            {isOwnEntry && entry.visibility && VISIBILITY_DISPLAY[entry.visibility] && (
              <View style={styles.headerVisibility}>
                <Text style={styles.headerVisibilityDot}>·</Text>
                <Ionicons 
                  name={VISIBILITY_DISPLAY[entry.visibility].icon} 
                  size={12} 
                  color="#8E8E93" 
                />
                <Text style={styles.headerVisibilityText}>
                  {VISIBILITY_DISPLAY[entry.visibility].label}
                </Text>
              </View>
            )}
          </View>
        </View>
        <TouchableOpacity style={styles.menuButton} onPress={() => onMenuPress?.(entry)}>
          <Ionicons name="ellipsis-horizontal" size={20} color="#8E8E93" />
        </TouchableOpacity>
      </View>

      {/* Content Blocks - Rendered in sequence (threaded) */}
      <View style={styles.contentContainer}>
        {entry.contentBlocks?.map((block, index) => renderContentBlock(block, index))}
      </View>

      {/* Engagement Section - Reactions & Responses */}
      {showEngagement && (
        <View style={styles.engagementContainer}>
          <EngagementSection
            reactions={entry.reactions}
            responses={entry.responses}
            userReaction={userReaction}
            commentsCount={entry.responsesCount || entry.responses?.length || 0}
            onReact={handleReact}
            onAddResponse={handleAddResponse}
            onViewAllResponses={handleViewResponses}
            currentUserId={currentUserId}
            primaryColor={primaryColor}
          />
        </View>
      )}

      {/* Footer with Gallery Button */}
      {hasMedia && (
        <View style={styles.footer}>
          <View style={styles.statsRow} />
          
          {/* Gallery Button - Bottom Right */}
          <TouchableOpacity 
            style={[styles.galleryButton, { backgroundColor: primaryColor }]}
            onPress={() => onGalleryPress?.(entry)}
            activeOpacity={0.8}
          >
            <Ionicons name="images-outline" size={18} color="#FFF" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
});

const PHOTO_HEIGHT = 200;
const GRID_GAP = 4;

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF',
    marginHorizontal: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: CARD_PADDING,
    paddingBottom: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
  },
  headerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
  },
  timestamp: {
    fontSize: 12,
    color: '#8E8E93',
  },
  timestampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  headerVisibility: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerVisibilityDot: {
    color: '#8E8E93',
    marginHorizontal: 4,
    fontSize: 12,
  },
  headerVisibilityText: {
    fontSize: 12,
    color: '#8E8E93',
    marginLeft: 3,
  },
  menuButton: {
    padding: 8,
  },

  // Sync badge
  syncBadge: {
    marginLeft: 6,
  },

  // Content container
  contentContainer: {
    paddingHorizontal: CARD_PADDING,
  },

  // Engagement section
  engagementContainer: {
    paddingHorizontal: CARD_PADDING,
  },

  // Text blocks
  textBlock: {
    marginBottom: 12,
  },
  textBlockSpacing: {
    marginTop: 8,
  },
  textContent: {
    fontSize: 15,
    lineHeight: 22,
    color: '#1C1C1E',
  },
  readMore: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 4,
    color: '#007AFF',
  },

  // Media blocks
  mediaBlock: {
    marginBottom: 12,
  },

  // Photo styles
  photo: {
    width: '100%',
    borderRadius: 12,
    backgroundColor: '#F0F0F0',
  },
  photoRow: {
    flexDirection: 'row',
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  gridPhotoContainer: {
    width: (CONTENT_WIDTH - 32 - GRID_GAP) / 2,
    height: (PHOTO_HEIGHT - GRID_GAP) / 2,
  },
  gridPhoto: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    backgroundColor: '#F0F0F0',
  },
  moreOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreText: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '600',
  },

  // Video styles
  videoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  videoContainer: {
    borderRadius: 12,
    overflow: 'hidden',
  },

  // Audio styles
  audioBlock: {
    marginBottom: 12,
  },
  audioWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F4FF',
    borderRadius: 24,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  audioIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  audioPlayer: {
    flex: 1,
  },
  audioDuration: {
    fontSize: 12,
    color: '#8E8E93',
    marginLeft: 8,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: CARD_PADDING,
    paddingBottom: CARD_PADDING,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  visibilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  visibilityText: {
    fontSize: 12,
    color: '#8E8E93',
    marginLeft: 4,
  },
  
  // Gallery button - bottom right
  galleryButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
      },
      android: {
        elevation: 4,
      },
      web: {
        boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
      },
    }),
  },
});

export default JournalEntryCard;
