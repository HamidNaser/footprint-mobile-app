/**
 * LocationPicker Component
 * 
 * Modal for picking a location on the map.
 * Used when creating/editing journal entries.
 * 
 * Features:
 * - Map with draggable pin
 * - Current location button
 * - Reverse geocoding to show address
 * - Search for places
 */

import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Keyboard,
  Platform,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';

import LocationService, { PermissionStatus } from '../../services/LocationService';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const PRIMARY_COLOR = '#4361ee';

// Default region
const DEFAULT_REGION = {
  latitude: 37.7749,
  longitude: -122.4194,
  latitudeDelta: 0.01,
  longitudeDelta: 0.01,
};

/**
 * Header component
 */
const Header = memo(({ onClose, onConfirm, canConfirm, title }) => (
  <View style={styles.header}>
    <TouchableOpacity style={styles.headerButton} onPress={onClose}>
      <Ionicons name="close" size={24} color="#333" />
    </TouchableOpacity>
    <Text style={styles.headerTitle}>{title}</Text>
    <TouchableOpacity
      style={[styles.headerButton, !canConfirm && styles.headerButtonDisabled]}
      onPress={onConfirm}
      disabled={!canConfirm}
    >
      <Text style={[styles.confirmText, !canConfirm && styles.confirmTextDisabled]}>
        Done
      </Text>
    </TouchableOpacity>
  </View>
));

Header.displayName = 'Header';

/**
 * Search bar component
 */
const SearchBar = memo(({ value, onChangeText, onSubmit, loading }) => (
  <View style={styles.searchContainer}>
    <View style={styles.searchBar}>
      <Ionicons name="search" size={20} color="#8E8E93" />
      <TextInput
        style={styles.searchInput}
        placeholder="Search for a place"
        placeholderTextColor="#8E8E93"
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        returnKeyType="search"
      />
      {loading && <ActivityIndicator size="small" color={PRIMARY_COLOR} />}
      {value.length > 0 && !loading && (
        <TouchableOpacity onPress={() => onChangeText('')}>
          <Ionicons name="close-circle" size={20} color="#8E8E93" />
        </TouchableOpacity>
      )}
    </View>
  </View>
));

SearchBar.displayName = 'SearchBar';

/**
 * Location info bar
 */
const LocationInfo = memo(({ address, loading }) => (
  <View style={styles.locationInfo}>
    {loading ? (
      <ActivityIndicator size="small" color={PRIMARY_COLOR} />
    ) : (
      <>
        <Ionicons name="location" size={20} color={PRIMARY_COLOR} />
        <Text style={styles.locationText} numberOfLines={2}>
          {address || 'Drag the pin to select a location'}
        </Text>
      </>
    )}
  </View>
));

LocationInfo.displayName = 'LocationInfo';

/**
 * Map controls
 */
const MapControls = memo(({ onCenterUser, loading }) => (
  <View style={styles.mapControls}>
    <TouchableOpacity style={styles.controlButton} onPress={onCenterUser} disabled={loading}>
      {loading ? (
        <ActivityIndicator size="small" color={PRIMARY_COLOR} />
      ) : (
        <Ionicons name="locate" size={22} color={PRIMARY_COLOR} />
      )}
    </TouchableOpacity>
  </View>
));

MapControls.displayName = 'MapControls';

/**
 * LocationPicker component
 */
export const LocationPicker = ({
  visible,
  onClose,
  onSelect,
  initialLocation,
  title = 'Pick Location',
  primaryColor = PRIMARY_COLOR,
}) => {
  const mapRef = useRef(null);

  // State
  const [region, setRegion] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [address, setAddress] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [geocoding, setGeocoding] = useState(false);

  /**
   * Initialize with current or initial location
   */
  useEffect(() => {
    if (visible) {
      if (initialLocation?.lat && initialLocation?.lng) {
        const loc = {
          latitude: initialLocation.lat,
          longitude: initialLocation.lng,
        };
        setSelectedLocation(loc);
        setRegion({
          ...loc,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });
        setAddress(initialLocation.name || '');
        reverseGeocode(loc.latitude, loc.longitude);
      } else {
        getCurrentLocation();
      }
    }
  }, [visible, initialLocation]);

  /**
   * Get current location
   */
  const getCurrentLocation = useCallback(async () => {
    setLoading(true);
    try {
      const { foreground } = await LocationService.checkPermissions();
      
      if (foreground !== PermissionStatus.GRANTED) {
        await LocationService.requestPermissions();
      }

      const location = await LocationService.getCurrentLocation();
      const loc = {
        latitude: location.latitude,
        longitude: location.longitude,
      };

      setSelectedLocation(loc);
      setRegion(LocationService.getRegion(loc.latitude, loc.longitude, 0.5));
      reverseGeocode(loc.latitude, loc.longitude);

      mapRef.current?.animateToRegion(
        LocationService.getRegion(loc.latitude, loc.longitude, 0.5),
        500
      );
    } catch (error) {
      console.error('[LocationPicker] Error getting location:', error);
      // Fall back to default region
      setRegion(DEFAULT_REGION);
    }
    setLoading(false);
  }, []);

  /**
   * Reverse geocode coordinates
   */
  const reverseGeocode = useCallback(async (latitude, longitude) => {
    setGeocoding(true);
    try {
      const result = await LocationService.reverseGeocode(latitude, longitude);
      if (result) {
        setAddress(result.formattedAddress);
      }
    } catch (error) {
      console.error('[LocationPicker] Geocoding error:', error);
      setAddress('');
    }
    setGeocoding(false);
  }, []);

  /**
   * Handle map press
   */
  const handleMapPress = useCallback((event) => {
    const { coordinate } = event.nativeEvent;
    setSelectedLocation(coordinate);
    reverseGeocode(coordinate.latitude, coordinate.longitude);
  }, [reverseGeocode]);

  /**
   * Handle marker drag
   */
  const handleMarkerDrag = useCallback((event) => {
    const { coordinate } = event.nativeEvent;
    setSelectedLocation(coordinate);
  }, []);

  const handleMarkerDragEnd = useCallback((event) => {
    const { coordinate } = event.nativeEvent;
    setSelectedLocation(coordinate);
    reverseGeocode(coordinate.latitude, coordinate.longitude);
  }, [reverseGeocode]);

  /**
   * Handle search
   */
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;

    Keyboard.dismiss();
    setLoading(true);

    try {
      const result = await LocationService.geocodeAddress(searchQuery);
      if (result) {
        const loc = {
          latitude: result.latitude,
          longitude: result.longitude,
        };

        setSelectedLocation(loc);
        mapRef.current?.animateToRegion(
          LocationService.getRegion(loc.latitude, loc.longitude, 0.5),
          500
        );
        reverseGeocode(loc.latitude, loc.longitude);
      }
    } catch (error) {
      console.error('[LocationPicker] Search error:', error);
    }
    setLoading(false);
  }, [searchQuery, reverseGeocode]);

  /**
   * Handle confirm
   */
  const handleConfirm = useCallback(() => {
    if (selectedLocation) {
      onSelect?.({
        lat: selectedLocation.latitude,
        lng: selectedLocation.longitude,
        name: address,
      });
    }
    onClose?.();
  }, [selectedLocation, address, onSelect, onClose]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header
          onClose={onClose}
          onConfirm={handleConfirm}
          canConfirm={!!selectedLocation}
          title={title}
        />

        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmit={handleSearch}
          loading={loading}
        />

        <View style={styles.mapContainer}>
          {region && (
            <MapView
              ref={mapRef}
              style={styles.map}
              provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
              initialRegion={region}
              onPress={handleMapPress}
              showsUserLocation={true}
              showsMyLocationButton={false}
            >
              {selectedLocation && (
                <Marker
                  coordinate={selectedLocation}
                  draggable
                  onDrag={handleMarkerDrag}
                  onDragEnd={handleMarkerDragEnd}
                >
                  <View style={styles.marker}>
                    <View style={[styles.markerPin, { backgroundColor: primaryColor }]}>
                      <Ionicons name="location" size={20} color="#FFF" />
                    </View>
                    <View style={[styles.markerShadow, { backgroundColor: primaryColor }]} />
                  </View>
                </Marker>
              )}
            </MapView>
          )}

          <MapControls onCenterUser={getCurrentLocation} loading={loading} />

          {/* Crosshair when no location selected */}
          {!selectedLocation && (
            <View style={styles.crosshair}>
              <Ionicons name="add" size={32} color="#8E8E93" />
            </View>
          )}
        </View>

        <LocationInfo address={address} loading={geocoding} />
      </SafeAreaView>
    </Modal>
  );
};

/**
 * Compact location display component
 * Shows selected location with edit button
 */
export const LocationDisplay = memo(({
  location,
  onPress,
  onRemove,
  placeholder = 'Add location',
  primaryColor = PRIMARY_COLOR,
}) => {
  if (!location) {
    return (
      <TouchableOpacity style={styles.locationDisplay} onPress={onPress}>
        <Ionicons name="location-outline" size={20} color="#8E8E93" />
        <Text style={styles.locationPlaceholder}>{placeholder}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.locationDisplayFilled}>
      <TouchableOpacity style={styles.locationDisplayContent} onPress={onPress}>
        <Ionicons name="location" size={20} color={primaryColor} />
        <Text style={styles.locationDisplayText} numberOfLines={1}>
          {location.name || `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.locationRemove} onPress={onRemove}>
        <Ionicons name="close-circle" size={20} color="#8E8E93" />
      </TouchableOpacity>
    </View>
  );
});

LocationDisplay.displayName = 'LocationDisplay';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  headerButton: {
    padding: 8,
    minWidth: 60,
  },
  headerButtonDisabled: {
    opacity: 0.5,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  confirmText: {
    fontSize: 17,
    fontWeight: '600',
    color: PRIMARY_COLOR,
    textAlign: 'right',
  },
  confirmTextDisabled: {
    color: '#8E8E93',
  },

  // Search
  searchContainer: {
    padding: 12,
    backgroundColor: '#F2F2F7',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#1C1C1E',
  },

  // Map
  mapContainer: {
    flex: 1,
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  mapControls: {
    position: 'absolute',
    top: 16,
    right: 16,
  },
  controlButton: {
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
  crosshair: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -16,
    marginTop: -16,
    opacity: 0.5,
  },

  // Marker
  marker: {
    alignItems: 'center',
  },
  markerPin: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
  markerShadow: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: -5,
    opacity: 0.3,
  },

  // Location info
  locationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    minHeight: 60,
  },
  locationText: {
    flex: 1,
    fontSize: 15,
    color: '#1C1C1E',
    lineHeight: 20,
  },

  // Location display (compact)
  locationDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#F2F2F7',
    borderRadius: 8,
    gap: 8,
  },
  locationPlaceholder: {
    fontSize: 15,
    color: '#8E8E93',
  },
  locationDisplayFilled: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    borderRadius: 8,
  },
  locationDisplayContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 8,
  },
  locationDisplayText: {
    flex: 1,
    fontSize: 15,
    color: '#1C1C1E',
  },
  locationRemove: {
    padding: 12,
  },
});

export default LocationPicker;
