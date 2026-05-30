/**
 * OAuth Configuration for FootPrint Mobile App
 * 
 * To set up Google OAuth:
 * 1. Go to Google Cloud Console: https://console.cloud.google.com/
 * 2. Create a new project or select existing one
 * 3. Enable Google+ API and Google Identity Services API
 * 4. Go to Credentials > Create Credentials > OAuth 2.0 Client IDs
 * 5. Create the following client IDs:
 * 
 *    For Expo Go (development):
 *    - Application type: Web application
 *    - Authorized redirect URIs: https://auth.expo.io/@YOUR_EXPO_USERNAME/footprint-mobile-app
 * 
 *    For Android standalone:
 *    - Application type: Android
 *    - Package name: com.footprint.app
 *    - SHA-1 certificate fingerprint: (get from `expo credentials:manager`)
 * 
 *    For iOS standalone:
 *    - Application type: iOS
 *    - Bundle ID: com.footprint.app
 * 
 *    For Web (if using Expo web):
 *    - Application type: Web application
 *    - Authorized JavaScript origins: http://localhost:8081
 *    - Authorized redirect URIs: http://localhost:8081
 */

import { Platform } from 'react-native';

// Google OAuth Client IDs
// Replace these with your actual client IDs from Google Cloud Console
const GOOGLE_CLIENT_IDS = {
  // Client ID for Expo Go development (Web type OAuth client)
  expoClientId: '895398829822-ne770421bk555q45mta1sg97cik90amv.apps.googleusercontent.com',
  
  // Client ID for standalone iOS app
  iosClientId: '895398829822-gujuid48t7d2lsadve1c427f7adekjac.apps.googleusercontent.com',
  
  // Client ID for standalone Android app
  androidClientId: 'YOUR_ANDROID_CLIENT_ID.apps.googleusercontent.com',
  
  // Client ID for web (Expo web)
  webClientId: '895398829822-ne770421bk555q45mta1sg97cik90amv.apps.googleusercontent.com',
};

// Check if OAuth is properly configured
export const isGoogleOAuthConfigured = () => {
  const clientId = getGoogleClientId();
  return clientId && !clientId.startsWith('YOUR_');
};

// Get the appropriate client ID based on platform
export const getGoogleClientId = () => {
  if (Platform.OS === 'ios') {
    return GOOGLE_CLIENT_IDS.iosClientId;
  } else if (Platform.OS === 'android') {
    return GOOGLE_CLIENT_IDS.androidClientId;
  } else if (Platform.OS === 'web') {
    return GOOGLE_CLIENT_IDS.webClientId;
  }
  // For Expo Go, use the expo client ID
  return GOOGLE_CLIENT_IDS.expoClientId;
};

// Export all client IDs for expo-auth-session
export const googleAuthConfig = {
  expoClientId: GOOGLE_CLIENT_IDS.expoClientId,
  iosClientId: GOOGLE_CLIENT_IDS.iosClientId,
  androidClientId: GOOGLE_CLIENT_IDS.androidClientId,
  webClientId: GOOGLE_CLIENT_IDS.webClientId,
};

// Google OAuth scopes
export const GOOGLE_SCOPES = ['openid', 'profile', 'email'];

// App scheme for OAuth redirect
export const APP_SCHEME = 'footprint';

export default {
  google: googleAuthConfig,
  isGoogleOAuthConfigured,
  getGoogleClientId,
  scopes: GOOGLE_SCOPES,
  scheme: APP_SCHEME,
};
