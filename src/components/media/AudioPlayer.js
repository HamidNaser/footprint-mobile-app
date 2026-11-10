/**
 * AudioPlayer Component
 * 
 * Plays audio with waveform visualization and seek controls.
 * Uses expo-audio for playback. expo-av carried no native module from SDK 57 onward.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  PanResponder,
  Platform,
} from 'react-native';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import WaveformStrip, { BARS_COMPACT, BARS_FULL } from './WaveformStrip';

/**
 * Format duration in mm:ss
 */
const formatDuration = (millis) => {
  if (!millis || isNaN(millis)) return '00:00';
  const totalSeconds = Math.floor(millis / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

/**
 * Playback states
 */
const PlaybackState = {
  LOADING: 'loading',
  READY: 'ready',
  PLAYING: 'playing',
  PAUSED: 'paused',
  ERROR: 'error',
};

/**
 * AudioPlayer component
 */
export const AudioPlayer = ({
  uri,
  duration: initialDuration,
  // The clip's recorded levels. Callers (`JournalEntryDetail`, `InterviewModeScreen`) have
  // always passed this; until 013 T054 it was never declared here, so the strip drew invented
  // bars even for a clip that had real ones.
  waveformData,
  onPlaybackStart,
  onPlaybackEnd,
  onError,
  autoPlay = false,
  showWaveform = true,
  showDuration = true,
  primaryColor = '#007AFF',
  compact = false,
  style,
}) => {
  const [playbackState, setPlaybackState] = useState(PlaybackState.LOADING);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(initialDuration || 0);
  const [isSeeking, setIsSeeking] = useState(false);

  const soundRef = useRef(null);
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Load audio on mount
  useEffect(() => {
    loadAudio();
    return () => {
      unloadAudio();
    };
  }, [uri]);

  // Update progress animation
  useEffect(() => {
    if (!isSeeking && duration > 0) {
      const progress = position / duration;
      Animated.timing(progressAnim, {
        toValue: progress,
        duration: 100,
        useNativeDriver: false,
      }).start();
    }
  }, [position, duration, isSeeking]);

  /**
   * Load audio file
   */
  const loadAudio = async () => {
    if (!uri) {
      setPlaybackState(PlaybackState.ERROR);
      return;
    }

    try {
      setPlaybackState(PlaybackState.LOADING);

      // expo-audio renamed these: the iOS suffixes are gone because the options apply to
      // both platforms now.
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
      });

      if (soundRef.current) {
        soundRef.current.remove();
        soundRef.current = null;
      }

      const player = createAudioPlayer({ uri });
      soundRef.current = player;

      // The player reports its own status rather than taking a callback at creation.
      player.addListener('playbackStatusUpdate', onPlaybackStatusUpdate);

      if (autoPlay) {
        player.play();
        setPlaybackState(PlaybackState.PLAYING);
        onPlaybackStart?.();
      } else {
        setPlaybackState(PlaybackState.READY);
      }

      if (initialDuration) setDuration(initialDuration);
    } catch (error) {
      console.error('[AudioPlayer] Load error:', error);
      setPlaybackState(PlaybackState.ERROR);
      onError?.(error);
    }
  };

  /**
   * Unload audio
   */
  const unloadAudio = async () => {
    if (soundRef.current) {
      try {
        soundRef.current.remove();
        soundRef.current = null;
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  };

  /**
   * Handle playback status updates
   */
  const onPlaybackStatusUpdate = useCallback((status) => {
    if (!status.isLoaded) return;

    // expo-audio reports seconds; everything below this line stays in milliseconds so the
    // waveform, the progress bar and formatDuration are all unchanged.
    setPosition((status.currentTime || 0) * 1000);
    if (status.duration) setDuration(status.duration * 1000);

    if (status.didJustFinish) {
      setPlaybackState(PlaybackState.READY);
      setPosition(0);
      progressAnim.setValue(0);
      onPlaybackEnd?.();
    } else if (status.playing) {
      setPlaybackState(PlaybackState.PLAYING);
    } else {
      setPlaybackState(PlaybackState.PAUSED);
    }
  }, [onPlaybackEnd]);

  /**
   * Play audio
   */
  const play = async () => {
    const player = soundRef.current;
    if (!player) return;

    try {
      // If at the end, restart rather than sitting on silence. Seconds, not millis.
      if (player.duration && player.currentTime >= player.duration - 0.1) {
        await player.seekTo(0);
      }

      player.play();
      setPlaybackState(PlaybackState.PLAYING);
      onPlaybackStart?.();
    } catch (error) {
      console.error('[AudioPlayer] Play error:', error);
    }
  };

  /**
   * Pause audio
   */
  const pause = async () => {
    if (!soundRef.current) return;

    try {
      soundRef.current.pause();
      setPlaybackState(PlaybackState.PAUSED);
    } catch (error) {
      console.error('[AudioPlayer] Pause error:', error);
    }
  };

  /**
   * Toggle play/pause
   */
  const togglePlayback = () => {
    if (playbackState === PlaybackState.PLAYING) {
      pause();
    } else {
      play();
    }
  };

  /**
   * Seek to position
   */
  const seekTo = async (positionMillis) => {
    if (!soundRef.current) return;

    try {
      // Callers speak milliseconds; expo-audio wants seconds.
      await soundRef.current.seekTo(positionMillis / 1000);
      setPosition(positionMillis);
    } catch (error) {
      console.error('[AudioPlayer] Seek error:', error);
    }
  };

  /**
   * Handle progress bar touch
   */
  const handleProgressPress = (event) => {
    const { locationX } = event.nativeEvent;
    const { width } = event.nativeEvent.target.getBoundingClientRect?.() || { width: 200 };
    const progress = Math.max(0, Math.min(1, locationX / width));
    const newPosition = progress * duration;
    seekTo(newPosition);
  };

  /**
   * Render waveform visualization.
   *
   * The strip itself is `WaveformStrip` (013 T054), shared with the Journal card's voice pill
   * rather than copied into it. Two things it does better than the loop that used to be here:
   * the fallback bars are derived from the clip's uri instead of `Math.random()` inside render,
   * so the strip no longer reshuffles on every status update, and a tap seeks by the strip's
   * measured width rather than by `getBoundingClientRect`, which is a web API and so always
   * fell through to a hardcoded 200 px on a phone.
   */
  const renderWaveform = () => {
    if (!showWaveform) return null;

    return (
      <WaveformStrip
        levels={waveformData}
        seed={uri}
        bars={compact ? BARS_COMPACT : BARS_FULL}
        progress={duration > 0 ? position / duration : 0}
        color={primaryColor}
        barHeight={compact ? 24 : 40}
        onSeek={(fraction) => seekTo(fraction * duration)}
        style={styles.waveformContainer}
      />
    );
  };

  // Render progress bar (alternative to waveform)
  const renderProgressBar = () => {
    if (showWaveform) return null;

    const progress = duration > 0 ? position / duration : 0;

    return (
      <TouchableOpacity
        style={styles.progressBarContainer}
        activeOpacity={0.9}
        onPress={handleProgressPress}
      >
        <View style={styles.progressBarBackground}>
          <Animated.View
            style={[
              styles.progressBarFill,
              {
                backgroundColor: primaryColor,
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>
      </TouchableOpacity>
    );
  };

  // Loading state
  if (playbackState === PlaybackState.LOADING) {
    return (
      <View style={[styles.container, compact && styles.containerCompact, style]}>
        <View style={styles.loadingContainer}>
          <Ionicons name="hourglass-outline" size={24} color="#999" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }

  // Error state
  if (playbackState === PlaybackState.ERROR) {
    return (
      <View style={[styles.container, compact && styles.containerCompact, style]}>
        <TouchableOpacity style={styles.errorContainer} onPress={loadAudio}>
          <Ionicons name="alert-circle-outline" size={24} color="#FF3B30" />
          <Text style={styles.errorText}>Failed to load audio. Tap to retry.</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Compact layout
  if (compact) {
    return (
      <View style={[styles.containerCompact, style]}>
        <TouchableOpacity
          style={[styles.playButtonCompact, { backgroundColor: primaryColor }]}
          onPress={togglePlayback}
        >
          <Ionicons
            name={playbackState === PlaybackState.PLAYING ? 'pause' : 'play'}
            size={16}
            color="#FFF"
          />
        </TouchableOpacity>
        
        <View style={styles.compactContent}>
          {renderWaveform()}
          {renderProgressBar()}
        </View>

        {showDuration && (
          <Text style={styles.durationCompact}>
            {formatDuration(position)} / {formatDuration(duration)}
          </Text>
        )}
      </View>
    );
  }

  // Full layout
  return (
    <View style={[styles.container, style]}>
      {/* Waveform or progress bar */}
      {renderWaveform()}
      {renderProgressBar()}

      {/* Time display */}
      {showDuration && (
        <View style={styles.timeContainer}>
          <Text style={styles.timeText}>{formatDuration(position)}</Text>
          <Text style={styles.timeText}>{formatDuration(duration)}</Text>
        </View>
      )}

      {/* Controls */}
      <View style={styles.controls}>
        {/* Rewind 10s */}
        <TouchableOpacity
          style={styles.controlButton}
          onPress={() => seekTo(Math.max(0, position - 10000))}
        >
          <Ionicons name="play-back" size={24} color="#666" />
          <Text style={styles.skipText}>10</Text>
        </TouchableOpacity>

        {/* Play/Pause */}
        <TouchableOpacity
          style={[styles.playButton, { backgroundColor: primaryColor }]}
          onPress={togglePlayback}
        >
          <Ionicons
            name={playbackState === PlaybackState.PLAYING ? 'pause' : 'play'}
            size={32}
            color="#FFF"
          />
        </TouchableOpacity>

        {/* Forward 10s */}
        <TouchableOpacity
          style={styles.controlButton}
          onPress={() => seekTo(Math.min(duration, position + 10000))}
        >
          <Ionicons name="play-forward" size={24} color="#666" />
          <Text style={styles.skipText}>10</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  containerCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loadingText: {
    marginLeft: 8,
    color: '#999',
    fontSize: 14,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  errorText: {
    marginLeft: 8,
    color: '#FF3B30',
    fontSize: 14,
  },
  // The row and bar styles now live in `WaveformStrip`; this is only the space the strip
  // occupies in this component's own stacked layout.
  waveformContainer: {
    marginBottom: 12,
  },
  progressBarContainer: {
    marginBottom: 12,
  },
  progressBarBackground: {
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  timeText: {
    fontSize: 12,
    color: '#999',
    fontVariant: ['tabular-nums'],
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  controlButton: {
    alignItems: 'center',
  },
  skipText: {
    fontSize: 10,
    color: '#666',
    marginTop: -4,
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  // Compact styles
  playButtonCompact: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  compactContent: {
    flex: 1,
    marginRight: 8,
  },
  durationCompact: {
    fontSize: 11,
    color: '#999',
    fontVariant: ['tabular-nums'],
    minWidth: 70,
    textAlign: 'right',
  },
});

export default AudioPlayer;
