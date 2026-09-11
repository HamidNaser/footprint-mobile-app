/**
 * Segmented control (the Family screen's List / Me toggle).
 *
 * Maps to tab-frame.svg and tab-selected.svg: an outer pill in the alt surface
 * with a selected pill in the base surface and an accent border.
 */
import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../ThemeContext';
import ThemeText from './ThemeText';

export default function ThemeTabBar({ tabs, value, onChange, style }) {
  const theme = useTheme();
  const { control } = theme.borders;

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: theme.colors.surfaceAlt,
          borderRadius: theme.radii.pill,
          borderWidth: control.width,
          borderColor: control.color,
          padding: 3,
        },
        style,
      ]}
    >
      {tabs.map((tab) => {
        const active = tab.key === value;
        return (
          <TouchableOpacity
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.label}
            onPress={() => onChange(tab.key)}
            style={[
              styles.tab,
              { borderRadius: theme.radii.pill },
              active && {
                backgroundColor: theme.colors.surfaceSelected,
                borderWidth: Math.max(1, control.width + 0.5),
                borderColor: theme.colors.borderAccent,
              },
            ]}
          >
            <ThemeText
              role="title"
              style={[
                styles.label,
                { color: active ? theme.colors.primary : theme.colors.textSecondary },
              ]}
            >
              {tab.label}
            </ThemeText>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row' },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 7 },
  label: { textAlign: 'center' },
});
