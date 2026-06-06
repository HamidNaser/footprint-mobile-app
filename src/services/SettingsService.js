/**
 * Settings Service
 * 
 * Manages application settings including:
 * - Storage mode (Cloud Sync / WiFi Only / Local Only)
 * - User preferences
 * - App configuration
 * 
 * Settings are persisted using AsyncStorage for quick access
 * and don't require the SQLite database to be initialized.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage keys
const KEYS = {
  STORAGE_MODE: '@footprint/storage_mode',
  USER_ID: '@footprint/user_id',
  LAST_SYNC_TIME: '@footprint/last_sync_time',
  JOURNAL_ID: '@footprint/default_journal_id',
  THEME: '@footprint/theme',
  NOTIFICATIONS_ENABLED: '@footprint/notifications_enabled',
  AUTO_BACKUP: '@footprint/auto_backup',
  ONBOARDING_COMPLETE: '@footprint/onboarding_complete',
};

/**
 * Storage mode options
 * Determines how data is synced with the server
 */
export const StorageMode = {
  /**
   * Full cloud sync - sync whenever online
   * Requires account, data backed up to cloud
   */
  CLOUD_SYNC: 'cloud_sync',
  
  /**
   * WiFi only sync - sync only when on WiFi
   * Saves mobile data, requires account
   */
  WIFI_ONLY: 'wifi_only',
  
  /**
   * Local only - never sync to cloud
   * No account required, data stays on device
   * WARNING: Data lost if device is lost
   */
  LOCAL_ONLY: 'local_only',
};

/**
 * Theme options
 */
export const Theme = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
};

class SettingsServiceClass {
  constructor() {
    this._cache = {};
    this._listeners = new Map();
  }

  // ============================================================
  // Storage Mode
  // ============================================================

  /**
   * Get the current storage mode
   * @returns {Promise<string>} Storage mode (cloud_sync, wifi_only, local_only)
   */
  async getStorageMode() {
    if (this._cache[KEYS.STORAGE_MODE]) {
      return this._cache[KEYS.STORAGE_MODE];
    }
    
    const mode = await AsyncStorage.getItem(KEYS.STORAGE_MODE);
    this._cache[KEYS.STORAGE_MODE] = mode || StorageMode.CLOUD_SYNC;
    return this._cache[KEYS.STORAGE_MODE];
  }

  /**
   * Set the storage mode
   * @param {string} mode - Storage mode to set
   */
  async setStorageMode(mode) {
    if (!Object.values(StorageMode).includes(mode)) {
      throw new Error(`Invalid storage mode: ${mode}`);
    }
    
    const previousMode = this._cache[KEYS.STORAGE_MODE];
    this._cache[KEYS.STORAGE_MODE] = mode;
    await AsyncStorage.setItem(KEYS.STORAGE_MODE, mode);
    
    // Notify listeners
    this._notifyListeners('storageMode', mode, previousMode);
    
    console.log(`[SettingsService] Storage mode changed to: ${mode}`);
  }

  /**
   * Check if sync is enabled (not in local-only mode)
   * @returns {Promise<boolean>} True if sync is enabled
   */
  async isSyncEnabled() {
    const mode = await this.getStorageMode();
    return mode !== StorageMode.LOCAL_ONLY;
  }

  /**
   * Check if we should sync on current network
   * @param {string} networkType - Current network type (wifi, cellular, etc.)
   * @returns {Promise<boolean>} True if should sync
   */
  async shouldSyncOnNetwork(networkType) {
    const mode = await this.getStorageMode();
    
    switch (mode) {
      case StorageMode.CLOUD_SYNC:
        return true; // Sync on any network
      case StorageMode.WIFI_ONLY:
        return networkType === 'wifi';
      case StorageMode.LOCAL_ONLY:
        return false;
      default:
        return false;
    }
  }

  // ============================================================
  // User Settings
  // ============================================================

  /**
   * Get the current user ID
   * @returns {Promise<string|null>} User ID or null
   */
  async getUserId() {
    return AsyncStorage.getItem(KEYS.USER_ID);
  }

  /**
   * Set the current user ID
   * @param {string} userId - User ID
   */
  async setUserId(userId) {
    if (userId) {
      await AsyncStorage.setItem(KEYS.USER_ID, userId);
    } else {
      await AsyncStorage.removeItem(KEYS.USER_ID);
    }
  }

  /**
   * Get the default journal ID for the user
   * @returns {Promise<string|null>} Journal ID or null
   */
  async getDefaultJournalId() {
    return AsyncStorage.getItem(KEYS.JOURNAL_ID);
  }

  /**
   * Set the default journal ID
   * @param {string} journalId - Journal ID
   */
  async setDefaultJournalId(journalId) {
    await AsyncStorage.setItem(KEYS.JOURNAL_ID, journalId);
  }

  // ============================================================
  // Sync Tracking
  // ============================================================

  /**
   * Get the last sync timestamp
   * @returns {Promise<number|null>} Timestamp or null
   */
  async getLastSyncTime() {
    const value = await AsyncStorage.getItem(KEYS.LAST_SYNC_TIME);
    return value ? parseInt(value, 10) : null;
  }

  /**
   * Update the last sync timestamp
   * @param {number} timestamp - Sync timestamp (defaults to now)
   */
  async setLastSyncTime(timestamp = Date.now()) {
    await AsyncStorage.setItem(KEYS.LAST_SYNC_TIME, timestamp.toString());
  }

  /**
   * Get human-readable last sync status
   * @returns {Promise<string>} Status message
   */
  async getLastSyncStatus() {
    const lastSync = await this.getLastSyncTime();
    
    if (!lastSync) {
      return 'Never synced';
    }
    
    const now = Date.now();
    const diff = now - lastSync;
    
    if (diff < 60000) {
      return 'Just now';
    } else if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    } else if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else {
      const days = Math.floor(diff / 86400000);
      return `${days} day${days > 1 ? 's' : ''} ago`;
    }
  }

  // ============================================================
  // App Preferences
  // ============================================================

  /**
   * Get the current theme
   * @returns {Promise<string>} Theme (light, dark, system)
   */
  async getTheme() {
    const theme = await AsyncStorage.getItem(KEYS.THEME);
    return theme || Theme.SYSTEM;
  }

  /**
   * Set the theme
   * @param {string} theme - Theme to set
   */
  async setTheme(theme) {
    await AsyncStorage.setItem(KEYS.THEME, theme);
    this._notifyListeners('theme', theme);
  }

  /**
   * Check if notifications are enabled
   * @returns {Promise<boolean>} True if enabled
   */
  async areNotificationsEnabled() {
    const value = await AsyncStorage.getItem(KEYS.NOTIFICATIONS_ENABLED);
    return value !== 'false'; // Default to true
  }

  /**
   * Set notifications enabled state
   * @param {boolean} enabled - Whether notifications are enabled
   */
  async setNotificationsEnabled(enabled) {
    await AsyncStorage.setItem(KEYS.NOTIFICATIONS_ENABLED, enabled.toString());
  }

  /**
   * Check if auto-backup is enabled
   * @returns {Promise<boolean>} True if enabled
   */
  async isAutoBackupEnabled() {
    const value = await AsyncStorage.getItem(KEYS.AUTO_BACKUP);
    return value === 'true';
  }

  /**
   * Set auto-backup enabled state
   * @param {boolean} enabled - Whether auto-backup is enabled
   */
  async setAutoBackupEnabled(enabled) {
    await AsyncStorage.setItem(KEYS.AUTO_BACKUP, enabled.toString());
  }

  /**
   * Check if onboarding is complete
   * @returns {Promise<boolean>} True if complete
   */
  async isOnboardingComplete() {
    const value = await AsyncStorage.getItem(KEYS.ONBOARDING_COMPLETE);
    return value === 'true';
  }

  /**
   * Set onboarding complete state
   * @param {boolean} complete - Whether onboarding is complete
   */
  async setOnboardingComplete(complete) {
    await AsyncStorage.setItem(KEYS.ONBOARDING_COMPLETE, complete.toString());
  }

  // ============================================================
  // Settings Change Listeners
  // ============================================================

  /**
   * Subscribe to settings changes
   * @param {string} setting - Setting name to watch
   * @param {function} callback - Callback function(newValue, oldValue)
   * @returns {function} Unsubscribe function
   */
  addListener(setting, callback) {
    if (!this._listeners.has(setting)) {
      this._listeners.set(setting, new Set());
    }
    this._listeners.get(setting).add(callback);
    
    // Return unsubscribe function
    return () => {
      const listeners = this._listeners.get(setting);
      if (listeners) {
        listeners.delete(callback);
      }
    };
  }

  /**
   * Notify listeners of a setting change
   */
  _notifyListeners(setting, newValue, oldValue) {
    const listeners = this._listeners.get(setting);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(newValue, oldValue);
        } catch (error) {
          console.error('[SettingsService] Listener error:', error);
        }
      });
    }
  }

  // ============================================================
  // Utility Methods
  // ============================================================

  /**
   * Clear all settings (for logout or reset)
   * @param {boolean} keepLocalData - If true, only clear account-related settings
   */
  async clearSettings(keepLocalData = false) {
    if (keepLocalData) {
      // Only clear account-related settings
      await AsyncStorage.multiRemove([
        KEYS.USER_ID,
        KEYS.LAST_SYNC_TIME,
        KEYS.JOURNAL_ID,
      ]);
    } else {
      // Clear all settings
      await AsyncStorage.multiRemove(Object.values(KEYS));
    }
    
    // Clear cache
    this._cache = {};
    
    console.log('[SettingsService] Settings cleared');
  }

  /**
   * Export all settings (for backup)
   * @returns {Promise<object>} All settings
   */
  async exportSettings() {
    const settings = {};
    
    for (const [name, key] of Object.entries(KEYS)) {
      settings[name] = await AsyncStorage.getItem(key);
    }
    
    return settings;
  }

  /**
   * Import settings (for restore)
   * @param {object} settings - Settings to import
   */
  async importSettings(settings) {
    for (const [name, value] of Object.entries(settings)) {
      const key = KEYS[name];
      if (key && value !== null && value !== undefined) {
        await AsyncStorage.setItem(key, value);
      }
    }
    
    // Clear cache to reload
    this._cache = {};
    
    console.log('[SettingsService] Settings imported');
  }

  // ============================================================
  // Journal Management
  // ============================================================

  /**
   * Get or create a default journal for the user
   * This is used for local-first journaling - no account required to start
   * @param {string} userId - Optional user ID (can be null for local-only mode)
   * @returns {Promise<string>} Journal ID (either stored or newly created)
   */
  async getOrCreateDefaultJournal(userId = null) {
    // Check if we already have a default journal
    let journalId = await this.getDefaultJournalId();
    
    if (journalId) {
      console.log('[SettingsService] Using existing journal:', journalId);
      return journalId;
    }
    
    // Create a new local journal ID
    // Format: local_journal_<timestamp>_<random>
    journalId = `local_journal_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    
    // Store the journal ID
    await this.setDefaultJournalId(journalId);
    
    console.log('[SettingsService] Created new local journal:', journalId);
    
    return journalId;
  }

  /**
   * Check if user has a journal set up
   * @returns {Promise<boolean>} True if journal exists
   */
  async hasJournal() {
    const journalId = await this.getDefaultJournalId();
    return !!journalId;
  }

  /**
   * Get storage mode display info
   * @param {string} mode - Storage mode
   * @returns {object} Display info { title, description, icon, warning }
   */
  getStorageModeInfo(mode) {
    switch (mode) {
      case StorageMode.CLOUD_SYNC:
        return {
          title: 'Cloud Sync',
          description: 'Your entries sync across all devices and are backed up securely in the cloud.',
          icon: 'cloud-upload-outline',
          warning: null,
        };
      case StorageMode.WIFI_ONLY:
        return {
          title: 'WiFi Only',
          description: 'Sync only when connected to WiFi to save mobile data.',
          icon: 'wifi-outline',
          warning: null,
        };
      case StorageMode.LOCAL_ONLY:
        return {
          title: 'Local Only',
          description: 'Keep everything on this device. No account required. Your data stays private on your phone.',
          icon: 'phone-portrait-outline',
          warning: 'If you lose your device, your data cannot be recovered.',
        };
      default:
        return {
          title: 'Unknown',
          description: '',
          icon: 'help-outline',
          warning: null,
        };
    }
  }
}

// Export singleton instance
export const SettingsService = new SettingsServiceClass();
export default SettingsService;
