/**
 * DateSwipeContainer Component
 * 
 * Wraps content and provides swipe gesture support for date navigation:
 * - Swipe down: Go to next date
 * - Swipe up: Go to previous date
 * 
 * Can be enabled/disabled via settings.
 */

import React, { useRef, useCallback, memo, useState } from 'react';
import {
  View,
  PanResponder,
  Animated,
  StyleSheet,
  Text,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Threshold for triggering date change (in pixels)
const SWIPE_THRESHOLD = 80;

// Visual indicator height
const INDICATOR_HEIGHT = 60;

/**
 * Swipe indicator that shows during gesture
 */
const SwipeIndicator = memo(({ direction, opacity, translateY }) => (
  <Animated.View
    style={[
      styles.indicator,
      direction === 'up' ? styles.indicatorTop : styles.indicatorBottom,
      {
        opacity,
        transform: [{ translateY }],
      },
    ]}
  >
    <Ionicons 
      name={direction === 'up' ? 'chevron-up' : 'chevron-down'} 
      size={24} 
      color="#4361ee" 
    />
    <Text style={styles.indicatorText}>
      {direction === 'up' ? 'Previous Day' : 'Next Day'}
    </Text>
  </Animated.View>
));

/**
 * DateSwipeContainer Component
 */
const DateSwipeContainer = ({
  children,
  onNextDate,
  onPreviousDate,
  enabled = true,
  style,
}) => {
  // Animation values
  const translateY = useRef(new Animated.Value(0)).current;
  const indicatorOpacity = useRef(new Animated.Value(0)).current;
  
  // State to track swipe direction
  const [swipeDirection, setSwipeDirection] = useState(null);

  // Reset animations
  const resetAnimations = useCallback(() => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }),
      Animated.timing(indicatorOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setSwipeDirection(null);
    });
  }, [translateY, indicatorOpacity]);

  // Trigger date change with animation
  const triggerDateChange = useCallback((direction) => {
    // Animate off screen
    Animated.timing(translateY, {
      toValue: direction === 'up' ? -SCREEN_HEIGHT : SCREEN_HEIGHT,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      // Call the date change callback
      if (direction === 'up') {
        onPreviousDate?.();
      } else {
        onNextDate?.();
      }
      
      // Reset position immediately (content has changed)
      translateY.setValue(0);
      indicatorOpacity.setValue(0);
      setSwipeDirection(null);
    });
  }, [translateY, indicatorOpacity, onNextDate, onPreviousDate]);

  // Pan responder for swipe gestures
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to vertical swipes
        return enabled && Math.abs(gestureState.dy) > 10 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderGrant: () => {
        // Gesture started
      },
      onPanResponderMove: (_, gestureState) => {
        const { dy } = gestureState;
        
        // Limit the drag amount with resistance
        const limitedDy = dy > 0 
          ? Math.min(dy * 0.5, SWIPE_THRESHOLD * 1.5) 
          : Math.max(dy * 0.5, -SWIPE_THRESHOLD * 1.5);
        
        translateY.setValue(limitedDy);
        
        // Show indicator
        const progress = Math.min(Math.abs(dy) / SWIPE_THRESHOLD, 1);
        indicatorOpacity.setValue(progress);
        
        // Update direction
        if (dy > 10) {
          setSwipeDirection('down');
        } else if (dy < -10) {
          setSwipeDirection('up');
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const { dy, vy } = gestureState;
        
        // Check if swipe exceeded threshold or had enough velocity
        if (Math.abs(dy) > SWIPE_THRESHOLD || Math.abs(vy) > 0.5) {
          if (dy > 0 || vy > 0.5) {
            // Swipe down - next date
            triggerDateChange('down');
          } else {
            // Swipe up - previous date
            triggerDateChange('up');
          }
        } else {
          // Didn't meet threshold - reset
          resetAnimations();
        }
      },
      onPanResponderTerminate: () => {
        resetAnimations();
      },
    })
  ).current;

  // Indicator translate based on swipe
  const indicatorTranslateY = translateY.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD],
    outputRange: [0, swipeDirection === 'up' ? -INDICATOR_HEIGHT : INDICATOR_HEIGHT, 0],
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.container, style]}>
      {/* Swipe up indicator (previous day) */}
      {enabled && (
        <SwipeIndicator
          direction="up"
          opacity={swipeDirection === 'up' ? indicatorOpacity : 0}
          translateY={indicatorTranslateY}
        />
      )}

      {/* Content */}
      <Animated.View
        {...(enabled ? panResponder.panHandlers : {})}
        style={[
          styles.content,
          { transform: [{ translateY }] },
        ]}
      >
        {children}
      </Animated.View>

      {/* Swipe down indicator (next day) */}
      {enabled && (
        <SwipeIndicator
          direction="down"
          opacity={swipeDirection === 'down' ? indicatorOpacity : 0}
          translateY={indicatorTranslateY}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },

  content: {
    flex: 1,
  },

  indicator: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: INDICATOR_HEIGHT,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    zIndex: 100,
  },

  indicatorTop: {
    top: 0,
    backgroundColor: 'rgba(240, 244, 255, 0.95)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5E5',
  },

  indicatorBottom: {
    bottom: 0,
    backgroundColor: 'rgba(240, 244, 255, 0.95)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E5E5',
  },

  indicatorText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4361ee',
  },
});

export { DateSwipeContainer };
export default DateSwipeContainer;
