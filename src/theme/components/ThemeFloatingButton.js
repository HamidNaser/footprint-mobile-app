/**
 * Floating action button -- fab.svg / fab-location.svg.
 * `icon` is a semantic icon name, resolved through the theme's icon set.
 */
import React from 'react';
import { TouchableOpacity } from 'react-native';
import { useTheme } from '../ThemeContext';
import ThemeIcon from './ThemeIcon';

export default function ThemeFloatingButton({
  icon = 'location', onPress, accessibilityLabel, size = 56, style,
}) {
  const theme = useTheme();
  const { fabBorder } = theme.colors;
  const borderWidth = fabBorder && fabBorder !== 'transparent' ? 3 : 0;

  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || icon}
      style={[
        {
          position: 'absolute',
          right: 20,
          bottom: 20,
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: theme.colors.fabBackground,
          borderWidth,
          borderColor: fabBorder,
          alignItems: 'center',
          justifyContent: 'center',
        },
        theme.shadows.fab,
        style,
      ]}
    >
      <ThemeIcon name={icon} size={size * 0.44} color={theme.colors.fabForeground} active />
    </TouchableOpacity>
  );
}
