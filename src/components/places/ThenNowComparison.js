/**
 * ThenNowComparison - Side-by-side view of old vs new photos
 * 
 * Shows a photo from the past next to a current photo at the same location.
 * Users can swipe/slide to compare the two eras.
 * 
 * Features:
 * - Side-by-side or overlay view modes
 * - Slider to reveal comparison
 * - Author attribution for both photos
 * - Year labels
 * - Share comparison feature
 */

import React, { useState, memo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  Animated,
  PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Theme colors
const PRIMARY_COLOR = '#4361ee';
const TEXT_COLOR = '#333333';
const TEXT_MUTED = '#666666';
const SURFACE_COLOR = '#FFFFFF';

/**
 * Year label badge
 */
const YearBadge = memo(({ year, author, position }) => (
  <View style={[styles.yearBadge, position === 'left' ? styles.yearBadgeLeft : styles.yearBadgeRight]}>
    <Text style={styles.yearText}>{year}</Text>
    {author && (
      <View style={styles.authorRow}>
        <Image source={{ uri: author.avatar }} style={styles.miniAvatar} />
        <Text style={styles.authorName}>{author.firstName}</Text>
      </View>
    )}
  </View>
));

/**
 * Side-by-side comparison view
 */
const SideBySideView = memo(({ thenMemory, nowMemory, onImagePress }) => (
  <View style={styles.sideBySide}>
    <TouchableOpacity 
      style={styles.sideBySideImage}
      onPress={() => onImagePress?.(thenMemory)}
      activeOpacity={0.9}
    >
      <Image 
        source={{ uri: thenMemory.media[0].uri }} 
        style={styles.halfImage}
        resizeMode="cover"
      />
      <YearBadge year={thenMemory.year} author={thenMemory.author} position="left" />
    </TouchableOpacity>
    
    <View style={styles.divider}>
      <View style={styles.dividerLine} />
      <View style={styles.dividerIcon}>
        <Ionicons name="swap-horizontal" size={16} color="#FFF" />
      </View>
      <View style={styles.dividerLine} />
    </View>
    
    <TouchableOpacity 
      style={styles.sideBySideImage}
      onPress={() => onImagePress?.(nowMemory)}
      activeOpacity={0.9}
    >
      <Image 
        source={{ uri: nowMemory.media[0].uri }} 
        style={styles.halfImage}
        resizeMode="cover"
      />
      <YearBadge year={nowMemory.year} author={nowMemory.author} position="right" />
    </TouchableOpacity>
  </View>
));

/**
 * Slider comparison view with draggable divider
 */
const SliderView = memo(({ thenMemory, nowMemory }) => {
  const slidePosition = useRef(new Animated.Value(SCREEN_WIDTH / 2)).current;
  
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        const newX = Math.max(50, Math.min(SCREEN_WIDTH - 50, gestureState.moveX));
        slidePosition.setValue(newX);
      },
    })
  ).current;

  return (
    <View style={styles.sliderContainer}>
      {/* Now image (full width, behind) */}
      <Image 
        source={{ uri: nowMemory.media[0].uri }} 
        style={styles.sliderImage}
        resizeMode="cover"
      />
      
      {/* Then image (clipped by slider position) */}
      <Animated.View 
        style={[
          styles.sliderOverlay,
          { width: slidePosition }
        ]}
      >
        <Image 
          source={{ uri: thenMemory.media[0].uri }} 
          style={[styles.sliderImage, { width: SCREEN_WIDTH }]}
          resizeMode="cover"
        />
      </Animated.View>
      
      {/* Slider handle */}
      <Animated.View 
        style={[styles.sliderHandle, { left: Animated.add(slidePosition, -20) }]}
        {...panResponder.panHandlers}
      >
        <View style={styles.sliderLine} />
        <View style={styles.sliderKnob}>
          <Ionicons name="code" size={16} color="#FFF" />
        </View>
        <View style={styles.sliderLine} />
      </Animated.View>

      {/* Year labels */}
      <View style={styles.sliderLabels}>
        <YearBadge year={thenMemory.year} position="left" />
        <YearBadge year={nowMemory.year} position="right" />
      </View>
    </View>
  );
});

/**
 * Main ThenNowComparison component
 */
const ThenNowComparison = ({
  thenMemory,
  nowMemory,
  placeName,
  onImagePress,
  onShare,
  onClose,
}) => {
  const [viewMode, setViewMode] = useState('side'); // 'side' | 'slider'

  if (!thenMemory || !nowMemory) return null;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Ionicons name="close" size={24} color={TEXT_COLOR} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Then & Now</Text>
          <Text style={styles.headerSubtitle}>{placeName}</Text>
        </View>
        <TouchableOpacity onPress={onShare} style={styles.shareButton}>
          <Ionicons name="share-outline" size={24} color={PRIMARY_COLOR} />
        </TouchableOpacity>
      </View>

      {/* View mode toggle */}
      <View style={styles.modeToggle}>
        <TouchableOpacity
          style={[styles.modeButton, viewMode === 'side' && styles.modeButtonActive]}
          onPress={() => setViewMode('side')}
        >
          <Ionicons 
            name="albums-outline" 
            size={18} 
            color={viewMode === 'side' ? '#FFF' : TEXT_MUTED} 
          />
          <Text style={[styles.modeText, viewMode === 'side' && styles.modeTextActive]}>
            Side by Side
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeButton, viewMode === 'slider' && styles.modeButtonActive]}
          onPress={() => setViewMode('slider')}
        >
          <Ionicons 
            name="git-compare-outline" 
            size={18} 
            color={viewMode === 'slider' ? '#FFF' : TEXT_MUTED} 
          />
          <Text style={[styles.modeText, viewMode === 'slider' && styles.modeTextActive]}>
            Slider
          </Text>
        </TouchableOpacity>
      </View>

      {/* Comparison view */}
      <View style={styles.comparisonArea}>
        {viewMode === 'side' ? (
          <SideBySideView 
            thenMemory={thenMemory}
            nowMemory={nowMemory}
            onImagePress={onImagePress}
          />
        ) : (
          <SliderView 
            thenMemory={thenMemory}
            nowMemory={nowMemory}
          />
        )}
      </View>

      {/* Captions */}
      <View style={styles.captions}>
        <View style={styles.captionBox}>
          <Text style={styles.captionYear}>{thenMemory.year}</Text>
          <Text style={styles.captionText} numberOfLines={2}>
            {thenMemory.caption || 'No caption'}
          </Text>
        </View>
        <View style={styles.captionDivider} />
        <View style={styles.captionBox}>
          <Text style={styles.captionYear}>{nowMemory.year}</Text>
          <Text style={styles.captionText} numberOfLines={2}>
            {nowMemory.caption || 'No caption'}
          </Text>
        </View>
      </View>

      {/* Years apart */}
      <View style={styles.yearsDiff}>
        <Ionicons name="time-outline" size={16} color={PRIMARY_COLOR} />
        <Text style={styles.yearsDiffText}>
          {nowMemory.year - thenMemory.year} years apart
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: SURFACE_COLOR,
  },
  closeButton: {
    padding: 4,
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: TEXT_COLOR,
  },
  headerSubtitle: {
    fontSize: 12,
    color: TEXT_MUTED,
    marginTop: 2,
  },
  shareButton: {
    padding: 4,
  },

  // Mode toggle
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: SURFACE_COLOR,
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
  },
  modeButtonActive: {
    backgroundColor: PRIMARY_COLOR,
  },
  modeText: {
    fontSize: 13,
    fontWeight: '500',
    color: TEXT_MUTED,
  },
  modeTextActive: {
    color: '#FFF',
  },

  // Comparison area
  comparisonArea: {
    flex: 1,
  },

  // Side by side
  sideBySide: {
    flex: 1,
    flexDirection: 'row',
  },
  sideBySideImage: {
    flex: 1,
    position: 'relative',
  },
  halfImage: {
    width: '100%',
    height: '100%',
  },
  divider: {
    width: 4,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dividerLine: {
    flex: 1,
    width: 2,
    backgroundColor: '#FFF',
  },
  dividerIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: PRIMARY_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Year badge
  yearBadge: {
    position: 'absolute',
    top: 16,
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 8,
  },
  yearBadgeLeft: {
    left: 12,
  },
  yearBadgeRight: {
    right: 12,
  },
  yearText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  miniAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#FFF',
  },
  authorName: {
    fontSize: 11,
    color: '#FFF',
  },

  // Slider view
  sliderContainer: {
    flex: 1,
    position: 'relative',
  },
  sliderImage: {
    width: '100%',
    height: '100%',
  },
  sliderOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    overflow: 'hidden',
  },
  sliderHandle: {
    position: 'absolute',
    top: 0,
    width: 40,
    height: '100%',
    alignItems: 'center',
  },
  sliderLine: {
    flex: 1,
    width: 3,
    backgroundColor: '#FFF',
  },
  sliderKnob: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: PRIMARY_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFF',
  },
  sliderLabels: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  // Captions
  captions: {
    flexDirection: 'row',
    backgroundColor: SURFACE_COLOR,
    padding: 12,
  },
  captionBox: {
    flex: 1,
    paddingHorizontal: 8,
  },
  captionDivider: {
    width: 1,
    backgroundColor: '#E0E0E0',
    marginVertical: 4,
  },
  captionYear: {
    fontSize: 14,
    fontWeight: '600',
    color: PRIMARY_COLOR,
    marginBottom: 4,
  },
  captionText: {
    fontSize: 13,
    color: TEXT_COLOR,
    lineHeight: 18,
  },

  // Years diff
  yearsDiff: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    backgroundColor: SURFACE_COLOR,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  yearsDiffText: {
    fontSize: 14,
    fontWeight: '500',
    color: PRIMARY_COLOR,
  },
});

export default ThenNowComparison;
