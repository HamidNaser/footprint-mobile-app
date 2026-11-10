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
 * Added in T026's first review round, all of it about a capture that produced nothing:
 *   - **every failed capture is signalled** through `onCaptureFailed`, never swallowed --
 *     `recordAsync` rejecting, `recordAsync` resolving `undefined` (which its own typings
 *     declare), `takePictureAsync` rejecting, a picture with no `uri`, and a parent whose
 *     `onShot` threw. Each carries `kind`, `reason`, `error`, `capturedAt` and `duration`,
 *     and each means *no piece was added*; a lost recording also says so on screen;
 *   - **Video is unavailable while a photo is in flight** -- the mirror of Photo being
 *     unavailable while recording, and reachable by an ordinary fast double-tap;
 *   - a second Video tap *inside* the microphone dialog asks once and records once, and a
 *     permission ask that *rejects* is a refusal rather than a dead Video shutter;
 *   - a clip ended by the camera's own cap never reports more than the cap;
 *   - `stopRecording()` throwing does not take the press handler down with it, and does not
 *     stamp the clip from a stop that failed;
 *   - the mount flag survives an effect being torn down and set up again (StrictMode, and
 *     React Fast Refresh in development), which otherwise discards every video;
 *   - a photo reaches the `onShot` the parent has *now*, not the one the tap closed over.
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
  /** What the microphone *dialog* answers, when that differs from the hook's state. */
  let microphoneAnswer = null;
  /** Dialogs still on screen, oldest first -- only when asking is held open. */
  let microphoneAsks = null;

  const requestCameraPermission = jest.fn(async () => cameraPermission);
  const requestMicrophonePermission = jest.fn(() => {
    const answer = microphoneAnswer ?? microphonePermission;
    if (!microphoneAsks) return Promise.resolve(answer);
    // Held open, the way an OS permission dialog is: it answers when the test says so.
    return new Promise((resolve) => {
      microphoneAsks.push(() => resolve(answer));
    });
  });

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
    /**
     * The microphone has not been asked for yet, and the dialog is held open: a Video tap
     * reaches `requestMicrophonePermission` and waits there until `__answerMicrophoneAsk`.
     */
    __askMicrophoneSlowly: () => {
      microphonePermission = {
        granted: false,
        status: 'undetermined',
        canAskAgain: true,
        expires: 'never',
      };
      microphoneAnswer = grant();
      microphoneAsks = [];
    },
    __pendingMicrophoneAsks: () => (microphoneAsks ? microphoneAsks.length : 0),
    __answerMicrophoneAsk: () => {
      microphoneAsks.shift()();
    },
    __reset: () => {
      photoCount = 0;
      videoCount = 0;
      if (inFlight?.timer) clearTimeout(inFlight.timer);
      inFlight = null;
      cameraPermission = grant();
      microphonePermission = grant();
      microphoneAnswer = null;
      microphoneAsks = null;
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
let onCaptureFailed;
let openSettings;

const element = (props = {}) => (
  <DualShutterCamera
    onShot={onShot}
    onDone={onDone}
    onClose={onClose}
    onCaptureFailed={onCaptureFailed}
    {...props}
  />
);

/**
 * Awaited, not synchronous: `@expo/vector-icons` loads its font asynchronously and sets
 * state when it resolves, so a render left un-flushed produces an "update to Icon was not
 * wrapped in act" warning after the test has finished.
 */
const render = async (props = {}) => {
  let tree;
  await act(async () => {
    tree = renderer.create(element(props));
  });
  trees.push(tree);
  return tree;
};

/**
 * The same component under `StrictMode`, which tears an effect down and sets it up again
 * on mount -- what React Fast Refresh does in development, and what turning StrictMode on
 * would do in production code paths.
 */
const renderStrict = async (props = {}) => {
  let tree;
  await act(async () => {
    tree = renderer.create(<React.StrictMode>{element(props)}</React.StrictMode>);
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
  onCaptureFailed = jest.fn();
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

describe('DualShutterCamera: a capture that produced nothing is signalled, not swallowed', () => {
  // There is no crash reporting in this app (`CLAUDE.md`), so a `console.warn` is not a
  // signal, and going back to the idle shutters is exactly what "you have not captured
  // anything yet" looks like. `CaptureScreen` owns the inline failed-capture message for
  // the capture screen as a whole (UI contract) and cannot show one it is never told about.
  it('reports a recording whose recordAsync rejected, and hands up no piece', async () => {
    const tree = await render();

    // The most likely real-device failure of the `mode`-a-render-early design: the very
    // first Video tap rejects. Silent, it is indistinguishable from nothing happening.
    camera.__recordAsync.mockImplementationOnce(async () => {
      throw new Error('the camera could not start recording');
    });

    await tap(tree, 'camera-video-button');

    expect(onShot).not.toHaveBeenCalled();
    expect(onCaptureFailed).toHaveBeenCalledTimes(1);

    const failure = onCaptureFailed.mock.calls[0][0];
    expect(failure.kind).toBe('video');
    expect(failure.reason).toBe('capture-failed');
    expect(failure.error).toBeInstanceOf(Error);
    // Enough for the screen to say something true about what was lost.
    expect(failure.capturedAt).toBe(START_ISO);
    expect(failure.duration).toBe(0);

    // And the camera says it on screen itself, as it does for a refused microphone.
    expect(has(tree, 'camera-capture-failed')).toBe(true);
    expect(textAt(tree, 'camera-capture-failed-message')).toMatch(/video/i);

    // Back to idle, and usable.
    expect(has(tree, 'camera-recording-indicator')).toBe(false);
    expect(pressable(tree, 'camera-photo-button').props.disabled).toBeFalsy();
  });

  it('reports a long recording that resolved with no file at all', async () => {
    const tree = await render();

    // `CameraView.d.ts` declares `recordAsync(): Promise<{uri: string} | undefined>`, so
    // `undefined` is documented, not theoretical. Fifty seconds, a tap on stop, no piece.
    let finishRecording;
    camera.__recordAsync.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRecording = () => resolve(undefined);
        }),
    );

    await tap(tree, 'camera-video-button');
    await elapse(50000);
    await tap(tree, 'camera-video-button');
    await act(async () => {
      finishRecording();
    });

    expect(onShot).not.toHaveBeenCalled();
    expect(onCaptureFailed).toHaveBeenCalledTimes(1);

    const failure = onCaptureFailed.mock.calls[0][0];
    expect(failure.kind).toBe('video');
    expect(failure.reason).toBe('no-file');
    expect(failure.error).toBeNull();
    expect(failure.capturedAt).toBe(START_ISO);
    expect(failure.duration).toBe(50);

    expect(has(tree, 'camera-capture-failed')).toBe(true);
    expect(has(tree, 'camera-recording-indicator')).toBe(false);
  });

  it('reports a photo whose takePictureAsync rejected, and stays usable', async () => {
    const tree = await render();

    camera.__takePictureAsync.mockImplementationOnce(async () => {
      throw new Error('the shutter failed');
    });

    await tap(tree, 'camera-photo-button');

    expect(onShot).not.toHaveBeenCalled();
    expect(onCaptureFailed).toHaveBeenCalledTimes(1);

    const failure = onCaptureFailed.mock.calls[0][0];
    expect(failure.kind).toBe('photo');
    expect(failure.reason).toBe('capture-failed');
    expect(failure.error).toBeInstanceOf(Error);
    expect(failure.capturedAt).toBe(START_ISO);
    expect(failure.duration).toBe(0);

    // One lost photo does not end the session.
    await tap(tree, 'camera-photo-button');
    expect(onShot).toHaveBeenCalledTimes(1);
    expect(onCaptureFailed).toHaveBeenCalledTimes(1);
  });

  it('reports a photo that resolved without naming a file', async () => {
    const tree = await render();

    camera.__takePictureAsync.mockImplementationOnce(async () => ({
      width: 4032,
      height: 3024,
    }));

    await tap(tree, 'camera-photo-button');

    expect(onShot).not.toHaveBeenCalled();
    expect(onCaptureFailed).toHaveBeenCalledTimes(1);
    expect(onCaptureFailed.mock.calls[0][0].kind).toBe('photo');
    expect(onCaptureFailed.mock.calls[0][0].reason).toBe('no-file');
    expect(onCaptureFailed.mock.calls[0][0].error).toBeNull();
    // Nothing in the strip either: a thumbnail for a piece nobody has is the same lie.
    expect(nodeAt(tree, 'camera-thumb-0')).toBeUndefined();
  });

  // A lost photo is exactly as invisible on screen as a lost recording was: the shutters go
  // back to idle and nothing says otherwise. The callback tells the capture screen, which is
  // not the same as putting something in front of the person holding the phone -- and this
  // feature has now made the same ruling three times, each time because a failure nobody can
  // see is the shape that makes a loss invisible. So the inline notice covers both shutters.
  it('says on screen that a photo was not kept, not only upward', async () => {
    const tree = await render();

    camera.__takePictureAsync.mockImplementationOnce(async () => {
      throw new Error('the shutter failed');
    });

    await tap(tree, 'camera-photo-button');

    expect(has(tree, 'camera-capture-failed')).toBe(true);
    // Truthful about what happened: a photo was not kept. Not that a memory was lost --
    // nothing else is touched, and the capture screen still has every earlier piece.
    expect(textAt(tree, 'camera-capture-failed-message')).toMatch(/photo/i);
    expect(textAt(tree, 'camera-capture-failed-message')).not.toMatch(/video/i);
    expect(textAt(tree, 'camera-capture-failed-message')).not.toMatch(/memory|lost/i);
  });

  it('says it for a photo that resolved with no file, and clears it on the next photo', async () => {
    const tree = await render();

    camera.__takePictureAsync.mockImplementationOnce(async () => ({
      width: 4032,
      height: 3024,
    }));
    await tap(tree, 'camera-photo-button');
    expect(has(tree, 'camera-capture-failed')).toBe(true);

    // The next photo clears it, as the next recording clears the recording notice.
    await tap(tree, 'camera-photo-button');
    expect(onShot).toHaveBeenCalledTimes(1);
    expect(has(tree, 'camera-capture-failed')).toBe(false);
  });

  it('does not blame the photo for a lost recording, or the other way round', async () => {
    const tree = await render();

    camera.__recordAsync.mockImplementationOnce(async () => {
      throw new Error('the camera could not start recording');
    });
    await tap(tree, 'camera-video-button');
    expect(textAt(tree, 'camera-capture-failed-message')).toMatch(/video/i);
    expect(textAt(tree, 'camera-capture-failed-message')).not.toMatch(/photo/i);

    camera.__takePictureAsync.mockImplementationOnce(async () => {
      throw new Error('the shutter failed');
    });
    await tap(tree, 'camera-photo-button');
    expect(textAt(tree, 'camera-capture-failed-message')).toMatch(/photo/i);
    expect(textAt(tree, 'camera-capture-failed-message')).not.toMatch(/video/i);
  });

  it('reports a piece the parent itself failed to keep, and shows no thumbnail for it', async () => {
    const tree = await render();

    // tasks.md's T029 case is "`addPiece` rejects (storage full)"; a handler that throws
    // synchronously is the same shape, and `onShot` is called, not awaited.
    onShot.mockImplementationOnce(() => {
      throw new Error('storage full');
    });

    await tap(tree, 'camera-photo-button');

    expect(onShot).toHaveBeenCalledTimes(1);
    expect(onCaptureFailed).toHaveBeenCalledTimes(1);
    expect(onCaptureFailed.mock.calls[0][0].kind).toBe('photo');
    expect(onCaptureFailed.mock.calls[0][0].reason).toBe('handler-failed');
    expect(nodeAt(tree, 'camera-thumb-0')).toBeUndefined();

    // And the camera still works.
    await tap(tree, 'camera-photo-button');
    expect(onShot).toHaveBeenCalledTimes(2);
    expect(nodeAt(tree, 'camera-thumb-0')).toBeDefined();
  });

  it('signals nothing at all when the photo and the video are both fine', async () => {
    const tree = await render();

    await tap(tree, 'camera-photo-button');
    await tap(tree, 'camera-video-button');
    await elapse(3000);
    await tap(tree, 'camera-video-button');

    expect(onShot).toHaveBeenCalledTimes(2);
    expect(onCaptureFailed).not.toHaveBeenCalled();
    expect(has(tree, 'camera-capture-failed')).toBe(false);
  });

  it('clears the notice when the next recording is started', async () => {
    const tree = await render();

    camera.__recordAsync.mockImplementationOnce(async () => {
      throw new Error('the camera could not start recording');
    });
    await tap(tree, 'camera-video-button');
    expect(has(tree, 'camera-capture-failed')).toBe(true);

    await tap(tree, 'camera-video-button');
    expect(has(tree, 'camera-capture-failed')).toBe(false);

    await elapse(2000);
    await tap(tree, 'camera-video-button');
    expect(onShot).toHaveBeenCalledTimes(1);
    expect(has(tree, 'camera-capture-failed')).toBe(false);
  });
});

describe('DualShutterCamera: a photo in flight blocks the Video shutter (FR-008)', () => {
  // `mode` flips `picture` -> `video` on the Video tap. Issuing that flip, and `recordAsync`
  // with it, while a still capture is in flight is the mirror of the guard that stops Photo
  // during a recording. On a device `takePictureAsync` takes hundreds of milliseconds, so
  // this is an ordinary fast double-tap, not a theoretical window.
  it('disables Video while a photo is being taken, and records nothing if it is reached', async () => {
    const tree = await render();

    let finishPhoto;
    camera.__takePictureAsync.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishPhoto = () => resolve({ uri: camera.__photoUri(1), width: 4032, height: 3024 });
        }),
    );

    await tap(tree, 'camera-photo-button');
    expect(onShot).not.toHaveBeenCalled(); // still in flight

    expect(pressable(tree, 'camera-video-button').props.disabled).toBe(true);

    // Belt and braces: even reached directly, it must not flip the preview or record.
    await tap(tree, 'camera-video-button');
    expect(camera.__recordAsync).not.toHaveBeenCalled();
    expect(preview(tree).props.mode).toBe('picture');
    expect(has(tree, 'camera-recording-indicator')).toBe(false);

    await act(async () => {
      finishPhoto();
    });

    expect(onShot).toHaveBeenCalledTimes(1);
    expect(onShot.mock.calls[0][0].kind).toBe('photo');
    expect(onCaptureFailed).not.toHaveBeenCalled();

    // And Video works again the moment the photo has landed.
    expect(pressable(tree, 'camera-video-button').props.disabled).toBeFalsy();
    await tap(tree, 'camera-video-button');
    expect(camera.__recordAsync).toHaveBeenCalledTimes(1);
    expect(preview(tree).props.mode).toBe('video');
  });
});

describe('DualShutterCamera: a second Video tap inside the permission ask', () => {
  // The guard at the top of `beginRecording` is evaluated, then the microphone permission
  // is awaited -- an OS dialog, open for as long as the person leaves it. Only a flag set
  // *before* that await can stop a second tap, because no state has changed yet.
  it('asks once and records once when the second tap lands while the dialog is up', async () => {
    camera.__askMicrophoneSlowly();
    const tree = await render();

    const button = pressable(tree, 'camera-video-button');

    await act(async () => {
      button.props.onPress();
    });
    expect(camera.__pendingMicrophoneAsks()).toBe(1);

    await act(async () => {
      button.props.onPress();
    });
    expect(camera.__pendingMicrophoneAsks()).toBe(1);

    await elapse(4000);
    await act(async () => {
      camera.__answerMicrophoneAsk();
    });

    // No second dialog left hanging, and one recording for one recording's worth of taps.
    expect(camera.__pendingMicrophoneAsks()).toBe(0);
    expect(camera.__recordAsync).toHaveBeenCalledTimes(1);

    await elapse(6000);
    await tap(tree, 'camera-video-button');

    expect(onShot).toHaveBeenCalledTimes(1);
    expect(onShot.mock.calls[0][0].duration).toBe(6);

    // And the pending flag was not left set by the tap that was refused: a stale one would
    // refuse every recording from here on.
    await tap(tree, 'camera-video-button');
    expect(camera.__pendingMicrophoneAsks()).toBe(1);
    await act(async () => {
      camera.__answerMicrophoneAsk();
    });
    expect(camera.__recordAsync).toHaveBeenCalledTimes(2);
  });

  it('asks again after a refusal rather than going quietly dead', async () => {
    camera.__refuseMicrophone();
    const tree = await render();

    await tap(tree, 'camera-video-button');
    await tap(tree, 'camera-video-button');

    expect(camera.useMicrophonePermissions()[1]).toHaveBeenCalledTimes(2);
    expect(camera.__recordAsync).not.toHaveBeenCalled();
    expect(has(tree, 'camera-microphone-denied')).toBe(true);
  });
});

describe('DualShutterCamera: the mounted flag survives an effect re-run', () => {
  // `mountedRef` is `useRef(true)` and the mount effect's cleanup sets it `false`. React
  // Fast Refresh in development, and `StrictMode`, tear an effect down and set it up again
  // -- after which the flag is `false` for the rest of the component's life and **every
  // video is silently discarded**.
  it('still hands up the video under StrictMode', async () => {
    // react-native's own `TouchableOpacity` reaches for `findNodeHandle` to animate its
    // opacity, which StrictMode deprecates -- its warning, not this component's, and the
    // only reason this suite is not silent. Anything *else* console.error says is still a
    // failure, which is what `unexpected` is for.
    const unexpected = [];
    const consoleError = jest.spyOn(console, 'error').mockImplementation((...args) => {
      const first = typeof args[0] === 'string' ? args[0] : String(args[0]);
      // The format string, before `%s` substitution: "%s is deprecated in StrictMode…".
      if (!first.includes('is deprecated in StrictMode')) unexpected.push(first);
    });

    try {
      const tree = await renderStrict();

      await tap(tree, 'camera-video-button');
      await elapse(5000);
      await tap(tree, 'camera-video-button');

      expect(onShot).toHaveBeenCalledTimes(1);
      expect(onShot.mock.calls[0][0].kind).toBe('video');
      expect(onShot.mock.calls[0][0].duration).toBe(5);
      expect(onCaptureFailed).not.toHaveBeenCalled();
      expect(has(tree, 'camera-recording-indicator')).toBe(false);
    } finally {
      // Unmounted here rather than in the shared teardown, so the same react-native
      // warning on the way out is not printed after the test has finished.
      trees.forEach((tree) => act(() => tree.unmount()));
      trees = [];
      consoleError.mockRestore();
    }

    expect(unexpected).toEqual([]);
  });
});

describe('DualShutterCamera: a capped clip never reports more than the cap (FR-008)', () => {
  // The length is measured from the clock, because `recordAsync` carries no duration --
  // and the clock is read after the camera's own cap has resolved the recording, so a
  // capped clip measures a little over 60 s. A reader of FR-008's "limited to 60 seconds"
  // could reject 60.4.
  it('clamps a clip ended by the camera to the cap', async () => {
    const tree = await render();

    await tap(tree, 'camera-video-button');
    await elapse(60400);

    expect(camera.__stopRecording).not.toHaveBeenCalled(); // the cap was the camera's
    expect(onShot).toHaveBeenCalledTimes(1);

    const [piece] = onShot.mock.calls[0];
    expect(piece.duration).toBe(60);
  });

  it('leaves a clip inside the cap exactly as measured', async () => {
    const tree = await render();

    await tap(tree, 'camera-video-button');
    await elapse(7500);
    await tap(tree, 'camera-video-button');

    expect(onShot.mock.calls[0][0].duration).toBe(7.5);
  });
});

describe('DualShutterCamera: a stop that throws', () => {
  // The unmount cleanup wraps `stopRecording()` in a `try`/`catch` and its comment concedes
  // the call can throw. The same call from a press handler needs the same guard -- and the
  // window is real: the camera's own cap can resolve the recording natively a moment before
  // this component has committed `setIsRecording(false)`.
  it('survives it, and does not stamp the clip from a stop that failed', async () => {
    const tree = await render();

    await tap(tree, 'camera-video-button');
    await elapse(2000);

    camera.__stopRecording.mockImplementationOnce(() => {
      throw new Error('nothing is recording');
    });
    await tap(tree, 'camera-video-button');

    expect(onShot).not.toHaveBeenCalled();

    // The recording is still the camera's, and its own cap ends it -- with the clip's real
    // length, not the length up to the stop that failed.
    await elapse(58000);

    expect(onShot).toHaveBeenCalledTimes(1);
    expect(onShot.mock.calls[0][0].duration).toBe(60);
    expect(onShot.mock.calls[0][0].capturedAt).toBe(START_ISO);
  });
});

describe('DualShutterCamera: a photo reaches the latest onShot', () => {
  // `takePictureAsync` is awaited, and that await can outlive the `onShot` the tap closed
  // over -- the same weakness the video path already holds `addShotRef` for.
  it('hands the photo to the onShot the parent has now, not the one at the tap', async () => {
    const tree = await render();

    let finishPhoto;
    camera.__takePictureAsync.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishPhoto = () => resolve({ uri: camera.__photoUri(1), width: 4032, height: 3024 });
        }),
    );

    await tap(tree, 'camera-photo-button');

    const later = jest.fn();
    await act(async () => {
      tree.update(element({ onShot: later }));
    });

    await act(async () => {
      finishPhoto();
    });

    expect(later).toHaveBeenCalledTimes(1);
    expect(later.mock.calls[0][0].uri).toBe(camera.__photoUri(1));
    expect(onShot).not.toHaveBeenCalled();
  });
});

describe('DualShutterCamera: a permission ask that rejects', () => {
  // The pending flag is now set *before* the microphone await, which is what stops a second
  // tap inside the dialog. That makes an ask that *throws* the one way the flag could be
  // left set for good -- after which Video is permanently dead and silent about it.
  it('treats it as a refusal rather than leaving the Video shutter dead', async () => {
    camera.__refuseMicrophone();
    const tree = await render();

    camera.useMicrophonePermissions()[1].mockImplementationOnce(() =>
      Promise.reject(new Error('the permission dialog could not be shown')),
    );

    await tap(tree, 'camera-video-button');

    expect(camera.__recordAsync).not.toHaveBeenCalled();
    expect(has(tree, 'camera-microphone-denied')).toBe(true);

    // And the next tap still reaches the ask.
    await tap(tree, 'camera-video-button');
    expect(camera.useMicrophonePermissions()[1]).toHaveBeenCalledTimes(2);
  });
});

/**
 * Important 5 of the whole-branch review -- the camera must not truncate a voice clip.
 *
 * FR-007: switching between the three controls loses nothing. `PieceList` was given
 * `isRecording` so that playing a saved clip cannot steal the audio session from a running
 * recording (`CaptureScreen.js` explains why), but opening the camera and tapping **Video** over
 * a running clip does the same thing one level out: `recordAsync` asks for the microphone and
 * the recording is interrupted. It is not a *loss* -- `VoiceRecorderBar`'s interruption path
 * finalises the clip and keeps the part already recorded, which is US2-2's behaviour -- but it
 * is a silent truncation caused by a tap in our own interface, which is worse than either case
 * FR-007 names.
 *
 * **Video only.** Photo needs no microphone, and FR-008 makes two quick taps of Photo the
 * designed use of this camera: disabling it would take away the thing somebody opened the camera
 * to do, to protect a recording a photograph cannot touch.
 */
describe('DualShutterCamera: Video is unavailable while a voice clip is recording (FR-007)', () => {
  it('disables Video, and records nothing if it is reached anyway', async () => {
    const tree = await render({ voiceRecording: true });

    const video = pressable(tree, 'camera-video-button');
    expect(video.props.disabled).toBe(true);
    expect(video.props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );

    // Belt and braces, as the photo-in-flight guard above: even reached directly it must not
    // flip the preview out of picture output or ask for the microphone.
    await tap(tree, 'camera-video-button');
    expect(camera.__recordAsync).not.toHaveBeenCalled();
    expect(preview(tree).props.mode).toBe('picture');
    expect(has(tree, 'camera-recording-indicator')).toBe(false);
  });

  it('leaves Photo alone, because a photograph needs no microphone (FR-008)', async () => {
    const tree = await render({ voiceRecording: true });

    expect(pressable(tree, 'camera-photo-button').props.disabled).toBeFalsy();

    await tap(tree, 'camera-photo-button');
    await act(async () => {});

    expect(onShot).toHaveBeenCalledTimes(1);
    expect(onShot.mock.calls[0][0].kind).toBe('photo');
    expect(onCaptureFailed).not.toHaveBeenCalled();
  });

  it('says why Video is dim, rather than leaving a dead control with no explanation', async () => {
    const tree = await render({ voiceRecording: true });

    expect(has(tree, 'camera-video-blocked')).toBe(true);
    expect(textAt(tree, 'camera-video-blocked-message')).toMatch(/voice/i);
  });

  it('gives Video back the moment the clip is finished', async () => {
    const tree = await render({ voiceRecording: true });
    expect(pressable(tree, 'camera-video-button').props.disabled).toBe(true);

    await act(async () => {
      tree.update(element({ voiceRecording: false }));
    });

    expect(pressable(tree, 'camera-video-button').props.disabled).toBeFalsy();
    expect(has(tree, 'camera-video-blocked')).toBe(false);

    await tap(tree, 'camera-video-button');
    expect(camera.__recordAsync).toHaveBeenCalledTimes(1);
    expect(preview(tree).props.mode).toBe('video');
  });

  it('is off by default, so nothing that opens the camera without saying so loses Video', async () => {
    const tree = await render();

    expect(pressable(tree, 'camera-video-button').props.disabled).toBeFalsy();
    expect(has(tree, 'camera-video-blocked')).toBe(false);
  });
});
