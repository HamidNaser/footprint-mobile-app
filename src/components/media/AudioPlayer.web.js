/**
 * AudioPlayer Component - Web Version
 * 
 * Web-compatible stub. Native audio playback requires expo-av.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export const PlaybackState = {
  IDLE: 'idle',
  LOADING: 'loading',
  PLAYING: 'playing',
  PAUSED: 'paused',
  ERROR: 'error',
};

export const AudioPlayer = ({
  uri,
  duration,
  style,
  primaryColor = '#007AFF',
}) => {
  return (
    <View style={[styles.container, style]}>
      <View style={[styles.iconContainer, { backgroundColor: primaryColor + '20' }]}>
        <Ionicons name="musical-notes-outline" size={24} color={primaryColor} />
      </View>
      <View style={styles.info}>
        <Text style={styles.text}>Audio Playback</Text>
        <Text style={styles.subtitle}>Not available on web</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#F5F5F7',
    borderRadius: 8,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  info: {
    flex: 1,
  },
  text: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1C1C1E',
  },
  subtitle: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
});

export default AudioPlayer;
