import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AuthContext = createContext(null);

const AUTH_STORAGE_KEY = '@footprint_auth';
const AUTH_API_BASE_URL = 'http://localhost:5100'; // Auth service
const USERS_API_BASE_URL = 'http://localhost:5200'; // Users service
const API_VERSION = 'v1'; // API version

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

  const loadStoredAuth = async () => {
    try {
      const storedData = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
      if (storedData) {
        const { user: storedUser, accessToken: storedAccessToken, refreshToken: storedRefreshToken } = JSON.parse(storedData);
        setUser(storedUser);
        setAccessToken(storedAccessToken);
        setRefreshToken(storedRefreshToken);
        setIsAuthenticated(true);
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
    } catch (error) {
      console.error('Error saving auth:', error);
      throw error;
    }
  };

  const login = async (email, password) => {
    try {
      const response = await fetch(`${AUTH_API_BASE_URL}/api/${API_VERSION}/auth/login`, {
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
      console.log('Registering with:', { email, name, url: `${AUTH_API_BASE_URL}/api/${API_VERSION}/auth/register` });
      
      const response = await fetch(`${AUTH_API_BASE_URL}/api/${API_VERSION}/auth/register`, {
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

  const loginWithGoogle = async (accessToken) => {
    try {
      const response = await fetch(`${AUTH_API_BASE_URL}/api/${API_VERSION}/auth/social/google`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ provider: 'google', token: accessToken }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Google login failed');
      }

      const data = await response.json();
      await saveAuth(data.user, { accessToken: data.accessToken, refreshToken: data.refreshToken });
      return data;
    } catch (error) {
      console.error('Google login error:', error);
      throw error;
    }
  };

  const loginWithApple = async (identityToken, authorizationCode) => {
    try {
      const response = await fetch(`${AUTH_API_BASE_URL}/api/${API_VERSION}/auth/apple`, {
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
      const response = await fetch(`${AUTH_API_BASE_URL}/api/${API_VERSION}/auth/facebook`, {
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
        await fetch(`${AUTH_API_BASE_URL}/api/${API_VERSION}/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ refreshToken }),
        }).catch(() => {}); // Ignore errors on logout
      }
    } finally {
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
      const response = await fetch(`${AUTH_API_BASE_URL}/api/${API_VERSION}/auth/refresh`, {
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

  // Fetch current user profile from API
  const fetchProfile = async () => {
    try {
      const response = await fetch(`${USERS_API_BASE_URL}/api/${API_VERSION}/users/me`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Token expired, try to refresh
          const newToken = await refreshAccessToken();
          if (newToken) {
            return fetchProfile(); // Retry with new token
          }
        }
        throw new Error('Failed to fetch profile');
      }

      const data = await response.json();
      // Update local user state
      setUser(data);
      // Also update stored auth data
      const storedData = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
      if (storedData) {
        const authData = JSON.parse(storedData);
        authData.user = data;
        await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authData));
      }
      return data;
    } catch (error) {
      console.error('Fetch profile error:', error);
      throw error;
    }
  };

  // Update user profile
  const updateProfile = async (profileData) => {
    try {
      // First get the current profile to get the version (ETag)
      const currentProfile = await fetchProfile();
      
      const response = await fetch(`${USERS_API_BASE_URL}/api/${API_VERSION}/users/me`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'If-Match': `"${currentProfile.version}"`,
        },
        body: JSON.stringify(profileData),
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Token expired, try to refresh
          const newToken = await refreshAccessToken();
          if (newToken) {
            return updateProfile(profileData); // Retry with new token
          }
        }
        if (response.status === 409) {
          throw new Error('Profile was modified by another device. Please refresh and try again.');
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to update profile');
      }

      const data = await response.json();
      // Update local user state with the returned profile data
      setUser(data);
      // Also update stored auth data
      const storedData = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
      if (storedData) {
        const authData = JSON.parse(storedData);
        authData.user = data;
        await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authData));
      }
      return data;
    } catch (error) {
      console.error('Update profile error:', error);
      throw error;
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
    fetchProfile,
    updateProfile,
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
