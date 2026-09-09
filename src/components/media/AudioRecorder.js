/**
 * AudioRecorder Component
 * 
 * Records audio with waveform visualization.
 * Uses expo-audio. expo-av carried no native module from SDK 57 onward.
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
import {
  useAudioRecorder,
  useAudioRecorderState,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
  IOSOutputFormat,
  AudioQuality,
} from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';

/**
 * Recording quality presets
 */
export const RecordingQuality = {
  LOW: {
    extension: '.m4a',
    sampleRate: 22050,
    numberOfChannels: 1,
    bitRate: 64000,
    android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
    ios: { outputFormat: IOSOutputFormat.MPEG4AAC, audioQuality: AudioQuality.LOW },
    web: { mimeType: 'audio/webm', bitsPerSecond: 64000 },
  },
  MEDIUM: {
    extension: '.m4a',
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 128000,
    android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
    ios: { outputFormat: IOSOutputFormat.MPEG4AAC, audioQuality: AudioQuality.MEDIUM },
    web: { mimeType: 'audio/webm', bitsPerSecond: 128000 },
  },
  HIGH: {
    extension: '.m4a',
    sampleRate: 44100,
    numberOfChannels: 2,
    bitRate: 256000,
    android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
    ios: { outputFormat: IOSOutputFormat.MPEG4AAC, audioQuality: AudioQuality.HIGH },
    web: { mimeType: 'audio/webm', bitsPerSecond: 256000 },
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
 * Polls the recorder and reports its state upward.
 *
 * This exists purely so the polling can be *unmounted*. `useAudioRecorderState` polls the
 * native recorder for as long as it is mounted, and expo-audio frees that native object
 * when recording ends and this screen closes. A poll landing in the gap throws
 *
 *   FunctionCallException: Calling the 'get' function has failed
 *   -> NotFoundException: Unable to find the native shared object associated with given
 *      JavaScript object
 *
 * as an uncaught promise rejection with no call site anywhere in our own code, which is
 * what made it look like a failure to save. It was not: it fired *after* the recording
 * had been written, the entry created and the media queued, every single time -- because
 * finishing a recording is precisely what tears this component down.
 *
 * Mounting the poll only while recording leaves nothing running to land late.
 */
const RecorderStatePoll = ({ recorder, onState }) => {
  const state = useAudioRecorderState(recorder, 100);

  useEffect(() => {
    onState(state);
  }, [state, onState]);

  return null;
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
  
  // expo-audio's recorder is a hook rather than an object you create on demand, so it is
  // declared here and driven from the handlers below. `useAudioRecorderState` polls it for
  // duration and metering, replacing the two intervals expo-av needed.
  const recorder = useAudioRecorder(RecordingQuality[quality] || RecordingQuality.MEDIUM);

  // Polling lives in a child so it can be unmounted the instant recording stops; see
  // RecorderStatePoll. Nothing below needs this state when idle -- the one effect that
  // reads it returns early unless isRecording.
  const [recorderState, setRecorderState] = useState(null);
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
   * Duration and metering, from the recorder's own reported state.
   *
   * expo-av needed two intervals here -- one polling getStatusAsync for the level meter,
   * another for elapsed time. useAudioRecorderState does both, so the intervals are gone
   * and with them the risk of one outliving the recording.
   */
  useEffect(() => {
    if (!recorderState?.isRecording) return;

    // Seconds -> milliseconds, so maxDuration and formatDuration are unchanged.
    const millis = (recorderState.currentTime || 0) * 1000;
    setDuration(millis);

    if (maxDuration && millis >= maxDuration) {
      stopRecording();
      return;
    }

    if (showWaveform && recorderState.metering !== undefined) {
      // Normalize metering (-160 to 0 dB) to a 0-1 range, as before.
      const normalized = Math.max(0, (recorderState.metering + 60) / 60);
      setMetering((prev) => [...prev.slice(-50), normalized]);
    }
  }, [recorderState, maxDuration, showWaveform]);

  /**
   * Request audio recording permissions
   */
  const requestPermissions = async () => {
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      setPermissionGranted(granted);

      if (granted) {
        // The iOS-suffixed names are gone in expo-audio; these apply to both platforms.
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      }
    } catch (error) {
      console.error('[AudioRecorder] Permission error:', error);
    }
  };

  /**
   * Clean up resources
   */
  const cleanup = async () => {
    // No intervals to clear any more -- useAudioRecorderState owns the polling, and the
    // recorder is released with the component.
    if (recorder?.isRecording) {
      try {
        await recorder.stop();
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
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });

      // Required before every recording, not just the first. expo-audio invalidates the
      // recorder on stop() -- without this, record() appears to work and the counter runs,
      // but the file it names is never a valid recording and the copy that follows fails
      // with E_FILE_NOT_COPIED. expo-av had no equivalent step.
      await recorder.prepareToRecordAsync();
      recorder.record();

      setRecordingState(RecordingState.RECORDING);
      setMetering([]);

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
    try {
      recorder.pause();
      setRecordingState(RecordingState.PAUSED);
      console.log('[AudioRecorder] Recording paused');
    } catch (error) {
      console.error('[AudioRecorder] Pause error:', error);
    }
  };

  /**
   * Resume recording
   */
  const resumeRecording = async () => {
    try {
      recorder.record();
      setRecordingState(RecordingState.RECORDING);
      console.log('[AudioRecorder] Recording resumed');
    } catch (error) {
      console.error('[AudioRecorder] Resume error:', error);
    }
  };

  /**
   * Stop recording and save
   */
  const stopRecording = async () => {
    try {
      await recorder.stop();

      // Read the uri after stop resolves -- it is null until the file is finalised.
      const uri = recorder.uri;
      const finalDuration = duration;

      await setAudioModeAsync({ allowsRecording: false });

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
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });

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
      {/* Renders nothing; polls the recorder only while there is one to poll. */}
      {(recordingState === RecordingState.RECORDING ||
        recordingState === RecordingState.PAUSED) && (
        <RecorderStatePoll recorder={recorder} onState={setRecorderState} />
      )}

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
