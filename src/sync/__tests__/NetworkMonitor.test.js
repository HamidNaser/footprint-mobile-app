/**
 * Unit tests for NetworkMonitor's connectivity predicates.
 *
 * These guard a specific production failure: ApiClient.request() rejects
 * outright when isOffline() is true, so a false "offline" reading silently
 * empties every live-data screen. NetInfo is mocked; no native modules load.
 */

import NetInfo from '@react-native-community/netinfo';
import { NetworkMonitor } from '../NetworkMonitor';

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: jest.fn(),
    addEventListener: jest.fn(() => jest.fn()),
  },
}));

jest.mock('../../services/SettingsService', () => ({
  SettingsService: { getStorageMode: jest.fn() },
  StorageMode: {},
}));

// Reach past initialize() so each case can set state directly.
const setState = (state) => {
  NetworkMonitor._currentState = state;
};

beforeEach(() => {
  jest.clearAllMocks();
  NetworkMonitor._currentState = null;
  NetworkMonitor._initialized = false;
});

describe('isOnline / isOffline before initialization', () => {
  it('treats unknown state as online, not offline', () => {
    // Regression: this returned false, so isOffline() was true and ApiClient
    // threw "No internet connection" for any caller that beat
    // NetworkMonitor.initialize() -- which startSync only reaches fourth,
    // behind SQLite open and migrations. Places went silently empty.
    expect(NetworkMonitor._currentState).toBeNull();
    expect(NetworkMonitor.isOnline()).toBe(true);
    expect(NetworkMonitor.isOffline()).toBe(false);
  });
});

describe('isOnline / isOffline with known state', () => {
  it('is online when connected and the internet is reachable', () => {
    setState({ isConnected: true, isInternetReachable: true });
    expect(NetworkMonitor.isOnline()).toBe(true);
  });

  it('is online when reachability is unknown but the device is connected', () => {
    // isInternetReachable is null on web and briefly at startup.
    setState({ isConnected: true, isInternetReachable: null });
    expect(NetworkMonitor.isOnline()).toBe(true);
  });

  it('is offline only when reachability is explicitly false', () => {
    setState({ isConnected: true, isInternetReachable: false });
    expect(NetworkMonitor.isOffline()).toBe(true);
  });

  it('is offline when not connected', () => {
    setState({ isConnected: false, isInternetReachable: false });
    expect(NetworkMonitor.isOffline()).toBe(true);
  });

  it('is offline when connectivity itself is unknown', () => {
    // A state object exists but isConnected is not true -- distinct from
    // having no state object at all.
    setState({ isConnected: null, isInternetReachable: null });
    expect(NetworkMonitor.isOffline()).toBe(true);
  });
});

describe('initialize', () => {
  it('adopts the state NetInfo reports', async () => {
    NetInfo.fetch.mockResolvedValue({ isConnected: true, isInternetReachable: true, type: 'wifi' });

    await NetworkMonitor.initialize();

    expect(NetInfo.fetch).toHaveBeenCalledTimes(1);
    expect(NetworkMonitor.isOnline()).toBe(true);
  });

  it('does not re-fetch once initialized', async () => {
    NetInfo.fetch.mockResolvedValue({ isConnected: true, isInternetReachable: true, type: 'wifi' });

    await NetworkMonitor.initialize();
    await NetworkMonitor.initialize();

    expect(NetInfo.fetch).toHaveBeenCalledTimes(1);
  });
});
