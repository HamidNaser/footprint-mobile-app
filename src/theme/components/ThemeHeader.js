/**
 * Screen header: title in the theme's display face, an optional flourish
 * beneath it, and caller-supplied left/right slots.
 *
 * Ornate themes centre the title under an ornament; flat themes get a plain
 * left-aligned title. Both come from the same tokens.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../ThemeContext';
import ThemeText from './ThemeText';

export default function ThemeHeader({ title, left, right, ornament = true }) {
  const theme = useTheme();
  const Ornament = theme.decor?.HeaderOrnament;
  const centred = Boolean(Ornament);

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.side}>{left}</View>
        <ThemeText
          role="display"
          numberOfLines={1}
          style={[
            styles.title,
            centred ? styles.titleCentred : styles.titleLeft,
            { color: theme.colors.primary },
          ]}
        >
          {title}
        </ThemeText>
        <View style={[styles.side, styles.sideRight]}>{right}</View>
      </View>

      {ornament && Ornament ? (
        <View style={styles.ornament}>
          <Ornament width={140} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center' },
  side: { minWidth: 72, flexDirection: 'row', alignItems: 'center', gap: 12 },
  sideRight: { justifyContent: 'flex-end' },
  title: { flex: 1 },
  titleCentred: { textAlign: 'center' },
  titleLeft: { textAlign: 'left' },
  ornament: { alignItems: 'center', marginTop: 2, marginBottom: 6 },
});
