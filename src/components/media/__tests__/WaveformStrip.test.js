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

import WaveformStrip, { BARS_COMPACT, fallbackLevels } from '../WaveformStrip';

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
    const tree = render({ levels: [0, 0.5, 1], barHeight: 40 });

    expect(bars(tree)).toHaveLength(3);
    expect(heights(tree)).toEqual([0, 20, 40]);
  });

  it('clamps a level that is out of range rather than drawing off the strip', () => {
    const tree = render({ levels: [-2, 7], barHeight: 40 });

    expect(heights(tree)).toEqual([0, 40]);
  });

  it('colours the played bars with the accent and leaves the rest alone', () => {
    const tree = render({ levels: [0.4, 0.4, 0.4, 0.4], progress: 0.5 });

    // Today's rule, kept deliberately (FR-021): a bar counts as played once the playhead has
    // *reached* it, so half way through four bars lights three -- the same reason position 0
    // lights the first one rather than none.
    expect(colours(tree)).toEqual([ACCENT, ACCENT, ACCENT, '#DDD']);
  });

  it('plays nothing yet at progress 0, and everything at progress 1', () => {
    const atStart = render({ levels: [0.4, 0.4], progress: 0 });
    const atEnd = render({ levels: [0.4, 0.4], progress: 1 });

    // The first bar is the one being played at position 0, so it reads as played.
    expect(colours(atStart)).toEqual([ACCENT, '#DDD']);
    expect(colours(atEnd)).toEqual([ACCENT, ACCENT]);
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
    const tree = render({ levels: [0.4, 0.4], onSeek });

    layout(tree, 300);
    tapAt(tree, 75);

    expect(onSeek).toHaveBeenCalledWith(0.25);
  });

  it('keeps a tap outside itself inside the clip', () => {
    const onSeek = jest.fn();
    const tree = render({ levels: [0.4], onSeek });

    layout(tree, 300);
    tapAt(tree, -40);
    tapAt(tree, 4000);

    expect(onSeek.mock.calls.map(([fraction]) => fraction)).toEqual([0, 1]);
  });

  it('does not seek while it is disabled', () => {
    const onSeek = jest.fn();
    const tree = render({ levels: [0.4], onSeek, disabled: true });

    layout(tree, 300);
    expect(strip(tree).props.disabled).toBe(true);
    tapAt(tree, 150);

    expect(onSeek).not.toHaveBeenCalled();
  });
});
