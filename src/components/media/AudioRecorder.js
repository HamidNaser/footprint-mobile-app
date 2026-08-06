/**
 * AudioRecorder Component
 * 
 * Records audio with waveform visualization.
 * Uses expo-av for audio recording.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';

/**
 * Recording quality presets
 */
export const RecordingQuality = {
  LOW: {
    android: {
      extension: '.m4a',
      outputFormat: Audio.AndroidOutputFormat.MPEG_4,
      audioEncoder: Audio.AndroidAudioEncoder.AAC,
      sampleRate: 22050,
      numberOfChannels: 1,
      bitRate: 64000,
    },
    ios: {
      extension: '.m4a',
      outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
      audioQuality: Audio.IOSAudioQuality.LOW,
      sampleRate: 22050,
      numberOfChannels: 1,
      bitRate: 64000,
    },
    web: {
      mimeType: 'audio/webm',
      bitsPerSecond: 64000,
    },
  },
  MEDIUM: {
    android: {
      extension: '.m4a',
      outputFormat: Audio.AndroidOutputFormat.MPEG_4,
      audioEncoder: Audio.AndroidAudioEncoder.AAC,
      sampleRate: 44100,
      numberOfChannels: 1,
      bitRate: 128000,
    },
    ios: {
      extension: '.m4a',
      outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
      audioQuality: Audio.IOSAudioQuality.MEDIUM,
      sampleRate: 44100,
      numberOfChannels: 1,
      bitRate: 128000,
    },
    web: {
      mimeType: 'audio/webm',
      bitsPerSecond: 128000,
    },
  },
  HIGH: {
    android: {
      extension: '.m4a',
      outputFormat: Audio.AndroidOutputFormat.MPEG_4,
      audioEncoder: Audio.AndroidAudioEncoder.AAC,
      sampleRate: 44100,
      numberOfChannels: 2,
      bitRate: 256000,
    },
    ios: {
      extension: '.m4a',
      outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
      audioQuality: Audio.IOSAudioQuality.HIGH,
      sampleRate: 44100,
      numberOfChannels: 2,
      bitRate: 256000,
    },
    web: {
      mimeType: 'audio/webm',
      bitsPerSecond: 256000,
    },
  },
};

/**
 * Recording states
 */
const RecordingState = {
  IDLE: 'idle',
  RECORDING: 'recording',
  PAUSED: 'paused',
};

/**
 * Format duration in mm:ss
 */
const formatDuration = (millis) => {
  const totalSeconds = Math.floor(millis / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

/**
 * AudioRecorder component
 */
export const AudioRecorder = ({
  onRecordingComplete,
  onRecordingStart,
  onRecordingCancel,
  quality = 'MEDIUM',
  maxDuration = 300000, // 5 minutes default
  showWaveform = true,
  primaryColor = '#007AFF',
  // Hold the button to record, release to stop -- a walkie-talkie, not a
  // two-tap transport. Capturing a thought while walking should cost one
  // gesture, and releasing is a natural full stop.
  holdToRecord = true,
  style,
}) => {
  const [recordingState, setRecordingState] = useState(RecordingState.IDLE);
  const [duration, setDuration] = useState(0);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [metering, setMetering] = useState([]);
  
  const recordingRef = useRef(null);
  const durationIntervalRef = useRef(null);
  const meteringIntervalRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Request permissions on mount
  useEffect(() => {
    requestPermissions();
    return () => {
      cleanup();
    };
  }, []);

  // Pulse animation for recording indicator
  useEffect(() => {
    if (recordingState === RecordingState.RECORDING) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [recordingState]);

  /**
   * Request audio recording permissions
   */
  const requestPermissions = async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      setPermissionGranted(granted);
      
      if (granted) {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
      }
    } catch (error) {
      console.error('[AudioRecorder] Permission error:', error);
    }
  };

  /**
   * Clean up resources
   */
  const cleanup = async () => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
    }
    if (meteringIntervalRef.current) {
      clearInterval(meteringIntervalRef.current);
    }
    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  };

  /**
   * Start recording
   */
  const startRecording = async () => {
    try {
      // Configure audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Get quality settings
      const qualitySettings = RecordingQuality[quality] || RecordingQuality.MEDIUM;

      // Create recording
      const { recording } = await Audio.Recording.createAsync(
        qualitySettings,
        (status) => {
          if (status.isRecording) {
            setDuration(status.durationMillis);
            
            // Check max duration
            if (maxDuration && status.durationMillis >= maxDuration) {
              stopRecording();
            }
          }
        },
        100 // Update every 100ms
      );

      recordingRef.current = recording;
      setRecordingState(RecordingState.RECORDING);
      setMetering([]);

      // Start metering for waveform
      if (showWaveform) {
        meteringIntervalRef.current = setInterval(async () => {
          if (recordingRef.current) {
            const status = await recordingRef.current.getStatusAsync();
            if (status.isRecording && status.metering !== undefined) {
              // Normalize metering (-160 to 0 dB) to 0-1 range
              const normalized = Math.max(0, (status.metering + 60) / 60);
              setMetering(prev => [...prev.slice(-50), normalized]);
            }
          }
        }, 100);
      }

      onRecordingStart?.();
      console.log('[AudioRecorder] Recording started');
    } catch (error) {
      console.error('[AudioRecorder] Start recording error:', error);
    }
  };

  /**
   * Pause recording
   */
  const pauseRecording = async () => {
    if (!recordingRef.current) return;

    try {
      await recordingRef.current.pauseAsync();
      setRecordingState(RecordingState.PAUSED);
      
      if (meteringIntervalRef.current) {
        clearInterval(meteringIntervalRef.current);
      }
      
      console.log('[AudioRecorder] Recording paused');
    } catch (error) {
      console.error('[AudioRecorder] Pause error:', error);
    }
  };

  /**
   * Resume recording
   */
  const resumeRecording = async () => {
    if (!recordingRef.current) return;

    try {
      await recordingRef.current.startAsync();
      setRecordingState(RecordingState.RECORDING);
      
      // Resume metering
      if (showWaveform) {
        meteringIntervalRef.current = setInterval(async () => {
          if (recordingRef.current) {
            const status = await recordingRef.current.getStatusAsync();
            if (status.isRecording && status.metering !== undefined) {
              const normalized = Math.max(0, (status.metering + 60) / 60);
              setMetering(prev => [...prev.slice(-50), normalized]);
            }
          }
        }, 100);
      }
      
      console.log('[AudioRecorder] Recording resumed');
    } catch (error) {
      console.error('[AudioRecorder] Resume error:', error);
    }
  };

  /**
   * Stop recording and save
   */
  const stopRecording = async () => {
    if (!recordingRef.current) return;

    try {
      if (meteringIntervalRef.current) {
        clearInterval(meteringIntervalRef.current);
      }

      await recordingRef.current.stopAndUnloadAsync();
      
      const uri = recordingRef.current.getURI();
      const finalDuration = duration;
      
      // Reset audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });

      recordingRef.current = null;
      setRecordingState(RecordingState.IDLE);
      setDuration(0);
      setMetering([]);

      console.log('[AudioRecorder] Recording saved:', uri);

      onRecordingComplete?.({
        uri,
        duration: finalDuration,
        type: 'audio',
        mimeType: 'audio/m4a',
      });
    } catch (error) {
      console.error('[AudioRecorder] Stop recording error:', error);
    }
  };

  /**
   * Cancel recording
   */
  const cancelRecording = async () => {
    if (!recordingRef.current) return;

    try {
      if (meteringIntervalRef.current) {
        clearInterval(meteringIntervalRef.current);
      }

      await recordingRef.current.stopAndUnloadAsync();
      
      // Reset audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });

      recordingRef.current = null;
      setRecordingState(RecordingState.IDLE);
      setDuration(0);
      setMetering([]);

      onRecordingCancel?.();
      console.log('[AudioRecorder] Recording cancelled');
    } catch (error) {
      console.error('[AudioRecorder] Cancel recording error:', error);
    }
  };

  /**
   * Handle main button press
   */
  const handleMainButtonPress = () => {
    switch (recordingState) {
      case RecordingState.IDLE:
        startRecording();
        break;
      case RecordingState.RECORDING:
        stopRecording();
        break;
      case RecordingState.PAUSED:
        resumeRecording();
        break;
    }
  };

  /**
   * Press-and-hold handlers.
   *
   * A very short hold is almost always an accidental brush rather than an
   * intended recording, so releasing under MIN_HOLD_MS discards instead of
   * saving a fragment the user has to go and delete.
   */
  const MIN_HOLD_MS = 400;
  const holdStartedAtRef = useRef(0);

  const handleHoldStart = () => {
    if (recordingState !== RecordingState.IDLE) return;
    holdStartedAtRef.current = Date.now();
    startRecording();
  };

  const handleHoldEnd = () => {
    if (recordingState !== RecordingState.RECORDING) return;
    const held = Date.now() - holdStartedAtRef.current;
    if (held < MIN_HOLD_MS) {
      cancelRecording();
      return;
    }
    stopRecording();
  };

  // Render waveform visualization
  const renderWaveform = () => {
    if (!showWaveform) return null;

    const bars = metering.length > 0 ? metering : Array(20).fill(0.1);

    return (
      <View style={styles.waveformContainer}>
        {bars.map((level, index) => (
          <View
            key={index}
            style={[
              styles.waveformBar,
              {
                height: Math.max(4, level * 40),
                backgroundColor: recordingState === RecordingState.RECORDING
                  ? primaryColor
                  : '#CCC',
              },
            ]}
          />
        ))}
      </View>
    );
  };

  // Permission not granted
  if (!permissionGranted) {
    return (
      <View style={[styles.container, style]}>
        <TouchableOpacity
          style={styles.permissionButton}
          onPress={requestPermissions}
        >
          <Ionicons name="mic-off-outline" size={32} color="#999" />
          <Text style={styles.permissionText}>
            Tap to enable microphone access
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      {/* Waveform */}
      {renderWaveform()}

      {/* Duration display */}
      <Text style={[styles.duration, { color: primaryColor }]}>
        {formatDuration(duration)}
        {maxDuration && (
          <Text style={styles.maxDuration}> / {formatDuration(maxDuration)}</Text>
        )}
      </Text>

      {/* Controls */}
      <View style={styles.controls}>
        {/* Cancel button (when recording) */}
        {recordingState !== RecordingState.IDLE && (
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={cancelRecording}
          >
            <Ionicons name="close" size={24} color="#FF3B30" />
          </TouchableOpacity>
        )}

        {/* Main record/stop button */}
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <TouchableOpacity
            style={[
              styles.mainButton,
              recordingState === RecordingState.RECORDING && {
                backgroundColor: '#FF3B30',
              },
              recordingState === RecordingState.IDLE && {
                backgroundColor: primaryColor,
              },
              recordingState === RecordingState.PAUSED && {
                backgroundColor: primaryColor,
              },
            ]}
            // In hold mode the press/release pair drives recording; onPress is
            // left unbound so a stray tap cannot start an unattended recording.
            onPressIn={holdToRecord ? handleHoldStart : undefined}
            onPressOut={holdToRecord ? handleHoldEnd : undefined}
            onPress={holdToRecord ? undefined : handleMainButtonPress}
            delayPressOut={0}
          >
            {recordingState === RecordingState.IDLE && (
              <Ionicons name="mic" size={32} color="#FFF" />
            )}
            {recordingState === RecordingState.RECORDING && (
              <Ionicons
                name={holdToRecord ? 'mic' : 'stop'}
                size={holdToRecord ? 32 : 28}
                color="#FFF"
              />
            )}
            {recordingState === RecordingState.PAUSED && (
              <Ionicons name="play" size={28} color="#FFF" />
            )}
          </TouchableOpacity>
        </Animated.View>

        {/* Pause button (when recording). Meaningless while holding -- you
            cannot pause and keep your finger down -- so hidden in hold mode. */}
        {recordingState === RecordingState.RECORDING && !holdToRecord && (
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={pauseRecording}
          >
            <Ionicons name="pause" size={24} color={primaryColor} />
          </TouchableOpacity>
        )}

        {/* Stop button (when paused) */}
        {recordingState === RecordingState.PAUSED && (
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={stopRecording}
          >
            <Ionicons name="checkmark" size={24} color="#34C759" />
          </TouchableOpacity>
        )}
      </View>

      {/* Status text */}
      <Text style={styles.statusText}>
        {recordingState === RecordingState.IDLE &&
          (holdToRecord ? 'Hold to record' : 'Tap to start recording')}
        {recordingState === RecordingState.RECORDING &&
          (holdToRecord ? 'Recording — release to stop' : 'Recording...')}
        {recordingState === RecordingState.PAUSED && 'Paused - tap to resume'}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: 20,
  },
  permissionButton: {
    alignItems: 'center',
    padding: 20,
  },
  permissionText: {
    marginTop: 10,
    color: '#999',
    fontSize: 14,
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
    marginBottom: 20,
  },
  waveformBar: {
    width: 3,
    marginHorizontal: 1,
    borderRadius: 2,
    backgroundColor: '#007AFF',
  },
  duration: {
    fontSize: 36,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    marginBottom: 20,
  },
  maxDuration: {
    fontSize: 18,
    color: '#999',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  mainButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  secondaryButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    marginTop: 16,
    fontSize: 14,
    color: '#8E8E93',
  },
});

export default AudioRecorder;
