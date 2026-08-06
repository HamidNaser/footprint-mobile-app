/**
 * CameraCapture Component
 * 
 * Full-screen camera for capturing photos and videos.
 * Uses expo-camera for camera access.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  Platform,
  StatusBar,
} from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * Camera modes
 */
export const CameraMode = {
  PHOTO: 'photo',
  VIDEO: 'video',
};

/**
 * Flash modes
 */
export const FlashMode = {
  OFF: 'off',
  ON: 'on',
  AUTO: 'auto',
};

/**
 * Format recording duration
 */
const formatDuration = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

/**
 * CameraCapture component
 */
export const CameraCapture = ({
  onCapture,
  onClose,
  onDone,
  captureCount = 0,
  initialMode = CameraMode.PHOTO,
  allowModeSwitch = true,
  allowFlash = true,
  maxVideoDuration = 60, // seconds
  videoQuality = '720p',
  style,
}) => {
  const [permission, requestPermission] = useCameraPermissions();
  // Video records audio, which is a separate grant from the camera itself.
  // Without it recordAsync fails on iOS rather than silently producing a
  // silent clip.
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [mode, setMode] = useState(initialMode);
  const [facing, setFacing] = useState('back');
  const [flash, setFlash] = useState(FlashMode.OFF);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);

  const cameraRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const recordedSecondsRef = useRef(0);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const flashAnim = useRef(new Animated.Value(0)).current;

  // Pulse animation for recording
  useEffect(() => {
    if (isRecording) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
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
  }, [isRecording]);

  // Recording timer
  useEffect(() => {
    if (isRecording) {
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => {
          const next = prev >= maxVideoDuration - 1 ? prev : prev + 1;
          // Mirrored into a ref because startRecording's closure captured
          // recordingDuration as 0 and reported every clip as 0ms long.
          recordedSecondsRef.current = next;
          if (prev >= maxVideoDuration - 1) stopRecording();
          return next;
        });
      }, 1000);
    } else {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      setRecordingDuration(0);
    }

    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, [isRecording]);

  /**
   * Toggle camera facing
   */
  const toggleFacing = () => {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  };

  /**
   * Cycle flash mode
   */
  const cycleFlash = () => {
    setFlash(current => {
      switch (current) {
        case FlashMode.OFF:
          return FlashMode.ON;
        case FlashMode.ON:
          return FlashMode.AUTO;
        case FlashMode.AUTO:
          return FlashMode.OFF;
        default:
          return FlashMode.OFF;
      }
    });
  };

  /**
   * Get flash icon
   */
  const getFlashIcon = () => {
    switch (flash) {
      case FlashMode.ON:
        return 'flash';
      case FlashMode.AUTO:
        return 'flash-outline';
      case FlashMode.OFF:
      default:
        return 'flash-off';
    }
  };

  /**
   * Switch camera mode
   */
  const switchMode = (newMode) => {
    if (isRecording) return;
    setMode(newMode);
  };

  /**
   * Take a photo
   */
  const takePhoto = async () => {
    if (!cameraRef.current || isCapturing) return;

    try {
      setIsCapturing(true);

      // Flash animation
      if (flash !== FlashMode.OFF) {
        Animated.sequence([
          Animated.timing(flashAnim, {
            toValue: 1,
            duration: 50,
            useNativeDriver: true,
          }),
          Animated.timing(flashAnim, {
            toValue: 0,
            duration: 100,
            useNativeDriver: true,
          }),
        ]).start();
      }

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        exif: true,
        skipProcessing: false,
      });

      console.log('[CameraCapture] Photo captured:', photo.uri);

      onCapture?.({
        uri: photo.uri,
        type: 'photo',
        width: photo.width,
        height: photo.height,
        exif: photo.exif,
      });
    } catch (error) {
      console.error('[CameraCapture] Photo capture error:', error);
    } finally {
      setIsCapturing(false);
    }
  };

  /**
   * Start video recording
   */
  const startRecording = async () => {
    if (!cameraRef.current || isRecording) return;

    // Video captures audio, which needs its own grant. Ask before rolling
    // rather than letting recordAsync reject with an opaque error.
    if (!micPermission?.granted) {
      const result = await requestMicPermission();
      if (!result?.granted) {
        console.warn('[CameraCapture] Microphone denied; cannot record video');
        return;
      }
    }

    try {
      recordedSecondsRef.current = 0;
      setIsRecording(true);

      const video = await cameraRef.current.recordAsync({
        maxDuration: maxVideoDuration,
        quality: videoQuality,
      });

      // recordAsync resolves only once recording stops, so read the ref rather
      // than the stale `recordingDuration` this closure captured at start.
      const seconds = recordedSecondsRef.current;
      console.log('[CameraCapture] Video recorded:', video?.uri, seconds + 's');

      if (video?.uri) {
        onCapture?.({
          uri: video.uri,
          type: 'video',
          duration: seconds * 1000, // ms
        });
      }
    } catch (error) {
      console.error('[CameraCapture] Video recording error:', error);
    } finally {
      setIsRecording(false);
    }
  };

  /**
   * Stop video recording
   */
  const stopRecording = () => {
    if (!cameraRef.current || !isRecording) return;
    cameraRef.current.stopRecording();
  };

  /**
   * Handle capture button press
   */
  const handleCapturePress = () => {
    if (mode === CameraMode.PHOTO) {
      takePhoto();
    } else {
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    }
  };

  // Permission loading
  if (!permission) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.permissionText}>Loading camera...</Text>
      </View>
    );
  }

  // Permission not granted
  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.centered, style]}>
        <Ionicons name="camera-outline" size={64} color="#999" />
        <Text style={styles.permissionText}>Camera access is required</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.closeButtonPermission} onPress={onClose}>
          <Text style={styles.closeButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <StatusBar hidden />
      
      {/* Camera View */}
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        flash={flash}
        // Required: CameraView defaults to "picture", and recordAsync() fails
        // outright on a picture-mode camera. This is why video never worked.
        mode={mode === CameraMode.VIDEO ? 'video' : 'picture'}
        enableTorch={flash === FlashMode.ON}
      >
        {/* Flash overlay */}
        <Animated.View
          style={[
            styles.flashOverlay,
            { opacity: flashAnim },
          ]}
          pointerEvents="none"
        />

        {/* Top controls */}
        <View style={styles.topControls}>
          {/* Close button */}
          <TouchableOpacity style={styles.topButton} onPress={onClose}>
            <Ionicons name="close" size={28} color="#FFF" />
          </TouchableOpacity>

          {/* Flash toggle */}
          {allowFlash && mode === CameraMode.PHOTO && (
            <TouchableOpacity style={styles.topButton} onPress={cycleFlash}>
              <Ionicons name={getFlashIcon()} size={24} color="#FFF" />
            </TouchableOpacity>
          )}

          {/* Done. The camera stays open after each shot so captures can be
              taken back to back; this is how you leave once finished. */}
          {onDone && captureCount > 0 && !isRecording && (
            <TouchableOpacity style={styles.doneButton} onPress={onDone}>
              <Text style={styles.doneCount}>{captureCount}</Text>
              <Text style={styles.doneLabel}>Done</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Recording indicator */}
        {isRecording && (
          <View style={styles.recordingIndicator}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingTime}>
              {formatDuration(recordingDuration)}
            </Text>
          </View>
        )}

        {/* Bottom controls */}
        <View style={styles.bottomControls}>
          {/* Mode switcher */}
          {allowModeSwitch && (
            <View style={styles.modeSwitcher}>
              <TouchableOpacity
                style={[
                  styles.modeButton,
                  mode === CameraMode.PHOTO && styles.modeButtonActive,
                ]}
                onPress={() => switchMode(CameraMode.PHOTO)}
                disabled={isRecording}
              >
                <Text style={[
                  styles.modeText,
                  mode === CameraMode.PHOTO && styles.modeTextActive,
                ]}>
                  PHOTO
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modeButton,
                  mode === CameraMode.VIDEO && styles.modeButtonActive,
                ]}
                onPress={() => switchMode(CameraMode.VIDEO)}
                disabled={isRecording}
              >
                <Text style={[
                  styles.modeText,
                  mode === CameraMode.VIDEO && styles.modeTextActive,
                ]}>
                  VIDEO
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Capture controls */}
          <View style={styles.captureControls}>
            {/* Spacer */}
            <View style={styles.sideButton} />

            {/* Capture button */}
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <TouchableOpacity
                style={[
                  styles.captureButton,
                  mode === CameraMode.VIDEO && styles.captureButtonVideo,
                  isRecording && styles.captureButtonRecording,
                ]}
                onPress={handleCapturePress}
                disabled={isCapturing}
              >
                {mode === CameraMode.PHOTO ? (
                  <View style={styles.captureButtonInner} />
                ) : (
                  <View style={[
                    styles.captureButtonInner,
                    isRecording && styles.captureButtonInnerRecording,
                  ]} />
                )}
              </TouchableOpacity>
            </Animated.View>

            {/* Flip camera button */}
            <TouchableOpacity
              style={styles.sideButton}
              onPress={toggleFacing}
              disabled={isRecording}
            >
              <Ionicons
                name="camera-reverse-outline"
                size={28}
                color="#FFF"
              />
            </TouchableOpacity>
          </View>
        </View>
      </CameraView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  camera: {
    flex: 1,
  },
  flashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFF',
  },
  
  // Top controls
  topControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingHorizontal: 20,
  },
  topButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  doneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.92)',
  },

  doneCount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#000',
  },

  doneLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
  },

  // Recording indicator
  recordingIndicator: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 100 : 70,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
    marginRight: 8,
  },
  recordingTime: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },

  // Bottom controls
  bottomControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
  },
  modeSwitcher: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 20,
  },
  modeButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  modeButtonActive: {
    // Active mode style
  },
  modeText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1,
  },
  modeTextActive: {
    color: '#FFF',
  },
  captureControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  sideButton: {
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#FFF',
  },
  captureButtonVideo: {
    borderColor: '#FF3B30',
  },
  captureButtonRecording: {
    backgroundColor: 'rgba(255,59,48,0.3)',
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFF',
  },
  captureButtonInnerRecording: {
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: '#FF3B30',
  },

  // Permission screen
  permissionText: {
    color: '#999',
    fontSize: 16,
    marginTop: 16,
    marginBottom: 24,
    textAlign: 'center',
  },
  permissionButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  permissionButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  closeButtonPermission: {
    paddingVertical: 12,
  },
  closeButtonText: {
    color: '#007AFF',
    fontSize: 16,
  },
});

export default CameraCapture;
