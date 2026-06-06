/**
 * Connection Status Indicator
 * 
 * Displays the current SignalR connection status.
 * Can be used as a badge, banner, or inline indicator.
 * 
 * Usage:
 * ```jsx
 * // Badge in header
 * <ConnectionStatusIndicator variant="badge" />
 * 
 * // Banner at top of screen
 * <ConnectionStatusIndicator variant="banner" />
 * 
 * // Inline with text
 * <ConnectionStatusIndicator variant="inline" showText />
 * ```
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRealtime } from '../../context';
import { ConnectionState } from '../../services/SignalRService';

/**
 * Connection status configuration
 */
const STATUS_CONFIG = {
  [ConnectionState.CONNECTED]: {
    color: '#34C759', // Green
    icon: 'checkmark-circle',
    text: 'Connected',
  },
  [ConnectionState.CONNECTING]: {
    color: '#FF9500', // Orange
    icon: 'sync',
    text: 'Connecting...',
    showSpinner: true,
  },
  [ConnectionState.RECONNECTING]: {
    color: '#FF9500', // Orange
    icon: 'sync',
    text: 'Reconnecting...',
    showSpinner: true,
  },
  [ConnectionState.DISCONNECTED]: {
    color: '#FF3B30', // Red
    icon: 'cloud-offline',
    text: 'Offline',
  },
  [ConnectionState.DISCONNECTING]: {
    color: '#8E8E93', // Gray
    icon: 'close-circle',
    text: 'Disconnecting...',
  },
};

/**
 * Connection Status Indicator Component
 */
export function ConnectionStatusIndicator({
  variant = 'badge', // 'badge' | 'banner' | 'inline' | 'dot'
  showText = false,
  showReconnectButton = false,
  onPress,
  style,
}) {
  const { 
    connectionState, 
    isConnected,
    reconnectAttempt, 
    reconnect 
  } = useRealtime();

  const config = STATUS_CONFIG[connectionState] || STATUS_CONFIG[ConnectionState.DISCONNECTED];

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else if (showReconnectButton && !isConnected) {
      reconnect();
    }
  };

  // Dot variant - just a colored dot
  if (variant === 'dot') {
    return (
      <View 
        style={[
          styles.dot, 
          { backgroundColor: config.color },
          style,
        ]} 
      />
    );
  }

  // Badge variant - small icon with optional text
  if (variant === 'badge') {
    const content = (
      <View style={[styles.badge, style]}>
        {config.showSpinner ? (
          <ActivityIndicator size="small" color={config.color} />
        ) : (
          <Ionicons name={config.icon} size={16} color={config.color} />
        )}
        {showText && (
          <Text style={[styles.badgeText, { color: config.color }]}>
            {config.text}
          </Text>
        )}
      </View>
    );

    if (showReconnectButton && !isConnected) {
      return (
        <TouchableOpacity onPress={handlePress}>
          {content}
        </TouchableOpacity>
      );
    }

    return content;
  }

  // Inline variant - icon and text inline
  if (variant === 'inline') {
    return (
      <TouchableOpacity 
        style={[styles.inline, style]} 
        onPress={handlePress}
        disabled={!showReconnectButton || isConnected}
      >
        {config.showSpinner ? (
          <ActivityIndicator size="small" color={config.color} />
        ) : (
          <Ionicons name={config.icon} size={18} color={config.color} />
        )}
        {showText && (
          <Text style={[styles.inlineText, { color: config.color }]}>
            {config.text}
            {reconnectAttempt > 0 && ` (attempt ${reconnectAttempt})`}
          </Text>
        )}
      </TouchableOpacity>
    );
  }

  // Banner variant - full-width banner
  if (variant === 'banner') {
    // Don't show banner when connected
    if (isConnected) {
      return null;
    }

    return (
      <TouchableOpacity 
        style={[styles.banner, { backgroundColor: config.color }, style]}
        onPress={handlePress}
        activeOpacity={showReconnectButton ? 0.7 : 1}
      >
        {config.showSpinner ? (
          <ActivityIndicator size="small" color="#FFF" style={styles.bannerIcon} />
        ) : (
          <Ionicons name={config.icon} size={18} color="#FFF" style={styles.bannerIcon} />
        )}
        <Text style={styles.bannerText}>
          {config.text}
          {reconnectAttempt > 0 && ` (attempt ${reconnectAttempt})`}
        </Text>
        {showReconnectButton && (
          <Text style={styles.bannerAction}>Tap to reconnect</Text>
        )}
      </TouchableOpacity>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  // Dot variant
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Badge variant
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 4,
  },

  // Inline variant
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inlineText: {
    fontSize: 14,
    marginLeft: 6,
  },

  // Banner variant
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  bannerIcon: {
    marginRight: 8,
  },
  bannerText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '500',
  },
  bannerAction: {
    color: '#FFF',
    fontSize: 12,
    marginLeft: 8,
    opacity: 0.9,
  },
});

export default ConnectionStatusIndicator;
