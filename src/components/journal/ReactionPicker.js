/**
 * ReactionPicker Component
 * 
 * Shows a horizontal row of emoji reactions (like iMessage/Facebook)
 * Appears on long press of an entry
 */

import React, { memo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Animated,
  Platform,
} from 'react-native';

/**
 * Available reactions with their meanings
 */
export const REACTIONS = [
  { emoji: '❤️', key: 'heart', label: 'Love' },
  { emoji: '🙏', key: 'thanks', label: 'Grateful' },
  { emoji: '😢', key: 'touched', label: 'Touched' },
  { emoji: '😊', key: 'happy', label: 'Happy' },
  { emoji: '🤗', key: 'hug', label: 'Hug' },
];

/**
 * Get reaction by key
 */
export const getReactionByKey = (key) => {
  return REACTIONS.find(r => r.key === key);
};

/**
 * ReactionButton - Individual reaction emoji button
 */
const ReactionButton = memo(({ reaction, isSelected, onPress, size = 28 }) => {
  return (
    <TouchableOpacity
      style={[
        styles.reactionButton,
        isSelected && styles.reactionButtonSelected,
      ]}
      onPress={() => onPress(reaction)}
      activeOpacity={0.7}
    >
      <Text style={[styles.reactionEmoji, { fontSize: size }]}>
        {reaction.emoji}
      </Text>
    </TouchableOpacity>
  );
});

/**
 * ReactionPicker - The picker that appears on long press
 */
export const ReactionPicker = memo(({
  visible,
  onSelect,
  onClose,
  currentReaction,
  position = { top: 0, left: 0 },
}) => {
  const handleSelect = useCallback((reaction) => {
    onSelect(reaction);
    onClose();
  }, [onSelect, onClose]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={[styles.pickerContainer, { top: position.top, left: position.left }]}>
          <View style={styles.picker}>
            {REACTIONS.map((reaction) => (
              <ReactionButton
                key={reaction.key}
                reaction={reaction}
                isSelected={currentReaction === reaction.key}
                onPress={handleSelect}
              />
            ))}
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
});

/**
 * ReactionDisplay - Shows reaction counts on an entry
 */
export const ReactionDisplay = memo(({
  reactions,
  onPress,
  size = 'normal',
}) => {
  if (!reactions || Object.keys(reactions).length === 0) {
    return null;
  }

  // Group reactions by type and count (only arrays - new format)
  const reactionCounts = {};
  let totalCount = 0;

  Object.entries(reactions).forEach(([key, users]) => {
    if (Array.isArray(users) && users.length > 0) {
      reactionCounts[key] = users.length;
      totalCount += users.length;
    }
  });

  if (totalCount === 0) return null;

  const fontSize = size === 'small' ? 14 : 16;
  const countSize = size === 'small' ? 12 : 14;

  return (
    <TouchableOpacity
      style={styles.reactionDisplay}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {Object.entries(reactionCounts).map(([key, count]) => {
        const reaction = getReactionByKey(key);
        if (!reaction) return null;
        
        return (
          <View key={key} style={styles.reactionCount}>
            <Text style={[styles.reactionCountEmoji, { fontSize }]}>
              {reaction.emoji}
            </Text>
            <Text style={[styles.reactionCountText, { fontSize: countSize }]}>
              {count}
            </Text>
          </View>
        );
      })}
    </TouchableOpacity>
  );
});

/**
 * QuickReactButton - A small button to add a reaction
 */
export const QuickReactButton = memo(({
  onLongPress,
  onPress,
  userReaction,
  primaryColor = '#4361ee',
}) => {
  const reaction = userReaction ? getReactionByKey(userReaction) : null;

  return (
    <TouchableOpacity
      style={styles.quickReactButton}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={300}
      activeOpacity={0.7}
    >
      {reaction ? (
        <Text style={styles.quickReactEmoji}>{reaction.emoji}</Text>
      ) : (
        <Text style={[styles.quickReactPlaceholder, { color: primaryColor }]}>
          ❤️
        </Text>
      )}
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  // Overlay
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },

  // Picker container
  pickerContainer: {
    position: 'absolute',
  },

  picker: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 24,
    paddingHorizontal: 8,
    paddingVertical: 6,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
      web: {
        boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
      },
    }),
  },

  // Reaction button
  reactionButton: {
    padding: 8,
    borderRadius: 20,
  },
  reactionButtonSelected: {
    backgroundColor: '#F0F0F0',
  },
  reactionEmoji: {
    fontSize: 28,
  },

  // Reaction display
  reactionDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reactionCount: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  reactionCountEmoji: {
    fontSize: 16,
  },
  reactionCountText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 3,
  },

  // Quick react button
  quickReactButton: {
    padding: 4,
  },
  quickReactEmoji: {
    fontSize: 20,
  },
  quickReactPlaceholder: {
    fontSize: 20,
    opacity: 0.4,
  },
});

export default ReactionPicker;
