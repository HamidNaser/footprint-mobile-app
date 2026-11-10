/**
 * WaveformStrip (013 T054, fix round 1) -- the bars a voice clip is seen and scrubbed on.
 *
 * This was `AudioPlayer.renderWaveform`. It is its own component because the Journal card's
 * voice pill draws the same strip: FR-021 allows the card only the additions this feature
 * lists, so the pill keeps its waveform, its play-progress colouring and its tap-to-seek, and
 * gains only a play control that works. Copying the block into `VoicePlayer` would have left
 * two strips to keep in step, so `AudioPlayer` renders this one too.
 *
 * Two deliberate differences from the code it replaces, both of which are the reason it was
 * worth extracting rather than copying:
 *
 * 1. **The fallback strip is stable.** The old one was `0.2 + Math.random() * 0.6` evaluated
 *    inside `render`, so a clip's strip reshuffled on every status update -- about four times a
 *    second while playing. The levels are now derived from the clip's own uri, so the same clip
 *    always draws the same strip, two clips do not look alike, and the range is unchanged. A
 *    strip that reshuffles is not "as it looks today" in any useful sense.
 * 2. **A tap seeks by the strip's measured width.** The old one read
 *    `event.nativeEvent.target.getBoundingClientRect?.()`, a web API that is undefined on a
 *    phone, so it fell through to a hardcoded `{ width: 200 }` and every seek landed in the
 *    wrong place on any strip that was not 200 px wide. The width now comes from `onLayout`,
 *    with 200 kept only as the value to use before the first layout.
 *
 * A clip's **own** levels are drawn when it has them: `VoiceRecorderBar` records up to
 * `WAVEFORM_BARS` of them per clip and `data-model.md` carries them on the audio piece. They are
 * **resampled to the strip's own bar count** rather than drawn one bar each -- see
 * `resampleLevels` for why the count must not depend on how long the clip is. The fallback is for
 * a clip that has no levels at all -- which, see `VoicePlayer`'s header, is every clip that has
 * been round-tripped through the server.
 */

import React, { useCallback, useMemo, useRef } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';

/** How many bars a strip draws when it has to invent them. Today's compact count. */
export const BARS_COMPACT = 30;

/** ...and today's full-size count. */
export const BARS_FULL = 50;

/** The strip's height before anything measures it, as the code this replaces assumed. */
const ASSUMED_WIDTH = 200;

const UNPLAYED_COLOUR = '#DDD';

/** FNV-1a, so one string becomes one number the same way every time. */
const hashSeed = (seed) => {
  let hash = 2166136261;
  const text = String(seed ?? '');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

/**
 * A stand-in strip for a clip with no recorded levels: `bars` values in 0.2..0.8, the range the
 * random version used, chosen by the seed rather than by chance so they never change.
 */
export const fallbackLevels = (seed, bars = BARS_COMPACT) => {
  let state = hashSeed(seed) || 1;
  const levels = [];
  for (let i = 0; i < bars; i += 1) {
    // A plain linear congruential step: enough to look like a voice, cheap, and repeatable.
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    levels.push(0.2 + (state / 4294967296) * 0.6);
  }
  return levels;
};

const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0));

/**
 * A clip's own levels, redrawn as exactly `bars` of them.
 *
 * The strip always draws the bar count it was asked for, because the count is part of how the
 * strip *looks* and must not become a function of how long the clip is. `VoiceRecorderBar`
 * collects about four levels a second and `downsampleWaveform` only ever downsamples, so a
 * two-second clip arrives with about eight levels and a five-minute one with fifty: one bar per
 * level would draw eight bars spread `space-between` across a whole pill where thirty have
 * always appeared.
 *
 * Down, it averages each bucket, the way `downsampleWaveform` does, so the shape of the whole
 * clip survives rather than only its beginning. Up, each bar takes the level it falls on, which
 * widens a short clip's bars rather than inventing detail it does not have.
 */
export const resampleLevels = (levels, bars = BARS_COMPACT) => {
  if (!Array.isArray(levels) || levels.length === 0) return [];
  if (!(bars > 0)) return [];
  if (levels.length === bars) return levels.map(clamp01);

  if (levels.length > bars) {
    const out = [];
    for (let i = 0; i < bars; i += 1) {
      const from = Math.floor((i * levels.length) / bars);
      const to = Math.max(Math.floor(((i + 1) * levels.length) / bars), from + 1);
      const bucket = levels.slice(from, to);
      out.push(bucket.reduce((sum, level) => sum + clamp01(level), 0) / bucket.length);
    }
    return out;
  }

  return Array.from({ length: bars }, (_, i) =>
    clamp01(levels[Math.floor((i * levels.length) / bars)]),
  );
};

/**
 * @param {object} props
 * @param {number[]} [props.levels] The clip's own recorded levels, 0..1, however many of them
 *   there are; they are resampled to `bars`.
 * @param {string} [props.seed] What the fallback strip is derived from; the clip's uri.
 * @param {number} [props.bars] How many bars the strip draws, whatever the clip.
 * @param {number} [props.progress] How far through the clip playback is, 0..1.
 * @param {string} [props.color] The colour of the bars already played.
 * @param {number} [props.barHeight] The height of a full-level bar.
 * @param {number} [props.height] The strip's own height; the bars sit centred in it.
 * @param {(fraction: number) => void} [props.onSeek] Called with where in the clip was tapped.
 * @param {boolean} [props.disabled] No seeking -- a clip that cannot play cannot be scrubbed.
 */
export default function WaveformStrip({
  levels,
  seed,
  bars = BARS_COMPACT,
  progress = 0,
  color = '#007AFF',
  barHeight = 24,
  height = 50,
  onSeek,
  disabled = false,
  testID = 'waveform-strip',
  style,
}) {
  const recorded = Array.isArray(levels) && levels.length > 0;

  const drawn = useMemo(
    () => (recorded ? resampleLevels(levels, bars) : fallbackLevels(seed, bars)),
    // `levels` is compared by identity on purpose: a caller handing down a fresh array of the
    // same numbers every render is a caller problem, and resampling is cheap. What must not be
    // recomputed is the fallback, which is why `seed` and `bars` are the other two keys.
    [recorded, levels, seed, bars],
  );

  // Measured rather than assumed: see the file header.
  const widthRef = useRef(ASSUMED_WIDTH);

  const handleLayout = useCallback((event) => {
    const measured = event?.nativeEvent?.layout?.width;
    if (Number.isFinite(measured) && measured > 0) widthRef.current = measured;
  }, []);

  const handlePress = useCallback(
    (event) => {
      // `disabled` is checked here as well as handed to the touchable: a clip that cannot play
      // must not be scrubbable whoever calls this, and the guarantee belongs to this component
      // rather than to its host.
      if (disabled || !onSeek) return;
      const x = event?.nativeEvent?.locationX ?? 0;
      onSeek(clamp01(x / (widthRef.current || ASSUMED_WIDTH)));
    },
    [disabled, onSeek],
  );

  const played = clamp01(progress);

  return (
    <TouchableOpacity
      testID={testID}
      // Deliberately no `accessibilityRole`. "adjustable" was tried and taken out again: it
      // promises a screen reader increment and decrement actions, and there are none here -- on
      // a component rendered by the voice pill, `media/MediaPreview.js` and `JournalEntryDetail`
      // alike. Today's strip carries no role either, so this is also the FR-021 answer; a role
      // with no `accessibilityValue` and no `onAccessibilityAction` is worse than none.
      activeOpacity={0.9}
      disabled={disabled}
      onLayout={handleLayout}
      onPress={handlePress}
      style={[styles.strip, { height }, style]}
    >
      {drawn.map((level, index) => (
        <View
          key={index}
          testID={`${testID}-bar-${index}`}
          style={[
            styles.bar,
            {
              height: level * barHeight,
              // The bar being played counts as played, so position 0 lights the first one.
              backgroundColor: index / drawn.length <= played ? color : UNPLAYED_COLOUR,
            },
          ]}
        />
      ))}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: UNPLAYED_COLOUR,
  },
});
