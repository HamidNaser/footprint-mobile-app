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
import { syncBadgeStatus, SyncBadgeStatus } from '../../utils/syncStatus';

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
    pendingCount,
    failedCount,
    refusedMemories,
  } = useSync();

  // Named memories the server refused. The banner already says "N not sent" from the count;
  // without these that line is a warning light with nothing behind it. Only the banner
  // shows them -- the dot, badge and inline variants have no room for a sentence, and
  // inventing a screen for what is usually one row is more surface than the answer needs.
  const refused = Array.isArray(refusedMemories) ? refusedMemories : [];

  // The queue decides, not syncState alone -- IDLE means "no sync running", which is
  // not the same as "nothing left to send".
  const status = syncBadgeStatus({ syncState, pendingCount, failedCount });
  const config =
    status === SyncBadgeStatus.PENDING
      ? {
          color: '#FF9500', // Amber: waiting, not broken
          icon: 'cloud-upload-outline',
          text: `${pendingCount} pending`,
        }
      : status === SyncBadgeStatus.FAILED && failedCount > 0
      ? {
          color: '#FF3B30',
          icon: 'alert-circle',
          text: failedCount === 1 ? '1 not sent' : `${failedCount} not sent`,
        }
      : STATUS_CONFIG[syncState] || STATUS_CONFIG[SyncState.IDLE];
  const { color, icon, text, showSpinner } = config;

  // Queued or failed work is exactly what the banner exists to surface, so it must
  // stay visible even though the engine is sitting idle.
  const hasUnsentWork = pendingCount > 0 || failedCount > 0;

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
    // Don't show banner when idle/synced -- but idle with work still queued is not
    // synced, and hiding it there is what made the backlog invisible.
    if (syncState === SyncState.IDLE && !showLastSync && !hasUnsentWork) {
      return null;
    }

    return (
      <View style={[styles.bannerGroup, { backgroundColor: color + '15' }, style]}>
        <View style={styles.banner}>
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
          {showRetryButton && (syncState === SyncState.ERROR || hasUnsentWork) && (
            <TouchableOpacity
              style={[styles.retryButton, { backgroundColor: color }]}
              onPress={handleRetry}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          )}
        </View>

        {/*
          Which memory, and what happened. Rendered only when there is something to say, so
          nothing refused shows nothing at all rather than an empty notice.

          No action on any of these, deliberately: retry, discard and keep-as-new were all
          considered and deferred. The Retry button above is the existing whole-queue retry
          and is unchanged -- a refused operation is settled as `conflict`, which
          `getPendingOperations` does not offer and `resetFailedOperations` does not re-arm,
          so pressing it cannot re-send these.
        */}
        {refused.length > 0 && (
          <View style={styles.refusedList}>
            {refused.map((memory) => (
              <View key={memory.operationId || memory.localId} style={styles.refusedItem}>
                {/*
                  The title is cut to one line; the day gets its own, so a long note can
                  never push the date off screen. The day is omitted rather than faked when
                  the queued payload has none -- a refused delete carries only a local id.
                */}
                <Text style={styles.refusedTitle} numberOfLines={1}>
                  {memory.title}
                </Text>
                {memory.day ? <Text style={styles.refusedDay}>{memory.day}</Text> : null}
                <Text style={styles.refusedWhy}>{memory.why}</Text>
              </View>
            ))}
          </View>
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
  //
  // The tinted background moved out to `bannerGroup` so the refused-memory list sits inside
  // the same block of colour as the headline rather than on the page behind it. `banner`
  // keeps the row layout and the padding it always had, so every variant renders as before.
  bannerGroup: {
    paddingBottom: 0,
  },
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

  // Refused-memory notice styles
  refusedList: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  refusedItem: {
    marginTop: 6,
  },
  refusedTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  refusedDay: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 1,
  },
  refusedWhy: {
    fontSize: 12,
    color: '#3A3A3C',
    marginTop: 1,
  },
});

export default SyncStatusBadge;
