/**
 * 013 T054 (fix round 1) -- `WaveformStrip`.
 *
 * The strip is the part of a voice clip you can see and scrub: bars, the played ones in the
 * accent colour, and a tap that moves playback. It was `AudioPlayer.renderWaveform`, drawn
 * nowhere else; it is now its own component because the Journal card's voice pill draws it too
 * (FR-021 keeps the pill looking as it does today), and two copies of a logic block is one copy
 * too many.
 *
 * What is pinned here:
 *   - a clip's **own** recorded levels are what gets drawn, one bar each;
 *   - the played bars are the accent colour and the rest are not, which is the whole of what
 *     "how far through am I" looks like;
 *   - **the fallback strip is stable.** Today's is `0.2 + Math.random() * 0.6` evaluated inside
 *     render, so the strip reshuffles on every tick of playback. Derived from the clip's uri
 *     instead: the same clip draws the same strip for ever, two different clips do not look
 *     alike, and the range is today's;
 *   - a tap seeks to the fraction of the strip's **measured** width that was tapped. Today's
 *     code reads `getBoundingClientRect()`, a web API, and so always falls back to a hardcoded
 *     200 px on a phone -- which is why seeking in the pill lands in the wrong place;
 *   - a disabled strip does not seek.
 */

import React from 'react';
import renderer, { act } from 'react-test-renderer';

import WaveformStrip, { BARS_COMPACT, fallbackLevels, resampleLevels } from '../WaveformStrip';

global.IS_REACT_ACT_ENVIRONMENT = true;

const ACCENT = '#2B7DE9';

let trees = [];

const render = (props) => {
  let tree;
  act(() => {
    tree = renderer.create(<WaveformStrip testID="strip" color={ACCENT} {...props} />);
  });
  trees.push(tree);
  return tree;
};

/** Host nodes only: a `View` is a composite wrapping a host of the same name and testID. */
const bars = (tree) =>
  tree.root.findAll(
    (n) =>
      typeof n.type === 'string' &&
      typeof n.props?.testID === 'string' &&
      /^strip-bar-\d+$/.test(n.props.testID),
  );

const flatten = (style) => (Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style || {});

const colours = (tree) => bars(tree).map((bar) => flatten(bar.props.style).backgroundColor);
const heights = (tree) => bars(tree).map((bar) => flatten(bar.props.style).height);

/** The touchable itself, not the component that was handed the same testID. */
const strip = (tree) =>
  tree.root.findAll(
    (n) => n.props?.testID === 'strip' && typeof n.props?.onPress === 'function',
  )[0];

/** The strip is laid out, so a tap has a real width to divide by. */
const layout = (tree, width) =>
  act(() => {
    strip(tree).props.onLayout({ nativeEvent: { layout: { width, height: 50 } } });
  });

const tapAt = (tree, locationX) =>
  act(() => {
    strip(tree).props.onPress({ nativeEvent: { locationX } });
  });

afterEach(() => {
  trees.forEach((tree) => act(() => tree.unmount()));
  trees = [];
});

describe('WaveformStrip: the clip you can see', () => {
  it("draws one bar per recorded level, at that level's height", () => {
    // `bars` matched to the clip's level count, so this case is about the heights alone; the
    // mismatched counts are the resampling block below.
    const tree = render({ levels: [0, 0.5, 1], bars: 3, barHeight: 40 });

    expect(bars(tree)).toHaveLength(3);
    expect(heights(tree)).toEqual([0, 20, 40]);
  });

  it('clamps a level that is out of range rather than drawing off the strip', () => {
    const tree = render({ levels: [-2, 7], bars: 2, barHeight: 40 });

    expect(heights(tree)).toEqual([0, 40]);
  });

  it('colours the played bars with the accent and leaves the rest alone', () => {
    const tree = render({ levels: [0.4, 0.4, 0.4, 0.4], bars: 4, progress: 0.5 });

    // Today's rule, kept deliberately (FR-021): a bar counts as played once the playhead has
    // *reached* it, so half way through four bars lights three -- the same reason position 0
    // lights the first one rather than none.
    expect(colours(tree)).toEqual([ACCENT, ACCENT, ACCENT, '#DDD']);
  });

  it('plays nothing yet at progress 0, and everything at progress 1', () => {
    const atStart = render({ levels: [0.4, 0.4], bars: 2, progress: 0 });
    const atEnd = render({ levels: [0.4, 0.4], bars: 2, progress: 1 });

    // The first bar is the one being played at position 0, so it reads as played.
    expect(colours(atStart)).toEqual([ACCENT, '#DDD']);
    expect(colours(atEnd)).toEqual([ACCENT, ACCENT]);
  });
});

describe('WaveformStrip: a clip always draws the bars the strip asked for', () => {
  /**
   * `VoiceRecorderBar` collects about four levels a second and `downsampleWaveform` only
   * *downs*amples, so a 2-second clip arrives with about 8 levels and a 5-minute one with 50.
   * Drawing one bar per level would make the bar count a function of clip length -- eight bars
   * spread `space-between` across a whole pill where thirty have always appeared. The clip's own
   * levels are what gets drawn (that is the ruling), resampled to the strip's own bar count.
   */
  it('stretches a short clip to fill the strip', () => {
    const tree = render({ levels: [0, 1, 0, 1], bars: 8, barHeight: 10 });

    expect(bars(tree)).toHaveLength(8);
    expect(heights(tree)).toEqual([0, 0, 10, 10, 0, 0, 10, 10]);
  });

  it('averages a long clip down, keeping the shape of the whole of it', () => {
    // Four loud levels then four quiet ones: averaged into four bars, the shape survives.
    const shaped = render({ levels: [1, 1, 1, 1, 0, 0, 0, 0], bars: 4, barHeight: 10 });

    expect(bars(shaped)).toHaveLength(4);
    expect(heights(shaped)).toEqual([10, 10, 0, 0]);

    // ...and it really averages each bucket rather than sampling one level out of it: loud and
    // quiet alternating is a strip of half-height bars, not a strip of whichever level was
    // picked. (Added after a "take the first of each bucket" mutant survived the case above,
    // where the two are indistinguishable.)
    const alternating = render({ levels: [1, 0, 1, 0, 1, 0, 1, 0], bars: 4, barHeight: 10 });

    expect(heights(alternating)).toEqual([5, 5, 5, 5]);
  });

  it('draws exactly the asked-for count whatever the clip, short or long', () => {
    const short = render({ levels: [0.4, 0.5], bars: BARS_COMPACT });
    const long = render({ levels: new Array(220).fill(0.4), bars: BARS_COMPACT });

    expect(bars(short)).toHaveLength(BARS_COMPACT);
    expect(bars(long)).toHaveLength(BARS_COMPACT);
  });

  it('resamples in range, and has nothing to say about an empty clip', () => {
    expect(resampleLevels([0.2, 0.8], 5)).toHaveLength(5);
    resampleLevels([-3, 9, 0.5], 7).forEach((level) => {
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThanOrEqual(1);
    });
    expect(resampleLevels([], 5)).toEqual([]);
    expect(resampleLevels(undefined, 5)).toEqual([]);
  });
});

describe('WaveformStrip: it claims no role it cannot honour', () => {
  /**
   * It was briefly `accessibilityRole="adjustable"`, which tells a screen reader there are
   * increment and decrement actions -- and there are none, on a component two other screens
   * render as well as the pill. Today's strip is a plain touchable with no role, and a
   * half-implemented role is worse than none.
   */
  it('announces no adjustable role while it has no value and no actions', () => {
    const tree = render({ levels: [0.4], bars: 1, onSeek: jest.fn() });

    expect(strip(tree).props.accessibilityRole).toBeUndefined();
    expect(strip(tree).props.accessibilityValue).toBeUndefined();
    expect(strip(tree).props.onAccessibilityAction).toBeUndefined();
  });
});

describe('WaveformStrip: the fallback strip is stable', () => {
  it('draws a full strip when the clip carries no levels', () => {
    const tree = render({ levels: [], seed: 'file:///clip-a.m4a' });

    expect(bars(tree)).toHaveLength(BARS_COMPACT);
    heights(tree).forEach((height) => {
      // Today's range: 0.2 + random * 0.6 of the bar height, so never flat and never full.
      expect(height).toBeGreaterThanOrEqual(0.2 * 24);
      expect(height).toBeLessThanOrEqual(0.8 * 24);
    });
  });

  it('draws the same strip for the same clip, every render and every instance', () => {
    const first = render({ seed: 'file:///clip-a.m4a' });
    const before = heights(first);

    // A re-render with new playback progress must not reshuffle the strip.
    act(() => {
      first.update(<WaveformStrip testID="strip" color={ACCENT} seed="file:///clip-a.m4a" progress={0.6} />);
    });
    expect(heights(first)).toEqual(before);

    const second = render({ seed: 'file:///clip-a.m4a' });
    expect(heights(second)).toEqual(before);
  });

  it('draws a different strip for a different clip', () => {
    const a = render({ seed: 'file:///clip-a.m4a' });
    const b = render({ seed: 'file:///clip-b.m4a' });

    expect(heights(b)).not.toEqual(heights(a));
  });

  it('is deterministic and in range for any seed, including none at all', () => {
    expect(fallbackLevels('x', 4)).toEqual(fallbackLevels('x', 4));
    expect(fallbackLevels(undefined, 4)).toHaveLength(4);
    fallbackLevels(undefined, 30).forEach((level) => {
      expect(level).toBeGreaterThanOrEqual(0.2);
      expect(level).toBeLessThanOrEqual(0.8);
    });
  });
});

describe('WaveformStrip: tapping it seeks', () => {
  it('seeks to the fraction of its measured width that was tapped', () => {
    const onSeek = jest.fn();
    const tree = render({ levels: [0.4, 0.4], bars: 2, onSeek });

    layout(tree, 300);
    tapAt(tree, 75);

    expect(onSeek).toHaveBeenCalledWith(0.25);
  });

  it('keeps a tap outside itself inside the clip', () => {
    const onSeek = jest.fn();
    const tree = render({ levels: [0.4], bars: 1, onSeek });

    layout(tree, 300);
    tapAt(tree, -40);
    tapAt(tree, 4000);

    expect(onSeek.mock.calls.map(([fraction]) => fraction)).toEqual([0, 1]);
  });

  it('does not seek while it is disabled', () => {
    const onSeek = jest.fn();
    const tree = render({ levels: [0.4], bars: 1, onSeek, disabled: true });

    layout(tree, 300);
    expect(strip(tree).props.disabled).toBe(true);
    tapAt(tree, 150);

    expect(onSeek).not.toHaveBeenCalled();
  });
});
