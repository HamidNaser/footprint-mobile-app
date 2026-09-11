/**
 * The screen's ground layer.
 *
 * A theme with decorative assets supplies `decor.ScreenBackground` and gets its
 * frame, vines and texture. A theme without one gets a plain coloured view --
 * same component, same call site, no conditionals in the screens.
 *
 * `variant` lets a screen ask for less ornament without knowing what the
 * ornament is:
 *   'full'    -- everything the theme offers (default)
 *   'minimal' -- ground and frame only; no vines or scenery
 * A dense screen (calendar, map, long list) asks for 'minimal' and every theme
 * decides for itself what that means. Themes with no decor ignore it entirely.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../ThemeContext';

export default function ThemeBackground({ children, edges = ['top'], style, variant = 'full' }) {
  const theme = useTheme();
  const Decor = theme.decor?.ScreenBackground;

  const body = (
    <SafeAreaView style={[styles.safe, style]} edges={edges}>
      {children}
    </SafeAreaView>
  );

  if (Decor) {
    return <Decor variant={variant}>{body}</Decor>;
  }

  return (
    <View style={[styles.safe, { backgroundColor: theme.colors.background }]}>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: 'transparent' },
});
