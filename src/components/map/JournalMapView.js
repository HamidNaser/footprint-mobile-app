/**
 * JournalMapView Component
 * 
 * Displays journal entries on a map with custom markers.
 * Features:
 * - Entry markers with photo thumbnails
 * - Marker clustering for dense areas
 * - Current location indicator
 * - Entry detail callouts
 */

import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Dimensions,
} from 'react-native';
import MapView, { PROVIDER_GOOGLE, Polyline } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';

import { EntryMarker, ClusterMarker, UserMarker } from './EntryMarker';
import LocationService, { PermissionStatus } from '../../services/LocationService';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const PRIMARY_COLOR = '#4361ee';

// Default region (San Francisco)
const DEFAULT_REGION = {
  latitude: 37.7749,
  longitude: -122.4194,
  latitudeDelta: 0.0922,
  longitudeDelta: 0.0421,
};

// Cluster distance threshold in degrees
const CLUSTER_THRESHOLD = 0.01;

/**
 * Group nearby entries into clusters
 */
const clusterEntries = (entries, threshold = CLUSTER_THRESHOLD) => {
  const clusters = [];
  const used = new Set();

  entries.forEach((entry, index) => {
    if (used.has(index) || !entry.location) return;

    const cluster = {
      entries: [entry],
      center: {
        latitude: entry.location.lat,
        longitude: entry.location.lng,
      },
    };

    entries.forEach((other, otherIndex) => {
      if (index === otherIndex || used.has(otherIndex) || !other.location) return;

      const distance = Math.sqrt(
        Math.pow(entry.location.lat - other.location.lat, 2) +
        Math.pow(entry.location.lng - other.location.lng, 2)
      );

      if (distance < threshold) {
        cluster.entries.push(other);
        used.add(otherIndex);
      }
    });

    used.add(index);
    clusters.push(cluster);
  });

  return clusters;
};

/**
 * Map type selector button
 */
const MapTypeButton = memo(({ mapType, onPress }) => (
  <TouchableOpacity style={styles.mapTypeButton} onPress={onPress}>
    <Ionicons
      name={mapType === 'standard' ? 'map' : 'satellite'}
      size={22}
      color="#333"
    />
  </TouchableOpacity>
));

MapTypeButton.displayName = 'MapTypeButton';

/**
 * Center on location button
 */
const CenterButton = memo(({ onPress, loading }) => (
  <TouchableOpacity style={styles.centerButton} onPress={onPress} disabled={loading}>
    {loading ? (
      <ActivityIndicator size="small" color={PRIMARY_COLOR} />
    ) : (
      <Ionicons name="locate" size={22} color={PRIMARY_COLOR} />
    )}
  </TouchableOpacity>
));

CenterButton.displayName = 'CenterButton';

/**
 * Permission denied overlay
 */
const PermissionOverlay = memo(({ onRequestPermission }) => (
  <View style={styles.permissionOverlay}>
    <Ionicons name="location-outline" size={48} color="#8E8E93" />
    <Text style={styles.permissionTitle}>Location Access</Text>
    <Text style={styles.permissionText}>
      Enable location to see your entries on the map
    </Text>
    <TouchableOpacity style={styles.permissionButton} onPress={onRequestPermission}>
      <Text style={styles.permissionButtonText}>Enable Location</Text>
    </TouchableOpacity>
  </View>
));

PermissionOverlay.displayName = 'PermissionOverlay';

/**
 * JournalMapView component
 */
export const JournalMapView = ({
  entries = [],
  onEntryPress,
  onMapPress,
  onRegionChange,
  initialRegion,
  showUserLocation = true,
  showTrail = false,
  enableClustering = true,
  clusterThreshold = CLUSTER_THRESHOLD,
  markerSize = 40,
  primaryColor = PRIMARY_COLOR,
  style,
}) => {
  const mapRef = useRef(null);
  
  // State
  const [mapType, setMapType] = useState('standard');
  const [userLocation, setUserLocation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [region, setRegion] = useState(initialRegion || DEFAULT_REGION);

  // Filter entries with valid locations
  const entriesWithLocation = useMemo(
    () => entries.filter(e => e.location?.lat && e.location?.lng),
    [entries]
  );

  // Cluster entries if enabled
  const clusters = useMemo(() => {
    if (!enableClustering || entriesWithLocation.length === 0) {
      return entriesWithLocation.map(entry => ({
        entries: [entry],
        center: {
          latitude: entry.location.lat,
          longitude: entry.location.lng,
        },
      }));
    }
    return clusterEntries(entriesWithLocation, clusterThreshold);
  }, [entriesWithLocation, enableClustering, clusterThreshold]);

  // Trail coordinates (for showing path)
  const trailCoordinates = useMemo(() => {
    if (!showTrail || entriesWithLocation.length < 2) return [];
    
    return entriesWithLocation
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(entry => ({
        latitude: entry.location.lat,
        longitude: entry.location.lng,
      }));
  }, [entriesWithLocation, showTrail]);

  /**
   * Get user location on mount
   */
  useEffect(() => {
    if (showUserLocation) {
      getCurrentLocation();
    }
  }, [showUserLocation]);

  /**
   * Get current location
   */
  const getCurrentLocation = useCallback(async () => {
    setLoading(true);
    try {
      const { foreground } = await LocationService.checkPermissions();
      
      if (foreground !== PermissionStatus.GRANTED) {
        const result = await LocationService.requestPermissions();
        if (result.foreground !== PermissionStatus.GRANTED) {
          setPermissionDenied(true);
          setLoading(false);
          return;
        }
      }

      setPermissionDenied(false);
      const location = await LocationService.getCurrentLocation();
      setUserLocation({
        latitude: location.latitude,
        longitude: location.longitude,
      });
      setLoading(false);
    } catch (error) {
      console.error('[JournalMapView] Error getting location:', error);
      setLoading(false);
    }
  }, []);

  /**
   * Center map on user location
   */
  const centerOnUser = useCallback(async () => {
    if (permissionDenied) {
      getCurrentLocation();
      return;
    }

    setLoading(true);
    try {
      const location = await LocationService.getCurrentLocation();
      const newRegion = LocationService.getRegion(
        location.latitude,
        location.longitude,
        0.5
      );

      mapRef.current?.animateToRegion(newRegion, 500);
      setUserLocation({
        latitude: location.latitude,
        longitude: location.longitude,
      });
    } catch (error) {
      console.error('[JournalMapView] Error centering on user:', error);
    }
    setLoading(false);
  }, [permissionDenied, getCurrentLocation]);

  /**
   * Fit map to show all entries
   */
  const fitToEntries = useCallback(() => {
    if (entriesWithLocation.length === 0) return;

    const coordinates = entriesWithLocation.map(entry => ({
      latitude: entry.location.lat,
      longitude: entry.location.lng,
    }));

    mapRef.current?.fitToCoordinates(coordinates, {
      edgePadding: {
        top: 50,
        right: 50,
        bottom: 50,
        left: 50,
      },
      animated: true,
    });
  }, [entriesWithLocation]);

  /**
   * Toggle map type
   */
  const toggleMapType = useCallback(() => {
    setMapType(prev => (prev === 'standard' ? 'satellite' : 'standard'));
  }, []);

  /**
   * Handle marker press
   */
  const handleMarkerPress = useCallback((entry) => {
    onEntryPress?.(entry);
  }, [onEntryPress]);

  /**
   * Handle cluster press (zoom in)
   */
  const handleClusterPress = useCallback((cluster) => {
    if (cluster.entries.length === 1) {
      handleMarkerPress(cluster.entries[0]);
      return;
    }

    // Zoom in to show cluster entries
    const coordinates = cluster.entries.map(entry => ({
      latitude: entry.location.lat,
      longitude: entry.location.lng,
    }));

    mapRef.current?.fitToCoordinates(coordinates, {
      edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
      animated: true,
    });
  }, [handleMarkerPress]);

  /**
   * Handle region change
   */
  const handleRegionChange = useCallback((newRegion) => {
    setRegion(newRegion);
    onRegionChange?.(newRegion);
  }, [onRegionChange]);

  return (
    <View style={[styles.container, style]}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        mapType={mapType}
        initialRegion={region}
        onRegionChangeComplete={handleRegionChange}
        onPress={onMapPress}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={true}
        showsScale={true}
        rotateEnabled={true}
        pitchEnabled={true}
      >
        {/* Trail polyline */}
        {showTrail && trailCoordinates.length >= 2 && (
          <Polyline
            coordinates={trailCoordinates}
            strokeColor={primaryColor}
            strokeWidth={2}
            lineDashPattern={[5, 5]}
          />
        )}

        {/* Entry markers / clusters */}
        {clusters.map((cluster, index) => {
          if (cluster.entries.length === 1) {
            return (
              <EntryMarker
                key={`entry-${cluster.entries[0].localId}`}
                entry={cluster.entries[0]}
                onPress={() => handleMarkerPress(cluster.entries[0])}
                onCalloutPress={() => handleMarkerPress(cluster.entries[0])}
                markerSize={markerSize}
                primaryColor={primaryColor}
              />
            );
          }

          return (
            <ClusterMarker
              key={`cluster-${index}`}
              count={cluster.entries.length}
              coordinate={cluster.center}
              onPress={() => handleClusterPress(cluster)}
              primaryColor={primaryColor}
            />
          );
        })}

        {/* User location marker */}
        {showUserLocation && userLocation && (
          <UserMarker
            coordinate={userLocation}
            primaryColor={primaryColor}
          />
        )}
      </MapView>

      {/* Controls */}
      <View style={styles.controls}>
        <MapTypeButton mapType={mapType} onPress={toggleMapType} />
        {showUserLocation && (
          <CenterButton onPress={centerOnUser} loading={loading} />
        )}
        {entriesWithLocation.length > 0 && (
          <TouchableOpacity style={styles.fitButton} onPress={fitToEntries}>
            <Ionicons name="scan" size={22} color="#333" />
          </TouchableOpacity>
        )}
      </View>

      {/* Permission overlay */}
      {permissionDenied && (
        <PermissionOverlay onRequestPermission={getCurrentLocation} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F4FF',
  },
  map: {
    flex: 1,
  },

  // Controls
  controls: {
    position: 'absolute',
    top: 16,
    right: 16,
    gap: 8,
  },
  mapTypeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  centerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  fitButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },

  // Permission overlay
  permissionOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1C1C1E',
    marginTop: 16,
    marginBottom: 8,
  },
  permissionText: {
    fontSize: 15,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 24,
  },
  permissionButton: {
    backgroundColor: PRIMARY_COLOR,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default JournalMapView;
