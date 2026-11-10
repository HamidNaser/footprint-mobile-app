/**
 * VoicePlayer (013 T054) -- the voice clip that actually plays.
 *
 * FR-020 is one sentence -- "a saved voice clip MUST play when its play control is tapped and
 * pause when tapped again" -- and the reason it needed writing down is that today's control
 * *looks* like a play button and does nothing (spec US4). So this component is deliberately
 * small, and every line of it closes one of the ways a tap can quietly amount to nothing:
 *
 * 1. **The audio mode is set before playing.** On iOS a clip played without
 *    `playsInSilentMode` is inaudible with the ringer switch off, which is indistinguishable
 *    from a dead button. `VoiceRecorderBar` leaves the session set up for *recording* and only
 *    puts `allowsRecording` back, so playback cannot assume anything about the mode it
 *    inherits and asks for its own.
 * 2. **A finished clip is rewound before it is played again.** `play()` at the end of a track
 *    plays nothing; the second tap on a clip that has run out has to start it over.
 * 3. **A clip with no file is shown as unavailable**, not as a live control. A disabled
 *    control that says why is honest; a live one that cannot play is the defect.
 * 4. **The control follows the player, never a local flag.** `useAudioPlayerStatus` is the
 *    only source of "is it playing", so a clip that ends by itself, or one paused because
 *    another clip started, shows Play again without anybody telling it to.
 *
 * **One clip plays at a time** (US4-3's "it plays, and tapping again pauses it" read across a
 * Journal full of cards): starting a clip pauses whichever clip was playing. The one playing
 * clip is held at module scope rather than in a context, because the two places a clip appears
 * -- the Journal card's voice pill and the capture screen's audio rows -- are in different
 * trees, and a person can reach both in one session. A player that is released (its card
 * scrolled out of the list, or the capture screen closed) is taken out of that one slot by its
 * own unmount: a released `SharedObject` throws when it is called, so leaving a stale one there
 * would turn the *next* clip's play into a crash.
 *
 * `useAudioPlayer` + `useAudioPlayerStatus` are used in preference to `createAudioPlayer`, the
 * way `VoiceRecorderBar` prefers `useAudioRecorder` + `useAudioRecorderState` on the recording
 * side of the same API: the hook releases the native player when the component goes, which is
 * the one piece of bookkeeping `src/components/media/AudioPlayer.js` (this file's predecessor
 * in the pill, kept for `InterviewModeScreen`) has to do by hand.
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';

/**
 * The audio mode playing a clip asks for: audible with the ringer switch off, no microphone,
 * and no claim on the background (a clip is listened to with the app open, unlike recording,
 * which FR-007 requires to survive the lock screen).
 */
export const PLAYBACK_AUDIO_MODE = {
  allowsRecording: false,
  playsInSilentMode: true,
  shouldPlayInBackground: false,
};

/**
 * How close to the end counts as the end. expo-audio reports seconds, and a clip stopped by
 * its own last frame lands a few milliseconds short of its reported duration, so an exact
 * comparison would leave the second tap playing silence.
 */
const END_TOLERANCE_S = 0.1;

/**
 * The one clip that is playing, app-wide. Module scope, for the reason in the file header:
 * the voice pill and the capture screen's audio rows are different trees.
 */
let playingPlayer = null;

/** Starts this clip's turn, pausing whichever clip was playing. */
const claimPlayback = (player) => {
  if (playingPlayer && playingPlayer !== player) {
    try {
      playingPlayer.pause();
    } catch (error) {
      // Released between claiming and now: there is nothing left to pause, and the component
      // that owned it has already gone.
    }
  }
  playingPlayer = player;
};

/**
 * Gives up the slot, but only if it is still this clip's. The guard is what makes the order
 * safe: the clip being paused *because* another one started releases after the new one has
 * already claimed the slot, and must not clear it.
 */
const releasePlayback = (player) => {
  if (playingPlayer === player) playingPlayer = null;
};

/** m:ss, zero-padded, as the capture screen's recording timer shows elapsed time. */
export const formatClock = (seconds) => {
  const total = Math.floor(Math.max(0, Number(seconds) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * @param {object} props
 * @param {string|null} [props.uri] The clip's file. Absent means there is nothing to play, and
 *   the control says so rather than pretending.
 * @param {number} [props.duration] The clip's length in seconds as the piece recorded it
 *   (data-model.md), shown until the player reports its own.
 * @param {string} [props.testID] Prefix for this player's nodes; two clips in one card need
 *   two different ones.
 * @param {string} [props.color] The control's colour, so the pill can keep the card's accent.
 */
export default function VoicePlayer({
  uri,
  duration,
  testID = 'voice-player',
  color = '#007AFF',
  style,
}) {
  // `null` is what `useAudioPlayer` takes for "no source": no file is loaded and no native
  // player is created for a clip that has none.
  const source = useMemo(() => (uri ? { uri } : null), [uri]);
  const player = useAudioPlayer(source);
  const status = useAudioPlayerStatus(player);

  const isPlaying = !!status?.playing;
  // The player's own length once it knows it; until then the length the piece recorded.
  const total = status?.duration > 0 ? status.duration : Math.max(0, Number(duration) || 0);
  const position = Math.max(0, status?.currentTime || 0);
  const finished =
    !!status?.didJustFinish || (total > 0 && position >= total - END_TOLERANCE_S);

  /**
   * The slot is given up when this clip stops playing, however it stopped -- including when
   * the clip simply ran out, which no tap reports.
   */
  useEffect(() => {
    if (!isPlaying) releasePlayback(player);
  }, [isPlaying, player]);

  /**
   * ...and when the component goes. `useAudioPlayer` releases the native player on unmount,
   * and a released player throws when it is called, so a stale entry here would crash the
   * next clip somebody taps.
   */
  useEffect(() => () => releasePlayback(player), [player]);

  const toggle = useCallback(async () => {
    if (!uri) return;

    if (isPlaying) {
      // Pause, not stop: FR-020 says "pause when tapped again", so the clip keeps its place.
      player.pause();
      releasePlayback(player);
      return;
    }

    // Claimed before the awaits below, so the clip that was playing goes quiet the moment
    // this one is tapped rather than a tick later.
    claimPlayback(player);

    try {
      await setAudioModeAsync(PLAYBACK_AUDIO_MODE);
    } catch (error) {
      // Worth saying, and not worth stopping for: without the mode the clip may be silent
      // with the ringer switch off, but not playing at all is the defect being fixed here.
      console.warn('[VoicePlayer] could not set the playback audio mode', error);
    }

    try {
      // A clip that has run out plays nothing from where it stopped.
      if (finished) await player.seekTo(0);
      player.play();
    } catch (error) {
      console.warn('[VoicePlayer] could not play this voice clip', error);
    }
  }, [finished, isPlaying, player, uri]);

  const accessibilityLabel = !uri
    ? 'This voice clip is unavailable'
    : isPlaying
      ? 'Pause this voice clip'
      : 'Play this voice clip';

  return (
    <View testID={testID} style={[styles.row, style]}>
      <TouchableOpacity
        testID={`${testID}-toggle`}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled: !uri }}
        disabled={!uri}
        onPress={toggle}
        style={[styles.button, { backgroundColor: uri ? color : '#C7C7CC' }]}
      >
        <Ionicons name={isPlaying ? 'pause' : 'play'} size={16} color="#FFF" />
      </TouchableOpacity>

      <Text testID={`${testID}-time`} style={styles.time}>
        {`${formatClock(position)} / ${formatClock(total)}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  button: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  time: {
    fontSize: 13,
    color: '#8E8E93',
    fontVariant: ['tabular-nums'],
  },
});
