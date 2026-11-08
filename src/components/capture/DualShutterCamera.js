/**
 * DualShutterCamera (013 T026) -- the capture screen's camera.
 *
 * One screen, two shutters: a white Photo button and a red Video button side by side, and
 * **no mode switch** (FR-008). Each tap of Photo takes one photo; Video starts on one tap and
 * stops on the next; nothing is ever held down. Photo is unavailable while a video records,
 * and a video is capped at 60 seconds. **Every photo and every video is its own piece**,
 * handed up one at a time through `onShot` -- this component never batches them and never
 * holds a memory together; the pieces list is `CaptureScreen`'s (T029/T030).
 *
 * It exists beside `src/components/media/CameraCapture.js`, which is the precedent for the
 * expo-camera mechanics but cannot serve here: that one has a PHOTO/VIDEO mode switcher and a
 * single shutter whose meaning depends on the mode, which is exactly what FR-008 removes.
 *
 * Checked against the **installed** expo-camera (57.0.4,
 * `node_modules/expo-camera/build/CameraView.d.ts` and `Camera.types.d.ts`), not assumed:
 *
 *   - `recordAsync(options)` resolves to `{ uri } | undefined`, and only once `stopRecording()`
 *     was invoked, `maxDuration`/`maxFileSize` was reached, or the preview stopped. It carries
 *     **no duration and no dimensions**, so the length of a clip can only be measured here.
 *   - `CameraRecordingOptions` is `{ maxDuration?, maxFileSize?, mirror?, codec? }`, and
 *     `maxDuration` is "Maximum video duration in **seconds**". There is **no `quality`
 *     recording option** in 57.0.4 -- `CameraCapture.js` passes one and it is simply ignored;
 *     the supported control is the `videoQuality` *prop*, which is what is used below.
 *   - The cap is therefore the camera's own: `recordAsync` is given `maxDuration: 60` and
 *     resolves itself at the limit. No timer here races it. `CameraCapture.js` instead counts
 *     seconds and stops itself one second early -- its `prev >= maxVideoDuration - 1` branch
 *     freezes the counter at 59 and then stops, so a full-length clip there is reported as 59
 *     seconds. A clip's length here is measured from the clock, which has neither the
 *     off-by-one nor the one-second granularity.
 *   - `CameraView` renders no children (the lesson `CameraCapture.js` paid for in
 *     expo-camera 16+), so every control is an absolutely-positioned sibling over the preview.
 *
 * The preview's `mode` prop follows the shutter being used and is invisible to the user: it is
 * `picture` at rest and `video` only while recording, because `recordAsync` fails outright on a
 * picture-mode camera. The switch happens a render *before* `recordAsync` is called -- that is
 * what the `pendingRecordRef` + effect below are for -- so the native view has the right output
 * configured by the time recording starts. This is not a mode switch in FR-008's sense: there
 * is no control for it and no state the user can be left in.
 *
 * A piece's `capturedAt` is the instant the capture **started** (research R8): the shutter tap
 * for a photo, and the tap that *started* recording for a video -- never the tap that stopped
 * it, which would misplace a long clip in capture order by its own length.
 *
 * `location` and `localId` are not this component's: `CaptureScreen` stamps each piece through
 * `CaptureLocation.withLocation` as it adds it (T029/T030).
 *
 * What jest cannot prove: that a real camera takes a real picture and records a real clip, and
 * that photo and video from one screen behave on a device as they do under the mock. Those are
 * the owner's device checks (quickstart Q-D5).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Linking,
} from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';

/** FR-008: a video is limited to 60 seconds. In seconds, as expo-camera wants it. */
export const MAX_VIDEO_SECONDS = 60;

/** How often the on-screen recording time is refreshed. */
const TICK_INTERVAL_MS = 500;

/** The white Photo shutter and the red Video shutter (contracts/ui-contract.md). */
export const PHOTO_SHUTTER_COLOR = '#FFFFFF';
export const VIDEO_SHUTTER_COLOR = '#E5484D';

/** m:ss, as the prototype's camera shows a clip's length. */
export const formatSeconds = (seconds) => {
  const total = Math.floor(Math.max(0, seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
};

/**
 * @param {object} props
 * @param {(piece: {kind: 'photo'|'video', uri: string, capturedAt: string, width?: number,
 *   height?: number, duration?: number}) => void} props.onShot
 *   Called **once per photo and once per video** (FR-008), with `capturedAt` the ISO-8601 UTC
 *   instant the capture started and, for a video, `duration` in seconds (data-model.md).
 * @param {() => void} [props.onDone] Finished with the camera; the capture screen takes over.
 * @param {() => void} [props.onClose] Left the camera without finishing.
 * @param {number} [props.maxVideoSeconds] The cap; defaults to 60 (FR-008).
 */
export default function DualShutterCamera({
  onShot,
  onDone,
  onClose,
  maxVideoSeconds = MAX_VIDEO_SECONDS,
  videoQuality = '720p',
  style,
}) {
  const [permission, requestPermission] = useCameraPermissions();
  // A video records sound, which is a separate grant from the camera itself. Without it
  // recordAsync rejects on iOS rather than quietly producing a silent clip.
  const [micPermission, requestMicPermission] = useMicrophonePermissions();

  const [shots, setShots] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedMs, setRecordedMs] = useState(0);
  const [micRefused, setMicRefused] = useState(false);

  const cameraRef = useRef(null);
  /** Set the render before `recordAsync` is called, so the preview is in video output first. */
  const pendingRecordRef = useRef(false);
  const startedAtRef = useRef(null);
  const stoppedAtRef = useRef(null);
  const capturedAtRef = useRef(null);
  /** takePictureAsync must not overlap itself; a ref, because a tap cannot wait for a render. */
  const photoInFlightRef = useRef(false);
  const mountedRef = useRef(true);

  /**
   * One cleanup, so there is no ordering to get wrong between "we have gone" and "stop the
   * camera": a recording left running would outlive the screen, and a piece arriving after
   * the screen has gone has nowhere to go.
   */
  useEffect(
    () => () => {
      mountedRef.current = false;
      if (cameraRef.current) {
        try {
          cameraRef.current.stopRecording();
        } catch (error) {
          // Nothing was recording; nothing to do.
        }
      }
    },
    [],
  );

  const openSettings = useCallback(() => {
    Linking.openSettings?.();
  }, []);

  const addShot = useCallback(
    (piece) => {
      setShots((previous) => [...previous, piece]);
      // One call per piece: the capture screen adds it, stamps it with a place and keeps the
      // order. Nothing is ever handed up as a batch.
      onShot?.(piece);
    },
    [onShot],
  );

  /**
   * Held in a ref, as `VoiceRecorderBar` holds `finishClip`: a recording resolves long after
   * it started, and by then the parent may have handed down a fresh `onShot`. Reading the
   * latest one here means the piece cannot be delivered to a closure that has moved on.
   */
  const addShotRef = useRef(addShot);
  useEffect(() => {
    addShotRef.current = addShot;
  }, [addShot]);

  /** FR-008: each tap of Photo takes one photo. */
  const takePhoto = useCallback(async () => {
    if (isRecording || photoInFlightRef.current || !cameraRef.current) return;
    photoInFlightRef.current = true;

    // Stamped at the tap, before the shutter is awaited (research R8).
    const capturedAt = new Date().toISOString();

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        exif: true,
        skipProcessing: false,
      });
      if (photo?.uri) {
        addShot({
          kind: 'photo',
          uri: photo.uri,
          width: photo.width,
          height: photo.height,
          capturedAt,
        });
      }
    } catch (error) {
      console.warn('[DualShutterCamera] could not take a photo', error);
    } finally {
      photoInFlightRef.current = false;
    }
  }, [addShot, isRecording]);

  /** FR-008: Video starts on one tap. */
  const beginRecording = useCallback(async () => {
    if (isRecording || pendingRecordRef.current) return;

    if (!micPermission?.granted) {
      const result = await requestMicPermission();
      if (!result?.granted) {
        // Said inline rather than swallowed; the photos keep working (UI contract).
        setMicRefused(true);
        return;
      }
      setMicRefused(false);
    }

    pendingRecordRef.current = true;
    capturedAtRef.current = new Date().toISOString();
    startedAtRef.current = Date.now();
    stoppedAtRef.current = null;
    setRecordedMs(0);
    // Flips the preview to video output and disables Photo in the same render.
    setIsRecording(true);
  }, [isRecording, micPermission, requestMicPermission]);

  /** FR-008: ... and stops on the next. */
  const endRecording = useCallback(() => {
    if (!isRecording || !cameraRef.current) return;
    // Read here, not after the await: this is the instant the recording was ended.
    stoppedAtRef.current = Date.now();
    cameraRef.current.stopRecording();
  }, [isRecording]);

  const handleVideoPress = useCallback(() => {
    if (isRecording) endRecording();
    else beginRecording();
  }, [beginRecording, endRecording, isRecording]);

  /**
   * Starts the recording a render after the tap, once the preview is in video output.
   * `recordAsync` resolves when the recording ends, however it ended -- a Video tap, the
   * camera's own 60-second cap, or the preview stopping -- so there is one place that
   * produces the piece and it cannot produce two.
   */
  useEffect(() => {
    if (!isRecording || !pendingRecordRef.current) return;
    pendingRecordRef.current = false;

    (async () => {
      let video;
      try {
        video = await cameraRef.current?.recordAsync({ maxDuration: maxVideoSeconds });
      } catch (error) {
        console.warn('[DualShutterCamera] could not record a video', error);
      }

      const endedAt = stoppedAtRef.current ?? Date.now();
      const startedAt = startedAtRef.current ?? endedAt;
      const duration = Math.max(0, endedAt - startedAt) / 1000; // seconds (data-model.md)

      startedAtRef.current = null;
      stoppedAtRef.current = null;

      if (!mountedRef.current) return;

      setIsRecording(false);
      setRecordedMs(0);

      // No file means nothing was recorded; a piece pointing at nothing is worse than none.
      if (video?.uri) {
        addShotRef.current({
          kind: 'video',
          uri: video.uri,
          duration,
          capturedAt: capturedAtRef.current,
        });
      }
      capturedAtRef.current = null;
    })();
  }, [isRecording, maxVideoSeconds]);

  /** The time on screen while recording. The cap itself is the camera's, not this timer's. */
  useEffect(() => {
    if (!isRecording) return undefined;

    const handle = setInterval(() => {
      if (startedAtRef.current != null) setRecordedMs(Date.now() - startedAtRef.current);
    }, TICK_INTERVAL_MS);

    return () => clearInterval(handle);
  }, [isRecording]);

  // Still being asked. Nothing is shown that could look like a camera that works.
  if (!permission) {
    return (
      <View testID="camera-permission-checking" style={[styles.container, styles.centred, style]}>
        <Text style={styles.checkingText}>Checking camera access…</Text>
      </View>
    );
  }

  // Refused: the inline message with Open Settings (UI contract). The capture screen's other
  // buttons keep working -- Close goes straight back to them.
  if (!permission.granted) {
    return (
      <View testID="camera-permission-denied" style={[styles.container, styles.centred, style]}>
        <Ionicons name="camera-outline" size={56} color="#8E8E93" />
        <Text testID="camera-permission-message" style={styles.deniedText}>
          Footprint can’t use the camera. Turn it on in Settings to take photos and videos.
        </Text>
        {permission.canAskAgain && (
          <TouchableOpacity
            testID="camera-allow-button"
            accessibilityRole="button"
            accessibilityLabel="Allow camera access"
            style={styles.primaryButton}
            onPress={requestPermission}
          >
            <Text style={styles.primaryButtonText}>Allow camera access</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          testID="camera-open-settings-button"
          accessibilityRole="button"
          accessibilityLabel="Open Settings"
          style={styles.secondaryButton}
          onPress={openSettings}
        >
          <Text style={styles.secondaryButtonText}>Open Settings</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="camera-close-button"
          accessibilityRole="button"
          accessibilityLabel="Close the camera"
          style={styles.secondaryButton}
          onPress={onClose}
        >
          <Text style={styles.secondaryButtonText}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <CameraView
        ref={cameraRef}
        style={styles.preview}
        facing="back"
        // Follows the shutter in use, with no control for it: recordAsync fails on a
        // picture-mode camera, and this is set the render before recording starts.
        mode={isRecording ? 'video' : 'picture'}
        videoQuality={videoQuality}
      />

      {/* CameraView renders no children in expo-camera 16+, so the controls sit over it. */}
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.topRow}>
          <TouchableOpacity
            testID="camera-close-button"
            accessibilityRole="button"
            accessibilityLabel="Close the camera"
            style={styles.topButton}
            onPress={onClose}
          >
            <Ionicons name="close" size={26} color="#FFFFFF" />
          </TouchableOpacity>

          {isRecording && (
            <View testID="camera-recording-indicator" style={styles.recordingPill}>
              <View style={styles.recordingDot} />
              <Text testID="camera-recording-time" style={styles.recordingTime}>
                {formatSeconds(recordedMs / 1000)}
              </Text>
            </View>
          )}

          <TouchableOpacity
            testID="camera-done-button"
            accessibilityRole="button"
            accessibilityLabel="Done with the camera"
            style={styles.doneButton}
            onPress={onDone}
          >
            <Text style={styles.doneText}>Done</Text>
          </TouchableOpacity>
        </View>

        {/* A refused microphone costs the video, never the photos (UI contract). */}
        {micRefused && (
          <View testID="camera-microphone-denied" style={styles.notice}>
            <Ionicons name="alert-circle-outline" size={20} color="#FFFFFF" />
            <Text testID="camera-microphone-message" style={styles.noticeText}>
              Footprint can’t use the microphone, so it can’t record a video. Turn it on in
              Settings. Photos still work.
            </Text>
            <TouchableOpacity
              testID="camera-open-settings-button"
              accessibilityRole="button"
              accessibilityLabel="Open Settings"
              style={styles.noticeButton}
              onPress={openSettings}
            >
              <Text style={styles.noticeButtonText}>Open Settings</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.bottom}>
          {shots.length > 0 && (
            <View testID="camera-thumbnail-strip" style={styles.strip}>
              {shots.map((shot, index) => (
                <View
                  key={`${shot.uri}-${index}`}
                  testID={`camera-thumb-${index}`}
                  accessibilityLabel={`${shot.kind === 'video' ? 'Video' : 'Photo'} ${index + 1}`}
                  style={styles.thumb}
                >
                  {shot.kind === 'photo' ? (
                    <Image
                      testID={`camera-thumb-image-${index}`}
                      source={{ uri: shot.uri }}
                      style={styles.thumbImage}
                    />
                  ) : (
                    <View style={[styles.thumbImage, styles.thumbVideo]}>
                      <Ionicons name="videocam" size={16} color="#FFFFFF" />
                      <Text testID={`camera-thumb-duration-${index}`} style={styles.thumbDuration}>
                        {formatSeconds(shot.duration ?? 0)}
                      </Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* Side by side, with no mode switch between them (FR-008). */}
          <View testID="camera-shutter-row" style={styles.shutterRow}>
            <View style={styles.shutterColumn}>
              <TouchableOpacity
                testID="camera-photo-button"
                accessibilityRole="button"
                accessibilityLabel="Take a photo"
                accessibilityState={{ disabled: isRecording }}
                // FR-008: Photo is unavailable while a video is recording.
                disabled={isRecording}
                style={[styles.photoShutter, isRecording && styles.shutterDisabled]}
                onPress={takePhoto}
              >
                <View style={styles.photoShutterInner} />
              </TouchableOpacity>
              <Text testID="camera-photo-label" style={styles.shutterLabel}>
                Photo
              </Text>
            </View>

            <View style={styles.shutterColumn}>
              <TouchableOpacity
                testID="camera-video-button"
                accessibilityRole="button"
                accessibilityLabel={isRecording ? 'Stop recording' : 'Record a video'}
                style={styles.videoShutter}
                onPress={handleVideoPress}
              >
                <View style={isRecording ? styles.videoShutterStop : styles.videoShutterInner} />
              </TouchableOpacity>
              <Text testID="camera-video-label" style={styles.shutterLabel}>
                Video
              </Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  centred: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  preview: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingHorizontal: 20,
  },
  topButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  recordingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: VIDEO_SHUTTER_COLOR,
  },
  recordingTime: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  doneButton: {
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  doneText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000000',
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 20,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  noticeText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
  },
  noticeButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
  },
  noticeButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000000',
  },
  bottom: {
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  strip: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbVideo: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  thumbDuration: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  shutterRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 36,
  },
  shutterColumn: {
    alignItems: 'center',
  },
  photoShutter: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PHOTO_SHUTTER_COLOR,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.65)',
  },
  photoShutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: PHOTO_SHUTTER_COLOR,
  },
  shutterDisabled: {
    opacity: 0.35,
  },
  videoShutter: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: VIDEO_SHUTTER_COLOR,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.65)',
  },
  videoShutterInner: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
  },
  videoShutterStop: {
    width: 24,
    height: 24,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
  },
  shutterLabel: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export { DualShutterCamera };
