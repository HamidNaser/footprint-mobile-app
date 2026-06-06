/**
 * LocationPicker Component - Web Version
 * 
 * Web-compatible stub for LocationPicker.
 * Maps are not supported on web, so we provide a simple text-based location input.
 */

import React, { useState, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const PRIMARY_COLOR = '#4361ee';

/**
 * LocationDisplay Component - Shows selected location
 */
export const LocationDisplay = memo(({ location, onPress, onRemove, compact = false }) => {
  if (!location) return null;

  const displayName = location.name || location.address || 
    `${location.lat?.toFixed(4)}, ${location.lng?.toFixed(4)}`;

  if (compact) {
    return (
      <TouchableOpacity style={styles.compactLocation} onPress={onPress}>
        <Ionicons name="location" size={16} color={PRIMARY_COLOR} />
        <Text style={styles.compactLocationText} numberOfLines={1}>
          {displayName}
        </Text>
        {onRemove && (
          <TouchableOpacity onPress={onRemove} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close-circle" size={18} color="#8E8E93" />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={styles.locationDisplay} onPress={onPress}>
      <View style={styles.locationIconContainer}>
        <Ionicons name="location" size={20} color={PRIMARY_COLOR} />
      </View>
      <View style={styles.locationInfo}>
        <Text style={styles.locationName} numberOfLines={1}>
          {displayName}
        </Text>
        {location.address && location.name && (
          <Text style={styles.locationAddress} numberOfLines={1}>
            {location.address}
          </Text>
        )}
      </View>
      {onRemove && (
        <TouchableOpacity style={styles.removeButton} onPress={onRemove}>
          <Ionicons name="close-circle" size={22} color="#8E8E93" />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
});

/**
 * LocationPicker Component - Web Version
 * Shows a simple text input for location since maps aren't supported on web
 */
export const LocationPicker = ({
  visible,
  onClose,
  onSelect,
  initialLocation = null,
  primaryColor = PRIMARY_COLOR,
}) => {
  const [locationName, setLocationName] = useState(initialLocation?.name || '');
  const [latitude, setLatitude] = useState(initialLocation?.lat?.toString() || '');
  const [longitude, setLongitude] = useState(initialLocation?.lng?.toString() || '');

  const handleConfirm = () => {
    if (!locationName.trim()) {
      Alert.alert('Location Required', 'Please enter a location name.');
      return;
    }

    const lat = parseFloat(latitude) || 0;
    const lng = parseFloat(longitude) || 0;

    onSelect({
      lat,
      lng,
      name: locationName.trim(),
      address: locationName.trim(),
    });
    onClose();
  };

  const handleClear = () => {
    setLocationName('');
    setLatitude('');
    setLongitude('');
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerButton} onPress={onClose}>
            <Ionicons name="close" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add Location</Text>
          <TouchableOpacity 
            style={[styles.headerButton, styles.confirmButton, { backgroundColor: primaryColor }]} 
            onPress={handleConfirm}
          >
            <Text style={styles.confirmText}>Done</Text>
          </TouchableOpacity>
        </View>

        {/* Web Notice */}
        <View style={styles.webNotice}>
          <Ionicons name="information-circle" size={20} color="#FF9500" />
          <Text style={styles.webNoticeText}>
            Map view is not available on web. Please enter location details manually.
          </Text>
        </View>

        {/* Location Input Form */}
        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Location Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., San Francisco, CA"
              value={locationName}
              onChangeText={setLocationName}
              placeholderTextColor="#999"
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
              <Text style={styles.label}>Latitude (optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="37.7749"
                value={latitude}
                onChangeText={setLatitude}
                keyboardType="numeric"
                placeholderTextColor="#999"
              />
            </View>
            <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
              <Text style={styles.label}>Longitude (optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="-122.4194"
                value={longitude}
                onChangeText={setLongitude}
                keyboardType="numeric"
                placeholderTextColor="#999"
              />
            </View>
          </View>

          {(locationName || latitude || longitude) && (
            <TouchableOpacity style={styles.clearButton} onPress={handleClear}>
              <Ionicons name="trash-outline" size={18} color="#FF3B30" />
              <Text style={styles.clearButtonText}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    </Modal>
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
  },
  headerButton: {
    padding: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
  },
  confirmButton: {
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  confirmText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
  webNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF9E6',
    padding: 12,
    margin: 16,
    borderRadius: 8,
    gap: 8,
  },
  webNoticeText: {
    flex: 1,
    fontSize: 14,
    color: '#996600',
  },
  form: {
    padding: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#F9F9F9',
  },
  row: {
    flexDirection: 'row',
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 8,
    gap: 8,
  },
  clearButtonText: {
    fontSize: 15,
    color: '#FF3B30',
  },

  // LocationDisplay styles
  locationDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F7',
    borderRadius: 12,
    padding: 12,
    marginVertical: 8,
  },
  locationIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: PRIMARY_COLOR + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  locationInfo: {
    flex: 1,
  },
  locationName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1C1C1E',
  },
  locationAddress: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  removeButton: {
    padding: 4,
  },
  compactLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PRIMARY_COLOR + '15',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  compactLocationText: {
    fontSize: 13,
    color: PRIMARY_COLOR,
    maxWidth: 150,
  },
});

export default LocationPicker;
