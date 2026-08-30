/**
 * Enchanted Storybook decorative layer.
 *
 * Every component here is optional from the theme system's point of view:
 * ThemeBackground / ThemeHeader check for them and render plainly when a theme
 * supplies none. Geometry is taken from the kit's SVGs and expressed as a
 * ratio of the measured container, not a fixed pixel size, so one component
 * covers every device instead of a template per phone.
 */
import React, { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, G, Rect, Defs, LinearGradient, Stop, Circle, Ellipse } from 'react-native-svg';

const PAPER = '#F7F2E7';
const SOFT = '#EFE6D3';
const BURGUNDY = '#6F2C4B';
const GOLD = '#D4AF37';
const SAGE = '#7A8F6A';
const SKY = '#7892A8';

// mobile-background.svg is authored at 1080x2340. Border weights below are
// expressed as a fraction of that width so they scale with the device.
const REF_W = 1080;
const REF_H = 2340;

// vines-left.svg / vines-right.svg are 300x2340.
const VINE_RATIO = 300 / 2340;

const VINE_PATH =
  'M210 20C100 180 250 300 110 470C20 580 220 720 90 880C20 1000 220 1160 100 1320C30 1440 220 1600 95 1770C25 1880 210 2050 80 2320';
const VINE_LEAVES = [
  { cx: 165, cy: 150, rot: -40 },
  { cx: 120, cy: 270, rot: 40 },
  { cx: 150, cy: 650, rot: -40 },
  { cx: 120, cy: 1030, rot: 40 },
  { cx: 150, cy: 1450, rot: -40 },
];

const SKYLINE = [
  'M70 2110V2020h40v-80h35v50h35v-100h45v150h35v-80h40v150z',
  'M780 2110v-100h40v-100h35v50h45v-140h45v170h35v-90h30v210z',
];

function Vines({ height, flip }) {
  const width = height * VINE_RATIO;
  return (
    <Svg width={width} height={height} viewBox="0 0 300 2340">
      <G transform={flip ? 'translate(300,0) scale(-1,1)' : undefined}>
        <Path d={VINE_PATH} fill="none" stroke={SAGE} strokeWidth={7} />
        <G fill={SAGE}>
          {VINE_LEAVES.map((l, i) => (
            <Ellipse
              key={i}
              cx={l.cx}
              cy={l.cy}
              rx={16}
              ry={38}
              transform={`rotate(${l.rot} ${l.cx} ${l.cy})`}
            />
          ))}
        </G>
      </G>
    </Svg>
  );
}

/**
 * Full-bleed storybook page: paper gradient, distant skyline, edge vines and
 * the burgundy/gold double border from mobile-background.svg.
 */
export function StorybookScreenBackground({ children }) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  const onLayout = useCallback((e) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) =>
      prev.width === width && prev.height === height ? prev : { width, height }
    );
  }, []);

  const { width, height } = size;
  const ready = width > 0 && height > 0;

  // Border weights straight from the source SVG, scaled to the real width.
  const outerInset = (18 / REF_W) * width;
  const outerWidth = Math.max(2, (14 / REF_W) * width);
  const innerInset = (34 / REF_W) * width;
  const innerWidth = Math.max(StyleSheet.hairlineWidth, (2 / REF_W) * width);
  const outerRadius = (34 / REF_W) * width;
  const innerRadius = (26 / REF_W) * width;

  return (
    <View style={styles.root} onLayout={onLayout}>
      {ready && (
        <>
          {/* Paper gradient */}
          <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
            <Defs>
              <LinearGradient id="paper" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={PAPER} />
                <Stop offset="1" stopColor={SOFT} />
              </LinearGradient>
            </Defs>
            <Rect width={width} height={height} fill="url(#paper)" />
          </Svg>

          {/* Distant skyline. The device aspect is within ~1% of the source
              viewBox, so stretching it is imperceptible at 16% opacity. */}
          <Svg
            style={StyleSheet.absoluteFill}
            width={width}
            height={height}
            viewBox={`0 0 ${REF_W} ${REF_H}`}
            preserveAspectRatio="none"
          >
            <G fill={SKY} opacity={0.16}>
              {SKYLINE.map((d, i) => (
                <Path key={i} d={d} />
              ))}
            </G>
          </Svg>

          {/* Edge vines, aspect preserved */}
          <View style={[styles.vine, { left: -width * 0.02 }]} pointerEvents="none">
            <Vines height={height} />
          </View>
          <View style={[styles.vine, { right: -width * 0.02 }]} pointerEvents="none">
            <Vines height={height} flip />
          </View>

          {/* Double border */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: outerInset, left: outerInset, right: outerInset, bottom: outerInset,
              borderWidth: outerWidth, borderColor: BURGUNDY, borderRadius: outerRadius,
            }}
          />
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: innerInset, left: innerInset, right: innerInset, bottom: innerInset,
              borderWidth: innerWidth, borderColor: GOLD, borderRadius: innerRadius,
            }}
          />
        </>
      )}

      <View style={styles.content}>{children}</View>
    </View>
  );
}

/** ornament-center.svg -- the flourish under a screen title. */
export function StorybookHeaderOrnament({ width = 140 }) {
  const height = width * (80 / 300);
  return (
    <Svg width={width} height={height} viewBox="0 0 300 80">
      <Path
        d="M15 40C55 10 85 10 115 40C145 70 175 70 205 40C235 10 265 10 285 40"
        fill="none"
        stroke={GOLD}
        strokeWidth={4}
      />
      <Circle cx={150} cy={40} r={7} fill={BURGUNDY} />
    </Svg>
  );
}

/** divider.svg -- rule, star, rule. */
export function StorybookDivider({ width = 240 }) {
  const height = width * (60 / 600);
  return (
    <Svg width={width} height={height} viewBox="0 0 600 60">
      <Path d="M20 30H250M350 30H580" stroke={GOLD} strokeWidth={2} />
      <Path
        d="M300 8l8 17 19 2-14 12 4 18-17-9-17 9 4-18-14-12 19-2z"
        fill={GOLD}
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAPER },
  content: { flex: 1 },
  vine: { position: 'absolute', top: 0, bottom: 0, opacity: 0.5 },
});
