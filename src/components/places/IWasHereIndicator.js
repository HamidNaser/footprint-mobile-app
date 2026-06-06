/**
 * IWasHereIndicator - Badge showing user visited a place
 * 
 * Visual indicator on place cards showing the user has memories there.
 * Can also show how many times and which years.
 * 
 * Features:
 * - "I was here" badge
 * - Multiple visit count
 * - Year pills showing when user visited
 * - Animated appearance
 */

import React, { memo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Theme colors
const PRIMARY_COLOR = '#4361ee';
const SUCCESS_COLOR = '#10b981';
const SURFACE_COLOR = '#FFFFFF';

/**
 * Simple "I was here" badge
 */
export const IWasHereBadge = memo(({ size = 'default' }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 5,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const isSmall = size === 'small';

  return (
    <Animated.View 
      style={[
        styles.badge,
        isSmall && styles.badgeSmall,
        {
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }],
        }
      ]}
    >
      <Ionicons 
        name="checkmark-circle" 
        size={isSmall ? 12 : 14} 
        color="#FFF" 
      />
      {!isSmall && <Text style={styles.badgeText}>I was here</Text>}
    </Animated.View>
  );
});

/**
 * Visit count badge (shows number of visits)
 */
export const VisitCountBadge = memo(({ count }) => {
  if (count <= 1) return <IWasHereBadge />;

  return (
    <View style={styles.countBadge}>
      <Ionicons name="location" size={14} color="#FFF" />
      <Text style={styles.countText}>{count}x</Text>
    </View>
  );
});

/**
 * Year pills showing when user visited
 */
export const VisitYearsPills = memo(({ years, maxDisplay = 3 }) => {
  if (!years || years.length === 0) return null;

  const displayYears = years.slice(0, maxDisplay);
  const remaining = years.length - maxDisplay;

  return (
    <View style={styles.yearsContainer}>
      {displayYears.map((year) => (
        <View key={year} style={styles.yearPill}>
          <Text style={styles.yearPillText}>{year}</Text>
        </View>
      ))}
      {remaining > 0 && (
        <View style={[styles.yearPill, styles.yearPillMore]}>
          <Text style={styles.yearPillText}>+{remaining}</Text>
        </View>
      )}
    </View>
  );
});

/**
 * Full IWasHereIndicator with all features
 */
const IWasHereIndicator = memo(({ 
  iWasHere = false, 
  myYears = [],
  variant = 'badge', // 'badge' | 'count' | 'years' | 'full'
  size = 'default',
}) => {
  if (!iWasHere) return null;

  if (variant === 'badge') {
    return <IWasHereBadge size={size} />;
  }

  if (variant === 'count') {
    return <VisitCountBadge count={myYears.length} />;
  }

  if (variant === 'years') {
    return <VisitYearsPills years={myYears} />;
  }

  // Full variant - badge + years
  return (
    <View style={styles.fullContainer}>
      <IWasHereBadge size="small" />
      <VisitYearsPills years={myYears} maxDisplay={2} />
    </View>
  );
});

const styles = StyleSheet.create({
  // Simple badge
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SUCCESS_COLOR,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  badgeSmall: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFF',
  },

  // Count badge
  countBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PRIMARY_COLOR,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 3,
  },
  countText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFF',
  },

  // Year pills
  yearsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  yearPill: {
    backgroundColor: PRIMARY_COLOR,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  yearPillMore: {
    backgroundColor: '#64748b',
  },
  yearPillText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFF',
  },

  // Full container
  fullContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});

export default IWasHereIndicator;
