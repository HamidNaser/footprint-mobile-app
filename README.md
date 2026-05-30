# FootPrint Mobile App - Deployment Guide

This guide covers the setup, testing, and deployment process for the FootPrint React Native (Expo) mobile application.

---

## Table of Contents

1. [Current Status](#current-status)
2. [What Has Been Done](#what-has-been-done)
3. [Project Structure](#project-structure)
4. [Development Setup](#development-setup)
5. [Testing on Devices](#testing-on-devices)
6. [What's Left To Do](#whats-left-to-do)
7. [Deployment Process](#deployment-process)
8. [CI/CD Pipeline](#cicd-pipeline)
9. [App Store Submission](#app-store-submission)
10. [Troubleshooting](#troubleshooting)
11. [Cost Summary](#cost-summary)

---

## Current Status

| Item | Status | Notes |
|------|--------|-------|
| Project Setup | ✅ Done | Expo SDK 54, React Navigation |
| Navigation | ✅ Done | Bottom tabs with 5 screens |
| Screen Placeholders | ✅ Done | Home, Journal, Family, Friends, Profile |
| EAS Configuration | ✅ Done | eas.json configured |
| GitHub Actions | ✅ Done | Workflow ready (needs secrets) |
| **Authentication** | | |
| Email/Password Login | ✅ Done | Registration and login working |
| Google Sign-In (Web) | ✅ Done | Working on localhost:8081 |
| Google Sign-In (iOS) | ✅ Done | Client ID configured |
| Google Sign-In (Android) | ⏳ Pending | Needs client ID and SHA-1 |
| Apple Sign-In | ⏳ Pending | Placeholder only |
| Facebook Sign-In | ⏳ Pending | Placeholder only |
| **Other** | | |
| App Icons/Splash | ⏳ Pending | Using default Expo assets |
| Screen Implementation | ⏳ Pending | Placeholder content only |
| Developer Accounts | ⏳ Pending | Need Apple & Google accounts |
| Testing | ⏳ Pending | Ready when app is complete |
| Store Submission | ⏳ Pending | After testing phase |

---

## What Has Been Done

### 1. Authentication System

The app has a complete authentication system with the following features:

#### Email/Password Authentication
- User registration with name, email, password
- User login with email and password
- Secure token storage using AsyncStorage
- Auto-login on app restart

#### Google Sign-In ✅
- Implemented using `expo-auth-session`
- Works on Web (localhost:8081), iOS, and Android
- Configured client IDs in `src/config/oauth.config.js`

**Google OAuth Client IDs:**
| Platform | Status | Client ID |
|----------|--------|-----------|
| Web/Expo Go | ✅ Configured | `895398829822-ne770421bk555q45mta1sg97cik90amv` |
| iOS | ✅ Configured | `895398829822-gujuid48t7d2lsadve1c427f7adekjac` |
| Android | ⏳ Pending | Needs setup in Google Cloud Console |

**Setup Guide:** See [GOOGLE-OAUTH-SETUP.md](GOOGLE-OAUTH-SETUP.md) for detailed instructions.

#### Apple Sign-In (Planned)
- Placeholder implemented
- Required for App Store if using social login
- Will use `expo-apple-authentication`

#### Facebook Sign-In (Planned)
- Placeholder implemented
- Will use Facebook SDK

### 2. Project Initialization

```
footprint-mobile-app/
├── App.js                      # Main entry point
├── app.json                    # Expo configuration
├── eas.json                    # EAS Build configuration
├── package.json                # Dependencies
└── src/
    ├── config/
    │   └── oauth.config.js     # Google OAuth configuration
    ├── context/
    │   └── AuthContext.js      # Authentication state management
    ├── navigation/
    │   └── AppNavigator.js     # Bottom tab navigation
    └── screens/
        ├── HomeScreen.js       # Home tab
        ├── JournalScreen.js    # Journal tab
        ├── FamilyScreen.js     # Family tab
        ├── FriendsScreen.js    # Friends tab
        ├── LoginScreen.js      # Login/Register screen
        └── ProfileScreen.js    # Profile tab
```

### 3. Configuration Files

#### `app.json` - Configured with:
- Bundle identifier: `com.footprint.app` (iOS)
- Package name: `com.footprint.app` (Android)
- App permissions (camera, photos, location)
- Splash screen colors (FootPrint blue #2B7DE9)
- EAS project ID placeholder
- OTA updates configuration

#### `eas.json` - Build profiles:
- **development**: For local testing with Expo Go
- **preview**: Internal testing (APK for Android, Ad-hoc for iOS)
- **production**: Store submission (AAB for Android, App Store for iOS)

### 3. CI/CD Pipeline

GitHub Actions workflow (`.github/workflows/build.yml`):
- Automatic builds on push to main
- Manual trigger with platform/profile selection
- Lint and test before building
- Store submission job (for production builds)

---

## Development Setup

### Prerequisites

```powershell
# Install Node.js (v20+)
winget install OpenJS.NodeJS.LTS

# Install Expo CLI globally
npm install -g expo-cli

# Install EAS CLI globally
npm install -g eas-cli
```

### Running Locally

```powershell
cd c:\Work\mine\footprint-mobile-app

# Install dependencies
npm install

# Start development server
npx expo start
```

This shows a QR code. Scan with:
- **iOS**: Camera app → Opens in Expo Go
- **Android**: Expo Go app → Scan QR Code

### Running in Browser (Web)

```powershell
npx expo start --web
```

### Running on Simulators

```powershell
# iOS Simulator (Mac only)
npx expo start --ios

# Android Emulator (requires Android Studio)
npx expo start --android
```

---

## Testing on Devices

### Option 1: Expo Go (Quickest - No Build Required)

1. Download "Expo Go" from App Store / Play Store
2. Run `npx expo start`
3. Scan QR code with your phone
4. App loads instantly

**Limitations**: Can't use native modules not in Expo Go

### Option 2: Development Build (Full Native Access)

```powershell
# First time: Create development build
eas build --profile development --platform android
eas build --profile development --platform ios

# Install the .apk (Android) or use TestFlight (iOS)
# Then run:
npx expo start --dev-client
```

### Option 3: Preview Build (Share with Testers)

```powershell
# Build for internal distribution
eas build --profile preview --platform all
```

This creates:
- Android: APK file (direct install)
- iOS: Requires TestFlight or Ad-hoc provisioning

---

## What's Left To Do

### Before Testing Phase

- [ ] **Create app icons**
  - Icon: 1024x1024 PNG (no transparency for iOS)
  - Adaptive icon: Foreground + background layers
  - Use tool: [Expo Icon Builder](https://buildicon.netlify.app/)

- [ ] **Create splash screen**
  - Image: 1284x2778 PNG (iPhone 14 Pro Max size)
  - Keep important content in center 640x1136 safe zone

- [ ] **Implement screens**
  - Port web app features to mobile
  - Handle mobile-specific UX (gestures, etc.)

- [ ] **Add environment variables**
  - API endpoints for dev/staging/production
  - Create `.env` files

### Before Store Submission

- [ ] **Create Expo account**
  ```powershell
  eas login
  # or
  npx expo register
  ```

- [ ] **Link project to EAS**
  ```powershell
  eas init
  ```
  This generates a project ID - update `app.json`:
  ```json
  "extra": {
    "eas": {
      "projectId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
    }
  }
  ```

- [ ] **Create Apple Developer Account** ($99/year)
  - https://developer.apple.com/programs/enroll/
  - Takes 24-48 hours for approval

- [ ] **Create Google Play Developer Account** ($25 one-time)
  - https://play.google.com/console/signup
  - Instant activation

- [ ] **Configure app store credentials in `eas.json`**
  ```json
  "submit": {
    "production": {
      "ios": {
        "appleId": "your@email.com",
        "ascAppId": "1234567890",
        "appleTeamId": "ABCD1234"
      }
    }
  }
  ```

- [ ] **Create Google Service Account**
  - For automated Play Store uploads
  - Save JSON key as `google-service-account.json`
  - Add to `.gitignore`

- [ ] **Prepare store listings**
  - App name, description, keywords
  - Screenshots (6.5" iPhone, 5.5" iPhone, Android phone, tablet)
  - Privacy policy URL
  - Support URL

---

## Deployment Process

### Step 1: Login to Expo/EAS

```powershell
eas login
```

### Step 2: Configure Project (First Time Only)

```powershell
eas init
```

### Step 3: Build for Preview (Internal Testing)

```powershell
# Build for both platforms
eas build --profile preview --platform all

# Or specific platform
eas build --profile preview --platform ios
eas build --profile preview --platform android
```

### Step 4: Download and Test

- Go to https://expo.dev → Your project → Builds
- Download APK (Android) or install via TestFlight (iOS)

### Step 5: Build for Production

```powershell
eas build --profile production --platform all
```

### Step 6: Submit to Stores

```powershell
# Submit latest build
eas submit --platform ios
eas submit --platform android

# Or submit specific build
eas submit --platform ios --id BUILD_ID
```

---

## CI/CD Pipeline

### GitHub Secrets Required

Add these to GitHub repo → Settings → Secrets → Actions:

| Secret | Description | How to Get |
|--------|-------------|------------|
| `EXPO_TOKEN` | EAS authentication | https://expo.dev/accounts/[user]/settings/access-tokens |
| `APPLE_APP_SPECIFIC_PASSWORD` | For iOS submission | https://appleid.apple.com → App-Specific Passwords |

### Automatic Builds

Pushes to `main` branch automatically:
1. Run linter and tests
2. Build preview versions for iOS and Android
3. Upload to EAS servers

### Manual Production Build

1. Go to Actions tab in GitHub
2. Select "Mobile App Build" workflow
3. Click "Run workflow"
4. Select:
   - Platform: `all`, `ios`, or `android`
   - Profile: `production`
5. Click "Run workflow"

### Workflow Triggers

| Trigger | Profile | Auto-Submit |
|---------|---------|-------------|
| Push to main | preview | No |
| Manual (preview) | preview | No |
| Manual (production) | production | Optional |

---

## App Store Submission

### iOS - App Store Connect

1. **Create App in App Store Connect**
   - https://appstoreconnect.apple.com
   - My Apps → + → New App
   - Fill in bundle ID: `com.footprint.app`

2. **Configure EAS credentials**
   ```powershell
   eas credentials
   ```
   - Select iOS
   - EAS can auto-generate certificates and provisioning profiles

3. **Submit**
   ```powershell
   eas submit --platform ios --latest
   ```

4. **Review Process**
   - Takes 24-48 hours typically
   - May get rejected with feedback
   - Fix issues and resubmit

### Android - Google Play Console

1. **Create App in Play Console**
   - https://play.google.com/console
   - Create app → Fill in details

2. **Create Service Account for API access**
   - Google Cloud Console → IAM → Service Accounts
   - Create account with "Service Account User" role
   - Download JSON key → save as `google-service-account.json`
   - Add to Play Console → API access

3. **Submit**
   ```powershell
   eas submit --platform android --latest
   ```

4. **Review Process**
   - First submission: 3-7 days
   - Updates: Usually 1-3 days

---

## Over-The-Air (OTA) Updates

After initial store release, you can push JavaScript updates without going through app review:

```powershell
# Publish update to preview channel
eas update --branch preview --message "Bug fix for login screen"

# Publish update to production channel
eas update --branch production --message "Version 1.0.1 - Performance improvements"
```

**Limitations**: OTA can only update JS/assets. Native code changes require new store submission.

---

## Troubleshooting

### EAS Build Fails

```powershell
# Check build logs
eas build:list
eas build:view BUILD_ID

# Clear cache and rebuild
eas build --clear-cache --platform android
```

### iOS Certificate Issues

```powershell
# Reset all credentials
eas credentials --platform ios
# Select "Remove" for existing credentials
# Then rebuild - EAS will generate new ones
```

### Android Keystore Issues

```powershell
# View current credentials
eas credentials --platform android

# Backup keystore (important!)
eas credentials --platform android
# Select "Download credentials"
```

### App Rejected from Store

**Common iOS rejection reasons:**
- Missing privacy policy
- Incomplete metadata
- Bugs or crashes
- Guideline violations (login with Apple required if you have social login)

**Common Android rejection reasons:**
- Missing privacy policy
- Deceptive behavior
- Policy violations
- Target API level too low

---

## Cost Summary

### One-Time Costs

| Item | Cost |
|------|------|
| Google Play Developer | $25 |
| Apple Developer (first year) | $99 |
| **Total** | **$124** |

### Recurring Costs

| Item | Cost | Frequency |
|------|------|-----------|
| Apple Developer | $99 | Annual |
| EAS Build (free tier) | $0 | 30 builds/month |
| EAS Build (production) | $99 | Monthly (if needed) |

### Free Tier Limits (EAS)

- 30 builds per month
- 1,000 updates per month
- Sufficient for most indie projects

---

## Useful Commands Reference

```powershell
# Development
npx expo start                    # Start dev server
npx expo start --clear            # Clear cache and start
npx expo start --web              # Run in browser
npx expo start --ios              # Run on iOS simulator
npx expo start --android          # Run on Android emulator

# EAS Build
eas build --profile development   # Development build
eas build --profile preview       # Preview build (internal testing)
eas build --profile production    # Production build (store)
eas build:list                    # List recent builds
eas build:cancel                  # Cancel running build

# EAS Submit
eas submit --platform ios         # Submit to App Store
eas submit --platform android     # Submit to Google Play

# EAS Update (OTA)
eas update --branch preview       # Push JS update to preview
eas update --branch production    # Push JS update to production

# Credentials
eas credentials                   # Manage signing credentials
eas credentials --platform ios    # iOS certificates & profiles
eas credentials --platform android # Android keystore

# Project
eas init                          # Initialize EAS for project
eas whoami                        # Check logged in user
eas logout                        # Logout
```

---

## Resources

- [Expo Documentation](https://docs.expo.dev)
- [EAS Build Documentation](https://docs.expo.dev/build/introduction/)
- [EAS Submit Documentation](https://docs.expo.dev/submit/introduction/)
- [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Google Play Policies](https://play.google.com/console/about/guides/releasewithconfidence/)
- [React Navigation](https://reactnavigation.org/docs/getting-started)
