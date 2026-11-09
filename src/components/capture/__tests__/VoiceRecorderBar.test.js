/**
 * 013 T021 / T037 -- `VoiceRecorderBar`.
 *
 * What is pinned down here:
 *   - one tap starts, one tap stops, and there is nothing to hold down (FR-006);
 *   - **an interruption keeps what was recorded** (T037, US2-2, research R5): when the
 *     recorder stops without anybody tapping Stop -- an incoming call, or the system taking
 *     the audio session -- the part recorded so far becomes one clip, and the Stop tap the
 *     person makes anyway adds no second one;
 *   - a stop hands over one clip `{ uri, duration, waveform, capturedAt }`, with
 *     `capturedAt` stamped when recording *started*, never when it stopped (research R8 --
 *     that instant is also where the clip is pinned, and it decides the piece's place in
 *     capture order);
 *   - the bar shows the elapsed time while recording;
 *   - the 5:00 cap stops the recording by itself and **keeps** the clip (FR-006);
 *   - the audio mode asked for at the start is the one that lets recording survive the lock
 *     screen (FR-007, research R5), and is *released* again once the clip is out -- otherwise
 *     every clip leaves other apps' audio suppressed;
 *   - a denied microphone permission is reported upward and records nothing;
 *   - a recording that produced no file is **signalled** (`onCaptureFailed`), never silently
 *     dropped: going back to the idle Voice button is indistinguishable from "you have not
 *     recorded yet", and a `console.warn` nobody reads is not a signal (this phone app has
 *     no crash reporting);
 *   - unmounting mid-recording finishes the clip, so no native recording is left running
 *     with the microphone hot and no UI left to stop it;
 *   - two taps in one tick start one recording, not two -- the permission dialog can sit on
 *     screen for seconds with the Voice button still live behind it;
 *   - the parent is told when recording starts and ends (`onRecordingChange`), because the
 *     idle button and the bar have very different footprints and the UI contract puts the
 *     bar above the dock, full width;
 *   - `duration` is the recorder's own length, not the last 250 ms poll;
 *   - `downsampleWaveform` really averages, and really bounds a five-minute clip to 50 bars.
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
  /**
   * How long after `record()` the native recorder starts reporting itself as recording, and
   * the instant it does. `record()` is synchronous and returns before the native session is
   * necessarily running, so the first polled status can legitimately read
   * `isRecording: false` on a recording that is perfectly fine. Zero by default, so every
   * other case in this suite is unaffected.
   */
  let startLatencyMs = 0;
  let nativeStartsAtMs = 0;

  const recorder = {
    id: 'fake-recorder-1',
    uri: null,
    isRecording: false,
    prepareToRecordAsync: jest.fn(async () => {
      prepared = true;
    }),
    record: jest.fn(() => {
      startedAtMs = Date.now();
      nativeStartsAtMs = startedAtMs + startLatencyMs;
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
      // What the *native* recorder reports, which is what an interruption changes and what
      // a just-started recording has not caught up with yet.
      isRecording: recorder.isRecording && Date.now() >= nativeStartsAtMs,
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
    /**
     * An interruption: a call arrives, or the system takes the audio session. The native
     * recorder stops on its own, the partial file is there, and **nobody tapped Stop** --
     * which is the whole of what distinguishes this from a stop (research R5).
     */
    __interrupt: () => {
      recordedMs = recorder.isRecording ? Date.now() - startedAtMs : recordedMs;
      recorder.isRecording = false;
      recorder.uri = CLIP_URI;
    },
    /** How long the native recorder takes to start reporting itself as recording. */
    __setStartLatency: (ms) => {
      startLatencyMs = ms;
    },
    __denyPermission: () => {
      api.requestRecordingPermissionsAsync.mockImplementation(async () => denied);
    },
    __reset: () => {
      prepared = false;
      startedAtMs = 0;
      recordedMs = 0;
      metering = -30;
      startLatencyMs = 0;
      nativeStartsAtMs = 0;
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
import VoiceRecorderBar, { downsampleWaveform, WAVEFORM_BARS } from '../VoiceRecorderBar';

global.IS_REACT_ACT_ENVIRONMENT = true;

/** The instant every recording in this suite starts at, on jest's fake clock. */
const START_ISO = '2026-11-08T09:15:00.000Z';
const FIVE_MINUTES_MS = 5 * 60 * 1000;

/** The component's status-poll interval, so a test can step exactly one poll. */
const POLL_MS = 250;

/**
 * How many waveform levels two separately-stepped polls collect: the status the poll
 * reports the moment it mounts, plus one per poll that lands in its own `act` block. Used
 * by the "one polled level, recorded once" case, where the number *is* the assertion.
 */
const LEVELS_AFTER_TWO_POLLS = 3;

let trees = [];
let onClip;
let onPermissionDenied;
let onCaptureFailed;
let onRecordingChange;

const props = (overrides = {}) => ({
  onClip,
  onPermissionDenied,
  onCaptureFailed,
  onRecordingChange,
  ...overrides,
});

const render = (overrides = {}) => {
  let tree;
  act(() => {
    tree = renderer.create(<VoiceRecorderBar {...props(overrides)} />);
  });
  trees.push(tree);
  return tree;
};

/** Unmounts now, and takes the tree off the list so `afterEach` does not do it twice. */
const unmount = async (tree) => {
  trees = trees.filter((t) => t !== tree);
  await act(async () => {
    tree.unmount();
  });
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
  onCaptureFailed = jest.fn();
  onRecordingChange = jest.fn();
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
    expect(waveform.length).toBeLessThanOrEqual(WAVEFORM_BARS);
    waveform.forEach((level) => {
      expect(Number.isFinite(level)).toBe(true);
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThanOrEqual(1);
    });
    expect(Math.max(...waveform)).toBeGreaterThan(Math.min(...waveform));
  });

  /**
   * `<= 50` above cannot fail on its own: every other case in this suite collects fewer
   * than 50 levels, and `downsampleWaveform` returns a short recording unchanged. This is
   * the case that drives the averaging branch through the component.
   *
   * It has to step the poll one interval at a time. Advancing five minutes inside a single
   * `act` block batches all ~1,200 polled `setState`s into one render, so only two levels
   * are ever collected -- an artefact of this harness, not of the phone, where each poll is
   * its own turn of the event loop. Measured: the 5:00 case collects exactly 2.
   */
  it('bounds a long recording to 50 levels, however many were polled', async () => {
    const tree = render();
    await tap(tree, 'voice-record-button');

    for (let i = 0; i < 60; i += 1) {
      await elapse(POLL_MS); // one poll, one level, one render
    }

    await tap(tree, 'voice-stop-button');

    const { waveform } = onClip.mock.calls[0][0];
    expect(waveform).toHaveLength(WAVEFORM_BARS);
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

  // `interruptionMode: 'doNotMix'` asks for exclusive audio focus. Never giving it back
  // leaves every other app on the phone silenced after a clip, and nothing in the UI shows
  // it -- so the release is pinned, not merely counted.
  it('releases the audio session once the clip is out', async () => {
    const tree = render();
    await tap(tree, 'voice-record-button');
    await elapse(2000);
    await tap(tree, 'voice-stop-button');

    expect(audio.setAudioModeAsync).toHaveBeenLastCalledWith({ allowsRecording: false });
  });

  // The order matters on a device: preparing or recording before the session is configured
  // records under whatever mode happened to be set. Call counts cannot see that.
  it('configures the session before preparing, and prepares before recording', async () => {
    const tree = render();
    await tap(tree, 'voice-record-button');

    const [modeFirst] = audio.setAudioModeAsync.mock.invocationCallOrder;
    const [prepare] = audio.__recorder.prepareToRecordAsync.mock.invocationCallOrder;
    const [record] = audio.__recorder.record.mock.invocationCallOrder;

    expect(modeFirst).toBeLessThan(prepare);
    expect(prepare).toBeLessThan(record);
  });
});

describe('VoiceRecorderBar: a recording that produced no file is signalled, not swallowed', () => {
  // The bar going back to the idle Voice button is exactly what "you have not recorded yet"
  // looks like. `CaptureScreen` owns the inline failed-capture message (UI contract), and it
  // cannot show a message it is never told about -- so there has to be a way to tell it.
  it('reports a stop that failed, and hands over no clip', async () => {
    const tree = render();
    await tap(tree, 'voice-record-button');
    await elapse(2000);

    audio.__recorder.stop.mockImplementationOnce(async () => {
      audio.__recorder.isRecording = false;
      throw new Error('could not write the recording');
    });
    await tap(tree, 'voice-stop-button');

    expect(onClip).not.toHaveBeenCalled();
    expect(onCaptureFailed).toHaveBeenCalledTimes(1);

    const failure = onCaptureFailed.mock.calls[0][0];
    expect(failure.reason).toBe('stop-failed');
    expect(failure.error).toBeInstanceOf(Error);
    // Enough for the screen to say something true about what was lost.
    expect(failure.capturedAt).toBe(START_ISO);
    expect(failure.duration).toBe(2);

    // And the bar is usable again.
    expect(has(tree, 'voice-record-button')).toBe(true);
  });

  it('reports a stop that succeeded but named no file', async () => {
    const tree = render();
    await tap(tree, 'voice-record-button');
    await elapse(2000);

    // stop() resolves, but expo-audio never names a file.
    audio.__recorder.stop.mockImplementationOnce(async () => {
      audio.__recorder.isRecording = false;
    });
    await tap(tree, 'voice-stop-button');

    expect(onClip).not.toHaveBeenCalled();
    expect(onCaptureFailed).toHaveBeenCalledTimes(1);
    expect(onCaptureFailed.mock.calls[0][0].reason).toBe('no-file');
    expect(onCaptureFailed.mock.calls[0][0].error).toBeNull();
  });

  it('signals nothing when the clip is fine', async () => {
    const tree = render();
    await tap(tree, 'voice-record-button');
    await elapse(2000);
    await tap(tree, 'voice-stop-button');

    expect(onClip).toHaveBeenCalledTimes(1);
    expect(onCaptureFailed).not.toHaveBeenCalled();
  });
});

describe('VoiceRecorderBar: the finish guard survives a throwing parent', () => {
  // The guard that makes one recording produce one clip is released at the end of the
  // finish. A parent whose `onClip` throws synchronously -- tasks.md's T029 case is
  // "`addPiece` rejects (storage full)", and the handler that wraps it throwing is the same
  // shape -- must not leave it stuck: the bar would show the idle Voice button and refuse
  // every tap thereafter, recording once per mount and then going quietly dead.
  it('records again after the parent threw on the previous clip', async () => {
    const tree = render();
    onClip.mockImplementationOnce(() => {
      throw new Error('storage full');
    });

    await tap(tree, 'voice-record-button');
    await elapse(2000);
    await tap(tree, 'voice-stop-button');

    expect(onClip).toHaveBeenCalledTimes(1);
    // The throw is a failure the screen may not know about either; it is reported.
    expect(onCaptureFailed).toHaveBeenCalledTimes(1);
    expect(onCaptureFailed.mock.calls[0][0].reason).toBe('handler-failed');

    await tap(tree, 'voice-record-button');
    expect(has(tree, 'voice-recorder-bar')).toBe(true);
    await elapse(3000);
    await tap(tree, 'voice-stop-button');

    expect(onClip).toHaveBeenCalledTimes(2);
    expect(onClip.mock.calls[1][0].duration).toBe(3);
  });
});

describe('VoiceRecorderBar: unmounting while recording', () => {
  // An unmount is not an interruption (T037/T038): nothing takes the audio session back.
  // Without a cleanup the status poll's interval goes, so the 5:00 cap can never fire
  // again, `stop()` is never called and the session is never released -- a recording that
  // keeps the microphone hot, suppresses other apps' audio and has no UI left to stop it,
  // with the recorded audio unreachable.
  it('finishes the clip, stops the recorder and releases the session', async () => {
    const tree = render();
    await tap(tree, 'voice-record-button');
    await elapse(3000);

    await unmount(tree);

    expect(audio.__recorder.stop).toHaveBeenCalledTimes(1);
    expect(audio.setAudioModeAsync).toHaveBeenLastCalledWith({ allowsRecording: false });
    expect(onClip).toHaveBeenCalledTimes(1);
    expect(onClip.mock.calls[0][0].uri).toBe(audio.CLIP_URI);
    expect(onClip.mock.calls[0][0].capturedAt).toBe(START_ISO);
    expect(onClip.mock.calls[0][0].duration).toBe(3);
  });

  it('does nothing on an unmount that was not recording', async () => {
    const tree = render();
    await unmount(tree);

    expect(audio.__recorder.stop).not.toHaveBeenCalled();
    expect(onClip).not.toHaveBeenCalled();
    expect(onCaptureFailed).not.toHaveBeenCalled();
  });
});

describe('VoiceRecorderBar: an interruption keeps what was recorded (T037, US2-2)', () => {
  /**
   * US2-2: "Given Sam is recording, When a phone call interrupts, Then the part recorded
   * before the call is kept as its own clip." Research R5 says where to see it: the polled
   * `useAudioRecorderState` stops saying `isRecording` and nobody tapped Stop.
   *
   * The failure to avoid is not losing the clip -- it is the bar going quietly back to the
   * idle Voice button with the recording ended, which reads as "you have not recorded yet"
   * and loses the minute Sam just spoke without a word about it.
   */
  it('finishes the clip itself when the recorder stops and nobody tapped Stop', async () => {
    const tree = render();
    await tap(tree, 'voice-record-button');
    await elapse(3000);

    await act(async () => {
      audio.__interrupt();
    });
    // The poll is the only thing that can notice; before it, nothing has happened.
    await elapse(POLL_MS);

    expect(onClip).toHaveBeenCalledTimes(1);
    const clip = onClip.mock.calls[0][0];
    expect(clip.uri).toBe(audio.CLIP_URI); // kept, not discarded
    expect(clip.duration).toBe(3); //          the part recorded before the call
    expect(clip.capturedAt).toBe(START_ISO);
    expect(onCaptureFailed).not.toHaveBeenCalled();

    // The parent is told the recording ended, so the bar is not left on screen (UI contract),
    // and the audio session goes back the way it does after any other ending.
    expect(onRecordingChange.mock.calls).toEqual([[true], [false]]);
    expect(audio.setAudioModeAsync).toHaveBeenLastCalledWith({ allowsRecording: false });
    expect(has(tree, 'voice-recorder-bar')).toBe(false);
    expect(has(tree, 'voice-record-button')).toBe(true);
  });

  // The other half of the pair, and the one that costs a piece if it is wrong. Sam's thumb
  // is already on Stop when the call arrives: the tap lands on the control they were looking
  // at, after the interruption has already made the clip. Two clips of one recording is the
  // same memory said twice, with the second one a duplicate nobody asked for.
  it('adds no second clip when the Stop tap lands after the interruption', async () => {
    const tree = render();
    await tap(tree, 'voice-record-button');
    // The handler the thumb is already bound to, taken while Stop is on screen. The handler
    // rather than the node because `react-test-renderer` will not read props off a node its
    // tree has since replaced -- and the tap is the point here, not the node.
    const stopTap = pressable(tree, 'voice-stop-button').props.onPress;
    expect(typeof stopTap).toBe('function');
    await elapse(3000);

    await act(async () => {
      audio.__interrupt();
    });
    await elapse(POLL_MS);
    expect(onClip).toHaveBeenCalledTimes(1);

    await act(async () => {
      stopTap();
    });

    expect(onClip).toHaveBeenCalledTimes(1);
    expect(onCaptureFailed).not.toHaveBeenCalled();
    expect(audio.__recorder.stop).toHaveBeenCalledTimes(1);
  });

  // The call ends and Sam carries on. The finish guard is released however a recording
  // ended, so an interruption must not be the one ending that leaves the bar recording once
  // per mount and then quietly dead.
  it('leaves the bar able to record another clip afterwards', async () => {
    const tree = render();
    await tap(tree, 'voice-record-button');
    await elapse(3000);
    await act(async () => {
      audio.__interrupt();
    });
    await elapse(POLL_MS);
    expect(onClip).toHaveBeenCalledTimes(1);

    await elapse(20000); // the call
    const secondStart = new Date().toISOString();

    await tap(tree, 'voice-record-button');
    expect(has(tree, 'voice-recorder-bar')).toBe(true);
    await elapse(2000);
    await tap(tree, 'voice-stop-button');

    expect(onClip).toHaveBeenCalledTimes(2);
    expect(onClip.mock.calls[1][0].capturedAt).toBe(secondStart);
    expect(onClip.mock.calls[1][0].duration).toBe(2);
  });

  // The same signal, one moment earlier, meaning the opposite thing. `record()` is
  // synchronous and returns before the native session is necessarily running, so the first
  // polled status of a perfectly healthy recording can read `isRecording: false`. Taking
  // that for an interruption would end every recording at birth -- Sam taps Voice, the bar
  // appears and vanishes, and the "clip" is of nothing.
  it('does not mistake a recorder that has not started yet for an interruption', async () => {
    audio.__setStartLatency(600);
    const tree = render();
    await tap(tree, 'voice-record-button');

    await elapse(POLL_MS); // two polls that both report isRecording: false
    await elapse(POLL_MS);

    expect(onClip).not.toHaveBeenCalled();
    expect(onCaptureFailed).not.toHaveBeenCalled();
    expect(has(tree, 'voice-recorder-bar')).toBe(true);

    await elapse(POLL_MS * 4); // the native recorder is going now
    await tap(tree, 'voice-stop-button');

    expect(onClip).toHaveBeenCalledTimes(1);
    expect(onClip.mock.calls[0][0].duration).toBeCloseTo(1.5, 5);
  });
});

describe('VoiceRecorderBar: two taps in one tick (FR-006 is one tap, not two recordings)', () => {
  // `requestRecordingPermissionsAsync` shows the OS dialog, which can sit on screen for
  // seconds, and the Voice button stays mounted and enabled behind it because the UI only
  // switches once recording has begun. A guard read from render state cannot see a start
  // that is still in flight.
  it('starts one recording, not two', async () => {
    const tree = render();
    const button = pressable(tree, 'voice-record-button');

    await act(async () => {
      button.props.onPress();
      button.props.onPress();
    });

    expect(audio.requestRecordingPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(audio.__recorder.prepareToRecordAsync).toHaveBeenCalledTimes(1);
    expect(audio.__recorder.record).toHaveBeenCalledTimes(1);

    // And the clip keeps the *first* tap's instant, not a second tap's overwrite (R8).
    await elapse(2000);
    await tap(tree, 'voice-stop-button');
    expect(onClip).toHaveBeenCalledTimes(1);
    expect(onClip.mock.calls[0][0].capturedAt).toBe(START_ISO);
  });
});

describe('VoiceRecorderBar: the parent is told when recording starts and ends', () => {
  // The idle Voice button is a dock-sized button; the bar is full width above the dock
  // (UI contract). A parent that cannot see the change cannot lay either of them out.
  it('calls onRecordingChange(true) on start and (false) on the stop', async () => {
    const tree = render();
    expect(onRecordingChange).not.toHaveBeenCalled();

    await tap(tree, 'voice-record-button');
    expect(onRecordingChange.mock.calls).toEqual([[true]]);

    await elapse(2000);
    await tap(tree, 'voice-stop-button');
    expect(onRecordingChange.mock.calls).toEqual([[true], [false]]);
  });

  it('reports the end even when the 5:00 cap was what ended it', async () => {
    const tree = render();
    await tap(tree, 'voice-record-button');
    await elapse(FIVE_MINUTES_MS);

    expect(onRecordingChange.mock.calls).toEqual([[true], [false]]);
  });
});

describe('VoiceRecorderBar: duration is the recorder’s length, not the last poll', () => {
  // `elapsedRef` is only as fresh as the last 250 ms poll. A clip stopped inside the first
  // poll interval has had no poll at all, so it would report `duration: 0` with a perfectly
  // valid `uri` -- a piece a reader renders as a zero-length clip.
  it('reports a real length for a clip stopped before the first poll', async () => {
    const tree = render();
    await tap(tree, 'voice-record-button');
    await elapse(100); // the first poll is at 250 ms, so none has landed
    await tap(tree, 'voice-stop-button');

    expect(onClip).toHaveBeenCalledTimes(1);
    expect(onClip.mock.calls[0][0].uri).toBe(audio.CLIP_URI);
    expect(onClip.mock.calls[0][0].duration).toBeCloseTo(0.1, 5);
  });

  it('does not round a clip stopped between two polls down to the poll', async () => {
    const tree = render();
    await tap(tree, 'voice-record-button');
    await elapse(1000); // polls at 250/500/750/1000
    await elapse(120); //  no poll lands in here; the next is at 1250
    await tap(tree, 'voice-stop-button');

    expect(onClip.mock.calls[0][0].duration).toBeCloseTo(1.12, 5);
  });
});

describe('VoiceRecorderBar: one polled level is recorded once', () => {
  // The waveform is pushed to from an effect keyed on the polled status. Any *other*
  // dependency of that effect changing mid-recording -- a `maxDurationMs` prop change is
  // the live one -- re-runs it on a status that has already been recorded.
  it('does not record the same level twice when a prop changes mid-recording', async () => {
    const tree = render({ maxDurationMs: FIVE_MINUTES_MS });
    await tap(tree, 'voice-record-button');
    // One level from the status the poll reports on mounting, then one per poll.
    await elapse(POLL_MS);
    await elapse(POLL_MS);

    // Nothing about the recorder's status changed -- only a prop.
    await act(async () => {
      tree.update(<VoiceRecorderBar {...props({ maxDurationMs: FIVE_MINUTES_MS - 1000 })} />);
    });

    await tap(tree, 'voice-stop-button');

    const { waveform } = onClip.mock.calls[0][0];
    expect(waveform).toHaveLength(LEVELS_AFTER_TWO_POLLS);
  });
});

describe('downsampleWaveform', () => {
  it('bounds a five-minute recording to 50 bars', () => {
    const samples = Array.from({ length: 1200 }, (_, i) => (i % 2 === 0 ? 0 : 1));
    expect(downsampleWaveform(samples)).toHaveLength(WAVEFORM_BARS);
  });

  // The point of averaging rather than taking every Nth sample: a bar describes its whole
  // slice of the clip, so a quiet half reads as quiet instead of as whatever landed on the
  // sampling stride.
  it('averages each bucket rather than picking one sample out of it', () => {
    // 100 samples, 50 bars -> buckets of two. Each pair averages to 0.5, and *no single
    // sample* in the input is 0.5, so only averaging can produce this.
    const samples = Array.from({ length: 100 }, (_, i) => (i % 2 === 0 ? 0 : 1));
    const out = downsampleWaveform(samples);

    expect(out).toHaveLength(WAVEFORM_BARS);
    out.forEach((level) => expect(level).toBeCloseTo(0.5, 10));
  });

  it('keeps the shape of the clip: a quiet first half stays quieter than a loud second', () => {
    const samples = [...Array(600).fill(0.1), ...Array(600).fill(0.9)];
    const out = downsampleWaveform(samples);

    expect(out).toHaveLength(WAVEFORM_BARS);
    expect(out.slice(0, 25).every((level) => Math.abs(level - 0.1) < 1e-9)).toBe(true);
    expect(out.slice(25).every((level) => Math.abs(level - 0.9) < 1e-9)).toBe(true);
  });

  it('leaves a short recording alone, and copies it rather than aliasing it', () => {
    const samples = [0.2, 0.4, 0.6];
    const out = downsampleWaveform(samples);

    expect(out).toEqual(samples);
    expect(out).not.toBe(samples);
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
