/**
 * 013 T053 -- `VoicePlayer`.
 *
 * The defect this component exists to fix is a control that *looks* like a play button and
 * does nothing (spec US4: "the voice-clip play button does nothing"). So what is pinned here
 * is that a tap reaches the player, and that every way the tap could quietly do nothing is
 * closed:
 *
 *   - tap plays, tap again pauses, and pausing keeps the clip's place (FR-020);
 *   - a clip that has run to its end **starts again** rather than playing silence from the
 *     end -- `play()` at the end of a track is the classic dead button;
 *   - the audio mode that makes a clip audible with the ringer switch off is asked for
 *     *before* playing, and a clip still plays if that request fails -- refusing to play is
 *     the very defect being fixed;
 *   - a clip with no file at all is shown as unavailable rather than as a live control;
 *   - the control follows the *player*, not a local flag, so a clip that ends by itself
 *     offers to play again;
 *   - **one clip plays at a time**: starting a second pauses the first, and the first says so;
 *   - a clip whose card goes away stops being "the clip that is playing", so the next clip
 *     never calls into a released player.
 *
 * The inline `expo-audio` mock is modelled on the installed version (expo-audio 57.0.4,
 * checked against `node_modules/expo-audio/build/*.d.ts`), in the same spirit as
 * `VoiceRecorderBar.test.js`'s mock of the recording half of the same API:
 *   - `useAudioPlayer(source)` returns an `AudioPlayer` with `play()`, `pause()`,
 *     `seekTo(seconds)`, `remove()`, `playing`, `currentTime` and `duration`, and the hook
 *     **releases it on unmount** (the real one is `useReleasingSharedObject`);
 *   - a released player **throws** when it is called, as a released `SharedObject` does. That
 *     is what makes "the card scrolled away while it was playing" a failing test rather than
 *     a silent one;
 *   - `useAudioPlayerStatus(player)` is event-driven, not polled: the real hook is
 *     `useEvent(player, 'playbackStatusUpdate', player.currentStatus)`, so the mock re-renders
 *     its subscriber whenever the player's state changes and at no other time.
 *
 * Real expo-audio cannot be imported under jest at all -- `AudioModule.AudioPlayer.prototype`
 * is undefined outside a native runtime, which fails the suite at *import* time. That is why
 * `jest.setup.js` carries a shared stub and why a suite that actually drives playback, like
 * this one, declares its own.
 *
 * What jest cannot prove: that sound comes out of the phone. That is a device check.
 */

import React from 'react';
import renderer, { act } from 'react-test-renderer';

jest.mock('expo-audio', () => {
  const { useEffect, useMemo, useState } = require('react');

  let nextId = 1;
  let players = [];

  /** Creates the fake `AudioPlayer` that `useAudioPlayer` hands back. */
  const makePlayer = (source) => {
    const listeners = new Set();
    const emit = () => {
      listeners.forEach((listener) => listener());
    };
    // A released SharedObject throws when it is called. Keeping that true here is the whole
    // value of the unmount case: a component that leaves itself in the "currently playing"
    // registry fails loudly instead of leaking.
    const alive = (what) => {
      if (player.released) throw new Error(`player ${player.id} is released (${what})`);
    };

    const player = {
      id: `fake-player-${nextId}`,
      source,
      uri: source?.uri ?? null,
      playing: false,
      currentTime: 0,
      duration: 0,
      isLoaded: false,
      didJustFinish: false,
      released: false,
      error: null,
      play: jest.fn(() => {
        alive('play');
        player.playing = true;
        player.didJustFinish = false;
        emit();
      }),
      pause: jest.fn(() => {
        alive('pause');
        player.playing = false;
        emit();
      }),
      seekTo: jest.fn(async (seconds) => {
        alive('seekTo');
        player.currentTime = seconds;
        player.didJustFinish = false;
        emit();
      }),
      remove: jest.fn(() => {
        player.released = true;
        player.playing = false;
        listeners.clear();
      }),
      __subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      __emit: emit,
    };

    nextId += 1;
    players.push(player);
    return player;
  };

  /** The `AudioStatus` the real hook reports, narrowed to the fields this app reads. */
  const statusOf = (player) => ({
    id: player.id,
    playing: player.playing,
    currentTime: player.currentTime,
    duration: player.duration,
    isLoaded: player.isLoaded,
    didJustFinish: player.didJustFinish,
    isBuffering: false,
    error: player.error,
  });

  const api = {
    setAudioModeAsync: jest.fn(async () => {}),

    /**
     * One player per component instance, recreated when the source changes and released on
     * unmount -- `useReleasingSharedObject`, as the real hook uses it.
     */
    useAudioPlayer: (source = null) => {
      const key = JSON.stringify(source ?? null);
      const player = useMemo(() => makePlayer(source), [key]); // eslint-disable-line react-hooks/exhaustive-deps
      useEffect(() => () => player.remove(), [player]);
      return player;
    },

    /** Event-driven, like `useEvent(player, 'playbackStatusUpdate', ...)`. */
    useAudioPlayerStatus: (player) => {
      const [status, setStatus] = useState(() => statusOf(player));
      useEffect(() => {
        setStatus(statusOf(player));
        return player.__subscribe(() => setStatus(statusOf(player)));
      }, [player]);
      return status;
    },

    // test handles
    __players: () => players,
    /** The most recently created player for a uri, released or not. */
    __playerFor: (uri) => [...players].reverse().find((player) => player.uri === uri),
    /** The player finishes loading and reports the clip's real length. */
    __loaded: (player, durationSeconds) => {
      player.duration = durationSeconds;
      player.isLoaded = true;
      player.__emit();
    },
    /** Playback reaches `seconds`. */
    __playedTo: (player, seconds) => {
      player.currentTime = seconds;
      player.__emit();
    },
    /** The next `play()` throws -- a player the native side will not start. */
    __failPlay: (player) => {
      player.play.mockImplementation(() => {
        throw new Error('the player would not start');
      });
    },
    /**
     * Playback fails: expo-audio reports it on the status as `error` (a string, "cleared when a
     * new source is loaded or playback resumes successfully"). A clip whose file has been
     * deleted since it was saved arrives here.
     */
    __errored: (player, message) => {
      player.error = message;
      player.playing = false;
      player.__emit();
    },
    /** The clip runs out on its own: nobody tapped anything. */
    __finish: (player) => {
      player.currentTime = player.duration;
      player.playing = false;
      player.didJustFinish = true;
      player.__emit();
    },
    __reset: () => {
      players = [];
      api.setAudioModeAsync.mockClear();
      api.setAudioModeAsync.mockImplementation(async () => {});
    },
  };

  return api;
});

import * as audio from 'expo-audio';
import VoicePlayer, { PLAYBACK_AUDIO_MODE, formatClock } from '../VoicePlayer';
import { BARS_COMPACT, resampleLevels } from '../../media/WaveformStrip';
// The two hosts T054 puts the player in, rendered for real at the bottom of this file.
import PieceList from '../../capture/PieceList';
import { JournalEntryCard } from '../JournalEntryCard';

global.IS_REACT_ACT_ENVIRONMENT = true;

const CLIP_A = 'file:///voice/clip-a.m4a';
const CLIP_B = 'file:///voice/clip-b.m4a';

let trees = [];

const render = (props) => {
  let tree;
  act(() => {
    tree = renderer.create(<VoicePlayer {...props} />);
  });
  trees.push(tree);
  return tree;
};

/** Unmounts now, and takes the tree off the list so `afterEach` does not do it twice. */
const unmount = async (tree) => {
  trees = trees.filter((candidate) => candidate !== tree);
  await act(async () => {
    tree.unmount();
  });
};

const node = (tree, testID) => tree.root.findAll((n) => n.props?.testID === testID)[0];

const toggle = (tree, testID) => node(tree, `${testID}-toggle`);

const tap = async (tree, testID) => {
  const target = toggle(tree, testID);
  expect(target).toBeDefined();
  await act(async () => {
    await target.props.onPress();
  });
};

const iconName = (tree, testID) =>
  toggle(tree, testID).findAll((n) => typeof n.props?.name === 'string')[0]?.props?.name;

const label = (tree, testID) => toggle(tree, testID).props.accessibilityLabel;

/** The clip's strip: the touchable, not the component handed the same testID. */
const stripOf = (tree, testID) =>
  tree.root.findAll(
    (n) => n.props?.testID === `${testID}-strip` && typeof n.props?.onPress === 'function',
  )[0];

/** Host nodes only: a `View` is a composite wrapping a host of the same name and testID. */
const stripBars = (tree, testID) =>
  tree.root.findAll(
    (n) =>
      typeof n.type === 'string' &&
      typeof n.props?.testID === 'string' &&
      n.props.testID.startsWith(`${testID}-strip-bar-`),
  );

const flatten = (style) =>
  Array.isArray(style)
    ? Object.assign({}, ...style.filter(Boolean).map((entry) => flatten(entry)))
    : style || {};

const flattenStyle = flatten;

/**
 * The flattened style of a node, picked by testID. Host nodes only: a `View` is a composite
 * wrapping a host of the same name, and the component handed the testID carries it as a prop
 * without carrying the style that goes with it.
 */
const styleOf = (tree, testID) =>
  flatten(
    tree.root.findAll((n) => typeof n.type === 'string' && n.props?.testID === testID)[0]?.props
      ?.style,
  );

const timeNode = (tree, testID) => node(tree, `${testID}-time`);

/** The height of every bar on a clip's strip, in order. */
const barHeights = (tree, testID) =>
  stripBars(tree, testID).map((bar) => flatten(bar.props.style).height);

/** How many bars read as already played. */
const playedBars = (tree, testID, accent) =>
  stripBars(tree, testID).filter((bar) => flatten(bar.props.style).backgroundColor === accent)
    .length;

const timeText = (tree, testID) => {
  const found = node(tree, `${testID}-time`);
  if (!found) return undefined;
  const { children } = found.props;
  return Array.isArray(children) ? children.join('') : String(children);
};

beforeEach(() => {
  audio.__reset();
});

afterEach(() => {
  trees.forEach((tree) => act(() => tree.unmount()));
  trees = [];
});

describe('VoicePlayer: tap plays, tap again pauses (FR-020)', () => {
  it('plays the clip on the first tap, and shows itself as playing', async () => {
    const tree = render({ uri: CLIP_A, duration: 12, testID: 'clip-a' });
    const player = audio.__playerFor(CLIP_A);

    expect(iconName(tree, 'clip-a')).toBe('play');

    await tap(tree, 'clip-a');

    expect(player.play).toHaveBeenCalledTimes(1);
    expect(iconName(tree, 'clip-a')).toBe('pause');
    expect(label(tree, 'clip-a')).toMatch(/pause/i);
  });

  it('pauses on the second tap and keeps the clip where it got to', async () => {
    const tree = render({ uri: CLIP_A, duration: 12, testID: 'clip-a' });
    const player = audio.__playerFor(CLIP_A);

    await tap(tree, 'clip-a');
    await act(async () => {
      audio.__loaded(player, 12);
      audio.__playedTo(player, 5);
    });

    await tap(tree, 'clip-a');

    expect(player.pause).toHaveBeenCalledTimes(1);
    // Paused, not stopped: a second tap resumes from 0:05 rather than from the beginning.
    expect(player.seekTo).not.toHaveBeenCalled();
    expect(player.currentTime).toBe(5);
    expect(iconName(tree, 'clip-a')).toBe('play');
    expect(label(tree, 'clip-a')).toMatch(/play/i);
  });

  it('starts a finished clip again from the beginning instead of playing its end', async () => {
    const tree = render({ uri: CLIP_A, duration: 12, testID: 'clip-a' });
    const player = audio.__playerFor(CLIP_A);

    await tap(tree, 'clip-a');
    await act(async () => {
      audio.__loaded(player, 12);
      audio.__finish(player);
    });

    expect(iconName(tree, 'clip-a')).toBe('play');

    await tap(tree, 'clip-a');

    expect(player.seekTo).toHaveBeenCalledWith(0);
    expect(player.play).toHaveBeenCalledTimes(2);
    expect(player.currentTime).toBe(0);
  });

  it('follows the player, not its own flag: a clip that ends by itself offers to play again', async () => {
    const tree = render({ uri: CLIP_A, duration: 12, testID: 'clip-a' });
    const player = audio.__playerFor(CLIP_A);

    await tap(tree, 'clip-a');
    expect(iconName(tree, 'clip-a')).toBe('pause');

    // Nobody tapped anything: the clip simply ran out.
    await act(async () => {
      audio.__loaded(player, 12);
      audio.__finish(player);
    });

    expect(player.pause).not.toHaveBeenCalled();
    expect(iconName(tree, 'clip-a')).toBe('play');
  });

  it('asks for the audio mode that is audible with the ringer switch off, before playing', async () => {
    const tree = render({ uri: CLIP_A, duration: 12, testID: 'clip-a' });
    const player = audio.__playerFor(CLIP_A);

    await tap(tree, 'clip-a');

    expect(audio.setAudioModeAsync).toHaveBeenCalledWith(PLAYBACK_AUDIO_MODE);
    expect(PLAYBACK_AUDIO_MODE.playsInSilentMode).toBe(true);
    // Playback never asks for the microphone; the recorder's mode must not be left behind.
    expect(PLAYBACK_AUDIO_MODE.allowsRecording).toBe(false);
    expect(audio.setAudioModeAsync.mock.invocationCallOrder[0]).toBeLessThan(
      player.play.mock.invocationCallOrder[0],
    );
  });

  it('plays even when the audio mode cannot be set: refusing to play is the defect', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    audio.setAudioModeAsync.mockImplementation(async () => {
      throw new Error('session busy');
    });

    const tree = render({ uri: CLIP_A, duration: 12, testID: 'clip-a' });
    const player = audio.__playerFor(CLIP_A);

    await tap(tree, 'clip-a');

    expect(player.play).toHaveBeenCalledTimes(1);
    expect(iconName(tree, 'clip-a')).toBe('pause');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('shows a clip with no file as unavailable rather than as a live control', async () => {
    const tree = render({ uri: null, duration: 12, testID: 'clip-a' });

    expect(toggle(tree, 'clip-a').props.disabled).toBe(true);
    expect(label(tree, 'clip-a')).toMatch(/unavailable/i);

    await tap(tree, 'clip-a');

    // The hook is called unconditionally, as a hook must be, so a player exists -- but it has
    // no source to load and nothing is ever asked of it.
    audio.__players().forEach((player) => {
      expect(player.source).toBeNull();
      expect(player.play).not.toHaveBeenCalled();
    });
    expect(audio.setAudioModeAsync).not.toHaveBeenCalled();
    expect(iconName(tree, 'clip-a')).toBe('play');
  });
});

describe('VoicePlayer: one clip plays at a time', () => {
  it('pauses the clip that was playing when another one starts', async () => {
    const first = render({ uri: CLIP_A, duration: 12, testID: 'clip-a' });
    const second = render({ uri: CLIP_B, duration: 30, testID: 'clip-b' });
    const playerA = audio.__playerFor(CLIP_A);
    const playerB = audio.__playerFor(CLIP_B);

    await tap(first, 'clip-a');
    expect(iconName(first, 'clip-a')).toBe('pause');

    await tap(second, 'clip-b');

    expect(playerA.pause).toHaveBeenCalledTimes(1);
    expect(playerB.play).toHaveBeenCalledTimes(1);
    expect(iconName(first, 'clip-a')).toBe('play');
    expect(iconName(second, 'clip-b')).toBe('pause');
  });

  it('does not pause itself when the same clip is played again', async () => {
    const tree = render({ uri: CLIP_A, duration: 12, testID: 'clip-a' });
    const player = audio.__playerFor(CLIP_A);

    await tap(tree, 'clip-a'); // play
    await tap(tree, 'clip-a'); // pause
    await tap(tree, 'clip-a'); // play again

    expect(player.play).toHaveBeenCalledTimes(2);
    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(iconName(tree, 'clip-a')).toBe('pause');
  });

  it('two taps in one tick leave the clip playing, never paused by its own second tap', async () => {
    const tree = render({ uri: CLIP_A, duration: 12, testID: 'clip-a' });
    const player = audio.__playerFor(CLIP_A);
    const target = toggle(tree, 'clip-a');

    // Both taps land before the first has finished asking for the audio mode, so the second
    // still sees a clip that is not playing -- and must not take it for somebody else's.
    await act(async () => {
      await Promise.all([target.props.onPress(), target.props.onPress()]);
    });

    expect(player.pause).not.toHaveBeenCalled();
    expect(iconName(tree, 'clip-a')).toBe('pause');
  });

  it('keeps the turn with the clip that has it: going back to the first pauses the second', async () => {
    const first = render({ uri: CLIP_A, duration: 12, testID: 'clip-a' });
    const second = render({ uri: CLIP_B, duration: 30, testID: 'clip-b' });
    const playerA = audio.__playerFor(CLIP_A);
    const playerB = audio.__playerFor(CLIP_B);

    await tap(first, 'clip-a');
    await tap(second, 'clip-b'); // pauses A; A must not take the turn away from B on its way out
    await tap(first, 'clip-a');

    expect(playerB.pause).toHaveBeenCalledTimes(1);
    expect(iconName(first, 'clip-a')).toBe('pause');
    expect(iconName(second, 'clip-b')).toBe('play');
    expect(playerA.play).toHaveBeenCalledTimes(2);
  });

  it('gives the turn back when a play fails, so nothing is left paused for nothing', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const first = render({ uri: CLIP_A, duration: 12, testID: 'clip-a' });
    const second = render({ uri: CLIP_B, duration: 30, testID: 'clip-b' });
    const playerA = audio.__playerFor(CLIP_A);
    const playerB = audio.__playerFor(CLIP_B);

    await tap(first, 'clip-a');
    audio.__failPlay(playerB);
    await tap(second, 'clip-b'); // pauses A, then fails to start: B is holding a turn it lost

    expect(playerA.pause).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();

    playerA.pause.mockClear();
    await tap(first, 'clip-a');

    // Nothing of B's is playing, so playing A again must not reach for it.
    expect(playerB.pause).not.toHaveBeenCalled();
    expect(iconName(first, 'clip-a')).toBe('pause');
    warn.mockRestore();
  });

  it('forgets a playing clip whose card goes away, so the next clip never calls it', async () => {
    const first = render({ uri: CLIP_A, duration: 12, testID: 'clip-a' });
    const second = render({ uri: CLIP_B, duration: 30, testID: 'clip-b' });
    const playerA = audio.__playerFor(CLIP_A);
    const playerB = audio.__playerFor(CLIP_B);

    await tap(first, 'clip-a');
    await unmount(first);
    expect(playerA.released).toBe(true);

    await tap(second, 'clip-b');

    // A released player throws when it is called, so one `pause` here would fail this test.
    expect(playerA.pause).not.toHaveBeenCalled();
    expect(playerB.play).toHaveBeenCalledTimes(1);
    expect(iconName(second, 'clip-b')).toBe('pause');
  });
});

describe('VoicePlayer: the strip stays, and works (FR-021)', () => {
  const LEVELS = [0.2, 0.9, 0.4, 0.7, 0.3, 0.8, 0.5, 0.6];
  const ACCENT = '#2B7DE9';

  it("draws the clip's own recorded levels, and moves them along as it plays", async () => {
    const tree = render({
      uri: CLIP_A,
      duration: 12,
      waveform: LEVELS,
      color: ACCENT,
      testID: 'clip-a',
    });
    const player = audio.__playerFor(CLIP_A);

    // The strip is drawing *this clip*, not a generic one: the bar heights are the clip's own
    // levels resampled to the strip's bar count, which no fallback strip can coincide with.
    expect(barHeights(tree, 'clip-a')).toEqual(
      resampleLevels(LEVELS, BARS_COMPACT).map((level) => level * 24),
    );
    expect(playedBars(tree, 'clip-a', ACCENT)).toBe(1); // the bar at position 0

    await tap(tree, 'clip-a');
    await act(async () => {
      audio.__loaded(player, 12);
      audio.__playedTo(player, 9);
    });

    // Three quarters through, so three quarters of the bars read as played.
    expect(playedBars(tree, 'clip-a', ACCENT)).toBe(23);
  });

  it("does not seek until the player knows the clip's length, then seeks by that", async () => {
    const tree = render({ uri: CLIP_A, duration: 12, waveform: LEVELS, testID: 'clip-a' });
    const player = audio.__playerFor(CLIP_A);
    const strip = stripOf(tree, 'clip-a');
    await act(async () => {
      strip.props.onLayout({ nativeEvent: { layout: { width: 200, height: 24 } } });
    });

    // Nothing loaded yet. The only length to hand is the piece's, and the piece's can be short
    // of the truth -- and once playback has run past it the shown total is the *position*, so
    // seeking against it would land the playhead where it already is.
    await act(async () => {
      audio.__playedTo(player, 13);
    });
    await act(async () => {
      await strip.props.onPress({ nativeEvent: { locationX: 199 } });
    });
    expect(player.seekTo).not.toHaveBeenCalled();

    // Now the player reports 20 s, which is the only length a seek is ever measured against.
    await act(async () => {
      audio.__loaded(player, 20);
    });
    await act(async () => {
      await strip.props.onPress({ nativeEvent: { locationX: 50 } });
    });

    // A quarter along a 20-second clip: 5 s. A quarter of the piece's claimed 12 would be 3.
    expect(player.seekTo).toHaveBeenCalledWith(5);
  });

  it('seeks to the point in the clip that was tapped on the strip', async () => {
    const tree = render({ uri: CLIP_A, duration: 12, waveform: LEVELS, testID: 'clip-a' });
    const player = audio.__playerFor(CLIP_A);
    await act(async () => {
      audio.__loaded(player, 12);
    });

    const strip = stripOf(tree, 'clip-a');
    await act(async () => {
      strip.props.onLayout({ nativeEvent: { layout: { width: 200, height: 24 } } });
    });
    await act(async () => {
      await strip.props.onPress({ nativeEvent: { locationX: 50 } });
    });

    // A quarter of the way along a 12-second clip.
    expect(player.seekTo).toHaveBeenCalledWith(3);
  });

  /**
   * FR-021 is a MUST about appearance, and the pill's appearance has drifted twice in review.
   * So this case is the exhaustive list: every style property the compact `AudioPlayer` and the
   * card between them put inside `styles.audioPlayer` today, asserted here so the next drift
   * fails a test instead of needing another reviewer.
   *
   * Today's tree, from `AudioPlayer.js` before this task removed it from the pill:
   *   containerCompact  row / center / padding 8 / #F5F5F5 / radius 8
   *   playButtonCompact 32x32 / radius 16 / centred / marginRight 8 / primaryColor
   *   compactContent    flex 1 / marginRight 8
   *   waveformContainer row / center / space-between / height 50 / marginBottom 12
   *   durationCompact   11pt / #999 / tabular / minWidth 70 / right
   */
  it("is the compact AudioPlayer's pill, property for property (FR-021)", () => {
    const tree = render({ uri: CLIP_A, duration: 12, color: ACCENT, testID: 'clip-a' });

    expect(styleOf(tree, 'clip-a')).toMatchObject({
      flexDirection: 'row',
      alignItems: 'center',
      padding: 8,
      backgroundColor: '#F5F5F5',
      borderRadius: 8,
    });

    expect(flattenStyle(toggle(tree, 'clip-a').props.style)).toMatchObject({
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 8,
      backgroundColor: ACCENT,
    });

    expect(styleOf(tree, 'clip-a-content')).toMatchObject({ flex: 1, marginRight: 8 });

    expect(flattenStyle(stripOf(tree, 'clip-a').props.style)).toMatchObject({
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: 50,
      marginBottom: 12,
    });

    // 30 bars, each at most 24 px, 3 px wide with a 2 px radius -- the compact numbers.
    const barStyles = stripBars(tree, 'clip-a').map((bar) => flattenStyle(bar.props.style));
    expect(barStyles).toHaveLength(BARS_COMPACT);
    barStyles.forEach((bar) => {
      expect(bar.width).toBe(3);
      expect(bar.borderRadius).toBe(2);
      expect(bar.height).toBeLessThanOrEqual(24);
    });

    expect(flattenStyle(timeNode(tree, 'clip-a').props.style)).toMatchObject({
      fontSize: 11,
      color: '#999',
      fontVariant: ['tabular-nums'],
      minWidth: 70,
      textAlign: 'right',
    });
  });

  it('still draws a strip for a clip whose waveform the server dropped', () => {
    const missing = render({ uri: CLIP_A, duration: 12, testID: 'clip-a' });
    // `[]` is the shape a server-sourced clip actually arrives in: the backend never stores the
    // waveform (see this component's header), and `SocialService` maps the absent value to an
    // empty array. Both have to draw a strip.
    const emptied = render({ uri: CLIP_B, duration: 12, waveform: [], testID: 'clip-b' });

    expect(stripBars(missing, 'clip-a')).toHaveLength(BARS_COMPACT);
    expect(stripBars(emptied, 'clip-b')).toHaveLength(BARS_COMPACT);
  });
});

describe('VoicePlayer: never while a recording is running (FR-007)', () => {
  it('refuses to play, or to be scrubbed, and says why', async () => {
    const tree = render({ uri: CLIP_A, duration: 12, testID: 'clip-a', isRecording: true });
    const player = audio.__playerFor(CLIP_A);

    expect(toggle(tree, 'clip-a').props.disabled).toBe(true);
    expect(label(tree, 'clip-a')).toMatch(/recording/i);

    // Loaded, so that the refusal below is the recording guard's and not merely "there is no
    // length to seek against yet" -- the two are indistinguishable on an unloaded clip.
    await act(async () => {
      audio.__loaded(player, 12);
    });

    await tap(tree, 'clip-a');
    const strip = stripOf(tree, 'clip-a');
    await act(async () => {
      await strip.props.onPress({ nativeEvent: { locationX: 50 } });
    });

    // The point of the guard: playback would set `allowsRecording: false` on the shared audio
    // session and end the recording that is running (FR-007).
    expect(audio.setAudioModeAsync).not.toHaveBeenCalled();
    expect(player.play).not.toHaveBeenCalled();
    expect(player.seekTo).not.toHaveBeenCalled();
  });

  it('pauses a clip that is playing when a recording starts', async () => {
    const tree = render({ uri: CLIP_A, duration: 12, testID: 'clip-a' });
    const player = audio.__playerFor(CLIP_A);

    await tap(tree, 'clip-a');
    expect(iconName(tree, 'clip-a')).toBe('pause');

    await act(async () => {
      tree.update(
        <VoicePlayer uri={CLIP_A} duration={12} testID="clip-a" isRecording />,
      );
    });

    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(iconName(tree, 'clip-a')).toBe('play');
  });
});

describe('VoicePlayer: a clip that cannot be played says so', () => {
  it('shows a clip whose file has gone as unavailable, not as a live control', async () => {
    const tree = render({ uri: CLIP_A, duration: 12, testID: 'clip-a' });
    const player = audio.__playerFor(CLIP_A);

    await act(async () => {
      audio.__errored(player, 'file not found');
    });

    expect(toggle(tree, 'clip-a').props.disabled).toBe(true);
    expect(label(tree, 'clip-a')).toMatch(/unavailable/i);

    await tap(tree, 'clip-a');

    expect(player.play).not.toHaveBeenCalled();
  });
});

describe('VoicePlayer: how far through the clip it is', () => {
  it("shows the piece's own length until the player reports its own, then the player's", async () => {
    const tree = render({ uri: CLIP_A, duration: 12, testID: 'clip-a' });
    const player = audio.__playerFor(CLIP_A);

    // Nothing is loaded yet, so the only length there is is the one the piece recorded.
    expect(timeText(tree, 'clip-a')).toBe('0:00 / 0:12');

    await act(async () => {
      audio.__loaded(player, 95);
      audio.__playedTo(player, 7);
    });

    expect(timeText(tree, 'clip-a')).toBe('0:07 / 1:35');
  });

  it('does not call a clip finished because its piece under-reported its length', async () => {
    // The piece says 12 s; the clip is really 13. Until the player has loaded, 12 is all there
    // is to go on -- and reading "past the end" off it would rewind a clip that is mid-sentence.
    const tree = render({ uri: CLIP_A, duration: 12, testID: 'clip-a' });
    const player = audio.__playerFor(CLIP_A);

    await tap(tree, 'clip-a');
    await act(async () => {
      audio.__playedTo(player, 13); // still loading: the player reports no duration of its own
    });

    // Never a length shorter than what has already played.
    expect(timeText(tree, 'clip-a')).toBe('0:13 / 0:13');

    await tap(tree, 'clip-a'); // pause
    await tap(tree, 'clip-a'); // resume -- from 0:13, not from the beginning

    expect(player.seekTo).not.toHaveBeenCalled();
    expect(player.currentTime).toBe(13);
  });

  it('formats a clock as m:ss, zero-padded, and never below zero', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(7)).toBe('0:07');
    expect(formatClock(95)).toBe('1:35');
    expect(formatClock(-4)).toBe('0:00');
    expect(formatClock(undefined)).toBe('0:00');
  });
});

/**
 * T054 puts this player in the two places a voice clip appears. Both are pinned here, with the
 * real `VoicePlayer` inside them, because a control that is not *reached* is the same dead
 * button FR-020 is about -- and neither host has a suite of its own that would notice it going.
 */
describe('VoicePlayer: the two places a voice clip appears (FR-020)', () => {
  it("plays a clip from the capture screen's audio row", async () => {
    const pieces = [
      {
        localId: 'p1',
        kind: 'audio',
        uri: CLIP_A,
        duration: 12,
        capturedAt: '2026-11-08T09:15:00.000Z',
      },
    ];
    let tree;
    act(() => {
      tree = renderer.create(<PieceList pieces={pieces} />);
    });
    trees.push(tree);

    expect(timeText(tree, 'piece-player-0')).toBe('0:00 / 0:12');

    await tap(tree, 'piece-player-0');

    expect(audio.__playerFor(CLIP_A).play).toHaveBeenCalledTimes(1);
    expect(iconName(tree, 'piece-player-0')).toBe('pause');
  });

  it("hands the capture screen's recording state down to the row's control (FR-007)", async () => {
    const pieces = [
      {
        localId: 'p1',
        kind: 'audio',
        uri: CLIP_A,
        duration: 12,
        capturedAt: '2026-11-08T09:15:00.000Z',
      },
    ];
    let tree;
    act(() => {
      tree = renderer.create(<PieceList pieces={pieces} isRecording />);
    });
    trees.push(tree);

    expect(toggle(tree, 'piece-player-0').props.disabled).toBe(true);

    await tap(tree, 'piece-player-0');

    expect(audio.setAudioModeAsync).not.toHaveBeenCalled();
    expect(audio.__playerFor(CLIP_A).play).not.toHaveBeenCalled();
  });

  it("plays a clip from the Journal card's voice pill, with the clip's own strip", async () => {
    const entry = {
      id: 'e1',
      userId: 'u1',
      createdAt: '2026-11-08T09:15:00Z',
      contentBlocks: [
        {
          type: 'audio',
          media: { id: 'm1', localPath: CLIP_A, duration: 12 },
          // On the **block**, which is where `journalBlocks.js` puts a clip's levels. The code
          // this replaced read `audio.waveform` off the media item, where there is none.
          waveform: [0.3, 0.6, 0.2, 0.9],
        },
      ],
    };
    let tree;
    act(() => {
      tree = renderer.create(
        <JournalEntryCard
          entry={entry}
          user={{ id: 'u1', name: 'Hamid' }}
          currentUserId="u1"
          showEngagement={false}
        />,
      );
    });
    trees.push(tree);

    // The block's four levels, resampled across the pill's bars: the card is drawing this
    // clip's own waveform and not the fallback strip.
    expect(barHeights(tree, 'memory-voice-player-0-0')).toEqual(
      resampleLevels([0.3, 0.6, 0.2, 0.9], BARS_COMPACT).map((level) => level * 24),
    );

    await tap(tree, 'memory-voice-player-0-0');

    expect(audio.__playerFor(CLIP_A).play).toHaveBeenCalledTimes(1);
    expect(iconName(tree, 'memory-voice-player-0-0')).toBe('pause');
  });
});
