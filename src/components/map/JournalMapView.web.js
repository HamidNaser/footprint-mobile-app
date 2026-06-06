/**
 * JournalMapView Component - Web Version
 * 
 * Web-compatible stub for the map view.
 * Maps are not supported on web, so we show a placeholder message.
 */

import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const PRIMARY_COLOR = '#4361ee';

/**
 * JournalMapView - Web Version
 * Shows a "not supported" message since react-native-maps doesn't work on web
 */
export const JournalMapView = memo(({
  entries = [],
  selectedEntry = null,
  onEntryPress,
  onMapPress,
  showCurrentLocation = true,
  style,
}) => {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="map-outline" size={64} color="#C7C7CC" />
        </View>
        <Text style={styles.title}>Map View Not Available</Text>
        <Text style={styles.subtitle}>
          Map functionality is only available on iOS and Android devices.
        </Text>
        {entries.length > 0 && (
          <Text style={styles.entriesCount}>
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'} with location data
          </Text>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    padding: 32,
    maxWidth: 400,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#E5E5EA',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 22,
  },
  entriesCount: {
    fontSize: 14,
    color: PRIMARY_COLOR,
    marginTop: 16,
    fontWeight: '500',
  },
});

export default JournalMapView;
