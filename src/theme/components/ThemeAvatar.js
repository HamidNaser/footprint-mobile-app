/**
 * Avatar in the theme's frame.
 *
 * profile-frame.svg is a gold ring with a burgundy rule inside it, so the inner
 * rule is drawn as an absolutely positioned overlay rather than a nested View
 * that would shrink the image.
 *
 * Falls back to initials when there is no photo, which the Enchanted Storybook
 * kit needs anyway: it ships no imagery of its own.
 */
import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { useTheme } from '../ThemeContext';
import ThemeText from './ThemeText';

function initials(name) {
  if (!name) return '';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export default function ThemeAvatar({ uri, name, size = 40, style }) {
  const theme = useTheme();
  const { avatar, avatarInner } = theme.borders;
  const radius = theme.radii.avatar === 999 ? size / 2 : theme.radii.avatar;
  const hasInner = avatarInner.width > 0 && avatarInner.color !== 'transparent';

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: radius,
          borderWidth: avatar.width,
          borderColor: avatar.color,
          backgroundColor: theme.colors.surfaceAlt,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <ThemeText
          role="title"
          style={{ fontSize: size * 0.32, color: theme.colors.primary, letterSpacing: 0 }}
        >
          {initials(name)}
        </ThemeText>
      )}

      {hasInner ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            {
              borderWidth: avatarInner.width,
              borderColor: avatarInner.color,
              borderRadius: radius,
            },
          ]}
        />
      ) : null}
    </View>
  );
}
