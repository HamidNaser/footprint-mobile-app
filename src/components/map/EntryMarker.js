/**
 * EntryMarker Component
 * 
 * Custom map marker for journal entries.
 * Shows a thumbnail of the entry's first photo if available,
 * or an icon indicating the entry type.
 */

import React, { memo, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Platform,
} from 'react-native';
import { Marker, Callout } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';

const PRIMARY_COLOR = '#4361ee';

/**
 * Get the first photo from entry content blocks
 */
const getFirstPhoto = (entry) => {
  if (!entry?.contentBlocks) return null;
  
  for (const block of entry.contentBlocks) {
    if (block.type === 'photos' && block.media?.length > 0) {
      return block.media[0].localPath || block.media[0].remoteUrl;
    }
  }
  return null;
};

/**
 * Get entry type icon
 */
const getEntryIcon = (entry) => {
  if (!entry?.contentBlocks) return 'document-text';
  
  for (const block of entry.contentBlocks) {
    if (block.type === 'photos') return 'image';
    if (block.type === 'videos') return 'videocam';
    if (block.type === 'audio') return 'mic';
  }
  return 'document-text';
};

/**
 * Format timestamp for callout
 */
const formatTime = (timestamp) => {
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

/**
 * Get text preview from entry
 */
const getTextPreview = (entry, maxLength = 50) => {
  if (!entry?.contentBlocks) return '';
  
  for (const block of entry.contentBlocks) {
    if (block.type === 'text' && block.content) {
      const text = block.content;
      if (text.length <= maxLength) return text;
      return text.substring(0, maxLength) + '...';
    }
  }
  return 'No description';
};

/**
 * Custom marker content
 */
const MarkerContent = memo(({ entry, size = 40, primaryColor = PRIMARY_COLOR }) => {
  const photo = useMemo(() => getFirstPhoto(entry), [entry]);
  const icon = useMemo(() => getEntryIcon(entry), [entry]);

  if (photo) {
    return (
      <View style={[styles.photoMarker, { width: size, height: size }]}>
        <Image
          source={{ uri: photo }}
          style={[styles.photoImage, { width: size - 4, height: size - 4 }]}
          resizeMode="cover"
        />
      </View>
    );
  }

  return (
    <View style={[styles.iconMarker, { width: size, height: size, backgroundColor: primaryColor }]}>
      <Ionicons name={icon} size={size * 0.5} color="#FFF" />
    </View>
  );
});

MarkerContent.displayName = 'MarkerContent';

/**
 * Callout content for marker
 */
const CalloutContent = memo(({ entry, primaryColor = PRIMARY_COLOR }) => {
  const photo = useMemo(() => getFirstPhoto(entry), [entry]);
  const preview = useMemo(() => getTextPreview(entry), [entry]);
  const time = useMemo(() => formatTime(entry.createdAt), [entry.createdAt]);
  const locationName = entry.location?.name || 'Unknown location';

  return (
    <View style={styles.calloutContainer}>
      {photo && (
        <Image
          source={{ uri: photo }}
          style={styles.calloutImage}
          resizeMode="cover"
        />
      )}
      <View style={styles.calloutContent}>
        <Text style={styles.calloutLocation} numberOfLines={1}>
          {locationName}
        </Text>
        <Text style={styles.calloutPreview} numberOfLines={2}>
          {preview}
        </Text>
        <Text style={styles.calloutTime}>{time}</Text>
      </View>
    </View>
  );
});

CalloutContent.displayName = 'CalloutContent';

/**
 * EntryMarker component
 */
export const EntryMarker = memo(({
  entry,
  onPress,
  onCalloutPress,
  markerSize = 40,
  showCallout = true,
  primaryColor = PRIMARY_COLOR,
  coordinate,
  ...props
}) => {
  // Use provided coordinate or entry's location
  const markerCoordinate = coordinate || {
    latitude: entry.location?.lat,
    longitude: entry.location?.lng,
  };

  // Don't render if no valid coordinates
  if (!markerCoordinate.latitude || !markerCoordinate.longitude) {
    return null;
  }

  return (
    <Marker
      coordinate={markerCoordinate}
      onPress={onPress}
      tracksViewChanges={false}
      {...props}
    >
      <MarkerContent 
        entry={entry} 
        size={markerSize} 
        primaryColor={primaryColor}
      />
      {showCallout && (
        <Callout 
          onPress={onCalloutPress}
          style={styles.callout}
          tooltip={Platform.OS === 'ios'}
        >
          <CalloutContent entry={entry} primaryColor={primaryColor} />
        </Callout>
      )}
    </Marker>
  );
});

EntryMarker.displayName = 'EntryMarker';

/**
 * Cluster marker for multiple entries at same location
 */
export const ClusterMarker = memo(({
  count,
  coordinate,
  onPress,
  size = 44,
  primaryColor = PRIMARY_COLOR,
}) => (
  <Marker
    coordinate={coordinate}
    onPress={onPress}
    tracksViewChanges={false}
  >
    <View style={[styles.clusterMarker, { width: size, height: size, backgroundColor: primaryColor }]}>
      <Text style={styles.clusterText}>{count}</Text>
    </View>
  </Marker>
));

ClusterMarker.displayName = 'ClusterMarker';

/**
 * User location marker
 */
export const UserMarker = memo(({
  coordinate,
  size = 20,
  primaryColor = PRIMARY_COLOR,
}) => (
  <Marker
    coordinate={coordinate}
    tracksViewChanges={false}
    anchor={{ x: 0.5, y: 0.5 }}
  >
    <View style={styles.userMarkerOuter}>
      <View style={[styles.userMarkerInner, { width: size, height: size, backgroundColor: primaryColor }]} />
    </View>
  </Marker>
));

UserMarker.displayName = 'UserMarker';

const styles = StyleSheet.create({
  // Photo marker
  photoMarker: {
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#FFF',
    backgroundColor: '#FFF',
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  photoImage: {
    borderRadius: 6,
  },

  // Icon marker
  iconMarker: {
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },

  // Callout
  callout: {
    width: 220,
  },
  calloutContainer: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    overflow: 'hidden',
    minWidth: 200,
    maxWidth: 250,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  calloutImage: {
    width: '100%',
    height: 100,
  },
  calloutContent: {
    padding: 12,
  },
  calloutLocation: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  calloutPreview: {
    fontSize: 13,
    color: '#8E8E93',
    lineHeight: 18,
    marginBottom: 6,
  },
  calloutTime: {
    fontSize: 11,
    color: '#AEAEB2',
  },

  // Cluster marker
  clusterMarker: {
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFF',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  clusterText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },

  // User marker
  userMarkerOuter: {
    padding: 8,
    backgroundColor: 'rgba(67, 97, 238, 0.2)',
    borderRadius: 50,
  },
  userMarkerInner: {
    borderRadius: 50,
    borderWidth: 3,
    borderColor: '#FFF',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});

export default EntryMarker;
