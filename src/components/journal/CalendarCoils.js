/**
 * CalendarCoils Component
 * 
 * Decorative spiral binding/coils that appear at the top of the journal screen,
 * giving it a notebook/planner aesthetic with realistic wire coil appearance.
 */

import React, { memo } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Number of coils to display
const COIL_COUNT = 7;

/**
 * Single realistic wire coil element
 * Creates a 3D spiral effect with shadows and highlights
 */
const Coil = memo(({ color = '#8B9097', size = 28 }) => {
  const wireWidth = Math.max(4, size * 0.18);
  
  return (
    <View style={[styles.coilContainer, { width: size, height: size * 1.3 }]}>
      {/* Shadow behind the coil */}
      <View style={[
        styles.coilShadow,
        { 
          width: size - 4, 
          height: size * 0.5,
          top: size * 0.35,
        }
      ]} />
      
      {/* Left wire going down (behind paper) */}
      <View style={[
        styles.wireSegment,
        styles.wireLeft,
        { 
          width: wireWidth,
          height: size * 0.45,
          backgroundColor: adjustColor(color, -30),
          left: wireWidth * 0.5,
          bottom: 0,
        }
      ]} />
      
      {/* Right wire going down (behind paper) */}
      <View style={[
        styles.wireSegment,
        styles.wireRight,
        { 
          width: wireWidth,
          height: size * 0.45,
          backgroundColor: adjustColor(color, -30),
          right: wireWidth * 0.5,
          bottom: 0,
        }
      ]} />
      
      {/* Main coil loop (the curved part on top) */}
      <View style={[
        styles.coilLoop,
        { 
          width: size,
          height: size * 0.55,
          borderWidth: wireWidth,
          borderColor: color,
          borderTopLeftRadius: size * 0.5,
          borderTopRightRadius: size * 0.5,
        }
      ]}>
        {/* Highlight on top of coil */}
        <View style={[
          styles.coilHighlight,
          { 
            width: size * 0.6,
            height: wireWidth * 0.6,
            top: -wireWidth * 0.3,
            backgroundColor: adjustColor(color, 60),
          }
        ]} />
      </View>
      
      {/* Left inner shadow */}
      <View style={[
        styles.innerShadow,
        { 
          width: wireWidth * 0.5,
          height: size * 0.35,
          left: wireWidth + 2,
          top: size * 0.2,
          backgroundColor: 'rgba(0,0,0,0.15)',
        }
      ]} />
    </View>
  );
});

/**
 * Helper function to lighten/darken a hex color
 */
function adjustColor(color, amount) {
  // Handle named colors or non-hex
  if (!color.startsWith('#')) {
    return color;
  }
  
  let hex = color.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('');
  }
  
  const num = parseInt(hex, 16);
  let r = (num >> 16) + amount;
  let g = ((num >> 8) & 0x00FF) + amount;
  let b = (num & 0x0000FF) + amount;
  
  r = Math.min(255, Math.max(0, r));
  g = Math.min(255, Math.max(0, g));
  b = Math.min(255, Math.max(0, b));
  
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/**
 * CalendarCoils - Row of decorative spiral binding
 */
const CalendarCoils = memo(({ 
  coilCount = COIL_COUNT, 
  color = '#8B9097', // Default to metallic gray
  coilSize = 28,
  style,
}) => {
  const coils = Array.from({ length: coilCount }, (_, i) => i);

  return (
    <View style={[styles.container, style]}>
      {/* Paper punch holes background */}
      <View style={styles.punchHolesRow}>
        {coils.map((index) => (
          <View key={`hole-${index}`} style={styles.punchHole} />
        ))}
      </View>
      
      {/* Paper edge with holes */}
      <View style={styles.paperEdge}>
        <View style={styles.paperEdgeLine} />
      </View>
      
      {/* Coils row */}
      <View style={styles.coilsRow}>
        {coils.map((index) => (
          <Coil key={index} color={color} size={coilSize} />
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 2,
    height: 44,
    overflow: 'hidden',
  },

  punchHolesRow: {
    position: 'absolute',
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    width: '100%',
    paddingHorizontal: 20,
    top: 20,
  },

  punchHole: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#E8E8E8',
    borderWidth: 1,
    borderColor: '#D0D0D0',
  },

  paperEdge: {
    position: 'absolute',
    top: 24,
    left: 0,
    right: 0,
    height: 20,
    backgroundColor: '#FAFAFA',
    zIndex: -1,
  },

  paperEdgeLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#E0E0E0',
  },

  coilsRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    width: '100%',
    paddingHorizontal: 20,
    zIndex: 1,
  },

  coilContainer: {
    alignItems: 'center',
    position: 'relative',
  },

  coilShadow: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.08)',
    borderRadius: 20,
  },

  wireSegment: {
    position: 'absolute',
    borderRadius: 2,
  },

  wireLeft: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },

  wireRight: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },

  coilLoop: {
    position: 'absolute',
    top: 0,
    borderBottomWidth: 0,
    overflow: 'visible',
  },

  coilHighlight: {
    position: 'absolute',
    alignSelf: 'center',
    borderRadius: 4,
  },

  innerShadow: {
    position: 'absolute',
    borderRadius: 2,
  },
});

export { CalendarCoils };
export default CalendarCoils;
