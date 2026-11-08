/**
 * VoiceRecorderBar (013 T022) -- voice capture for the capture screen.
 *
 * One tap starts, one tap stops, and there is nothing to hold down (FR-006). That is the
 * whole point of this component existing beside `src/components/media/AudioRecorder.js`,
 * which defaults to press-and-hold ("a walkie-talkie, not a two-tap transport") and cannot
 * be walked with. Each stop produces exactly one clip, and the 5:00 cap **keeps** the clip
 * rather than discarding it.
 *
 * Idle, it is the dock's "Voice" button; recording, it is the bar from the prototype --
 * timer, "Recording ..." and Stop. One component owns both so that the single tap that
 * starts a recording is literally one tap (FR-006), with no intermediate "now press record".
 *
 * It follows `AudioRecorder.js`'s use of expo-audio (`useAudioRecorder` +
 * `useAudioRecorderState`), including the two lessons that file paid for:
 *   - `prepareToRecordAsync()` before *every* recording, not just the first -- expo-audio
 *     invalidates the recorder on `stop()`, and without it `record()` only appears to work;
 *   - the status poll lives in a child that is mounted only while recording, so no poll can
 *     land on a native recorder that has already been freed.
 *
 * Two things it does differently, on purpose:
 *   - `isMeteringEnabled: true` in the recording options. Without it expo-audio's status
 *     carries no `metering` at all, so there is no waveform to collect.
 *   - elapsed time comes from `RecorderState.durationMillis`, the field expo-audio 57
 *     actually reports from `recorder.getStatus()`.
 *
 * What jest cannot prove: that recording continues while the phone is locked or the app is
 * backgrounded (FR-007, SC-003). That needs a release build on an iPhone and an Android
 * phone (quickstart Q-D1-Q-D3). What the code can do, and does, is *request* the audio mode
 * that allows it (research R5) -- the plugin options that make it possible on a real build
 * are T024's.
 *
 * Interruptions (an incoming call, the system taking the audio session) are T037/T038.
 * `finishClip` below is already reason-agnostic and guarded against finishing twice, so that
 * work is an effect that calls it -- not a rewrite.
 *
 * An **unmount is not an interruption** and is handled here, not there: nothing takes the
 * session back, so without a cleanup `stop()` is never called, the session is never
 * released, and the status poll's interval goes with the tree -- leaving a native recording
 * that keeps the microphone hot, suppresses other apps' audio (`interruptionMode:
 * 'doNotMix'` asks for exclusive focus, and on Android the plugin's recording foreground
 * service keeps it alive), can no longer hit its own 5:00 cap, and has no UI left to stop
 * it. The cleanup effect finishes the clip, which is also the only way the recorded audio
 * reaches anybody.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import {
  useAudioRecorder,
  useAudioRecorderState,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
  IOSOutputFormat,
  AudioQuality,
} from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';

/** FR-006: a clip is limited to 5 minutes. */
export const MAX_CLIP_MS = 5 * 60 * 1000;

/** How often the recorder's status is polled while recording. */
const POLL_INTERVAL_MS = 250;

/** How many waveform levels a clip carries at most (`AudioPlayer` draws ~50 bars). */
export const WAVEFORM_BARS = 50;

/**
 * Mono voice at a middling bitrate: a spoken clip, not music. `isMeteringEnabled` is what
 * puts `metering` in the status, and so what makes a waveform possible at all.
 *
 * This is field-for-field `RecordingQuality.MEDIUM` from `AudioRecorder.js` plus
 * `isMeteringEnabled`, and **the duplication is deliberate, not an oversight.** `plan.md`
 * records `AudioRecorder.js` as superseded for capture by this component, so importing its
 * presets would tie the capture path's audio format to a file that is on its way out and
 * whose own presets are missing `isMeteringEnabled` (which is why its waveform is always
 * empty). Capture owns its format here, in one literal a reader can check against the
 * expo-audio typings without opening another file.
 */
const VOICE_RECORDING_OPTIONS = {
  isMeteringEnabled: true,
  extension: '.m4a',
  sampleRate: 44100,
  numberOfChannels: 1,
  bitRate: 128000,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: { outputFormat: IOSOutputFormat.MPEG4AAC, audioQuality: AudioQuality.MEDIUM },
  web: { mimeType: 'audio/webm', bitsPerSecond: 128000 },
};

/**
 * The audio mode voice capture asks for (FR-007, research R5):
 * recording allowed, audible with the ringer switch off, allowed to keep going in the
 * background, and not mixed with whatever else wants the session.
 */
export const VOICE_AUDIO_MODE = {
  allowsRecording: true,
  playsInSilentMode: true,
  allowsBackgroundRecording: true,
  interruptionMode: 'doNotMix',
};

/** m:ss, as the prototype's recording bar shows it ("0:00", "5:00"). */
export const formatElapsed = (ms) => {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

/** expo-audio reports metering in dB (about -160 to 0); -60 dB and below reads as silence. */
const normalizeMetering = (db) => Math.min(1, Math.max(0, (db + 60) / 60));

/**
 * Averages a recording's levels down to at most `bars` values, keeping the shape of the
 * whole clip. Taking the last N instead would describe only the end of a long recording,
 * and keeping every sample would put ~1,200 numbers for a five-minute clip into the draft
 * and then onto the wire.
 */
export const downsampleWaveform = (samples, bars = WAVEFORM_BARS) => {
  if (samples.length <= bars) return samples.slice();

  const out = [];
  for (let i = 0; i < bars; i += 1) {
    const from = Math.floor((i * samples.length) / bars);
    const to = Math.max(Math.floor(((i + 1) * samples.length) / bars), from + 1);
    const bucket = samples.slice(from, to);
    out.push(bucket.reduce((sum, level) => sum + level, 0) / bucket.length);
  }
  return out;
};

/**
 * Polls the recorder and reports its status upward; renders nothing.
 *
 * It exists so the polling can be *unmounted* the instant recording ends.
 * `useAudioRecorderState` polls for as long as it is mounted, and a poll that lands after
 * the native recorder has been freed throws an uncaught `NotFoundException` with no call
 * site in our own code -- the failure documented at length in `AudioRecorder.js`.
 */
const RecorderStatePoll = ({ recorder, onStatus }) => {
  const status = useAudioRecorderState(recorder, POLL_INTERVAL_MS);

  useEffect(() => {
    onStatus(status);
  }, [status, onStatus]);

  return null;
};

/**
 * @param {object} props
 * @param {(clip: {uri: string, duration: number, waveform: number[], capturedAt: string}) => void} props.onClip
 *   Called once per recording, with `duration` in seconds and `capturedAt` the ISO-8601 UTC
 *   instant recording started (research R8).
 * @param {() => void} [props.onPermissionDenied] Called when the microphone is refused. The
 *   inline message and Open Settings belong to the capture screen, not here (UI contract).
 * @param {(failure: {reason: 'stop-failed'|'no-file'|'handler-failed', error: Error|null,
 *   capturedAt: string|null, duration: number}) => void} [props.onCaptureFailed]
 *   Called instead of `onClip` when a recording ended without a usable file, and after it
 *   when the parent's own `onClip` threw. See the note on `finishClip`.
 * @param {(isRecording: boolean) => void} [props.onRecordingChange] Called with `true` when
 *   recording starts and `false` when it ends, however it ended. The idle Voice button is a
 *   dock-sized button and the recording bar is full width above the dock (UI contract), so
 *   the parent has to be able to see the change to lay either of them out. Not called on
 *   mount -- only on a change.
 * @param {number} [props.maxDurationMs] The cap; defaults to 5 minutes (FR-006).
 */
export default function VoiceRecorderBar({
  onClip,
  onPermissionDenied,
  onCaptureFailed,
  onRecordingChange,
  maxDurationMs = MAX_CLIP_MS,
  style,
}) {
  const recorder = useAudioRecorder(VOICE_RECORDING_OPTIONS);

  const [isRecording, setIsRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [status, setStatus] = useState(null);

  // The clip's capturedAt: stamped at the start and read at the stop, so a long recording
  // is still placed in the order by when it began (research R8).
  const capturedAtRef = useRef(null);
  const elapsedRef = useRef(0);
  const levelsRef = useRef([]);
  // One clip per recording, whatever ended it -- a Stop tap, the cap, an unmount, or (T038)
  // an interruption that arrives while the stop is still in flight.
  const finishingRef = useRef(false);
  // The same guard on the *start* side. It cannot be the `isRecording` state: the state is
  // not set until after three awaits, one of which is the OS permission dialog, and the
  // Voice button stays live behind it the whole time.
  const startingRef = useRef(false);
  // `isRecording` as the unmount cleanup can see it -- a cleanup closes over its mount.
  // Written synchronously beside every `setIsRecording`, deliberately rather than from an
  // effect: an unmount committed in the same batch as the state change would still see the
  // old value if the ref were only synced afterwards.
  const isRecordingRef = useRef(false);
  // Which polled status has already contributed a waveform level, so a re-run of the status
  // effect for some *other* reason cannot record the same level twice.
  const lastLevelStatusRef = useRef(null);

  /**
   * Ends the recording and hands the clip over, whatever ended it.
   *
   * Everything from here on is inside a `try`/`finally` that releases `finishingRef`. The
   * guard is "one clip per recording", not "one clip ever" (US1 captures two clips in one
   * memory), and leaving it set would put the bar back to the idle Voice button while
   * `startRecording` silently refused every tap -- recorded once per mount, then quietly
   * dead. A synchronous throw from the parent's `onClip` is enough to reach that, and
   * tasks.md's T029 case ("`addPiece` rejects (storage full)") is exactly that shape.
   *
   * **A recording that produced no file is signalled, never swallowed.** Going back to the
   * idle Voice button is indistinguishable from "you have not recorded yet", and this app
   * has no crash reporting, so a `console.warn` is not a signal. Task 20's analogous case
   * chose to *throw*, and the asymmetry is deliberate: `buildContentBlocks` had no caller
   * that could render anything and was in the middle of a save, whereas this component has
   * a parent that owns the inline failed-capture message (UI contract) and the capture is
   * already over -- so a callback the screen can render is better than an exception it
   * would have to catch.
   */
  const finishClip = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;

    try {
      // The recorder's own length, read before stop() invalidates it -- `elapsedRef` is
      // only as fresh as the last 250 ms poll, so a clip stopped between polls under-
      // reports, and one stopped before the first poll reports 0 with a valid uri.
      let durationMs = elapsedRef.current;
      try {
        const finalStatus = recorder.getStatus?.();
        if (Number.isFinite(finalStatus?.durationMillis) && finalStatus.durationMillis > 0) {
          durationMs = finalStatus.durationMillis;
        }
      } catch {
        // An already-invalidated recorder: the last polled value is the best we have.
      }

      let stopError = null;
      try {
        await recorder.stop();
      } catch (error) {
        stopError = error instanceof Error ? error : new Error(String(error));
      }

      // The uri is only final once stop() has resolved.
      const uri = recorder.uri ?? null;
      const clip = {
        uri,
        duration: durationMs / 1000, // seconds (data-model.md)
        waveform: downsampleWaveform(levelsRef.current),
        capturedAt: capturedAtRef.current,
      };

      setIsRecording(false);
      isRecordingRef.current = false;
      setStatus(null);
      setElapsedMs(0);
      elapsedRef.current = 0;
      levelsRef.current = [];
      lastLevelStatusRef.current = null;
      capturedAtRef.current = null;
      onRecordingChange?.(false);

      try {
        await setAudioModeAsync({ allowsRecording: false });
      } catch (error) {
        console.warn('[VoiceRecorderBar] releasing the audio session failed', error);
      }

      if (uri) {
        // A parent that throws here has failed to keep the piece, and may not know it:
        // `onClip` is called, not awaited, so only a *synchronous* throw reaches us.
        try {
          onClip?.(clip);
        } catch (error) {
          onCaptureFailed?.({
            reason: 'handler-failed',
            error: error instanceof Error ? error : new Error(String(error)),
            capturedAt: clip.capturedAt,
            duration: clip.duration,
          });
        }
      } else {
        // No file means nothing was recorded; a piece pointing at nothing is worse than
        // none -- but the screen has to be told, or the loss is invisible.
        onCaptureFailed?.({
          reason: stopError ? 'stop-failed' : 'no-file',
          error: stopError,
          capturedAt: clip.capturedAt,
          duration: clip.duration,
        });
      }
    } finally {
      finishingRef.current = false;
    }
  }, [onCaptureFailed, onClip, onRecordingChange, recorder]);

  const startRecording = useCallback(async () => {
    // `startingRef` is set synchronously, so a second tap during the permission dialog or
    // either of the two awaits after it cannot start a second recording on the same
    // recorder -- which would also overwrite `capturedAt` with the later tap's instant,
    // losing R8's start instant for audio already being captured.
    if (isRecording || startingRef.current || finishingRef.current) return;
    startingRef.current = true;

    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        onPermissionDenied?.();
        return;
      }

      await setAudioModeAsync(VOICE_AUDIO_MODE);
      // Before every recording, not just the first; see the file header.
      await recorder.prepareToRecordAsync();

      levelsRef.current = [];
      lastLevelStatusRef.current = null;
      elapsedRef.current = 0;
      setElapsedMs(0);
      capturedAtRef.current = new Date().toISOString();
      recorder.record();
      setIsRecording(true);
      isRecordingRef.current = true;
      onRecordingChange?.(true);
    } catch (error) {
      console.warn('[VoiceRecorderBar] could not start recording', error);
    } finally {
      startingRef.current = false;
    }
  }, [isRecording, onPermissionDenied, onRecordingChange, recorder]);

  /**
   * Held in a ref so the effect below runs when the *status* changes and not every time
   * the parent hands down a fresh `onClip` closure -- which would otherwise re-run it on
   * the same status and record the same level twice in the waveform.
   */
  const finishClipRef = useRef(finishClip);
  useEffect(() => {
    finishClipRef.current = finishClip;
  }, [finishClip]);

  /**
   * Elapsed time, waveform levels and the 5:00 cap, all from the polled status.
   */
  useEffect(() => {
    if (!isRecording || !status?.isRecording) return;

    const ms = status.durationMillis || 0;
    elapsedRef.current = ms;
    setElapsedMs(ms);

    // Keyed on the status object's identity, not on the effect running: `maxDurationMs` is
    // a dependency too, and a prop change mid-recording would otherwise record the level
    // from an already-recorded status a second time.
    if (lastLevelStatusRef.current !== status) {
      lastLevelStatusRef.current = status;
      if (typeof status.metering === 'number') {
        levelsRef.current.push(normalizeMetering(status.metering));
      }
    }

    // The cap stops the recording; it never throws the clip away (FR-006).
    if (ms >= maxDurationMs) finishClipRef.current();
  }, [isRecording, maxDurationMs, status]);

  /**
   * An unmount mid-recording finishes the clip. **A separate effect on purpose:** the
   * status effect above early-returns on `!status?.isRecording`, which is precisely the
   * interruption condition T037/T038 will add, so the two must not share a cleanup.
   *
   * It reads refs rather than state because a cleanup closes over the mount it was created
   * on, and `[]` is what makes it run on unmount only.
   */
  useEffect(
    () => () => {
      if (isRecordingRef.current) finishClipRef.current();
    },
    [],
  );

  if (!isRecording) {
    return (
      <TouchableOpacity
        testID="voice-record-button"
        accessibilityRole="button"
        accessibilityLabel="Record a voice clip"
        style={[styles.voiceButton, style]}
        onPress={startRecording}
      >
        <Ionicons name="mic" size={22} color="#2B7DE9" />
        <Text style={styles.voiceLabel}>Voice</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View testID="voice-recorder-bar" style={[styles.bar, style]}>
      {/* Renders nothing; polls only while there is a recorder to poll. */}
      <RecorderStatePoll recorder={recorder} onStatus={setStatus} />

      <View testID="voice-recording-dot" style={styles.dot} />

      <View style={styles.barText}>
        <Text testID="voice-recorder-timer" style={styles.timer}>
          {formatElapsed(elapsedMs)}
        </Text>
        <Text style={styles.hint}>Recording · keeps going when the phone is locked</Text>
      </View>

      <TouchableOpacity
        testID="voice-stop-button"
        accessibilityRole="button"
        accessibilityLabel="Stop recording"
        style={styles.stopButton}
        onPress={finishClip}
      >
        <Text style={styles.stopLabel}>Stop</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  voiceButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  voiceLabel: {
    marginTop: 4,
    fontSize: 12,
    color: '#2B7DE9',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#FDECEC',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#E5484D',
  },
  barText: {
    flex: 1,
  },
  timer: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
    fontVariant: ['tabular-nums'],
  },
  hint: {
    fontSize: 12,
    color: '#8E8E93',
  },
  stopButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: '#E5484D',
  },
  stopLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
