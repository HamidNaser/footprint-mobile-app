# Testing FootPrint on a phone

How to get the app onto an iPhone and see whether it works.

Written for somebody who has never done it. Every command is meant to be copied
exactly. If something does not match what you see on screen, stop and say so —
do not guess, because two of the three ways below will silently lie to you if
used for the wrong job.

For shipping to the App Store, see [RELEASING.md](RELEASING.md). This is about
testing before you get there.

---

## The three ways to run the app

There are three, they are genuinely different, and **picking the wrong one is how
bugs reach users**.

| | Expo Go | Preview build | TestFlight |
| --- | --- | --- | --- |
| What it is | A container app that loads your JavaScript | A real app, signed for **your** phone | A real app, from Apple |
| Speed | Instant | ~4 minutes | ~4 min + 5–15 min at Apple |
| Cost | Free | $2 | $2 |
| Who can install | You, on your wifi | Only phones you have registered | Anyone you invite by email |
| Apple review | No | No | Yes, for outside testers |
| Updating it | Save a file | Delete the app, reinstall | Installs over the top |
| Keeps your data | Yes | **No** — deleting wipes it | Yes |

### Which one to use

- **Changed only JavaScript?** → **Expo Go**. Free and instant.
- **Changed `package.json` or `app.json`?** → **Preview build**. Always.
- **Someone else needs to try it?** → **TestFlight**.

**The rule worth memorising:**

> Expo Go carries its own copy of the native code. It can make your app work
> using something your app never actually included — and then the real build
> ships without it and breaks.

That is not hypothetical. It happened on 10 September 2026: audio recording
worked perfectly in Expo Go for days because Expo Go happened to include
`expo-asset`, which this app needed and had never declared. A real build would
have shipped with audio broken. `npx expo-doctor` caught it; Expo Go never could.

---

## A. Expo Go — for everyday work

Use this for anything that is only JavaScript: screens, layout, logic, text.

### One-time setup

- Install **Expo Go** from the App Store on your iPhone.
- Make sure the **phone and the computer are on the same wifi**. This will not
  work across different networks.

### Every time

1. Open a terminal on the computer:

   ```powershell
   cd C:\Aqrava\footprint-mobile-app
   npx expo start
   ```

2. Wait for a **QR code** to appear in the terminal.

3. On the iPhone, open the **Camera** app and point it at the QR code. Tap the
   notification that appears. (Or open Expo Go and use the link shown in the
   terminal.)

4. The app loads. **Edit a file, save it, and the phone updates by itself** —
   you do not rebuild anything.

### If it does not connect

- **Nothing appears under "Development servers"** → the phone and computer are on
  different wifi. Check both.
- **"Project is incompatible with this version of Expo Go"** → Expo Go on the
  phone is for a different SDK than the project. Update Expo Go from the App
  Store.
- **Port 8081 is already in use** → a Metro server is already running. Either use
  that one, or close it and start again.

---

## B. Preview build — a real app, on your phone

Use this whenever native code could be involved. It is the only honest test.

**Everything below has already been set up once and does not need repeating:**
the iPhone is registered, the ad-hoc provisioning profile exists, and Developer
Mode is on. This section is only the part you repeat.

### ⚠️ Before you start: protect your entries

Installing a preview build **requires deleting the app that is already there**,
and deleting an app **deletes everything it stored on the phone**. Entries that
have reached the server are safe. Entries that have not are gone for good.

So, **in the app that is currently installed**:

1. Open the **journal** screen.
2. Look at the sync indicator.
   - **"Synced"** → safe to continue.
   - **"N pending"** or **"N not sent"** → go to **Settings → Sync Now** and wait
     for it to say Synced.
3. If it will not clear, **sign out and sign back in**, then try again. That
   fixes a stuck sync more reliably than anything else.
4. Only then delete the app.

### Making the build

1. Go to the repository on GitHub → **Actions** tab.
2. Choose **Release** in the left-hand list.
3. Press **Run workflow** (top right) and set:
   - **Branch** — the branch you want to test
   - **platform** — `ios`
   - **profile** — `preview`
   - **submit** — `false`
4. Press the green **Run workflow** button.
5. **It will pause and wait for you to approve it.** Open the run and press
   **Review deployments → Approve**. It will not start until you do.
6. Wait about **4 minutes**.

### Installing it

1. Open the finished run and click the **Summary** tab.
2. There is a section headed **Install it** with a link.
3. **Open that link on the iPhone** — not on the computer. Message it to
   yourself, or scan it.
4. Press **Install** on that page.
5. Delete the old FootPrint first if you have not already:
   press and hold its icon → **Remove App** → **Delete App**.
6. Open FootPrint and sign in. Everything that had synced comes back.

### If something goes wrong

- **"FootPrint is already installed. To install this app, delete FootPrint…"** →
  exactly what it says. The old app is signed differently, so iOS will not
  replace it. Delete it and install again.
- **"Developer Mode required"** → **Settings → Privacy & Security → Developer
  Mode** → turn on → restart the phone → confirm after unlocking. One-time.
- **The build fails before it reaches "Build"** → the problem is the tooling, not
  your code. Open the failed step and read the last few lines.

---

## C. TestFlight — for other people

Use this when someone who is not you needs to try it, or when a build is a
genuine release candidate.

1. **Actions → Release → Run workflow**:
   - **platform** — `ios`
   - **profile** — `production`
   - **submit** — `true`
2. Approve it when it pauses.
3. Wait ~4 minutes to build, then **5–15 minutes** while Apple processes it.
4. It appears in
   [TestFlight](https://appstoreconnect.apple.com/apps/6796826616/testflight/ios).

Testers install the **TestFlight** app from the App Store and accept your email
invitation. Updates install over the top — they do not delete anything, and
their data survives.

**Every build looks like `1.0.0` in TestFlight.** The *build number* is what
tells them apart, and the run's Summary says which one to look for.

---

## D. Debugging with Expo Go

Expo Go is the best debugging tool here, because the phone prints everything it
is doing to the terminal on the computer.

### Seeing what the app is doing

1. Start the server and connect the phone as in section A.
2. **Leave the terminal visible.** Everything the app logs appears there:

   ```text
   LOG  [JournalScreen] Entry saved successfully
   LOG  [MediaApi] Upload complete: {...}
   LOG  [SyncEngine] Sync completed {"errors": 0, "pushed": 1}
   ERROR  [Error: ...]
   ```

3. Reproduce the problem on the phone, then read the **last few lines** in the
   terminal. That is almost always where the answer is.

### Reading an error

Errors come in two places and they are not equally useful:

- **The red box on the phone** — tells you *something* broke.
- **The terminal** — tells you *what and where*. Always prefer this one.

A worked example, from a real bug on 10 September 2026:

```text
LOG  [FileService] Saving file: .../recording-232E86FF.m4a
LOG  [JournalRepositoryClass] createEntry {"date": "2026-09-08", ...}
LOG  [JournalScreen] Entry saved successfully          ← it worked
ERROR  FunctionCallException: Calling the 'get' function has failed
LOG  [MediaApi] Upload complete  ×4                    ← still working
LOG  [SyncEngine] Sync completed {"errors": 0}         ← finished fine
```

The red error looked fatal. The lines around it show the recording **was**
saved, the media **did** upload, and the sync **did** finish with zero errors.
The error was noise from a component being torn down.

**Read what happened before and after the error, not just the error.**

### The most useful thing to check

If something "does not work", first find out whether the request ever left the
phone:

- **`[SyncEngine] Sync completed {"errors": 0, "pushed": N}`** → it worked.
- **`Request failed with status 400`** → the server rejected it. The app sent
  something wrong.
- **`401`** → a token problem. Sign out and back in.
- **`502`, `503`, `504`** → the server is down. Not your app. Wait, or ask.
- **Nothing at all** → the app never tried. Look for an error before that point.

### Other tools

- **Shake the phone** → the developer menu. **Reload** restarts the app.
- **`npx expo-doctor`** → checks the project for problems Expo Go hides.
  **Run it before every preview build.** It is what found the `expo-asset` bug.

  Two of its checks matter differently:

  - **"required peer dependencies are installed"** — take this seriously. A
    missing peer dependency is the exact bug Expo Go conceals, because Expo Go
    supplies it and a real build does not.
  - **"packages match versions required by the SDK"** — usually just patch drift.
    Expo publishes patches constantly, so this starts failing on its own without
    anything changing here. Worth tidying between pieces of work with
    `npx expo install --fix`; not worth doing the day you have a build you have
    verified, because updating seventeen packages throws that verification away.
- **`npx jest`** → runs the tests. Faster than any of this when the bug is in
  logic rather than in the app.

### What Expo Go cannot tell you

Do not trust Expo Go for any of these — it will appear to work and the real
build will not:

- A native module that is installed but not declared in `package.json`
- Anything in `app.json` — permissions, plugins, icons, the splash screen
- Camera, microphone or photo-library permission prompts
- Anything that behaves differently outside a container app

**For all of those: make a preview build.** $2 and four minutes, and it tells
you the truth.

---

## Quick reference

```text
Everyday JavaScript work
  npx expo start                    → scan QR with Camera → edit and save

Changed package.json or app.json
  npx expo-doctor                   → peer dependencies must pass
  Actions → Release → ios / preview / submit:false
  Summary tab → Install it → open link on the phone

Someone else needs it
  Actions → Release → ios / production / submit:true
  Appears in TestFlight after ~20 minutes

Something is broken
  npx expo start                    → watch the terminal, not the phone
  Look for: errors: 0  ·  status 400/401  ·  502/503  ·  nothing at all
```
