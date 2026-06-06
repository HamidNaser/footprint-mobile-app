/**
 * CameraCapture Component - Web Version
 * 
 * Web-compatible stub. Camera requires native APIs.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export const CameraMode = {
  PHOTO: 'photo',
  VIDEO: 'video',
};

export const FlashMode = {
  OFF: 'off',
  ON: 'on',
  AUTO: 'auto',
};

export const CameraCapture = ({
  onCapture,
  onClose,
  mode = CameraMode.PHOTO,
  allowModeSwitch = true,
  primaryColor = '#007AFF',
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="camera-outline" size={64} color="#C7C7CC" />
        </View>
        <Text style={styles.title}>Camera Not Available</Text>
        <Text style={styles.subtitle}>
          Camera functionality is only available on iOS and Android devices.
        </Text>
        {onClose && (
          <TouchableOpacity 
            style={[styles.closeButton, { backgroundColor: primaryColor }]} 
            onPress={onClose}
          >
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
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
    backgroundColor: '#1C1C1E',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 24,
  },
  closeButton: {
    marginTop: 32,
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 25,
  },
  closeText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFF',
  },
});

export default CameraCapture;
