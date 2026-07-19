/**
 * SettingsScreen
 * 
 * Settings and privacy management:
 * - Storage mode toggle (Cloud Sync / WiFi Only / Local Only)
 * - Data export functionality
 * - Delete cloud data option
 * - Sync status indicator
 * - Theme selection
 * - Notification settings
 */

import React, { useState, useEffect, useCallback, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
  Linking,
  Platform,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';

import SettingsService, { StorageMode, Theme } from '../services/SettingsService';
import { SettingsApi, LOCATION_PRECISION_OPTIONS } from '../api';
import { useAuth } from '../context/AuthContext';

const PRIMARY_COLOR = '#4361ee';

/** Human label for a precision radius (meters). `null` => Private. */
const precisionLabel = (meters) => {
  const opt = LOCATION_PRECISION_OPTIONS.find((o) => o.meters === (meters ?? null));
  return opt ? opt.label : 'City';
};

// Storage mode configuration
const STORAGE_MODE_CONFIG = {
  [StorageMode.CLOUD_SYNC]: {
    icon: 'cloud-done',
    title: 'Cloud Sync',
    subtitle: 'Sync whenever online',
    description: 'Your data is backed up to the cloud and synced across all devices.',
  },
  [StorageMode.WIFI_ONLY]: {
    icon: 'wifi',
    title: 'WiFi Only',
    subtitle: 'Sync only on WiFi',
    description: 'Saves mobile data. Syncs automatically when connected to WiFi.',
  },
  [StorageMode.LOCAL_ONLY]: {
    icon: 'phone-portrait-outline',
    title: 'Local Only',
    subtitle: 'Never sync to cloud',
    description: 'Data stays on this device only. Not backed up to cloud.',
    warning: 'Warning: Data will be lost if you lose your device.',
  },
};

// Theme configuration
const THEME_CONFIG = {
  [Theme.LIGHT]: { icon: 'sunny', title: 'Light' },
  [Theme.DARK]: { icon: 'moon', title: 'Dark' },
  [Theme.SYSTEM]: { icon: 'settings', title: 'System' },
};

/**
 * Section header component
 */
const SectionHeader = memo(({ title, icon }) => (
  <View style={styles.sectionHeader}>
    {icon && <Ionicons name={icon} size={18} color="#8E8E93" style={styles.sectionIcon} />}
    <Text style={styles.sectionTitle}>{title}</Text>
  </View>
));

SectionHeader.displayName = 'SectionHeader';

/**
 * Settings row component
 */
const SettingsRow = memo(({
  icon,
  iconColor = '#8E8E93',
  title,
  subtitle,
  value,
  onPress,
  showChevron = true,
  rightComponent,
  danger = false,
}) => (
  <TouchableOpacity
    style={styles.settingsRow}
    onPress={onPress}
    disabled={!onPress}
    activeOpacity={onPress ? 0.7 : 1}
  >
    {icon && (
      <View style={[styles.settingsIcon, { backgroundColor: iconColor + '20' }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
    )}
    <View style={styles.settingsContent}>
      <Text style={[styles.settingsTitle, danger && styles.dangerText]}>{title}</Text>
      {subtitle && <Text style={styles.settingsSubtitle}>{subtitle}</Text>}
    </View>
    {value && <Text style={styles.settingsValue}>{value}</Text>}
    {rightComponent}
    {showChevron && onPress && (
      <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
    )}
  </TouchableOpacity>
));

SettingsRow.displayName = 'SettingsRow';

/**
 * Toggle row component
 */
const ToggleRow = memo(({ icon, iconColor, title, subtitle, value, onValueChange }) => (
  <View style={styles.settingsRow}>
    {icon && (
      <View style={[styles.settingsIcon, { backgroundColor: iconColor + '20' }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
    )}
    <View style={styles.settingsContent}>
      <Text style={styles.settingsTitle}>{title}</Text>
      {subtitle && <Text style={styles.settingsSubtitle}>{subtitle}</Text>}
    </View>
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: '#E5E5EA', true: PRIMARY_COLOR + '80' }}
      thumbColor={value ? PRIMARY_COLOR : '#FFF'}
    />
  </View>
));

ToggleRow.displayName = 'ToggleRow';

/**
 * Storage mode selector modal content
 */
const StorageModeSelector = memo(({ currentMode, onSelect, onClose }) => (
  <View style={styles.modalContent}>
    <View style={styles.modalHeader}>
      <Text style={styles.modalTitle}>Storage Mode</Text>
      <TouchableOpacity onPress={onClose}>
        <Ionicons name="close" size={24} color="#333" />
      </TouchableOpacity>
    </View>
    <Text style={styles.modalSubtitle}>
      Choose how your journal data is stored and synced
    </Text>
    
    {Object.entries(STORAGE_MODE_CONFIG).map(([mode, config]) => (
      <TouchableOpacity
        key={mode}
        style={[
          styles.modeOption,
          currentMode === mode && styles.modeOptionSelected,
        ]}
        onPress={() => onSelect(mode)}
      >
        <View style={[
          styles.modeIcon,
          { backgroundColor: currentMode === mode ? PRIMARY_COLOR : '#F2F2F7' },
        ]}>
          <Ionicons
            name={config.icon}
            size={24}
            color={currentMode === mode ? '#FFF' : '#8E8E93'}
          />
        </View>
        <View style={styles.modeContent}>
          <View style={styles.modeHeader}>
            <Text style={styles.modeTitle}>{config.title}</Text>
            {currentMode === mode && (
              <Ionicons name="checkmark-circle" size={20} color={PRIMARY_COLOR} />
            )}
          </View>
          <Text style={styles.modeSubtitle}>{config.subtitle}</Text>
          <Text style={styles.modeDescription}>{config.description}</Text>
          {config.warning && (
            <Text style={styles.modeWarning}>{config.warning}</Text>
          )}
        </View>
      </TouchableOpacity>
    ))}
  </View>
));

StorageModeSelector.displayName = 'StorageModeSelector';

/**
 * Location-precision selector modal content. Lets the user pick how precisely a
 * given audience (family or friends) sees the location attached to their entries.
 */
const PrecisionSelector = memo(({ title, currentMeters, onSelect, onClose }) => (
  <View style={styles.modalContent}>
    <View style={styles.modalHeader}>
      <Text style={styles.modalTitle}>{title}</Text>
      <TouchableOpacity onPress={onClose}>
        <Ionicons name="close" size={24} color="#333" />
      </TouchableOpacity>
    </View>
    <Text style={styles.modalSubtitle}>
      Choose how precisely they see the location on your entries
    </Text>

    {LOCATION_PRECISION_OPTIONS.map((opt) => {
      const selected = (currentMeters ?? null) === opt.meters;
      return (
        <TouchableOpacity
          key={opt.label}
          style={[styles.modeOption, selected && styles.modeOptionSelected]}
          onPress={() => onSelect(opt.meters)}
        >
          <View style={[
            styles.modeIcon,
            { backgroundColor: selected ? PRIMARY_COLOR : '#F2F2F7' },
          ]}>
            <Ionicons
              name={opt.meters === null ? 'lock-closed' : 'location'}
              size={22}
              color={selected ? '#FFF' : '#8E8E93'}
            />
          </View>
          <View style={styles.modeContent}>
            <View style={styles.modeHeader}>
              <Text style={styles.modeTitle}>{opt.label}</Text>
              {selected && (
                <Ionicons name="checkmark-circle" size={20} color={PRIMARY_COLOR} />
              )}
            </View>
            <Text style={styles.modeSubtitle}>{opt.hint}</Text>
          </View>
        </TouchableOpacity>
      );
    })}
  </View>
));

PrecisionSelector.displayName = 'PrecisionSelector';

/**
 * Sync status indicator
 */
const SyncStatusIndicator = memo(({ pendingCount, lastSyncStatus, isOnline }) => {
  let icon, color, text;

  if (!isOnline) {
    icon = 'cloud-offline';
    color = '#8E8E93';
    text = 'Offline';
  } else if (pendingCount > 0) {
    icon = 'cloud-upload';
    color = '#FF9500';
    text = `${pendingCount} pending`;
  } else {
    icon = 'cloud-done';
    color = '#34C759';
    text = lastSyncStatus || 'Synced';
  }

  return (
    <View style={styles.syncStatus}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[styles.syncText, { color }]}>{text}</Text>
    </View>
  );
});

SyncStatusIndicator.displayName = 'SyncStatusIndicator';

/**
 * Main SettingsScreen component
 */
export default function SettingsScreen({ navigation }) {
  const { user, logout } = useAuth();
  
  // State
  const [storageMode, setStorageMode] = useState(StorageMode.CLOUD_SYNC);
  const [theme, setTheme] = useState(Theme.SYSTEM);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [autoBackup, setAutoBackup] = useState(true);
  const [lastSyncStatus, setLastSyncStatus] = useState('');
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [showStorageModal, setShowStorageModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Location privacy (per-audience precision)
  const [familyMeters, setFamilyMeters] = useState(100);
  const [friendsMeters, setFriendsMeters] = useState(5000);
  const [defaultLocationSharing, setDefaultLocationSharing] = useState('private');
  const [precisionAudience, setPrecisionAudience] = useState(null); // 'family' | 'friends' | null

  /**
   * Load settings on mount
   */
  useEffect(() => {
    loadSettings();
  }, []);

  /**
   * Load all settings
   */
  const loadSettings = async () => {
    try {
      const [mode, currentTheme, notifications, backup, syncStatus] = await Promise.all([
        SettingsService.getStorageMode(),
        SettingsService.getTheme(),
        SettingsService.areNotificationsEnabled(),
        SettingsService.isAutoBackupEnabled(),
        SettingsService.getLastSyncStatus(),
      ]);

      setStorageMode(mode);
      setTheme(currentTheme);
      setNotificationsEnabled(notifications);
      setAutoBackup(backup);
      setLastSyncStatus(syncStatus);
      
      // TODO: Get actual pending count from SyncEngine
      setPendingCount(0);
    } catch (error) {
      console.error('[SettingsScreen] Error loading settings:', error);
    }

    // Location privacy is served by the Hub API; load it separately so a network
    // failure here never blocks the rest of the settings screen.
    try {
      const location = await SettingsApi.getLocationSettings();
      if (location) {
        setFamilyMeters(location.familyLocationPrecisionMeters ?? 100);
        setFriendsMeters(location.friendsLocationPrecisionMeters ?? null);
        setDefaultLocationSharing(location.defaultLocationSharing ?? 'private');
      }
    } catch (error) {
      console.warn('[SettingsScreen] Could not load location settings:', error?.message);
    }
  };

  /**
   * Persist a change to the per-audience location precision.
   */
  const handlePrecisionChange = useCallback(async (audience, meters) => {
    const nextFamily = audience === 'family' ? meters : familyMeters;
    const nextFriends = audience === 'friends' ? meters : friendsMeters;

    // Optimistic UI update.
    if (audience === 'family') setFamilyMeters(meters);
    else setFriendsMeters(meters);
    setPrecisionAudience(null);

    try {
      await SettingsApi.updateLocationSettings({
        defaultLocationSharing,
        familyLocationPrecisionMeters: nextFamily ?? 100,
        friendsLocationPrecisionMeters: nextFriends,
      });
    } catch (error) {
      console.error('[SettingsScreen] Error saving location settings:', error);
      // Roll back on failure.
      if (audience === 'family') setFamilyMeters(familyMeters);
      else setFriendsMeters(friendsMeters);
      Alert.alert('Could not save', 'Your location privacy change was not saved. Please try again.');
    }
  }, [familyMeters, friendsMeters, defaultLocationSharing]);

  /**
   * Handle storage mode change
   */
  const handleStorageModeChange = useCallback(async (mode) => {
    if (mode === StorageMode.LOCAL_ONLY) {
      Alert.alert(
        'Switch to Local Only?',
        'Your data will no longer sync to the cloud. Existing cloud data will remain, but new entries will only be stored on this device.\n\nYou can switch back anytime.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Switch',
            onPress: async () => {
              await SettingsService.setStorageMode(mode);
              setStorageMode(mode);
              setShowStorageModal(false);
            },
          },
        ]
      );
    } else {
      await SettingsService.setStorageMode(mode);
      setStorageMode(mode);
      setShowStorageModal(false);
    }
  }, []);

  /**
   * Handle theme change
   */
  const handleThemeChange = useCallback(async () => {
    const themeOrder = [Theme.SYSTEM, Theme.LIGHT, Theme.DARK];
    const currentIndex = themeOrder.indexOf(theme);
    const nextTheme = themeOrder[(currentIndex + 1) % themeOrder.length];
    
    await SettingsService.setTheme(nextTheme);
    setTheme(nextTheme);
  }, [theme]);

  /**
   * Handle notifications toggle
   */
  const handleNotificationsToggle = useCallback(async (value) => {
    await SettingsService.setNotificationsEnabled(value);
    setNotificationsEnabled(value);
  }, []);

  /**
   * Handle auto backup toggle
   */
  const handleAutoBackupToggle = useCallback(async (value) => {
    await SettingsService.setAutoBackupEnabled(value);
    setAutoBackup(value);
  }, []);

  /**
   * Export all data
   */
  const handleExportData = useCallback(async () => {
    setIsExporting(true);
    
    try {
      // TODO: Get actual data from JournalService
      const exportData = {
        exportedAt: new Date().toISOString(),
        version: '1.0',
        user: user ? { id: user.id, email: user.email } : null,
        entries: [], // TODO: Fetch from JournalService
        settings: {
          storageMode,
          theme,
          notificationsEnabled,
          autoBackup,
        },
      };

      const jsonString = JSON.stringify(exportData, null, 2);
      const fileName = `footprint-export-${new Date().toISOString().split('T')[0]}.json`;
      const filePath = `${FileSystem.documentDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(filePath, jsonString);

      // Share the file
      if (Platform.OS === 'ios') {
        await Share.share({
          url: filePath,
          title: 'Export FootPrint Data',
        });
      } else {
        await Share.share({
          message: jsonString,
          title: 'Export FootPrint Data',
        });
      }

      Alert.alert('Export Complete', 'Your data has been exported successfully.');
    } catch (error) {
      console.error('[SettingsScreen] Export error:', error);
      Alert.alert('Export Failed', 'Unable to export your data. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }, [user, storageMode, theme, notificationsEnabled, autoBackup]);

  /**
   * Delete cloud data
   */
  const handleDeleteCloudData = useCallback(() => {
    Alert.alert(
      'Delete Cloud Data?',
      'This will permanently delete all your data from our servers. Local data on this device will be kept.\n\nThis action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you absolutely sure?',
              'Type "DELETE" to confirm.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, Delete Everything',
                  style: 'destructive',
                  onPress: async () => {
                    setIsDeleting(true);
                    try {
                      // TODO: Call API to delete cloud data
                      await new Promise(resolve => setTimeout(resolve, 2000));
                      
                      // Switch to local only mode
                      await SettingsService.setStorageMode(StorageMode.LOCAL_ONLY);
                      setStorageMode(StorageMode.LOCAL_ONLY);
                      
                      Alert.alert(
                        'Cloud Data Deleted',
                        'All your cloud data has been deleted. Your storage mode has been set to Local Only.'
                      );
                    } catch (error) {
                      console.error('[SettingsScreen] Delete error:', error);
                      Alert.alert('Delete Failed', 'Unable to delete cloud data. Please try again.');
                    } finally {
                      setIsDeleting(false);
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  }, []);

  /**
   * Handle logout
   */
  const handleLogout = useCallback(() => {
    const doLogout = async () => {
      await logout();
      // Auth state change swaps to the auth stack automatically; reset guarded
      // in case the 'Login' route isn't reachable from the current navigator.
      try {
        navigation.reset({
          index: 0,
          routes: [{ name: 'Login' }],
        });
      } catch {
        // ignore — the root navigator will render Login once logged out
      }
    };

    // React Native's Alert with buttons is a no-op on web (the onPress
    // callbacks never fire), so use the browser confirm dialog there.
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('Log out? You will need to log in again to sync your data.')) {
        doLogout();
      }
      return;
    }

    Alert.alert(
      'Log Out?',
      'You will need to log in again to sync your data.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: doLogout,
        },
      ]
    );
  }, [logout, navigation]);

  /**
   * Open privacy policy
   */
  const handlePrivacyPolicy = useCallback(() => {
    Linking.openURL('https://footprint.app/privacy');
  }, []);

  /**
   * Open terms of service
   */
  const handleTermsOfService = useCallback(() => {
    Linking.openURL('https://footprint.app/terms');
  }, []);

  const storageModeConfig = STORAGE_MODE_CONFIG[storageMode];
  const themeConfig = THEME_CONFIG[theme];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Sync Status */}
        {storageMode !== StorageMode.LOCAL_ONLY && (
          <View style={styles.syncStatusCard}>
            <SyncStatusIndicator
              pendingCount={pendingCount}
              lastSyncStatus={lastSyncStatus}
              isOnline={isOnline}
            />
            <TouchableOpacity
              style={styles.syncButton}
              onPress={() => {/* TODO: Trigger manual sync */}}
            >
              <Text style={styles.syncButtonText}>Sync Now</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Storage & Privacy */}
        <SectionHeader title="STORAGE & PRIVACY" icon="shield-checkmark" />
        <View style={styles.section}>
          <SettingsRow
            icon={storageModeConfig.icon}
            iconColor={PRIMARY_COLOR}
            title="Storage Mode"
            subtitle={storageModeConfig.subtitle}
            onPress={() => setShowStorageModal(true)}
          />
          <SettingsRow
            icon="download-outline"
            iconColor="#34C759"
            title="Export My Data"
            subtitle="Download all your data"
            onPress={handleExportData}
            rightComponent={isExporting ? <ActivityIndicator size="small" color={PRIMARY_COLOR} /> : null}
            showChevron={!isExporting}
          />
          {storageMode !== StorageMode.LOCAL_ONLY && user && (
            <SettingsRow
              icon="trash-outline"
              iconColor="#FF3B30"
              title="Delete Cloud Data"
              subtitle="Remove all data from servers"
              onPress={handleDeleteCloudData}
              danger
              rightComponent={isDeleting ? <ActivityIndicator size="small" color="#FF3B30" /> : null}
              showChevron={!isDeleting}
            />
          )}
        </View>

        {/* Location Privacy */}
        <SectionHeader title="LOCATION PRIVACY" icon="location" />
        <View style={styles.section}>
          <SettingsRow
            icon="people"
            iconColor="#34C759"
            title="Family sees"
            subtitle="How precisely family sees your locations"
            value={precisionLabel(familyMeters)}
            onPress={() => setPrecisionAudience('family')}
          />
          <SettingsRow
            icon="person-add"
            iconColor="#5AC8FA"
            title="Friends see"
            subtitle="How precisely friends see your locations"
            value={precisionLabel(friendsMeters)}
            onPress={() => setPrecisionAudience('friends')}
          />
        </View>

        {/* Appearance */}
        <SectionHeader title="APPEARANCE" icon="color-palette" />
        <View style={styles.section}>
          <SettingsRow
            icon={themeConfig.icon}
            iconColor="#FF9500"
            title="Theme"
            value={themeConfig.title}
            onPress={handleThemeChange}
          />
        </View>

        {/* Notifications */}
        <SectionHeader title="NOTIFICATIONS" icon="notifications" />
        <View style={styles.section}>
          <ToggleRow
            icon="notifications-outline"
            iconColor="#5856D6"
            title="Push Notifications"
            subtitle="Get notified about family updates"
            value={notificationsEnabled}
            onValueChange={handleNotificationsToggle}
          />
          {storageMode !== StorageMode.LOCAL_ONLY && (
            <ToggleRow
              icon="cloud-upload-outline"
              iconColor="#007AFF"
              title="Auto Backup"
              subtitle="Automatically backup new entries"
              value={autoBackup}
              onValueChange={handleAutoBackupToggle}
            />
          )}
        </View>

        {/* Account */}
        {user && (
          <>
            <SectionHeader title="ACCOUNT" icon="person" />
            <View style={styles.section}>
              <SettingsRow
                icon="person-outline"
                iconColor="#8E8E93"
                title={user.displayName || user.email}
                subtitle={user.email}
                showChevron={false}
              />
              <SettingsRow
                icon="log-out-outline"
                iconColor="#FF3B30"
                title="Log Out"
                onPress={handleLogout}
                danger
              />
            </View>
          </>
        )}

        {/* About */}
        <SectionHeader title="ABOUT" icon="information-circle" />
        <View style={styles.section}>
          <SettingsRow
            icon="document-text-outline"
            iconColor="#8E8E93"
            title="Privacy Policy"
            onPress={handlePrivacyPolicy}
          />
          <SettingsRow
            icon="reader-outline"
            iconColor="#8E8E93"
            title="Terms of Service"
            onPress={handleTermsOfService}
          />
          <SettingsRow
            icon="information-circle-outline"
            iconColor="#8E8E93"
            title="Version"
            value="1.0.0"
            showChevron={false}
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>FootPrint Journal</Text>
          <Text style={styles.footerSubtext}>Made with ❤️ for families</Text>
        </View>
      </ScrollView>

      {/* Storage Mode Modal */}
      {showStorageModal && (
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowStorageModal(false)}
          />
          <StorageModeSelector
            currentMode={storageMode}
            onSelect={handleStorageModeChange}
            onClose={() => setShowStorageModal(false)}
          />
        </View>
      )}

      {/* Location Precision Modal */}
      {precisionAudience && (
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setPrecisionAudience(null)}
          />
          <PrecisionSelector
            title={precisionAudience === 'family' ? 'Family sees' : 'Friends see'}
            currentMeters={precisionAudience === 'family' ? familyMeters : friendsMeters}
            onSelect={(meters) => handlePrecisionChange(precisionAudience, meters)}
            onClose={() => setPrecisionAudience(null)}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
  },

  // Content
  content: {
    flex: 1,
  },

  // Sync status card
  syncStatusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    margin: 16,
    padding: 16,
    backgroundColor: '#FFF',
    borderRadius: 12,
  },
  syncStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  syncText: {
    fontSize: 15,
    fontWeight: '500',
  },
  syncButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: PRIMARY_COLOR + '15',
    borderRadius: 8,
  },
  syncButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: PRIMARY_COLOR,
  },

  // Section
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 8,
  },
  sectionIcon: {
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    letterSpacing: 0.5,
  },
  section: {
    backgroundColor: '#FFF',
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },

  // Settings row
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5EA',
  },
  settingsIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  settingsContent: {
    flex: 1,
  },
  settingsTitle: {
    fontSize: 16,
    color: '#000',
  },
  settingsSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  settingsValue: {
    fontSize: 16,
    color: '#8E8E93',
    marginRight: 8,
  },
  dangerText: {
    color: '#FF3B30',
  },

  // Modal
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
  },
  modalSubtitle: {
    fontSize: 15,
    color: '#8E8E93',
    marginBottom: 20,
  },

  // Mode option
  modeOption: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    backgroundColor: '#F2F2F7',
  },
  modeOptionSelected: {
    backgroundColor: PRIMARY_COLOR + '10',
    borderWidth: 1,
    borderColor: PRIMARY_COLOR,
  },
  modeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  modeContent: {
    flex: 1,
  },
  modeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modeTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
  },
  modeSubtitle: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  modeDescription: {
    fontSize: 13,
    color: '#666',
    marginTop: 8,
    lineHeight: 18,
  },
  modeWarning: {
    fontSize: 12,
    color: '#FF9500',
    marginTop: 6,
    fontWeight: '500',
  },

  // Footer
  footer: {
    alignItems: 'center',
    padding: 32,
    paddingBottom: 48,
  },
  footerText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#8E8E93',
  },
  footerSubtext: {
    fontSize: 13,
    color: '#AEAEB2',
    marginTop: 4,
  },
});
