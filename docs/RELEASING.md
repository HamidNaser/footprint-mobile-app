# Releasing FootPrint

How a change gets from a branch to a tester's phone, and eventually to the App Store.

## The one thing to understand first

**TestFlight and the App Store are the same binary.** A `production` build uploads
to App Store Connect, appears in TestFlight, and is later *promoted* to store
review — without rebuilding. You never build a separate "App Store version." If
you did, you would ship something nobody tested.

So there is one release action (build → TestFlight) and one promotion gate
(TestFlight → store review).

---

## One-time setup

These must be done once before the automated release works. Until then, releases
work only from a machine that has the signing key on disk.

### 1. Upload the App Store Connect API key to EAS

The distribution certificate and provisioning profile already live on EAS
servers. The ASC API key (`AuthKey_687TV37PM6.p8`) does **not** — it exists only
on one local disk, which makes it both a CI blocker and a single point of loss.

```bash
eas credentials --platform ios
# -> production -> App Store Connect API Key -> upload the .p8
```

`eas.json` no longer references `ascApiKeyPath`, so `eas submit` will use the
EAS-hosted key once uploaded. After that, keep a copy of the `.p8` somewhere
durable (password manager) and it no longer needs to sit in the repo folder.

### 2. Initialize remote build numbers

`appVersionSource` is now `remote`: EAS tracks `buildNumber` server-side and
increments it per build. Local `app.json` values are ignored.

Apple permanently rejects duplicate build numbers, and build **14** is already
uploaded. Seed the remote counter above it:

```bash
eas build:version:set --platform ios     # set to 14 (next build becomes 15)
```

Verify with `eas build:version:get --platform ios` before the first CI release.
Once confirmed, `ios.buildNumber` / `android.versionCode` can be deleted from
`app.json` — they are dead config under remote versioning. (Left in place for
now to avoid conflicting with in-flight branches.)

### 3. Create the `production` GitHub Environment

`Settings -> Environments -> New environment -> production`, then enable
**Required reviewers** and add yourself.

This is what makes the release button an approved, auditable action rather than
an anonymous one. It also means a misclick pauses for confirmation instead of
uploading to Apple.

### 4. Confirm the `EXPO_TOKEN` secret

`Settings -> Secrets and variables -> Actions`. It should already exist from the
previous workflow. It is the only secret CI needs.

---

## Shipping to TestFlight

**Actions -> Release -> Run workflow.**

| Input | Use |
|---|---|
| `platform` | `ios` (Android is not submit-ready — see Known gaps) |
| `profile` | `production` for TestFlight/App Store; `preview` for ad-hoc internal builds |
| `submit` | `true` to upload to App Store Connect after building |

Approve the environment prompt. Build takes ~15–30 min, Apple processes the
upload for another 5–15 min, then it appears in
[TestFlight](https://appstoreconnect.apple.com/apps/6796826616/testflight/ios).

Releases are **manual by design**. Merging to `main` runs CI only — it never
builds and never ships.

### Running it locally instead

Equivalent, and useful when CI is unavailable:

```bash
eas build --platform ios --profile production --auto-submit
```

Requires `git` on PATH (see Known gaps).

---

## Promoting to the App Store

**This step is deliberately not automated.**

`eas submit` uploads a build to App Store Connect; it does **not** submit it for
review. That final step happens in App Store Connect (or via fastlane / the ASC
API, if it ever becomes worth automating).

Keeping it manual is a choice, not a limitation. Releasing publicly is a business
decision tangled up with timing and marketing, and it is effectively
irreversible. It deserves a human pause.

1. Confirm the TestFlight build is genuinely tested.
2. App Store Connect -> your app -> **+ Version or Platform**, enter the
   marketing version (e.g. `1.0.1`).
3. Select **the already-tested build** from TestFlight. Do not rebuild.
4. Fill in what's new, screenshots, review notes.
5. Submit for review. Consider **phased release** for a gradual rollout.

### Marketing versions

`version` in `app.json` (e.g. `1.0.0`) is the user-visible version and stays
under manual control — bump it in its own commit when starting a new release
cycle. Only `buildNumber` is machine-managed.

---

## Known gaps

Tracked honestly so they are not mistaken for working features.

- **CI quality gates are hollow.** `npm run lint --if-present` is a no-op —
  eslint is not installed and there is no `lint` script, so the step passes
  having checked nothing. The jest suite is minimal. Both should be real before
  public launch.
- **No crash reporting.** There is no Sentry (or equivalent). Once real users
  exist, a production crash is invisible. This is the highest-value gap to close
  before launch.
- **Android submission is not configured.** `eas.json` points at
  `./google-service-account.json`, which does not exist. Android builds work;
  Android *submission* will fail until a Play service account is created.
- **`expo-updates` is installed but disabled**, from the SDK 54 TestFlight crash
  fix (`b04b8ee`). OTA updates for JS-only hotfixes are valuable but should be
  re-enabled deliberately, with a staged rollout — not casually.
- **`git` is not installed system-wide on the primary dev machine.** It exists
  only inside GitHub Desktop (`%LOCALAPPDATA%\GitHubDesktop\app-<version>\...`),
  and that path changes on every GitHub Desktop update. `eas build` fails without
  git on PATH. Fix with `winget install Git.Git`.
