/**
 * AudioRecorder Component - Web Version
 * 
 * Web-compatible stub. Audio recording requires native APIs.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export const RecordingQuality = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
};

export const RecordingState = {
  IDLE: 'idle',
  RECORDING: 'recording',
  PAUSED: 'paused',
};

export const AudioRecorder = ({
  onRecordingComplete,
  onCancel,
  primaryColor = '#FF3B30',
  style,
}) => {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.iconContainer}>
        <Ionicons name="mic-off-outline" size={48} color="#C7C7CC" />
      </View>
      <Text style={styles.title}>Audio Recording Not Available</Text>
      <Text style={styles.subtitle}>
        Audio recording is only available on iOS and Android devices.
      </Text>
      {onCancel && (
        <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F5F7',
    borderRadius: 12,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E5E5EA',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 20,
  },
  cancelButton: {
    marginTop: 20,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  cancelText: {
    fontSize: 16,
    color: '#007AFF',
  },
});

export default AudioRecorder;
