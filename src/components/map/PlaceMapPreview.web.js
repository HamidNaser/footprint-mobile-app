/**
 * PlaceMapPreview Component (web)
 *
 * react-native-maps is native-only, so on web we render a lightweight static
 * preview with the place coordinates. Mirrors the native component's API.
 */

import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const PRIMARY_COLOR = '#4361ee';
const TEXT_MUTED = '#666666';

const PlaceMapPreview = memo(({ lat, lng, height = 160 }) => {
  if (lat == null || lng == null) return null;

  return (
    <View style={[styles.container, { height }]}>
      <Ionicons name="map" size={40} color={PRIMARY_COLOR} />
      <Text style={styles.coords}>
        {lat.toFixed(4)}, {lng.toFixed(4)}
      </Text>
    </View>
  );
});

PlaceMapPreview.displayName = 'PlaceMapPreview';

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 12,
    backgroundColor: '#E8EEFF',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  coords: {
    fontSize: 13,
    color: TEXT_MUTED,
  },
});

export default PlaceMapPreview;
