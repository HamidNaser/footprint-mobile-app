/**
 * Pill button. `variant` picks the theme's primary or secondary treatment --
 * button-primary.svg is a filled pill with an accent stroke, button-secondary
 * an outlined one.
 */
import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../ThemeContext';
import ThemeText from './ThemeText';

export default function ThemeButton({
  title, onPress, variant = 'primary', disabled = false, style, children,
}) {
  const theme = useTheme();
  const isPrimary = variant === 'primary';
  const { control } = theme.borders;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={title}
      style={[
        styles.base,
        {
          backgroundColor: isPrimary ? theme.colors.primary : theme.colors.surface,
          borderRadius: theme.radii.pill,
          borderWidth: Math.max(control.width, 1),
          borderColor: isPrimary ? theme.colors.accent : control.color || theme.colors.border,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {children ?? (
        <ThemeText
          role="title"
          style={{ color: isPrimary ? theme.colors.onPrimary : theme.colors.primary }}
        >
          {title}
        </ThemeText>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
});
