/**
 * Sync Status Badge
 * 
 * Displays the current sync state and last sync time.
 * Shows different states: idle, syncing, error, disabled.
 * 
 * Usage:
 * ```jsx
 * // Small badge
 * <SyncStatusBadge variant="badge" />
 * 
 * // Banner with details
 * <SyncStatusBadge variant="banner" showLastSync />
 * 
 * // Inline indicator
 * <SyncStatusBadge variant="inline" />
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
import { useSync, SyncState } from '../../context';

/**
 * Sync status configuration
 */
const STATUS_CONFIG = {
  [SyncState.IDLE]: {
    color: '#34C759', // Green
    icon: 'checkmark-circle',
    text: 'Synced',
  },
  [SyncState.SYNCING]: {
    color: '#007AFF', // Blue
    icon: 'sync',
    text: 'Syncing...',
    showSpinner: true,
  },
  [SyncState.OFFLINE]: {
    color: '#8E8E93', // Gray
    icon: 'cloud-offline',
    text: 'Offline',
  },
  [SyncState.ERROR]: {
    color: '#FF3B30', // Red
    icon: 'alert-circle',
    text: 'Sync Error',
  },
  [SyncState.DISABLED]: {
    color: '#8E8E93', // Gray
    icon: 'pause-circle',
    text: 'Sync Disabled',
  },
};

/**
 * Format time ago string
 */
function formatTimeAgo(date) {
  if (!date) return 'Never';
  
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

/**
 * Sync Status Badge Component
 */
export function SyncStatusBadge({
  variant = 'badge', // 'badge' | 'banner' | 'inline' | 'dot'
  showLastSync = false,
  showRetryButton = false,
  onPress,
  style,
}) {
  const { 
    syncState, 
    isSyncing, 
    lastSyncTime,
    triggerSync,
    isInitialized,
  } = useSync();

  // Get status config for current state
  const config = STATUS_CONFIG[syncState] || STATUS_CONFIG[SyncState.IDLE];
  const { color, icon, text, showSpinner } = config;

  // Handle retry/manual sync
  const handleRetry = async () => {
    if (onPress) {
      onPress();
    } else if (isInitialized) {
      await triggerSync({ force: true });
    }
  };

  // Dot variant - just a colored dot
  if (variant === 'dot') {
    return (
      <View 
        style={[
          styles.dot,
          { backgroundColor: color },
          style,
        ]}
      />
    );
  }

  // Badge variant - small icon badge
  if (variant === 'badge') {
    return (
      <TouchableOpacity
        style={[styles.badge, style]}
        onPress={handleRetry}
        disabled={isSyncing}
      >
        {showSpinner ? (
          <ActivityIndicator size="small" color={color} />
        ) : (
          <Ionicons name={icon} size={20} color={color} />
        )}
      </TouchableOpacity>
    );
  }

  // Inline variant - icon with optional text
  if (variant === 'inline') {
    return (
      <TouchableOpacity
        style={[styles.inline, style]}
        onPress={handleRetry}
        disabled={isSyncing}
      >
        {showSpinner ? (
          <ActivityIndicator size="small" color={color} />
        ) : (
          <Ionicons name={icon} size={16} color={color} />
        )}
        <Text style={[styles.inlineText, { color }]}>{text}</Text>
        {showLastSync && lastSyncTime && (
          <Text style={styles.lastSyncText}>
            • {formatTimeAgo(lastSyncTime)}
          </Text>
        )}
      </TouchableOpacity>
    );
  }

  // Banner variant - full width banner
  if (variant === 'banner') {
    // Don't show banner when idle/synced
    if (syncState === SyncState.IDLE && !showLastSync) {
      return null;
    }

    return (
      <View style={[styles.banner, { backgroundColor: color + '15' }, style]}>
        <View style={styles.bannerContent}>
          {showSpinner ? (
            <ActivityIndicator size="small" color={color} style={styles.bannerIcon} />
          ) : (
            <Ionicons name={icon} size={18} color={color} style={styles.bannerIcon} />
          )}
          <View style={styles.bannerTextContainer}>
            <Text style={[styles.bannerText, { color }]}>{text}</Text>
            {showLastSync && lastSyncTime && (
              <Text style={styles.bannerLastSync}>
                Last sync: {formatTimeAgo(lastSyncTime)}
              </Text>
            )}
          </View>
        </View>
        {showRetryButton && syncState === SyncState.ERROR && (
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: color }]}
            onPress={handleRetry}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  // Dot styles
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Badge styles
  badge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },

  // Inline styles
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  inlineText: {
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 4,
  },
  lastSyncText: {
    fontSize: 11,
    color: '#8E8E93',
    marginLeft: 4,
  },

  // Banner styles
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  bannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  bannerIcon: {
    marginRight: 8,
  },
  bannerTextContainer: {
    flex: 1,
  },
  bannerText: {
    fontSize: 13,
    fontWeight: '600',
  },
  bannerLastSync: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 2,
  },
  retryButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    marginLeft: 8,
  },
  retryButtonText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
});

export default SyncStatusBadge;
