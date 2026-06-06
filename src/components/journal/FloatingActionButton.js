/**
 * FloatingActionButton (FAB) Component
 * 
 * Expandable floating action button for quick journal actions:
 * - Take photo
 * - Record video
 * - Record audio
 * - Write text
 */

import React, { useState, useRef, useCallback, memo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * FAB action types
 */
export const FABAction = {
  PHOTO: 'photo',
  VIDEO: 'video',
  AUDIO: 'audio',
  TEXT: 'text',
  GALLERY: 'gallery',
};

/**
 * Default FAB actions
 */
const DEFAULT_ACTIONS = [
  { 
    key: FABAction.PHOTO, 
    icon: 'camera-outline', 
    label: 'Photo', 
    color: '#007AFF',
  },
  { 
    key: FABAction.VIDEO, 
    icon: 'videocam-outline', 
    label: 'Video', 
    color: '#FF2D55',
  },
  { 
    key: FABAction.AUDIO, 
    icon: 'mic-outline', 
    label: 'Audio', 
    color: '#FF9500',
  },
  { 
    key: FABAction.GALLERY, 
    icon: 'images-outline', 
    label: 'Gallery', 
    color: '#34C759',
  },
  { 
    key: FABAction.TEXT, 
    icon: 'create-outline', 
    label: 'Write', 
    color: '#5856D6',
  },
];

/**
 * Sub-action button
 */
const SubActionButton = memo(({ 
  action, 
  index, 
  animation, 
  onPress,
  isOpen,
}) => {
  const translateY = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -60 * (index + 1)],
  });

  const scale = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 1],
  });

  const opacity = animation.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0, 1],
  });

  return (
    <Animated.View
      style={[
        styles.subActionContainer,
        {
          transform: [{ translateY }, { scale }],
          opacity,
        },
      ]}
      pointerEvents={isOpen ? 'auto' : 'none'}
    >
      <View style={styles.subActionLabelContainer}>
        <Text style={styles.subActionLabel}>{action.label}</Text>
      </View>
      <TouchableOpacity
        style={[styles.subActionButton, { backgroundColor: action.color }]}
        onPress={() => onPress(action.key)}
        activeOpacity={0.8}
      >
        <Ionicons name={action.icon} size={22} color="#FFF" />
      </TouchableOpacity>
    </Animated.View>
  );
});

/**
 * Main FAB component
 */
export const FloatingActionButton = ({
  actions = DEFAULT_ACTIONS,
  onAction,
  primaryColor = '#007AFF',
  position = 'right', // 'left' | 'center' | 'right'
  bottomOffset = 100,
  disabled = false,
  style,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const animation = useRef(new Animated.Value(0)).current;

  /**
   * Toggle menu open/close
   */
  const toggleMenu = useCallback(() => {
    const toValue = isOpen ? 0 : 1;
    
    Animated.spring(animation, {
      toValue,
      friction: 6,
      tension: 40,
      useNativeDriver: true,
    }).start();

    setIsOpen(!isOpen);
  }, [isOpen, animation]);

  /**
   * Close menu
   */
  const closeMenu = useCallback(() => {
    if (isOpen) {
      Animated.spring(animation, {
        toValue: 0,
        friction: 6,
        tension: 40,
        useNativeDriver: true,
      }).start();
      setIsOpen(false);
    }
  }, [isOpen, animation]);

  /**
   * Handle action press
   */
  const handleActionPress = useCallback((actionKey) => {
    closeMenu();
    onAction?.(actionKey);
  }, [closeMenu, onAction]);

  /**
   * Calculate position
   */
  const getPositionStyle = () => {
    switch (position) {
      case 'left':
        return { left: 20 };
      case 'center':
        return { alignSelf: 'center', left: SCREEN_WIDTH / 2 - 28 };
      case 'right':
      default:
        return { right: 20 };
    }
  };

  // Main button rotation
  const rotation = animation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '45deg'],
  });

  // Overlay opacity
  const overlayOpacity = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.5],
  });

  return (
    <>
      {/* Backdrop overlay */}
      {isOpen && (
        <TouchableWithoutFeedback onPress={closeMenu}>
          <Animated.View 
            style={[
              styles.overlay,
              { opacity: overlayOpacity },
            ]} 
          />
        </TouchableWithoutFeedback>
      )}

      {/* FAB container */}
      <View
        style={[
          styles.container,
          getPositionStyle(),
          { bottom: bottomOffset },
          style,
        ]}
        pointerEvents="box-none"
      >
        {/* Sub-action buttons */}
        {actions.map((action, index) => (
          <SubActionButton
            key={action.key}
            action={action}
            index={index}
            animation={animation}
            onPress={handleActionPress}
            isOpen={isOpen}
          />
        ))}

        {/* Main FAB button */}
        <TouchableOpacity
          style={[
            styles.mainButton,
            { backgroundColor: primaryColor },
            disabled && styles.disabledButton,
          ]}
          onPress={toggleMenu}
          disabled={disabled}
          activeOpacity={0.8}
        >
          <Animated.View style={{ transform: [{ rotate: rotation }] }}>
            <Ionicons name="add" size={28} color="#FFF" />
          </Animated.View>
        </TouchableOpacity>
      </View>
    </>
  );
};

/**
 * Simple FAB (single action, no menu)
 */
export const SimpleFAB = ({
  icon = 'add',
  onPress,
  primaryColor = '#007AFF',
  position = 'right',
  bottomOffset = 100,
  disabled = false,
  label,
  style,
}) => {
  const getPositionStyle = () => {
    switch (position) {
      case 'left':
        return { left: 20 };
      case 'center':
        return { alignSelf: 'center', left: SCREEN_WIDTH / 2 - 28 };
      case 'right':
      default:
        return { right: 20 };
    }
  };

  return (
    <View
      style={[
        styles.simpleFabContainer,
        getPositionStyle(),
        { bottom: bottomOffset },
        style,
      ]}
    >
      {label && (
        <View style={styles.simpleFabLabel}>
          <Text style={styles.simpleFabLabelText}>{label}</Text>
        </View>
      )}
      <TouchableOpacity
        style={[
          styles.mainButton,
          { backgroundColor: primaryColor },
          disabled && styles.disabledButton,
        ]}
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.8}
      >
        <Ionicons name={icon} size={28} color="#FFF" />
      </TouchableOpacity>
    </View>
  );
};

/**
 * Camera FAB - Quick access camera button
 */
export const CameraFAB = ({
  onPress,
  primaryColor = '#007AFF',
  bottomOffset = 100,
  disabled = false,
}) => (
  <SimpleFAB
    icon="camera"
    onPress={onPress}
    primaryColor={primaryColor}
    position="center"
    bottomOffset={bottomOffset}
    disabled={disabled}
  />
);

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 998,
  },

  container: {
    position: 'absolute',
    alignItems: 'center',
    zIndex: 999,
  },

  mainButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
      },
      android: {
        elevation: 8,
      },
    }),
  },

  disabledButton: {
    opacity: 0.5,
  },

  subActionContainer: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
  },

  subActionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: {
        elevation: 6,
      },
    }),
  },

  subActionLabelContainer: {
    position: 'absolute',
    right: 54,
    backgroundColor: '#FFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.15,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },

  subActionLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1C1C1E',
  },

  // Simple FAB
  simpleFabContainer: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 999,
  },

  simpleFabLabel: {
    marginRight: 12,
    backgroundColor: '#FFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.15,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },

  simpleFabLabelText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1C1C1E',
  },
});

export default FloatingActionButton;
