/**
 * DateSwipeContainer Component
 *
 * Wraps content and provides swipe gesture support for date navigation:
 * - Swipe right: Go to the next date that has entries
 * - Swipe left:  Go to the previous date that has entries
 *
 * Navigation is entry-to-entry, not day-by-day: empty days are skipped, so a
 * journal with a three-week gap between trips takes one swipe to cross it. The
 * caller decides which date that is (see JournalScreen's `datesWithEntries`);
 * this component only reports the direction.
 *
 * `hasNext` / `hasPrevious` let the container refuse a swipe at either end
 * rather than animating out to an unchanged screen.
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Threshold for triggering date change (in pixels)
const SWIPE_THRESHOLD = 80;

// Visual indicator width
const INDICATOR_WIDTH = 130;

/**
 * Swipe indicator that shows during gesture
 */
const SwipeIndicator = memo(({ direction, opacity, translateX }) => (
  <Animated.View
    style={[
      styles.indicator,
      direction === 'left' ? styles.indicatorLeft : styles.indicatorRight,
      {
        opacity,
        transform: [{ translateX }],
      },
    ]}
  >
    <Ionicons
      name={direction === 'left' ? 'chevron-back' : 'chevron-forward'}
      size={24}
      color="#4361ee"
    />
    <Text style={styles.indicatorText}>
      {direction === 'left' ? 'Previous' : 'Next'}
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
  hasNext = true,
  hasPrevious = true,
  enabled = true,
  style,
}) => {
  // Animation values
  const translateX = useRef(new Animated.Value(0)).current;
  const indicatorOpacity = useRef(new Animated.Value(0)).current;

  // State to track swipe direction
  const [swipeDirection, setSwipeDirection] = useState(null);

  // Reset animations
  const resetAnimations = useCallback(() => {
    Animated.parallel([
      Animated.spring(translateX, {
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
  }, [translateX, indicatorOpacity]);

  // Trigger date change with animation. `direction` is the direction the finger
  // travelled: 'right' advances to the next date, 'left' goes back.
  const triggerDateChange = useCallback((direction) => {
    // Content follows the finger off screen.
    Animated.timing(translateX, {
      toValue: direction === 'right' ? SCREEN_WIDTH : -SCREEN_WIDTH,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      if (direction === 'right') {
        onNextDate?.();
      } else {
        onPreviousDate?.();
      }

      // Reset position immediately (content has changed)
      translateX.setValue(0);
      indicatorOpacity.setValue(0);
      setSwipeDirection(null);
    });
  }, [translateX, indicatorOpacity, onNextDate, onPreviousDate]);

  // Whether a swipe in this direction has anywhere to go.
  const canGo = useCallback(
    (direction) => (direction === 'right' ? hasNext : hasPrevious),
    [hasNext, hasPrevious],
  );

  // Pan responder for swipe gestures. Recreated when the guards change so the
  // closure never tests a stale hasNext/hasPrevious.
  const panResponder = useRef(null);
  const guards = `${enabled}:${hasNext}:${hasPrevious}`;
  const guardsRef = useRef(null);

  if (guardsRef.current !== guards) {
    guardsRef.current = guards;
    panResponder.current = PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to horizontal swipes, and only when the vertical intent
        // is clearly smaller -- the journal list scrolls vertically underneath.
        return (
          enabled &&
          Math.abs(gestureState.dx) > 10 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy)
        );
      },
      onPanResponderGrant: () => {
        // Gesture started
      },
      onPanResponderMove: (_, gestureState) => {
        const { dx } = gestureState;
        const direction = dx > 0 ? 'right' : 'left';

        // Resist the drag, and resist harder when there is nowhere to go so the
        // edge of the journal is felt rather than just discovered on release.
        const resistance = canGo(direction) ? 0.5 : 0.15;
        const limitedDx = dx > 0
          ? Math.min(dx * resistance, SWIPE_THRESHOLD * 1.5)
          : Math.max(dx * resistance, -SWIPE_THRESHOLD * 1.5);

        translateX.setValue(limitedDx);

        // Show indicator only when the swipe would actually move somewhere.
        const progress = canGo(direction)
          ? Math.min(Math.abs(dx) / SWIPE_THRESHOLD, 1)
          : 0;
        indicatorOpacity.setValue(progress);

        if (Math.abs(dx) > 10) {
          setSwipeDirection(direction);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const { dx, vx } = gestureState;
        const direction = dx > 0 ? 'right' : 'left';

        const passedThreshold =
          Math.abs(dx) > SWIPE_THRESHOLD || Math.abs(vx) > 0.5;

        if (passedThreshold && canGo(direction)) {
          triggerDateChange(direction);
        } else {
          // Either too small a gesture, or no date in that direction.
          resetAnimations();
        }
      },
      onPanResponderTerminate: () => {
        resetAnimations();
      },
    });
  }

  // Indicator slides in from its edge as the gesture progresses.
  const indicatorTranslateX = translateX.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD],
    outputRange: [0, swipeDirection === 'left' ? INDICATOR_WIDTH : -INDICATOR_WIDTH, 0],
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.container, style]}>
      {/* Swipe left indicator (previous date) */}
      {enabled && (
        <SwipeIndicator
          direction="left"
          opacity={swipeDirection === 'left' ? indicatorOpacity : 0}
          translateX={indicatorTranslateX}
        />
      )}

      {/* Content */}
      <Animated.View
        {...(enabled ? panResponder.current.panHandlers : {})}
        style={[
          styles.content,
          { transform: [{ translateX }] },
        ]}
      >
        {children}
      </Animated.View>

      {/* Swipe right indicator (next date) */}
      {enabled && (
        <SwipeIndicator
          direction="right"
          opacity={swipeDirection === 'right' ? indicatorOpacity : 0}
          translateX={indicatorTranslateX}
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
    top: 0,
    bottom: 0,
    width: INDICATOR_WIDTH,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    zIndex: 100,
  },

  indicatorLeft: {
    left: 0,
    backgroundColor: 'rgba(240, 244, 255, 0.95)',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: '#E5E5E5',
  },

  indicatorRight: {
    right: 0,
    backgroundColor: 'rgba(240, 244, 255, 0.95)',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: '#E5E5E5',
  },

  indicatorText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4361ee',
  },
});

export { DateSwipeContainer };
export default DateSwipeContainer;
