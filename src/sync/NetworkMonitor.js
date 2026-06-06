/**
 * Network Monitor
 * 
 * Monitors network connectivity and provides utilities for
 * determining when to sync based on connection type.
 * 
 * Uses @react-native-community/netinfo for connectivity detection.
 */

import NetInfo from '@react-native-community/netinfo';
import { SettingsService, StorageMode } from '../services/SettingsService';

/**
 * Network state types
 */
export const NetworkState = {
  ONLINE: 'online',
  OFFLINE: 'offline',
  WIFI: 'wifi',
  CELLULAR: 'cellular',
  UNKNOWN: 'unknown',
};

/**
 * Connection quality levels
 */
export const ConnectionQuality = {
  EXCELLENT: 'excellent',  // WiFi or fast cellular
  GOOD: 'good',            // 4G/LTE
  FAIR: 'fair',            // 3G
  POOR: 'poor',            // 2G or slow connection
  NONE: 'none',            // No connection
};

class NetworkMonitorClass {
  constructor() {
    this._currentState = null;
    this._listeners = new Set();
    this._unsubscribe = null;
    this._initialized = false;
  }

  /**
   * Initialize the network monitor
   * Must be called before using other methods
   */
  async initialize() {
    if (this._initialized) return;

    console.log('[NetworkMonitor] Initializing...');

    // Get initial state
    this._currentState = await NetInfo.fetch();
    
    // Subscribe to network state changes
    this._unsubscribe = NetInfo.addEventListener(state => {
      const previousState = this._currentState;
      this._currentState = state;
      
      // Notify listeners of state change
      this._notifyListeners(state, previousState);
      
      // Log state changes
      if (__DEV__) {
        console.log('[NetworkMonitor] State changed:', {
          type: state.type,
          isConnected: state.isConnected,
          isInternetReachable: state.isInternetReachable,
        });
      }
    });

    this._initialized = true;
    console.log('[NetworkMonitor] Initialized. Current state:', this._currentState?.type);
  }

  /**
   * Clean up the network monitor
   */
  destroy() {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    this._listeners.clear();
    this._initialized = false;
    console.log('[NetworkMonitor] Destroyed');
  }

  // ============================================================
  // State Queries
  // ============================================================

  /**
   * Get current network state
   * @returns {object} Current NetInfo state
   */
  getCurrentState() {
    return this._currentState;
  }

  /**
   * Check if device is online
   * @returns {boolean} True if connected and internet is reachable
   */
  isOnline() {
    if (!this._currentState) return false;
    return this._currentState.isConnected && this._currentState.isInternetReachable;
  }

  /**
   * Check if device is offline
   * @returns {boolean} True if not connected or internet not reachable
   */
  isOffline() {
    return !this.isOnline();
  }

  /**
   * Check if connected via WiFi
   * @returns {boolean} True if on WiFi
   */
  isWifi() {
    return this._currentState?.type === 'wifi';
  }

  /**
   * Check if connected via cellular
   * @returns {boolean} True if on cellular
   */
  isCellular() {
    return this._currentState?.type === 'cellular';
  }

  /**
   * Get simplified network state
   * @returns {string} NetworkState value
   */
  getNetworkState() {
    if (!this._currentState) return NetworkState.UNKNOWN;
    
    if (!this._currentState.isConnected || !this._currentState.isInternetReachable) {
      return NetworkState.OFFLINE;
    }
    
    switch (this._currentState.type) {
      case 'wifi':
        return NetworkState.WIFI;
      case 'cellular':
        return NetworkState.CELLULAR;
      default:
        return NetworkState.ONLINE;
    }
  }

  /**
   * Get connection quality based on network type and details
   * @returns {string} ConnectionQuality value
   */
  getConnectionQuality() {
    if (!this.isOnline()) return ConnectionQuality.NONE;
    
    if (this.isWifi()) return ConnectionQuality.EXCELLENT;
    
    if (this.isCellular()) {
      const details = this._currentState.details;
      const cellularGeneration = details?.cellularGeneration;
      
      switch (cellularGeneration) {
        case '4g':
        case '5g':
          return ConnectionQuality.EXCELLENT;
        case '3g':
          return ConnectionQuality.GOOD;
        case '2g':
          return ConnectionQuality.POOR;
        default:
          return ConnectionQuality.FAIR;
      }
    }
    
    return ConnectionQuality.GOOD;
  }

  // ============================================================
  // Sync Decision Logic
  // ============================================================

  /**
   * Determine if sync should be allowed based on network and settings
   * @returns {Promise<boolean>} True if sync is allowed
   */
  async shouldSync() {
    // First check if sync is enabled in settings
    const syncEnabled = await SettingsService.isSyncEnabled();
    if (!syncEnabled) {
      return false;
    }

    // Check if online
    if (this.isOffline()) {
      return false;
    }

    // Check storage mode against network type
    const storageMode = await SettingsService.getStorageMode();
    const networkType = this.isWifi() ? 'wifi' : 'cellular';

    switch (storageMode) {
      case StorageMode.CLOUD_SYNC:
        // Sync on any network
        return true;
      
      case StorageMode.WIFI_ONLY:
        // Only sync on WiFi
        return this.isWifi();
      
      case StorageMode.LOCAL_ONLY:
        // Never sync
        return false;
      
      default:
        return false;
    }
  }

  /**
   * Check if media uploads should be allowed
   * Large uploads typically require WiFi
   * @param {number} sizeBytes - Size of upload in bytes
   * @returns {Promise<boolean>} True if upload is allowed
   */
  async shouldUploadMedia(sizeBytes = 0) {
    // Check basic sync permission first
    const shouldSync = await this.shouldSync();
    if (!shouldSync) return false;

    // For large files (>5MB), prefer WiFi
    const LARGE_FILE_THRESHOLD = 5 * 1024 * 1024; // 5MB
    
    if (sizeBytes > LARGE_FILE_THRESHOLD) {
      const storageMode = await SettingsService.getStorageMode();
      
      // If WiFi only mode, already handled by shouldSync
      // If cloud sync mode, still prefer WiFi for large files
      if (storageMode === StorageMode.CLOUD_SYNC && !this.isWifi()) {
        // Allow but maybe show warning to user
        console.log('[NetworkMonitor] Large upload on cellular, user should be warned');
      }
    }

    return true;
  }

  /**
   * Get a human-readable network status for UI display
   * @returns {Promise<object>} { status, message, canSync }
   */
  async getNetworkStatus() {
    const isOnline = this.isOnline();
    const networkState = this.getNetworkState();
    const shouldSync = await this.shouldSync();
    const storageMode = await SettingsService.getStorageMode();

    if (storageMode === StorageMode.LOCAL_ONLY) {
      return {
        status: 'local',
        message: 'Local only mode - data stays on device',
        canSync: false,
        icon: 'phone-portrait-outline',
      };
    }

    if (!isOnline) {
      return {
        status: 'offline',
        message: 'No internet connection',
        canSync: false,
        icon: 'cloud-offline-outline',
      };
    }

    if (networkState === NetworkState.WIFI) {
      return {
        status: 'wifi',
        message: 'Connected via WiFi',
        canSync: true,
        icon: 'wifi-outline',
      };
    }

    if (networkState === NetworkState.CELLULAR) {
      if (storageMode === StorageMode.WIFI_ONLY) {
        return {
          status: 'cellular-disabled',
          message: 'On cellular - WiFi only mode enabled',
          canSync: false,
          icon: 'cellular-outline',
        };
      }
      
      return {
        status: 'cellular',
        message: 'Connected via cellular',
        canSync: true,
        icon: 'cellular-outline',
      };
    }

    return {
      status: 'online',
      message: 'Connected',
      canSync: shouldSync,
      icon: 'globe-outline',
    };
  }

  // ============================================================
  // Event Listeners
  // ============================================================

  /**
   * Subscribe to network state changes
   * @param {function} callback - Callback function(newState, previousState)
   * @returns {function} Unsubscribe function
   */
  addListener(callback) {
    this._listeners.add(callback);
    
    // Immediately call with current state
    if (this._currentState) {
      callback(this._currentState, null);
    }
    
    // Return unsubscribe function
    return () => {
      this._listeners.delete(callback);
    };
  }

  /**
   * Subscribe to online/offline transitions only
   * @param {function} onOnline - Called when coming online
   * @param {function} onOffline - Called when going offline
   * @returns {function} Unsubscribe function
   */
  addConnectionListener(onOnline, onOffline) {
    return this.addListener((newState, previousState) => {
      const wasOnline = previousState?.isConnected && previousState?.isInternetReachable;
      const isNowOnline = newState.isConnected && newState.isInternetReachable;
      
      if (!wasOnline && isNowOnline) {
        onOnline?.();
      } else if (wasOnline && !isNowOnline) {
        onOffline?.();
      }
    });
  }

  /**
   * Wait until online (with timeout)
   * @param {number} timeoutMs - Maximum time to wait (0 for no timeout)
   * @returns {Promise<boolean>} True if came online, false if timed out
   */
  waitForConnection(timeoutMs = 30000) {
    return new Promise((resolve) => {
      // Already online?
      if (this.isOnline()) {
        resolve(true);
        return;
      }

      let unsubscribe;
      let timeoutId;

      const cleanup = () => {
        if (unsubscribe) unsubscribe();
        if (timeoutId) clearTimeout(timeoutId);
      };

      // Set up timeout
      if (timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          cleanup();
          resolve(false);
        }, timeoutMs);
      }

      // Listen for online event
      unsubscribe = this.addConnectionListener(
        () => {
          cleanup();
          resolve(true);
        },
        null
      );
    });
  }

  /**
   * Notify all listeners of state change
   */
  _notifyListeners(newState, previousState) {
    this._listeners.forEach(callback => {
      try {
        callback(newState, previousState);
      } catch (error) {
        console.error('[NetworkMonitor] Listener error:', error);
      }
    });
  }
}

// Export singleton instance
export const NetworkMonitor = new NetworkMonitorClass();
export default NetworkMonitor;
