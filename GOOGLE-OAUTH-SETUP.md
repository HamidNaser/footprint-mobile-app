# Google OAuth Setup Guide for FootPrint Mobile App

This guide explains how to set up Google Sign-In for the FootPrint mobile app.

## Current Configuration Status

| Platform | Status | Client ID |
|----------|--------|-----------|
| Web / Expo Go | ✅ Configured | `895398829822-ne770421bk555q45mta1sg97cik90amv.apps.googleusercontent.com` |
| iOS | ✅ Configured | `895398829822-gujuid48t7d2lsadve1c427f7adekjac.apps.googleusercontent.com` |
| Android | ⏳ Pending | Needs SHA-1 fingerprint |

**Last Updated:** June 2, 2026

---

## Prerequisites

- A Google Cloud account
- Access to the [Google Cloud Console](https://console.cloud.google.com/)

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Note your project ID

## Step 2: Configure OAuth Consent Screen

1. Navigate to **APIs & Services** > **OAuth consent screen**
2. Select **External** user type (unless you have a Google Workspace)
3. Fill in the required information:
   - App name: `FootPrint`
   - User support email: Your email
   - Developer contact email: Your email
4. Add scopes: `email`, `profile`, `openid`
5. Add test users if in testing mode
6. Save and continue

## Step 3: Create OAuth 2.0 Client IDs

You need to create multiple client IDs for different platforms.

### For Expo Go Development (Required)

This is a **Web application** type client ID used for development with Expo Go.

1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth 2.0 Client IDs**
3. Select **Web application**
4. Name: `FootPrint Expo Development`
5. Add **Authorized redirect URIs**:
   ```
   https://auth.expo.io/@hamid.naser/footprint-mobile-app
   ```
6. Click **Create** and copy the Client ID

**✅ Already configured:** `895398829822-ne770421bk555q45mta1sg97cik90amv.apps.googleusercontent.com`

### For iOS Standalone App

1. Create another OAuth 2.0 Client ID
2. Select **iOS**
3. Name: `FootPrint iOS`
4. Bundle ID: `com.footprint.app`
5. Click **Create** and copy the Client ID

**✅ Already configured:** `895398829822-gujuid48t7d2lsadve1c427f7adekjac.apps.googleusercontent.com`

### For Android Standalone App

1. Create another OAuth 2.0 Client ID
2. Select **Android**
3. Name: `FootPrint Android`
4. Package name: `com.footprint.app`
5. SHA-1 certificate fingerprint: 
   - For development: Run `eas credentials` to get this
   - For production: Use your release keystore fingerprint
6. Click **Create** and copy the Client ID

**⏳ Not yet configured** - Needs SHA-1 fingerprint from EAS build

### For Web (if using Expo Web)

1. Create another OAuth 2.0 Client ID
2. Select **Web application**
3. Name: `FootPrint Web`
4. Add **Authorized JavaScript origins**:
   ```
   http://localhost:8081
   http://localhost:19006
   ```
5. Add **Authorized redirect URIs**:
   ```
   http://localhost:8081
   http://localhost:19006
   ```
6. Click **Create** and copy the Client ID

**✅ Using same as Expo Go:** `895398829822-ne770421bk555q45mta1sg97cik90amv.apps.googleusercontent.com`

## Step 4: Update the Config File

Open `src/config/oauth.config.js` and replace the placeholder values with your actual client IDs.

**Current Configuration (already set up):**

```javascript
const GOOGLE_CLIENT_IDS = {
  // Client ID for Expo Go development (Web type OAuth client)
  expoClientId: '895398829822-ne770421bk555q45mta1sg97cik90amv.apps.googleusercontent.com',
  
  // Client ID for standalone iOS app
  iosClientId: '895398829822-gujuid48t7d2lsadve1c427f7adekjac.apps.googleusercontent.com',
  
  // Client ID for standalone Android app - NEEDS SETUP
  androidClientId: 'YOUR_ANDROID_CLIENT_ID.apps.googleusercontent.com',
  
  // Client ID for web (Expo web)
  webClientId: '895398829822-ne770421bk555q45mta1sg97cik90amv.apps.googleusercontent.com',
};
```

### Google Cloud Console - Authorized Redirect URIs

The Web client must have these redirect URIs configured:

| URI | Purpose | Status |
|-----|---------|--------|
| `http://localhost:8081` | Expo Web local testing | ✅ Required |
| `https://auth.expo.io/@hamid.naser/footprint-mobile-app` | Expo Go on device | ✅ Required |

## Step 5: Test the Integration

1. Start the Expo development server:
   ```bash
   npm start
   ```

2. Open the app in Expo Go on your device or emulator

3. Tap "Continue with Google" on the login screen

4. You should be redirected to Google's sign-in page

5. After signing in, you'll be redirected back to the app

## Troubleshooting

### "redirect_uri_mismatch" Error

This means the redirect URI in Google Cloud Console doesn't match what Expo is using.

- For Expo Go, ensure the redirect URI is exactly:
  ```
  https://auth.expo.io/@hamid.naser/footprint-mobile-app
  ```
- For Web testing, ensure these are in authorized origins AND redirect URIs:
  ```
  http://localhost:8081
  ```
- Check your Expo username with `expo whoami`
- The project slug must match `footprint-mobile-app` in `app.json`

### "Google Sign In is initializing" Message

This can happen if:
- The client IDs are not properly configured
- The app is still loading the OAuth configuration
- Try waiting a few seconds and tap the button again

### OAuth Not Working in Standalone Builds

For standalone builds (not Expo Go), you need:
- The correct iOS Client ID with matching Bundle ID
- The correct Android Client ID with matching package name and SHA-1 fingerprint

### Network Errors

If you see network errors during authentication:
- Ensure your device has internet connectivity
- Check if the backend server is running and accessible
- Verify the API endpoint in `AuthContext.js`

## Backend Integration

The mobile app sends the Google access token to your backend at:
```
POST /api/v1/auth/social/google
Body: { "provider": "google", "token": "<access_token>" }
```

Your backend should:
1. Verify the access token with Google
2. Extract user information (email, name, profile picture)
3. Create or update the user in your database
4. Return JWT tokens for the mobile app

## Security Notes

- Never commit your actual OAuth client IDs to version control if the repo is public
- Consider using environment variables or a secrets management solution
- The `expoClientId` is less sensitive as it's used for development only
- Standalone app client IDs should be kept secure

## References

- [Expo AuthSession Documentation](https://docs.expo.dev/versions/latest/sdk/auth-session/)
- [Google Identity Services Documentation](https://developers.google.com/identity)
- [Google Cloud Console](https://console.cloud.google.com/)
