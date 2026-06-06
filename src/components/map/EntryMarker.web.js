/**
 * EntryMarker Components - Web Version
 * 
 * Web-compatible stubs for map markers.
 * Maps are not supported on web, so these are placeholder components.
 */

import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

const PRIMARY_COLOR = '#4361ee';

/**
 * EntryMarker - Web Stub
 */
export const EntryMarker = memo(({ entry, onPress, clustered = false }) => {
  // On web, markers are not rendered (no map support)
  return null;
});

/**
 * ClusterMarker - Web Stub
 */
export const ClusterMarker = memo(({ count, onPress, color = PRIMARY_COLOR }) => {
  // On web, markers are not rendered (no map support)
  return null;
});

/**
 * UserMarker - Web Stub
 */
export const UserMarker = memo(({ heading, accuracy }) => {
  // On web, markers are not rendered (no map support)
  return null;
});

export default EntryMarker;
