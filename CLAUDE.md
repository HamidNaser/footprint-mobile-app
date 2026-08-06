# FootPrint Mobile App

Expo / React Native app (SDK 54). Ships to TestFlight and the App Store.

## Working style — read this first

This repo is set up for **long unattended runs**: a spec is handed over, questions
are answered up front, then work proceeds for hours without a human present.

**Ask everything up front.** Before starting implementation, ask all clarifying
questions in one batch. Once work begins, do not stop to ask — if something is
ambiguous, pick the most reasonable interpretation, **write the assumption down
in the PR description**, and keep going. A run that halts at 2am to ask a
question has wasted the night.

**Never work on `main`.** Create a branch, commit there, open a PR, and stop.
Do not merge. The PR is how the work gets reviewed — it must stand on its own:
what changed, why, what was assumed, what wasn't done.

**Verify your own work.** After changes, run the build and the test suite. A
change that hasn't been run is not finished. If verification is impossible, say
so explicitly in the PR rather than implying the work is complete.

**Report honestly.** If part of the task is blocked, finish everything else and
state plainly what was skipped and why. Never describe unverified work as tested.

## Releases are not yours to run

Building and shipping are deliberately blocked (`eas build`, `eas submit`,
`gh workflow run`). Releases go out via **Actions → Release**, approved by a
human through the `production` environment gate. See [docs/RELEASING.md](docs/RELEASING.md).

If a change needs a build to validate, say so in the PR and stop there.

## Project facts worth knowing

- **Versioning is remote.** EAS owns `buildNumber` (`appVersionSource: remote`).
  Do not add `ios.buildNumber` or `android.versionCode` back to `app.json` —
  they are ignored and EAS warns about them. `version` (marketing) is manual.
- **Native modules need a real build.** Anything touching native code cannot be
  validated locally or shipped as an OTA update.
- **Web has separate variants.** `*.web.js` files exist alongside native ones.
  Metro is configured so iOS does not resolve `.web.js` over native modules —
  do not add web extensions to `sourceExts`.
- **`AuthKey_*.p8` is a signing secret.** Never read, print, move, or commit it.
  The key also lives on EAS servers; the local file is a fallback.

## Known gaps

Do not mistake these for working features:

- **Lint is a no-op.** `npm run lint --if-present` passes because eslint is not
  installed and no `lint` script exists. CI going green proves very little.
- **The test suite is minimal.** Jest is installed; meaningful coverage is not.
- **No crash reporting.** Production crashes are currently invisible.
- **Android submission is unconfigured** — `google-service-account.json` does not exist.
