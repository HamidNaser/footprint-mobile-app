/**
 * 013 T025 -- `DualShutterCamera`.
 *
 * What is pinned down here (all FR-008):
 *   - a white Photo button and a red Video button, side by side in one row, and **no mode
 *     switch at all** -- the controls on the screen are exactly Close, Photo, Video, Done;
 *   - nothing is held down: neither shutter has `onPressIn`, `onPressOut` or `onLongPress`;
 *   - **every photo and every video is its own piece**: two Photo taps hand up two separate
 *     photo pieces with different files, and a photo and a video are never merged into one;
 *   - Video starts on one tap and stops on the next, handing up exactly one video piece with
 *     its duration -- nothing on the start tap;
 *   - Photo is unavailable while a video is recording, and available again afterwards;
 *   - the 60-second cap is the camera's own (`maxDuration: 60`, **seconds**), so a recording
 *     nobody stops ends by itself at 60 s and still produces its piece;
 *   - the thumbnail strip shows every shot, in capture order;
 *   - Done calls `onDone`;
 *   - a denied camera permission shows the inline message with Open Settings and no shutters.
 *
 * `capturedAt` is the instant the capture **started** (research R8). For a photo that is the
 * shutter tap. For a video it is the tap that started it, not the tap that stopped it -- the
 * difference is the whole length of the clip, and getting it wrong puts the video in the
 * wrong place in capture order.
 *
 * The inline `expo-camera` mock is modelled on the installed version (**expo-camera 57.0.4**,
 * read in `node_modules/expo-camera/build/CameraView.d.ts` and `Camera.types.d.ts`):
 *   - `CameraView` is a component with imperative `takePictureAsync(options)`,
 *     `recordAsync(options)` and `stopRecording()`, reached through a ref;
 *   - `takePictureAsync` resolves to a `CameraCapturedPicture` -- `{ uri, width, height }`
 *     (+ `base64`/`exif` when asked for);
 *   - `recordAsync` resolves to `{ uri }` **or `undefined`**, and only once `stopRecording()`
 *     was invoked, `maxDuration`/`maxFileSize` was reached, or the preview stopped. It
 *     carries **no duration and no dimensions**, so a clip's length can only be measured by
 *     the caller;
 *   - `CameraRecordingOptions` is `{ maxDuration?, maxFileSize?, mirror?, codec? }` and
 *     `maxDuration` is documented in that file as "Maximum video duration in **seconds**".
 *     There is no `quality` recording option in 57.0.4 (it is the `videoQuality` *prop*);
 *   - `useCameraPermissions()` / `useMicrophonePermissions()` return
 *     `[PermissionResponse | null, request, get]`.
 *
 * The mock **honours** `maxDuration` the way the library does -- it resolves `recordAsync` by
 * itself after `maxDuration` seconds on jest's clock -- rather than only recording that it was
 * called. So the cap test fails if the component passes the wrong number, the wrong unit
 * (60000 ms would wait 60,000 s), or nothing at all; it is not a restatement of the mock.
 *
 * What jest cannot prove: that a real camera records on a real phone, and that taking a
 * picture and recording a video from one screen behave on the device as they do here. Those
 * are the owner's device checks (quickstart Q-D5).
 */

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { StyleSheet, Linking } from 'react-native';

jest.mock('expo-camera', () => {
  const React = require('react');

  let photoCount = 0;
  let videoCount = 0;
  /** The recording in flight: expo-camera's promise stays pending until something ends it. */
  let inFlight = null;

  const takePictureAsync = jest.fn(async () => {
    photoCount += 1;
    return {
      uri: `file:///camera/photo-${photoCount}.jpg`,
      width: 4032,
      height: 3024,
    };
  });

  const recordAsync = jest.fn(
    (options = {}) =>
      new Promise((resolve) => {
        videoCount += 1;
        const uri = `file:///camera/video-${videoCount}.mov`;
        const entry = { uri, resolve, timer: null };
        // expo-camera 57: maxDuration is in SECONDS, and reaching it resolves the promise.
        if (typeof options.maxDuration === 'number') {
          entry.timer = setTimeout(() => {
            inFlight = null;
            resolve({ uri });
          }, options.maxDuration * 1000);
        }
        inFlight = entry;
      }),
  );

  const stopRecording = jest.fn(() => {
    if (!inFlight) return;
    const entry = inFlight;
    inFlight = null;
    if (entry.timer) clearTimeout(entry.timer);
    entry.resolve({ uri: entry.uri });
  });

  const CameraView = React.forwardRef((props, ref) => {
    React.useImperativeHandle(
      ref,
      () => ({
        takePictureAsync,
        recordAsync,
        stopRecording,
        pausePreview: async () => {},
        resumePreview: async () => {},
        getAvailablePictureSizesAsync: async () => [],
      }),
      [],
    );
    // A host element, so the test can read the props the component gave the preview.
    return React.createElement('ExpoCameraViewMock', props);
  });
  CameraView.displayName = 'CameraView';

  const grant = (overrides) => ({
    granted: true,
    status: 'granted',
    canAskAgain: true,
    expires: 'never',
    ...overrides,
  });
  const refuse = (overrides) => ({
    granted: false,
    status: 'denied',
    canAskAgain: false,
    expires: 'never',
    ...overrides,
  });

  let cameraPermission = grant();
  let microphonePermission = grant();

  const requestCameraPermission = jest.fn(async () => cameraPermission);
  const requestMicrophonePermission = jest.fn(async () => microphonePermission);

  const api = {
    CameraView,
    useCameraPermissions: () => [cameraPermission, requestCameraPermission],
    useMicrophonePermissions: () => [microphonePermission, requestMicrophonePermission],

    // test handles
    __takePictureAsync: takePictureAsync,
    __recordAsync: recordAsync,
    __stopRecording: stopRecording,
    __photoUri: (n) => `file:///camera/photo-${n}.jpg`,
    __videoUri: (n) => `file:///camera/video-${n}.mov`,
    __isRecording: () => inFlight !== null,
    __refuseCamera: (overrides) => {
      cameraPermission = refuse(overrides);
    },
    __unknownCamera: () => {
      cameraPermission = null;
    },
    __refuseMicrophone: () => {
      microphonePermission = refuse();
    },
    __reset: () => {
      photoCount = 0;
      videoCount = 0;
      if (inFlight?.timer) clearTimeout(inFlight.timer);
      inFlight = null;
      cameraPermission = grant();
      microphonePermission = grant();
      takePictureAsync.mockClear();
      recordAsync.mockClear();
      stopRecording.mockClear();
      requestCameraPermission.mockClear();
      requestMicrophonePermission.mockClear();
    },
  };

  return api;
});

import * as camera from 'expo-camera';
import DualShutterCamera from '../DualShutterCamera';

global.IS_REACT_ACT_ENVIRONMENT = true;

/** The instant every capture in this suite happens at, on jest's fake clock. */
const START_ISO = '2026-11-08T09:41:00.000Z';

let trees = [];
let onShot;
let onDone;
let onClose;
let openSettings;

/**
 * Awaited, not synchronous: `@expo/vector-icons` loads its font asynchronously and sets
 * state when it resolves, so a render left un-flushed produces an "update to Icon was not
 * wrapped in act" warning after the test has finished.
 */
const render = async (props = {}) => {
  let tree;
  await act(async () => {
    tree = renderer.create(
      <DualShutterCamera onShot={onShot} onDone={onDone} onClose={onClose} {...props} />,
    );
  });
  trees.push(tree);
  return tree;
};

const pressable = (tree, testID) =>
  tree.root.findAll((n) => n.props?.testID === testID && typeof n.props?.onPress === 'function')[0];

const has = (tree, testID) => tree.root.findAll((n) => n.props?.testID === testID).length > 0;

const nodeAt = (tree, testID) => tree.root.findAll((n) => n.props?.testID === testID)[0];

const textAt = (tree, testID) => {
  const node = nodeAt(tree, testID);
  if (!node) return undefined;
  const { children } = node.props;
  return Array.isArray(children) ? children.join('') : String(children);
};

/** Every control on the screen, by testID -- a mode switch would show up here. */
const controlIds = (tree) =>
  Array.from(
    new Set(
      tree.root
        .findAll(
          (n) => typeof n.props?.onPress === 'function' && typeof n.props?.testID === 'string',
        )
        .map((n) => n.props.testID),
    ),
  ).sort();

/** Controls with no testID, which the assertion above could not see. */
const untestableControls = (tree) =>
  tree.root.findAll(
    (n) => typeof n.props?.onPress === 'function' && typeof n.props?.testID !== 'string',
  );

const preview = (tree) => tree.root.findAll((n) => n.type === 'ExpoCameraViewMock')[0];

const tap = async (tree, testID) => {
  const target = pressable(tree, testID);
  expect(target).toBeDefined();
  await act(async () => {
    target.props.onPress();
  });
};

/** Lets the fake clock run, so the recording's length and the camera's cap move together. */
const elapse = async (ms) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

const bg = (node) => StyleSheet.flatten(node.props.style)?.backgroundColor;

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'performance', 'queueMicrotask'] });
  jest.setSystemTime(new Date(START_ISO));
  camera.__reset();
  onShot = jest.fn();
  onDone = jest.fn();
  onClose = jest.fn();
  openSettings = jest.spyOn(Linking, 'openSettings').mockImplementation(async () => {});
});

afterEach(() => {
  trees.forEach((tree) => act(() => tree.unmount()));
  trees = [];
  openSettings.mockRestore();
  jest.useRealTimers();
});

describe('DualShutterCamera: two shutters side by side, no mode switch (FR-008)', () => {
  it('shows a white Photo button and a red Video button in the same row', async () => {
    const tree = await render();

    const row = nodeAt(tree, 'camera-shutter-row');
    expect(row).toBeDefined();
    expect(StyleSheet.flatten(row.props.style)?.flexDirection).toBe('row');

    // Side by side means both live inside that row, not one replacing the other.
    expect(
      row.findAll((n) => n.props?.testID === 'camera-photo-button').length,
    ).toBeGreaterThan(0);
    expect(
      row.findAll((n) => n.props?.testID === 'camera-video-button').length,
    ).toBeGreaterThan(0);

    expect(bg(pressable(tree, 'camera-photo-button'))).toBe('#FFFFFF');
    expect(bg(pressable(tree, 'camera-video-button'))).toBe('#E5484D');

    expect(textAt(tree, 'camera-photo-label')).toBe('Photo');
    expect(textAt(tree, 'camera-video-label')).toBe('Video');
  });

  it('offers no mode switch: the only controls are Close, Photo, Video and Done', async () => {
    const tree = await render();

    expect(controlIds(tree)).toEqual([
      'camera-close-button',
      'camera-done-button',
      'camera-photo-button',
      'camera-video-button',
    ]);
    // Nothing pressable hides from the list above.
    expect(untestableControls(tree)).toHaveLength(0);
  });

  it('holds nothing down: no press-and-hold on either shutter', async () => {
    const tree = await render();

    ['camera-photo-button', 'camera-video-button'].forEach((testID) => {
      const button = pressable(tree, testID);
      expect(button.props.onPressIn).toBeUndefined();
      expect(button.props.onPressOut).toBeUndefined();
      expect(button.props.onLongPress).toBeUndefined();
      expect(button.props.delayLongPress).toBeUndefined();
    });
  });
});

describe('DualShutterCamera: every photo and every video is its own piece (FR-008)', () => {
  it('hands up two separate photo pieces for two Photo taps', async () => {
    const tree = await render();

    await tap(tree, 'camera-photo-button');
    await tap(tree, 'camera-photo-button');

    expect(camera.__takePictureAsync).toHaveBeenCalledTimes(2);
    expect(onShot).toHaveBeenCalledTimes(2);

    const [first] = onShot.mock.calls[0];
    const [second] = onShot.mock.calls[1];

    expect(first).toEqual(
      expect.objectContaining({
        kind: 'photo',
        uri: camera.__photoUri(1),
        width: 4032,
        height: 3024,
        capturedAt: START_ISO,
      }),
    );
    expect(second).toEqual(
      expect.objectContaining({ kind: 'photo', uri: camera.__photoUri(2) }),
    );

    // Two pieces, not one piece carrying two files.
    expect(first.uri).not.toBe(second.uri);
    expect(Array.isArray(first.uri)).toBe(false);
    expect(first.duration).toBeUndefined();
  });

  it('keeps a photo and a video apart, each with its own time and kind', async () => {
    const tree = await render();

    await tap(tree, 'camera-photo-button');

    await elapse(5000);
    const videoStart = new Date().toISOString();
    await tap(tree, 'camera-video-button');
    await elapse(12000);
    await tap(tree, 'camera-video-button');

    expect(onShot).toHaveBeenCalledTimes(2);
    const kinds = onShot.mock.calls.map(([piece]) => piece.kind);
    expect(kinds).toEqual(['photo', 'video']);

    expect(onShot.mock.calls[0][0].capturedAt).toBe(START_ISO);
    expect(onShot.mock.calls[1][0].capturedAt).toBe(videoStart);
    expect(onShot.mock.calls[0][0].capturedAt).not.toBe(
      onShot.mock.calls[1][0].capturedAt,
    );
  });
});

describe('DualShutterCamera: Video starts on one tap and stops on the next (FR-008)', () => {
  it('hands up one video piece, with its duration, only on the stop', async () => {
    const tree = await render();

    await tap(tree, 'camera-video-button');

    // A start is not a piece.
    expect(onShot).not.toHaveBeenCalled();
    expect(camera.__recordAsync).toHaveBeenCalledTimes(1);
    expect(has(tree, 'camera-recording-indicator')).toBe(true);

    await elapse(12000);
    await tap(tree, 'camera-video-button');

    expect(camera.__stopRecording).toHaveBeenCalledTimes(1);
    expect(onShot).toHaveBeenCalledTimes(1);

    const [piece] = onShot.mock.calls[0];
    expect(piece.kind).toBe('video');
    expect(piece.uri).toBe(camera.__videoUri(1));
    expect(piece.duration).toBe(12); // seconds (data-model.md)
    expect(has(tree, 'camera-recording-indicator')).toBe(false);
  });

  it('stamps the video with when recording started, not when it stopped (research R8)', async () => {
    const tree = await render();

    await tap(tree, 'camera-video-button');
    await elapse(42000);

    const stopInstant = new Date().toISOString();
    expect(stopInstant).not.toBe(START_ISO); // the clock really did move

    await tap(tree, 'camera-video-button');

    const [piece] = onShot.mock.calls[0];
    expect(piece.capturedAt).toBe(START_ISO);
    expect(piece.capturedAt).not.toBe(stopInstant);
    expect(piece.duration).toBe(42);
  });

  it('records a second video after the first: each is its own piece', async () => {
    const tree = await render();

    await tap(tree, 'camera-video-button');
    await elapse(4000);
    await tap(tree, 'camera-video-button');

    await elapse(3000);
    const secondStart = new Date().toISOString();

    await tap(tree, 'camera-video-button');
    await elapse(7000);
    await tap(tree, 'camera-video-button');

    expect(onShot).toHaveBeenCalledTimes(2);
    expect(camera.__recordAsync).toHaveBeenCalledTimes(2);

    const [first] = onShot.mock.calls[0];
    const [second] = onShot.mock.calls[1];
    expect(first.uri).toBe(camera.__videoUri(1));
    expect(second.uri).toBe(camera.__videoUri(2));
    expect(first.capturedAt).toBe(START_ISO);
    expect(second.capturedAt).toBe(secondStart);
    expect(first.duration).toBe(4);
    expect(second.duration).toBe(7);
  });

  it('puts the preview in video output only while recording', async () => {
    const tree = await render();

    // recordAsync fails outright on a picture-mode camera, and takePictureAsync is the
    // other way round: the preview must follow the shutter being used, invisibly.
    expect(preview(tree).props.mode).toBe('picture');

    await tap(tree, 'camera-video-button');
    expect(preview(tree).props.mode).toBe('video');

    await elapse(2000);
    await tap(tree, 'camera-video-button');
    expect(preview(tree).props.mode).toBe('picture');
  });
});

describe('DualShutterCamera: Photo is unavailable while recording (FR-008)', () => {
  it('disables Photo while a video records, and takes no picture if it is pressed', async () => {
    const tree = await render();

    expect(pressable(tree, 'camera-photo-button').props.disabled).toBeFalsy();

    await tap(tree, 'camera-video-button');

    expect(pressable(tree, 'camera-photo-button').props.disabled).toBe(true);

    // Belt and braces: even reached directly, it must not capture mid-recording.
    await tap(tree, 'camera-photo-button');
    expect(camera.__takePictureAsync).not.toHaveBeenCalled();
    expect(onShot).not.toHaveBeenCalled();
  });

  it('makes Photo available again once the recording has stopped', async () => {
    const tree = await render();

    await tap(tree, 'camera-video-button');
    await elapse(2000);
    await tap(tree, 'camera-video-button');

    expect(pressable(tree, 'camera-photo-button').props.disabled).toBeFalsy();

    await tap(tree, 'camera-photo-button');
    expect(camera.__takePictureAsync).toHaveBeenCalledTimes(1);
    expect(onShot).toHaveBeenCalledTimes(2);
    expect(onShot.mock.calls[1][0].kind).toBe('photo');
  });
});

describe('DualShutterCamera: the 60-second cap (FR-008)', () => {
  it('asks the camera itself to cap the recording at 60 seconds', async () => {
    const tree = await render();

    await tap(tree, 'camera-video-button');

    expect(camera.__recordAsync).toHaveBeenCalledTimes(1);
    expect(camera.__recordAsync).toHaveBeenCalledWith(
      expect.objectContaining({ maxDuration: 60 }),
    );
  });

  it('ends by itself at 60 seconds and still hands up the clip, with nobody tapping stop', async () => {
    const tree = await render();

    await tap(tree, 'camera-video-button');
    await elapse(60000);

    expect(camera.__stopRecording).not.toHaveBeenCalled(); // the cap was the camera's
    expect(onShot).toHaveBeenCalledTimes(1);

    const [piece] = onShot.mock.calls[0];
    expect(piece.kind).toBe('video');
    expect(piece.uri).toBe(camera.__videoUri(1)); // kept, not discarded
    expect(piece.duration).toBe(60);
    expect(piece.capturedAt).toBe(START_ISO);

    expect(has(tree, 'camera-recording-indicator')).toBe(false);
    expect(pressable(tree, 'camera-photo-button').props.disabled).toBeFalsy();
  });

  it('adds no second piece after the cap has ended the recording', async () => {
    const tree = await render();

    await tap(tree, 'camera-video-button');
    await elapse(60000);
    await elapse(30000);

    expect(onShot).toHaveBeenCalledTimes(1);
  });
});

describe('DualShutterCamera: the thumbnail strip', () => {
  it('shows every shot, in capture order', async () => {
    const tree = await render();

    expect(nodeAt(tree, 'camera-thumb-0')).toBeUndefined();

    await tap(tree, 'camera-photo-button');
    await tap(tree, 'camera-photo-button');
    await tap(tree, 'camera-video-button');
    await elapse(8000);
    await tap(tree, 'camera-video-button');

    const strip = nodeAt(tree, 'camera-thumbnail-strip');
    expect(strip).toBeDefined();

    const thumbs = tree.root.findAll(
      (n) => typeof n.props?.testID === 'string' && /^camera-thumb-\d+$/.test(n.props.testID),
    );
    const ids = Array.from(new Set(thumbs.map((n) => n.props.testID))).sort();
    expect(ids).toEqual(['camera-thumb-0', 'camera-thumb-1', 'camera-thumb-2']);

    expect(nodeAt(tree, 'camera-thumb-0').props.accessibilityLabel).toBe('Photo 1');
    expect(nodeAt(tree, 'camera-thumb-1').props.accessibilityLabel).toBe('Photo 2');
    expect(nodeAt(tree, 'camera-thumb-2').props.accessibilityLabel).toBe('Video 3');

    expect(nodeAt(tree, 'camera-thumb-image-0').props.source).toEqual({
      uri: camera.__photoUri(1),
    });
    expect(nodeAt(tree, 'camera-thumb-image-1').props.source).toEqual({
      uri: camera.__photoUri(2),
    });
    expect(textAt(tree, 'camera-thumb-duration-2')).toBe('0:08');
  });
});

describe('DualShutterCamera: Done', () => {
  it('calls onDone and nothing else', async () => {
    const tree = await render();

    await tap(tree, 'camera-photo-button');
    await tap(tree, 'camera-done-button');

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(onShot).toHaveBeenCalledTimes(1); // the photo, not a second piece on Done
  });
});

describe('DualShutterCamera: a denied camera permission', () => {
  it('shows the inline message with Open Settings, and no shutters', async () => {
    camera.__refuseCamera();
    const tree = await render();

    expect(has(tree, 'camera-permission-denied')).toBe(true);
    expect(textAt(tree, 'camera-permission-message')).toMatch(/camera/i);
    expect(textAt(tree, 'camera-permission-message')).toMatch(/settings/i);

    // No way to pretend a capture happened.
    expect(has(tree, 'camera-photo-button')).toBe(false);
    expect(has(tree, 'camera-video-button')).toBe(false);
    expect(preview(tree)).toBeUndefined();

    await tap(tree, 'camera-open-settings-button');
    expect(openSettings).toHaveBeenCalledTimes(1);

    // Nothing was captured and the screen can still be left.
    expect(onShot).not.toHaveBeenCalled();
    await tap(tree, 'camera-close-button');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('offers to ask again when the phone still allows it', async () => {
    camera.__refuseCamera({ canAskAgain: true, status: 'undetermined' });
    const tree = await render();

    expect(has(tree, 'camera-open-settings-button')).toBe(true);
    await tap(tree, 'camera-allow-button');
    expect(camera.useCameraPermissions()[1]).toHaveBeenCalledTimes(1);
  });

  it('shows no controls at all while the permission is still unknown', async () => {
    camera.__unknownCamera();
    const tree = await render();

    expect(has(tree, 'camera-photo-button')).toBe(false);
    expect(has(tree, 'camera-video-button')).toBe(false);
    expect(preview(tree)).toBeUndefined();
  });
});

describe('DualShutterCamera: a denied microphone', () => {
  it('records nothing and says so inline, with Open Settings', async () => {
    camera.__refuseMicrophone();
    const tree = await render();

    await tap(tree, 'camera-video-button');

    expect(camera.__recordAsync).not.toHaveBeenCalled();
    expect(onShot).not.toHaveBeenCalled();
    expect(has(tree, 'camera-microphone-denied')).toBe(true);
    expect(textAt(tree, 'camera-microphone-message')).toMatch(/microphone/i);

    await tap(tree, 'camera-open-settings-button');
    expect(openSettings).toHaveBeenCalledTimes(1);

    // The camera still works: a refused microphone must not cost the photos too.
    await tap(tree, 'camera-photo-button');
    expect(onShot).toHaveBeenCalledTimes(1);
    expect(onShot.mock.calls[0][0].kind).toBe('photo');
  });
});
