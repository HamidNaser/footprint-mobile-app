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
 * 5. **A clip whose file has gone is shown as unavailable too.** expo-audio reports that on the
 *    status as `error`, and a control over an unplayable file is the same dead button in a
 *    narrower form.
 * 6. **Nothing plays while a recording is running** (`isRecording`, FR-007). Playing asks for
 *    `allowsRecording: false`, and there is one audio session for the whole app: on the capture
 *    screen, where a saved clip's row sits above the recorder bar, a tap on it would otherwise
 *    take `.playAndRecord` away from the recording in progress -- the same call
 *    `VoiceRecorderBar` uses to *release* the session when a clip is finished. The recording
 *    would end mid-sentence, and `VoiceRecorderBar` would read it as an interruption. Being
 *    stopped by a tap in the app's own UI is worse than either of the cases FR-007 names.
 *
 * The strip -- the clip's bars, the played ones coloured, and a tap that moves playback -- is
 * `WaveformStrip`, shared with `media/AudioPlayer` rather than copied from it. FR-021 allows the
 * card only this feature's additions, so the pill keeps everything it draws today and gains only
 * a control that works.
 *
 * ⚠ **A clip's own levels reach the pill only while the memory is read from the phone.** The
 * waveform is stored on the *block* (`journalBlocks.js` puts it there, and the local
 * `content_blocks` JSON keeps it), but the backend drops it on the way in:
 * `JournalsController.MapToContentBlock` never sets `ContentBlock.Waveform`, although the domain
 * model has the field and the response DTO returns it. So a memory that has been round-tripped
 * through the server comes back with no waveform, and the fallback strip is the normal case, not
 * the exception. That is a backend defect, not something this component can fix.
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
 * in the pill, and still rendered by `media/MediaPreview.js` and `JournalEntryDetail`) has to do
 * by hand.
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import WaveformStrip, { BARS_COMPACT } from '../media/WaveformStrip';

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

/** The strip's geometry in the pill, unchanged from the compact `AudioPlayer` it replaces. */
const STRIP_BAR_HEIGHT = 24;
const STRIP_HEIGHT = 50;

/**
 * The one clip that is playing, app-wide. Module scope, for the reason in the file header:
 * the voice pill and the capture screen's audio rows are different trees.
 */
let playingPlayer = null;

/**
 * Pauses a player without caring whether it is still there.
 *
 * Every `pause()` in this file goes through here, because every one of them can reach a player
 * that has been released: a released `SharedObject` throws when it is called, and a card
 * scrolling out of a list releases its player without telling the clip that holds the turn.
 */
const pauseQuietly = (player) => {
  try {
    player.pause();
  } catch (error) {
    // Already released: there is nothing left to pause, and whoever owned it has gone.
  }
};

/** Starts this clip's turn, pausing whichever clip was playing. */
const claimPlayback = (player) => {
  if (playingPlayer && playingPlayer !== player) pauseQuietly(playingPlayer);
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
 * @param {number[]} [props.waveform] The clip's recorded levels, if it still has them. See the
 *   file header: a clip that has been round-tripped through the server has not.
 * @param {boolean} [props.isRecording] True while a voice recording is running on this screen.
 *   The control goes dead for the duration, for the reason in the file header (FR-007).
 * @param {string} [props.testID] Prefix for this player's nodes; two clips in one card need
 *   two different ones.
 * @param {string} [props.color] The control's colour, so the pill can keep the card's accent.
 */
export default function VoicePlayer({
  uri,
  duration,
  waveform,
  isRecording = false,
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
  // The player's own length, and *only* the player's: it is the one value that can be compared
  // against the position, because both come from the same place.
  const loadedTotal = status?.duration > 0 ? status.duration : 0;
  const position = Math.max(0, status?.currentTime || 0);
  // What to *show*: the player's length once it has one, otherwise what the piece recorded --
  // and never a length shorter than what has already played, which would read as "0:13 / 0:12".
  const total = Math.max(loadedTotal || Math.max(0, Number(duration) || 0), position);
  /**
   * Whether the clip has run out, and so needs rewinding before it can play again.
   *
   * Measured against the player's own length, never against the piece's. A piece that
   * under-reports its clip -- the length is recorded from a 250 ms poll, so a clip stopped
   * between polls does -- would otherwise be "finished" while it was still mid-sentence, and
   * the next tap would start it over instead of resuming.
   */
  const finished =
    !!status?.didJustFinish || (loadedTotal > 0 && position >= loadedTotal - END_TOLERANCE_S);

  /**
   * Why this clip cannot be played, if it cannot. All three are the same defect in different
   * clothes -- a control that looks live and does nothing -- so all three disable it and say so.
   */
  const unavailable = !uri
    ? 'This voice clip is unavailable'
    : isRecording
      ? // Playing would call `setAudioModeAsync({ allowsRecording: false, … })` on the one
        // shared audio session and end the recording that is running. See the file header.
        'Not while you are recording'
      : status?.error
        ? 'This voice clip is unavailable'
        : null;

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

  /**
   * A recording starting takes the audio session for recording, so a clip that was playing is
   * stopped by the system whatever this component does. Pausing it here is what keeps the
   * control honest about it instead of leaving a Pause icon over silence (FR-007).
   */
  useEffect(() => {
    if (isRecording && isPlaying) {
      pauseQuietly(player);
      releasePlayback(player);
    }
  }, [isRecording, isPlaying, player]);

  const toggle = useCallback(async () => {
    if (unavailable) return;

    if (isPlaying) {
      // Pause, not stop: FR-020 says "pause when tapped again", so the clip keeps its place.
      pauseQuietly(player);
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
      // The turn goes back: the clip that was playing was paused to make way for this one, and
      // holding the turn for a player that never started would have the next clip reach into it.
      releasePlayback(player);
      console.warn('[VoicePlayer] could not play this voice clip', error);
    }
  }, [finished, isPlaying, player, unavailable]);

  /**
   * Moves playback to where the strip was tapped.
   *
   * **Measured against `loadedTotal`, never the shown total**, and so not possible at all until
   * the player has reported a length. The shown total falls back to the piece's recorded length
   * and is floored at the position, so before the player has loaded a clip that has played past
   * its recorded length has `total === position` — and seeking against that sends the playhead
   * to where it already is, leaving the strip fully coloured while the clip plays on. There is
   * no length worth seeking against until the player has one, and a clip reports its length as
   * soon as it loads.
   */
  const seekToFraction = useCallback(
    async (fraction) => {
      if (unavailable || !(loadedTotal > 0)) return;
      try {
        await player.seekTo(fraction * loadedTotal);
      } catch (error) {
        console.warn('[VoicePlayer] could not move through this voice clip', error);
      }
    },
    [loadedTotal, player, unavailable],
  );

  const accessibilityLabel =
    unavailable ?? (isPlaying ? 'Pause this voice clip' : 'Play this voice clip');

  return (
    <View testID={testID} style={[styles.pill, style]}>
      <TouchableOpacity
        testID={`${testID}-toggle`}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled: !!unavailable }}
        disabled={!!unavailable}
        onPress={toggle}
        style={[styles.button, { backgroundColor: unavailable ? '#C7C7CC' : color }]}
      >
        <Ionicons name={isPlaying ? 'pause' : 'play'} size={16} color="#FFF" />
      </TouchableOpacity>

      {/* The strip the pill has always had: the clip's shape, how far through it is, and a tap
          that moves playback (FR-021). The wrapper is the compact `AudioPlayer`'s
          `compactContent` -- the strip is laid out in a column inside it, which is what gives
          the strip its own `marginBottom`. */}
      <View testID={`${testID}-content`} style={styles.content}>
        <WaveformStrip
          testID={`${testID}-strip`}
          levels={waveform}
          seed={uri}
          bars={BARS_COMPACT}
          progress={total > 0 ? position / total : 0}
          color={color}
          barHeight={STRIP_BAR_HEIGHT}
          height={STRIP_HEIGHT}
          disabled={!!unavailable}
          onSeek={seekToFraction}
          style={styles.strip}
        />
      </View>

      <Text testID={`${testID}-time`} style={styles.time}>
        {`${formatClock(position)} / ${formatClock(total)}`}
      </Text>
    </View>
  );
}

/**
 * Property for property, the compact `AudioPlayer`'s pill: `containerCompact`,
 * `playButtonCompact`, `compactContent`, `waveformContainer` and `durationCompact` as they are
 * in `media/AudioPlayer.js` today. FR-021 allows the card only this feature's additions, so
 * nothing here is a fresh choice and none of it should be tidied without reading that rule.
 * `VoicePlayer.test.js` asserts the lot.
 */
const styles = StyleSheet.create({
  // `containerCompact`: the grey box the pill's contents have always sat in.
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
  },
  // `playButtonCompact`. The spacing is this button's own `marginRight`, not a `gap` on the
  // row: a gap would also space the time text, which today sits tight against the content box.
  button: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  // `compactContent`.
  content: {
    flex: 1,
    marginRight: 8,
  },
  // `waveformContainer`'s spacing. Its row, centring and height are the strip's own.
  strip: {
    marginBottom: 12,
  },
  // `durationCompact`.
  time: {
    fontSize: 11,
    color: '#999',
    fontVariant: ['tabular-nums'],
    minWidth: 70,
    textAlign: 'right',
  },
});
