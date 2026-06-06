# FootPrint Mobile App - Deployment Guide

> **Last Updated:** June 4, 2026

This document covers **building, testing, and deploying** the FootPrint mobile app to the App Store and Google Play.

---

## Table of Contents

1. [Development Setup](#development-setup)
2. [Testing on Devices](#testing-on-devices)
3. [Build Profiles](#build-profiles)
4. [Deployment Process](#deployment-process)
5. [CI/CD Pipeline](#cicd-pipeline)
6. [App Store Submission](#app-store-submission)
7. [Over-The-Air Updates](#over-the-air-ota-updates)
8. [Troubleshooting](#troubleshooting)
9. [Cost Summary](#cost-summary)
10. [Command Reference](#command-reference)

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

## Build Profiles

The `eas.json` file defines three build profiles:

| Profile | Purpose | Output |
|---------|---------|--------|
| **development** | Local testing with Expo Go | Debug build |
| **preview** | Internal testing | APK (Android), Ad-hoc (iOS) |
| **production** | Store submission | AAB (Android), App Store (iOS) |

```json
// eas.json
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {}
  }
}
```

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

### GitHub Actions Workflow

Location: `.github/workflows/build.yml`

**Features:**
- Automatic builds on push to main
- Manual trigger with platform/profile selection
- Lint and test before building
- Store submission job (for production builds)

### GitHub Secrets Required

Add these to GitHub repo → Settings → Secrets → Actions:

| Secret | Description | How to Get |
|--------|-------------|------------|
| `EXPO_TOKEN` | EAS authentication | https://expo.dev/accounts/[user]/settings/access-tokens |
| `APPLE_APP_SPECIFIC_PASSWORD` | For iOS submission | https://appleid.apple.com → App-Specific Passwords |

### Workflow Triggers

| Trigger | Profile | Auto-Submit |
|---------|---------|-------------|
| Push to main | preview | No |
| Manual (preview) | preview | No |
| Manual (production) | production | Optional |

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

---

## App Store Submission

### Before Submission Checklist

- [ ] **Create app icons** (1024x1024 PNG, no transparency for iOS)
- [ ] **Create splash screen** (1284x2778 PNG)
- [ ] **Create Expo account** (`eas login`)
- [ ] **Link project to EAS** (`eas init`)
- [ ] **Prepare store listings** (name, description, screenshots)
- [ ] **Create privacy policy URL**

### iOS - App Store Connect

1. **Create Apple Developer Account** ($99/year)
   - https://developer.apple.com/programs/enroll/
   - Takes 24-48 hours for approval

2. **Create App in App Store Connect**
   - https://appstoreconnect.apple.com
   - My Apps → + → New App
   - Fill in bundle ID: `com.footprint.app`

3. **Configure EAS credentials**
   ```powershell
   eas credentials
   ```
   - Select iOS
   - EAS can auto-generate certificates and provisioning profiles

4. **Submit**
   ```powershell
   eas submit --platform ios --latest
   ```

5. **Review Process**
   - Takes 24-48 hours typically
   - May get rejected with feedback
   - Fix issues and resubmit

### Android - Google Play Console

1. **Create Google Play Developer Account** ($25 one-time)
   - https://play.google.com/console/signup
   - Instant activation

2. **Create App in Play Console**
   - https://play.google.com/console
   - Create app → Fill in details

3. **Create Service Account for API access**
   - Google Cloud Console → IAM → Service Accounts
   - Create account with "Service Account User" role
   - Download JSON key → save as `google-service-account.json`
   - Add to Play Console → API access
   - **Add `google-service-account.json` to `.gitignore`**

4. **Submit**
   ```powershell
   eas submit --platform android --latest
   ```

5. **Review Process**
   - First submission: 3-7 days
   - Updates: Usually 1-3 days

### EAS Submit Configuration

Add to `eas.json`:

```json
{
  "submit": {
    "production": {
      "ios": {
        "appleId": "your@email.com",
        "ascAppId": "1234567890",
        "appleTeamId": "ABCD1234"
      }
    }
  }
}
```

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
- Guideline violations (login with Apple required if using social login)

**Common Android rejection reasons:**
- Missing privacy policy
- Deceptive behavior
- Policy violations
- Target API level too low

### Google OAuth Issues

See [GOOGLE-OAUTH-SETUP.md](GOOGLE-OAUTH-SETUP.md) for detailed troubleshooting.

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

## Command Reference

### Development

```powershell
npx expo start                    # Start dev server
npx expo start --clear            # Clear cache and start
npx expo start --web              # Run in browser
npx expo start --ios              # Run on iOS simulator
npx expo start --android          # Run on Android emulator
```

### EAS Build

```powershell
eas build --profile development   # Development build
eas build --profile preview       # Preview build (internal testing)
eas build --profile production    # Production build (store)
eas build:list                    # List recent builds
eas build:cancel                  # Cancel running build
```

### EAS Submit

```powershell
eas submit --platform ios         # Submit to App Store
eas submit --platform android     # Submit to Google Play
```

### EAS Update (OTA)

```powershell
eas update --branch preview       # Push JS update to preview
eas update --branch production    # Push JS update to production
```

### Credentials

```powershell
eas credentials                   # Manage signing credentials
eas credentials --platform ios    # iOS certificates & profiles
eas credentials --platform android # Android keystore
```

### Project

```powershell
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
