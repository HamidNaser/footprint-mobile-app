/**
 * JournalEntryDetail Screen - Web Version
 * 
 * Web-compatible version that doesn't use expo-av Video.
 */

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
  StatusBar,
  Modal,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AudioPlayer } from '../components/media/AudioPlayer';
import { VideoThumbnail } from '../components/media/VideoThumbnail';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const formatDate = (timestamp) => {
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const formatTime = (timestamp) => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getSyncStatusConfig = (status) => {
  switch (status) {
    case 'synced':
      return { icon: 'cloud-done', color: '#34C759', label: 'Synced to cloud' };
    case 'syncing':
      return { icon: 'cloud-upload', color: '#007AFF', label: 'Syncing...' };
    case 'pending':
      return { icon: 'cloud-offline', color: '#FF9500', label: 'Waiting to sync' };
    case 'conflict':
      return { icon: 'warning', color: '#FF3B30', label: 'Sync conflict' };
    case 'local_only':
      return { icon: 'phone-portrait', color: '#8E8E93', label: 'Local only' };
    default:
      return { icon: 'cloud', color: '#8E8E93', label: 'Unknown' };
  }
};

/**
 * Full-screen image viewer modal
 */
const ImageViewerModal = ({ visible, images, initialIndex, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const flatListRef = useRef(null);

  const renderItem = ({ item }) => (
    <View style={styles.viewerImageContainer}>
      <Image
        source={{ uri: item.localPath || item.serverUrl }}
        style={styles.viewerImage}
        resizeMode="contain"
      />
    </View>
  );

  const handleScroll = (event) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setCurrentIndex(index);
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.viewerContainer}>
        <View style={styles.viewerHeader}>
          <TouchableOpacity style={styles.viewerCloseButton} onPress={onClose}>
            <Ionicons name="close" size={28} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.viewerCounter}>
            {currentIndex + 1} / {images.length}
          </Text>
          <View style={styles.viewerCloseButton} />
        </View>

        <FlatList
          ref={flatListRef}
          data={images}
          renderItem={renderItem}
          keyExtractor={(item, index) => item.localId || `image-${index}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScroll}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, index) => ({
            length: SCREEN_WIDTH,
            offset: SCREEN_WIDTH * index,
            index,
          })}
        />
      </View>
    </Modal>
  );
};

/**
 * Video player modal - Web version (no native video support)
 */
const VideoPlayerModal = ({ visible, video, onClose }) => {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.viewerContainer}>
        <View style={styles.viewerHeader}>
          <TouchableOpacity style={styles.viewerCloseButton} onPress={onClose}>
            <Ionicons name="close" size={28} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.viewerCounter}>Video</Text>
          <View style={styles.viewerCloseButton} />
        </View>

        <View style={styles.videoPlaceholder}>
          <Ionicons name="videocam" size={64} color="#8E8E93" />
          <Text style={styles.videoPlaceholderTitle}>Video Playback</Text>
          <Text style={styles.videoPlaceholderText}>
            Video playback is not available on web.{'\n'}
            Please use the mobile app to view videos.
          </Text>
        </View>
      </View>
    </Modal>
  );
};

/**
 * Main JournalEntryDetail component
 */
export const JournalEntryDetail = ({
  entry,
  user,
  onEdit,
  onDelete,
  onBack,
  onLocationPress,
  primaryColor = '#007AFF',
}) => {
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [imageViewerIndex, setImageViewerIndex] = useState(0);
  const [videoPlayerVisible, setVideoPlayerVisible] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState(null);

  if (!entry) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color="#FF3B30" />
          <Text style={styles.errorText}>Entry not found</Text>
        </View>
      </View>
    );
  }

  const textBlocks = entry.contentBlocks?.filter(b => b.type === 'text') || [];
  const photos = entry.contentBlocks
    ?.filter(b => b.type === 'photos')
    .flatMap(b => b.media) || [];
  const videos = entry.contentBlocks
    ?.filter(b => b.type === 'video')
    .flatMap(b => b.media) || [];
  const audioItems = entry.contentBlocks
    ?.filter(b => b.type === 'audio')
    .flatMap(b => b.media) || [];
  const location = entry.location || entry.contentBlocks?.find(b => b.type === 'location')?.location;

  const syncConfig = getSyncStatusConfig(entry.syncStatus);

  const openImageViewer = (index) => {
    setImageViewerIndex(index);
    setImageViewerVisible(true);
  };

  const openVideoPlayer = (video) => {
    setSelectedVideo(video);
    setVideoPlayerVisible(true);
  };

  const handleDelete = () => {
    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm('Are you sure you want to delete this journal entry?')) {
        onDelete?.(entry);
      }
    }
  };

  const showMenu = () => {
    // On web, use a simple approach
    const choice = typeof window !== 'undefined' && window.prompt 
      ? window.prompt('Enter action: edit / delete')
      : null;
    if (choice === 'edit') onEdit?.(entry);
    if (choice === 'delete') handleDelete();
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={onBack}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <View style={styles.headerTitle}>
          <Text style={styles.headerDate}>{formatDate(entry.createdAt)}</Text>
        </View>
        <TouchableOpacity style={styles.headerButton} onPress={showMenu}>
          <Ionicons name="ellipsis-horizontal" size={24} color="#000" />
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* User info */}
        <View style={styles.userInfo}>
          <Image
            source={{ uri: user?.avatarUrl || 'https://via.placeholder.com/48' }}
            style={styles.avatar}
          />
          <View style={styles.userDetails}>
            <Text style={styles.userName}>{user?.name || 'You'}</Text>
            <Text style={styles.entryTime}>{formatTime(entry.createdAt)}</Text>
          </View>
        </View>

        {/* Text content */}
        {textBlocks.map((block, index) => (
          <View key={index} style={styles.textBlock}>
            <Text style={styles.textContent}>{block.content}</Text>
          </View>
        ))}

        {/* Photos */}
        {photos.length > 0 && (
          <View style={styles.mediaSection}>
            <View style={styles.photoGrid}>
              {photos.map((photo, index) => (
                <TouchableOpacity
                  key={photo.localId || index}
                  style={[
                    styles.photoItem,
                    photos.length === 1 && styles.photoItemSingle,
                  ]}
                  onPress={() => openImageViewer(index)}
                >
                  <Image
                    source={{ uri: photo.localPath || photo.serverUrl }}
                    style={styles.photo}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Videos */}
        {videos.length > 0 && (
          <View style={styles.mediaSection}>
            <Text style={styles.mediaSectionTitle}>Videos</Text>
            <View style={styles.videoGrid}>
              {videos.map((video, index) => (
                <TouchableOpacity
                  key={video.localId || index}
                  style={styles.videoItem}
                  onPress={() => openVideoPlayer(video)}
                >
                  <VideoThumbnail
                    videoUri={video.localPath || video.serverUrl}
                    thumbnailUri={video.thumbnailUrl}
                    duration={video.duration}
                    width={(SCREEN_WIDTH - 48) / 2}
                    height={100}
                    showDuration
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Audio */}
        {audioItems.length > 0 && (
          <View style={styles.mediaSection}>
            <Text style={styles.mediaSectionTitle}>Voice Recordings</Text>
            {audioItems.map((audio, index) => (
              <AudioPlayer
                key={audio.localId || index}
                uri={audio.localPath || audio.serverUrl}
                waveformData={audio.waveform}
                primaryColor={primaryColor}
                style={styles.audioPlayer}
              />
            ))}
          </View>
        )}

        {/* Location */}
        {location && (
          <TouchableOpacity 
            style={styles.locationSection}
            onPress={() => onLocationPress?.(location)}
          >
            <Ionicons name="location" size={20} color={primaryColor} />
            <Text style={[styles.locationText, { color: primaryColor }]}>
              {location.name || `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`}
            </Text>
            <Ionicons name="chevron-forward" size={20} color="#8E8E93" />
          </TouchableOpacity>
        )}

        {/* Metadata */}
        <View style={styles.metadataSection}>
          {entry.visibility && (
            <View style={styles.metadataRow}>
              <Ionicons 
                name={entry.visibility === 'private' ? 'lock-closed-outline' : 'people-outline'} 
                size={18} 
                color="#8E8E93" 
              />
              <Text style={styles.metadataText}>
                {entry.visibility.charAt(0).toUpperCase() + entry.visibility.slice(1)}
              </Text>
            </View>
          )}

          <View style={styles.metadataRow}>
            <Ionicons name={syncConfig.icon} size={18} color={syncConfig.color} />
            <Text style={[styles.metadataText, { color: syncConfig.color }]}>
              {syncConfig.label}
            </Text>
          </View>

          {entry.updatedAt !== entry.createdAt && (
            <View style={styles.metadataRow}>
              <Ionicons name="time-outline" size={18} color="#8E8E93" />
              <Text style={styles.metadataText}>
                Edited {formatDate(entry.updatedAt)}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Image viewer modal */}
      <ImageViewerModal
        visible={imageViewerVisible}
        images={photos}
        initialIndex={imageViewerIndex}
        onClose={() => setImageViewerVisible(false)}
      />

      {/* Video player modal */}
      <VideoPlayerModal
        visible={videoPlayerVisible}
        video={selectedVideo}
        onClose={() => {
          setVideoPlayerVisible(false);
          setSelectedVideo(null);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 10,
    paddingHorizontal: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  headerButton: {
    padding: 8,
  },
  headerTitle: {
    flex: 1,
    alignItems: 'center',
  },
  headerDate: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F0F0F0',
  },
  userDetails: {
    marginLeft: 12,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  entryTime: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 2,
  },
  textBlock: {
    marginBottom: 16,
  },
  textContent: {
    fontSize: 17,
    lineHeight: 26,
    color: '#1C1C1E',
  },
  mediaSection: {
    marginBottom: 20,
  },
  mediaSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  photoItem: {
    width: (SCREEN_WIDTH - 36) / 2,
    height: 150,
    borderRadius: 12,
    overflow: 'hidden',
  },
  photoItemSingle: {
    width: SCREEN_WIDTH - 32,
    height: 250,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  videoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  videoItem: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  audioPlayer: {
    marginBottom: 8,
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
  },
  locationSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    padding: 12,
    borderRadius: 12,
    marginBottom: 20,
  },
  locationText: {
    flex: 1,
    fontSize: 15,
    marginLeft: 8,
  },
  metadataSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E5EA',
    paddingTop: 16,
  },
  metadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  metadataText: {
    fontSize: 14,
    color: '#8E8E93',
    marginLeft: 8,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    fontSize: 17,
    color: '#FF3B30',
    marginTop: 16,
  },
  viewerContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  viewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  viewerCloseButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerCounter: {
    fontSize: 16,
    color: '#FFF',
    fontWeight: '500',
  },
  viewerImageContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT - 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerImage: {
    width: SCREEN_WIDTH,
    height: '100%',
  },
  videoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  videoPlaceholderTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFF',
    marginTop: 16,
  },
  videoPlaceholderText: {
    fontSize: 15,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
  },
});

export default JournalEntryDetail;
