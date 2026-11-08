/**
 * 013 T021 -- `VoiceRecorderBar`.
 *
 * What is pinned down here:
 *   - one tap starts, one tap stops, and there is nothing to hold down (FR-006);
 *   - a stop hands over one clip `{ uri, duration, waveform, capturedAt }`, with
 *     `capturedAt` stamped when recording *started*, never when it stopped (research R8 --
 *     that instant is also where the clip is pinned, and it decides the piece's place in
 *     capture order);
 *   - the bar shows the elapsed time while recording;
 *   - the 5:00 cap stops the recording by itself and **keeps** the clip (FR-006);
 *   - the audio mode asked for at the start is the one that lets recording survive the lock
 *     screen (FR-007, research R5);
 *   - a denied microphone permission is reported upward and records nothing.
 *
 * The inline `expo-audio` mock is modelled on the installed version (expo-audio 57.0.4,
 * checked against `node_modules/expo-audio/build/*.d.ts`):
 *   - `useAudioRecorder(options)` returns an `AudioRecorder` with `prepareToRecordAsync()`,
 *     `record()`, `stop()`, `uri` and `getStatus()`;
 *   - `useAudioRecorderState(recorder, interval)` polls `recorder.getStatus()` on an
 *     interval and returns a `RecorderState`
 *     `{ canRecord, isRecording, durationMillis, mediaServicesDidReset, metering, url }`.
 *     The mock keeps that polling shape rather than pushing state in, so the component is
 *     driven here the way it is driven on a phone: jest's fake clock advances the poll and
 *     the recorded length together.
 *
 * What jest cannot prove: that recording really continues while the phone is locked or the
 * app is backgrounded (FR-007, SC-003). That is a device check on a release build
 * (quickstart Q-D1-Q-D3). What is proven here is that the right audio mode is *requested*.
 *
 * The inline "permission denied" message with Open Settings is **not** this component's:
 * the UI contract puts it on `CaptureScreen` ("other buttons keep working"), which is why
 * this bar only calls `onPermissionDenied` (tasks T029/T030).
 */

import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('expo-audio', () => {
  const { useEffect, useState } = require('react');

  const CLIP_URI = 'file:///voice/clip-1.m4a';
  const QUIET_DB = -60; // normalises to 0
  const LOUD_DB = 0; //    normalises to 1

  let prepared = false;
  let startedAtMs = 0;
  let recordedMs = 0;
  let metering = -30;

  const recorder = {
    id: 'fake-recorder-1',
    uri: null,
    isRecording: false,
    prepareToRecordAsync: jest.fn(async () => {
      prepared = true;
    }),
    record: jest.fn(() => {
      startedAtMs = Date.now();
      recordedMs = 0;
      recorder.uri = null;
      recorder.isRecording = true;
    }),
    stop: jest.fn(async () => {
      recordedMs = recorder.isRecording ? Date.now() - startedAtMs : recordedMs;
      recorder.isRecording = false;
      // expo-audio only names the file once stop() has resolved.
      recorder.uri = CLIP_URI;
    }),
    pause: jest.fn(),
    getStatus: () => ({
      canRecord: prepared,
      isRecording: recorder.isRecording,
      durationMillis: recorder.isRecording ? Date.now() - startedAtMs : recordedMs,
      mediaServicesDidReset: false,
      metering,
      url: recorder.uri,
    }),
  };

  const granted = { granted: true, status: 'granted', canAskAgain: true, expires: 'never' };
  const denied = { granted: false, status: 'denied', canAskAgain: false, expires: 'never' };

  const api = {
    AudioQuality: { MIN: 0, LOW: 32, MEDIUM: 64, HIGH: 96, MAX: 127 },
    IOSOutputFormat: { MPEG4AAC: 'aac ' },
    setAudioModeAsync: jest.fn(async () => {}),
    requestRecordingPermissionsAsync: jest.fn(async () => granted),
    getRecordingPermissionsAsync: jest.fn(async () => granted),
    useAudioRecorder: () => recorder,
    useAudioRecorderState: (rec, interval = 500) => {
      const [state, setState] = useState(rec.getStatus());
      useEffect(() => {
        const handle = setInterval(() => setState(rec.getStatus()), interval);
        return () => clearInterval(handle);
      }, [rec.id, interval]);
      return state;
    },

    // test handles
    CLIP_URI,
    QUIET_DB,
    LOUD_DB,
    __recorder: recorder,
    __setMetering: (db) => {
      metering = db;
    },
    __denyPermission: () => {
      api.requestRecordingPermissionsAsync.mockImplementation(async () => denied);
    },
    __reset: () => {
      prepared = false;
      startedAtMs = 0;
      recordedMs = 0;
      metering = -30;
      recorder.uri = null;
      recorder.isRecording = false;
      recorder.prepareToRecordAsync.mockClear();
      recorder.record.mockClear();
      recorder.stop.mockClear();
      recorder.pause.mockClear();
      api.setAudioModeAsync.mockClear();
      api.requestRecordingPermissionsAsync.mockClear();
      api.requestRecordingPermissionsAsync.mockImplementation(async () => granted);
    },
  };

  return api;
});

import * as audio from 'expo-audio';
import VoiceRecorderBar from '../VoiceRecorderBar';

global.IS_REACT_ACT_ENVIRONMENT = true;

/** The instant every recording in this suite starts at, on jest's fake clock. */
const START_ISO = '2026-11-08T09:15:00.000Z';
const FIVE_MINUTES_MS = 5 * 60 * 1000;

let trees = [];
let onClip;
let onPermissionDenied;

const render = (props = {}) => {
  let tree;
  act(() => {
    tree = renderer.create(
      <VoiceRecorderBar onClip={onClip} onPermissionDenied={onPermissionDenied} {...props} />,
    );
  });
  trees.push(tree);
  return tree;
};

const pressable = (tree, testID) =>
  tree.root.findAll((n) => n.props?.testID === testID && typeof n.props?.onPress === 'function')[0];

const has = (tree, testID) => tree.root.findAll((n) => n.props?.testID === testID).length > 0;

const textAt = (tree, testID) => {
  const node = tree.root.findAll((n) => n.props?.testID === testID)[0];
  if (!node) return undefined;
  const { children } = node.props;
  return Array.isArray(children) ? children.join('') : String(children);
};

const tap = async (tree, testID) => {
  const target = pressable(tree, testID);
  expect(target).toBeDefined();
  await act(async () => {
    target.props.onPress();
  });
};

/** Lets the fake clock run: the recorder's poll and the recorded length move together. */
const elapse = async (ms) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'performance', 'queueMicrotask'] });
  jest.setSystemTime(new Date(START_ISO));
  audio.__reset();
  onClip = jest.fn();
  onPermissionDenied = jest.fn();
});

afterEach(() => {
  trees.forEach((tree) => act(() => tree.unmount()));
  trees = [];
  jest.useRealTimers();
});

describe('VoiceRecorderBar: one tap to start, one tap to stop (FR-006)', () => {
  it('starts recording on a single tap, with nothing to hold down', async () => {
    const tree = render();
    const button = pressable(tree, 'voice-record-button');

    // FR-006: "it MUST NOT require holding a control" -- no press-and-hold handlers at all.
    expect(button.props.onPressIn).toBeUndefined();
    expect(button.props.onPressOut).toBeUndefined();
    expect(button.props.onLongPress).toBeUndefined();

    await tap(tree, 'voice-record-button');

    expect(audio.requestRecordingPermissionsAsync).toHaveBeenCalledTimes(1);
    // Required before *every* recording, not just the first (see AudioRecorder.js).
    expect(audio.__recorder.prepareToRecordAsync).toHaveBeenCalledTimes(1);
    expect(audio.__recorder.record).toHaveBeenCalledTimes(1);
    expect(has(tree, 'voice-recorder-bar')).toBe(true);
    expect(has(tree, 'voice-stop-button')).toBe(true);
    expect(has(tree, 'voice-record-button')).toBe(false);
  });

  it('stops on a single tap and hands over one clip, then goes back to idle', async () => {
    const tree = render();
    await tap(tree, 'voice-record-button');
    await elapse(2000);
    await tap(tree, 'voice-stop-button');

    expect(audio.__recorder.stop).toHaveBeenCalledTimes(1);
    expect(onClip).toHaveBeenCalledTimes(1);

    const clip = onClip.mock.calls[0][0];
    expect(clip.uri).toBe(audio.CLIP_URI);
    expect(clip.duration).toBe(2); // seconds (data-model.md: duration is in seconds)
    expect(clip.capturedAt).toBe(START_ISO);
    expect(Array.isArray(clip.waveform)).toBe(true);

    expect(has(tree, 'voice-record-button')).toBe(true);
    expect(has(tree, 'voice-recorder-bar')).toBe(false);
  });

  // US1 captures two clips in one memory ("a note, a clip, two photos, a video and a
  // second clip"), so finishing one recording must leave the bar able to start another.
  it('records again after a clip: each stop adds its own piece', async () => {
    const tree = render();

    await tap(tree, 'voice-record-button');
    await elapse(4000);
    await tap(tree, 'voice-stop-button');

    await elapse(10000); // a pause between the two clips
    const secondStart = new Date().toISOString();

    await tap(tree, 'voice-record-button');
    expect(has(tree, 'voice-recorder-bar')).toBe(true);
    await elapse(6000);
    await tap(tree, 'voice-stop-button');

    expect(onClip).toHaveBeenCalledTimes(2);
    // prepareToRecordAsync is required before *every* recording, not just the first.
    expect(audio.__recorder.prepareToRecordAsync).toHaveBeenCalledTimes(2);

    const [first] = onClip.mock.calls[0];
    const [second] = onClip.mock.calls[1];
    expect(first.capturedAt).toBe(START_ISO);
    expect(first.duration).toBe(4);
    expect(second.capturedAt).toBe(secondStart);
    expect(second.duration).toBe(6);
  });

  it('gives the clip a waveform: levels in 0..1, bounded, loud above quiet', async () => {
    const tree = render();
    audio.__setMetering(audio.QUIET_DB);
    await tap(tree, 'voice-record-button');
    await elapse(3000);
    audio.__setMetering(audio.LOUD_DB);
    await elapse(3000);
    await tap(tree, 'voice-stop-button');

    const { waveform } = onClip.mock.calls[0][0];
    expect(waveform.length).toBeGreaterThan(0);
    // Bounded, so a five-minute clip does not carry thousands of samples into the draft.
    expect(waveform.length).toBeLessThanOrEqual(50);
    waveform.forEach((level) => {
      expect(Number.isFinite(level)).toBe(true);
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThanOrEqual(1);
    });
    expect(Math.max(...waveform)).toBeGreaterThan(Math.min(...waveform));
  });
});

describe('VoiceRecorderBar: the clip remembers when it started (research R8)', () => {
  it('stamps capturedAt at the start of the recording, not at the stop', async () => {
    const tree = render();
    await tap(tree, 'voice-record-button');
    await elapse(30000);

    const stopInstant = new Date().toISOString();
    expect(stopInstant).not.toBe(START_ISO); // the clock really did move

    await tap(tree, 'voice-stop-button');

    const clip = onClip.mock.calls[0][0];
    expect(clip.capturedAt).toBe(START_ISO);
    expect(clip.capturedAt).not.toBe(stopInstant);
    expect(clip.duration).toBe(30);
  });
});

describe('VoiceRecorderBar: the timer', () => {
  it('shows the elapsed time while recording', async () => {
    const tree = render();
    await tap(tree, 'voice-record-button');
    expect(textAt(tree, 'voice-recorder-timer')).toBe('0:00');

    await elapse(5000);
    expect(textAt(tree, 'voice-recorder-timer')).toBe('0:05');

    await elapse(60000);
    expect(textAt(tree, 'voice-recorder-timer')).toBe('1:05');
  });
});

describe('VoiceRecorderBar: the 5:00 cap (FR-006)', () => {
  it('stops by itself at 5:00 and keeps the clip', async () => {
    const tree = render();
    await tap(tree, 'voice-record-button');
    await elapse(FIVE_MINUTES_MS);

    // Nobody tapped Stop.
    expect(audio.__recorder.stop).toHaveBeenCalledTimes(1);
    expect(onClip).toHaveBeenCalledTimes(1);

    const clip = onClip.mock.calls[0][0];
    expect(clip.uri).toBe(audio.CLIP_URI); // kept, not discarded
    expect(clip.duration).toBe(300);
    expect(clip.capturedAt).toBe(START_ISO);

    expect(has(tree, 'voice-recorder-bar')).toBe(false);
    expect(has(tree, 'voice-record-button')).toBe(true);
  });

  it('adds no second clip after the cap has stopped it', async () => {
    const tree = render();
    await tap(tree, 'voice-record-button');
    await elapse(FIVE_MINUTES_MS);
    await elapse(10000);

    expect(onClip).toHaveBeenCalledTimes(1);
    expect(audio.__recorder.stop).toHaveBeenCalledTimes(1);
  });
});

describe('VoiceRecorderBar: the audio mode (FR-007)', () => {
  it('asks for the mode that keeps recording alive when the phone is locked', async () => {
    const tree = render();
    await tap(tree, 'voice-record-button');

    expect(audio.setAudioModeAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        allowsRecording: true,
        playsInSilentMode: true,
        allowsBackgroundRecording: true,
        interruptionMode: 'doNotMix',
      }),
    );
  });
});

describe('VoiceRecorderBar: a denied microphone permission', () => {
  it('reports it upward and records nothing', async () => {
    audio.__denyPermission();
    const tree = render();
    await tap(tree, 'voice-record-button');

    expect(onPermissionDenied).toHaveBeenCalledTimes(1);
    expect(audio.__recorder.record).not.toHaveBeenCalled();
    expect(audio.setAudioModeAsync).not.toHaveBeenCalled();
    expect(onClip).not.toHaveBeenCalled();
    // The bar stays as it was; the inline message with Open Settings is CaptureScreen's.
    expect(has(tree, 'voice-record-button')).toBe(true);
    expect(has(tree, 'voice-recorder-bar')).toBe(false);
  });
});
