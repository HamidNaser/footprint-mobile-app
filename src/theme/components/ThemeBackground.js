/**
 * The screen's ground layer.
 *
 * A theme with decorative assets supplies `decor.ScreenBackground` and gets its
 * frame, vines and texture. A theme without one gets a plain coloured view --
 * same component, same call site, no conditionals in the screens.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../ThemeContext';

export default function ThemeBackground({ children, edges = ['top'], style }) {
  const theme = useTheme();
  const Decor = theme.decor?.ScreenBackground;

  const body = (
    <SafeAreaView style={[styles.safe, style]} edges={edges}>
      {children}
    </SafeAreaView>
  );

  if (Decor) {
    return <Decor>{body}</Decor>;
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
