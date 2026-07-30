/**
 * PlaceMapPreview Component (native)
 *
 * A small, non-interactive map preview centered on a place's coordinates,
 * used in the Place detail modal. On web, the .web.js variant renders a
 * static fallback since react-native-maps is native-only.
 */

import React, { memo } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';

const PRIMARY_COLOR = '#4361ee';

const PlaceMapPreview = memo(({ lat, lng, height = 160 }) => {
  if (lat == null || lng == null) return null;

  const region = {
    latitude: lat,
    longitude: lng,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  return (
    <View style={[styles.container, { height }]} pointerEvents="none">
      <MapView
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={region}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        liteMode
      >
        <Marker coordinate={{ latitude: lat, longitude: lng }}>
          <View style={styles.marker}>
            <Ionicons name="location" size={28} color={PRIMARY_COLOR} />
          </View>
        </Marker>
      </MapView>
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
  },
  marker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default PlaceMapPreview;
