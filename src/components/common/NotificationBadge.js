/**
 * Notification Badge Component
 * 
 * Displays an unread notification count badge.
 * Can be used in tab bar, header icons, etc.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRealtime } from '../../context';

/**
 * Notification Badge
 */
export function NotificationBadge({
  count: propCount,  // Optional override for count
  maxCount = 99,
  size = 'medium',  // 'small' | 'medium' | 'large'
  style,
  textStyle,
}) {
  const { unreadNotificationCount } = useRealtime();
  
  const count = propCount ?? unreadNotificationCount;
  
  if (count <= 0) {
    return null;
  }

  const displayCount = count > maxCount ? `${maxCount}+` : String(count);
  
  const sizeStyles = {
    small: { badge: styles.badgeSmall, text: styles.textSmall },
    medium: { badge: styles.badgeMedium, text: styles.textMedium },
    large: { badge: styles.badgeLarge, text: styles.textLarge },
  };
  
  const currentSize = sizeStyles[size] || sizeStyles.medium;

  return (
    <View style={[styles.badge, currentSize.badge, style]}>
      <Text style={[styles.text, currentSize.text, textStyle]}>
        {displayCount}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: '#FF3B30',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
  },
  badgeSmall: {
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    top: -4,
    right: -4,
  },
  badgeMedium: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    top: -6,
    right: -6,
  },
  badgeLarge: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 8,
    top: -8,
    right: -8,
  },
  text: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  textSmall: {
    fontSize: 10,
  },
  textMedium: {
    fontSize: 12,
  },
  textLarge: {
    fontSize: 14,
  },
});

export default NotificationBadge;
