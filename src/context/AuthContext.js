import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG } from '../config/api.config';
import { ApiClient } from '../api/ApiClient';
import { startSync, teardownLocalData } from '../sync/SyncBootstrap';

const AuthContext = createContext(null);

const AUTH_STORAGE_KEY = '@footprint_auth';
const API_BASE_URL = API_CONFIG.AUTH_BASE_URL; // Live AWS backend (see api.config.js)
const API_VERSION = 'v1'; // API version

/**
 * Derive seconds-until-expiry from a JWT's `exp` claim so ApiClient can manage
 * proactive token refresh. Falls back to 1 hour if the token can't be decoded.
 */
function getExpiresInSeconds(accessToken) {
  try {
    const payload = accessToken.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const decoded = JSON.parse(json);
    if (decoded?.exp) {
      return Math.max(60, decoded.exp - Math.floor(Date.now() / 1000));
    }
  } catch {
    // ignore — fall through to default
  }
  return 3600;
}

/**
 * Bridge the auth tokens into ApiClient so the Hub API layer (journals, media,
 * places) is authenticated. AuthContext and ApiClient use different storage
 * keys, so this must be called whenever tokens change.
 */
async function bridgeTokensToApiClient(accessToken, refreshToken) {
  if (!accessToken) return;
  try {
    await ApiClient.setTokens({
      accessToken,
      refreshToken,
      expiresIn: getExpiresInSeconds(accessToken),
    });
  } catch (error) {
    console.warn('[AuthContext] Failed to bridge tokens to ApiClient:', error?.message);
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [refreshToken, setRefreshToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Load stored auth data on mount
  useEffect(() => {
    loadStoredAuth();
  }, []);

  // Activate the offline-first sync stack once authenticated (idempotent).
  // Pass the user id so the sync stack can detect an account switch and wipe
  // any local data left behind by a previous user before pulling.
  useEffect(() => {
    if (isAuthenticated && accessToken) {
      startSync(user?.id);
    }
  }, [isAuthenticated, accessToken, user?.id]);

  const loadStoredAuth = async () => {
    try {
      const storedData = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
      if (storedData) {
        const { user: storedUser, accessToken: storedAccessToken, refreshToken: storedRefreshToken } = JSON.parse(storedData);
        setUser(storedUser);
        setAccessToken(storedAccessToken);
        setRefreshToken(storedRefreshToken);
        setIsAuthenticated(true);
        await bridgeTokensToApiClient(storedAccessToken, storedRefreshToken);
      }
    } catch (error) {
      console.error('Error loading stored auth:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveAuth = async (userData, tokens) => {
    try {
      const authData = {
        user: userData,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      };
      await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authData));
      setUser(userData);
      setAccessToken(tokens.accessToken);
      setRefreshToken(tokens.refreshToken);
      setIsAuthenticated(true);
      await bridgeTokensToApiClient(tokens.accessToken, tokens.refreshToken);
    } catch (error) {
      console.error('Error saving auth:', error);
      throw error;
    }
  };

  const login = async (email, password) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/${API_VERSION}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      // Check if response has content
      const text = await response.text();
      if (!text) {
        throw new Error('Server returned empty response. Check if backend is running and CORS is configured.');
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error(`Invalid server response: ${text.substring(0, 100)}`);
      }

      if (!response.ok) {
        throw new Error(data.message || 'Login failed');
      }

      await saveAuth(data.user, { accessToken: data.accessToken, refreshToken: data.refreshToken });
      return data;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const register = async (email, password, name) => {
    try {
      console.log('Registering with:', { email, name, url: `${API_BASE_URL}/api/${API_VERSION}/auth/register` });
      
      const response = await fetch(`${API_BASE_URL}/api/${API_VERSION}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, name }),
      });

      console.log('Response status:', response.status);

      // Check if response has content
      const text = await response.text();
      console.log('Response text:', text);
      
      if (!text) {
        throw new Error('Server returned empty response. Check if backend is running and CORS is configured.');
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error(`Invalid server response: ${text.substring(0, 100)}`);
      }

      if (!response.ok) {
        // Use message from API response, or code if message not available
        const errorMsg = data.message || data.error || data.code || 'Registration failed';
        throw new Error(errorMsg);
      }

      await saveAuth(data.user, { accessToken: data.accessToken, refreshToken: data.refreshToken });
      return data;
    } catch (error) {
      console.error('Registration error:', error);
      // If it's a network error, provide more helpful message
      if (error.message === 'Failed to fetch' || error.message.includes('NetworkError')) {
        throw new Error('Cannot connect to server. Check if backend is running and CORS is configured.');
      }
      throw error;
    }
  };

  const loginWithGoogle = async (googleToken) => {
    try {
      // Backend contract: POST /api/v1/auth/social/{provider} with
      // { provider, token } (both required), returning a TokenResponse.
      const response = await fetch(`${API_BASE_URL}/api/${API_VERSION}/auth/social/google`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ provider: 'google', token: googleToken }),
      });

      // Parse defensively: an empty body would otherwise throw
      // "Unexpected end of JSON input" on response.json().
      const text = await response.text();
      let data = {};
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error(`Invalid server response: ${text.substring(0, 100)}`);
        }
      }

      if (!response.ok) {
        throw new Error(data.message || data.error || `Google login failed (${response.status})`);
      }

      await saveAuth(data.user, { accessToken: data.accessToken, refreshToken: data.refreshToken });
      return data;
    } catch (error) {
      console.error('Google login error:', error);
      throw error;
    }
  };

  const loginWithApple = async (identityToken, authorizationCode) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/${API_VERSION}/auth/apple`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ identityToken, authorizationCode }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Apple login failed');
      }

      const data = await response.json();
      await saveAuth(data.user, { accessToken: data.accessToken, refreshToken: data.refreshToken });
      return data;
    } catch (error) {
      console.error('Apple login error:', error);
      throw error;
    }
  };

  const loginWithFacebook = async (accessTokenFb) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/${API_VERSION}/auth/facebook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ accessToken: accessTokenFb }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Facebook login failed');
      }

      const data = await response.json();
      await saveAuth(data.user, { accessToken: data.accessToken, refreshToken: data.refreshToken });
      return data;
    } catch (error) {
      console.error('Facebook login error:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      // Call logout endpoint if needed
      if (refreshToken) {
        await fetch(`${API_BASE_URL}/api/${API_VERSION}/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ refreshToken }),
        }).catch(() => {}); // Ignore errors on logout
      }
    } finally {
      // Stop background sync, clear the Hub API client's tokens, and wipe the
      // local offline store so no journal data bleeds into the next session.
      await teardownLocalData();
      await ApiClient.clearTokens().catch(() => {});
      // Clear local storage
      await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
      setUser(null);
      setAccessToken(null);
      setRefreshToken(null);
      setIsAuthenticated(false);
    }
  };

  const refreshAccessToken = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/${API_VERSION}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        // Refresh token invalid, logout
        await logout();
        return null;
      }

      const data = await response.json();
      await saveAuth(user, { accessToken: data.accessToken, refreshToken: data.refreshToken || refreshToken });
      return data.accessToken;
    } catch (error) {
      console.error('Token refresh error:', error);
      await logout();
      return null;
    }
  };

  const value = {
    user,
    accessToken,
    isLoading,
    isAuthenticated,
    login,
    register,
    loginWithGoogle,
    loginWithApple,
    loginWithFacebook,
    logout,
    refreshAccessToken,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
