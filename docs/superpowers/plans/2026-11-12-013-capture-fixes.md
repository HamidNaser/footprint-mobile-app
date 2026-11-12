# 013 Capture Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the phone's capture screen work end to end after the 013 build and the Expo SDK 57 upgrade: the camera opens and records, captured media shows while composing, memories with voice or video upload, and four smaller fixes the owner asked for.

**Architecture:** Nine independent fixes in the existing Expo / React Native app — no new screens, no new dependencies, no backend change. Each task changes one area and carries its own jest test. Root causes were found on a real iPhone through a development build with live Metro logs (evidence in the design).

**Tech Stack:** Expo SDK 57, React Native 0.86.3, expo-camera 57, react-native-maps, jest + react-test-renderer.

**Spec:** the approved design is the table in `C:\Aqrava-planning-013-capture-fixes\docs\sskit\013-capture-fixes\manifest.md` (planning repo, branch `013-capture-fixes`). Read it first; every task below cites its row.

## Global Constraints

- Repo: `footprint-mobile-app`, worktree `C:\Aqrava\footprint-mobile-app-013-capture-fixes`, branch `013-capture-fixes` (from `origin/release/1.0`). Never `main`.
- **Before Task 1:** the worktree holds temporary `[DIAG]` edits in `App.js`, `src/api/ApiClient.js`, `src/components/capture/CaptureDock.js`, `src/components/capture/DualShutterCamera.js`, `src/screens/capture/CaptureScreen.js`. Restore those five files with `git checkout -- <the five paths>` (named one by one). Never `git reset --hard`, `git clean`, or bare `git stash` (repo CLAUDE.md / planning CLAUDE.md).
- React Native 0.86 has **no** `StyleSheet.absoluteFillObject`. Use `StyleSheet.absoluteFill` (a plain object in 0.86, safe to spread).
- The server's content-block and media `duration` is `int?` seconds (`JournalDtos.cs:120,280`, `MediaDtos.cs:16,95`). The phone must send whole seconds.
- No native-module changes: everything here must work in the existing `development-device` / preview builds.
- Tests: `npx jest <path>` for one file; `npm test` for all. Measure the full-suite baseline before Task 1 and quote counts at the end.
- Commit after each task, message prefixed with the task: `013-fix T<n>: …`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Replace the removed `absoluteFillObject` everywhere (design row 1)

**Files:**
- Modify: every file under `src/` that contains `StyleSheet.absoluteFillObject` (about 20; list them with `git grep -l "absoluteFillObject" -- src`), including `src/screens/capture/CaptureScreen.js` (`cameraOverlay`) and `src/components/capture/DualShutterCamera.js` (`preview`, `overlay`, and the comment near the voice-recording notice that names `absoluteFillObject`).
- Create: `src/__tests__/noRemovedStyleSheetApis.test.js`

**Interfaces:** Produces nothing other tasks call. Tasks 2 and 3 edit `DualShutterCamera.js` after this one.

- [ ] **Step 1: Write the failing test**

```js
// src/__tests__/noRemovedStyleSheetApis.test.js
/**
 * React Native 0.86 removed StyleSheet.absoluteFillObject. Spreading it spreads `undefined`,
 * which silently drops `position: 'absolute'`: on an iPhone the capture camera overlay laid out
 * at {y: 852, height: 0} and was invisible (013-capture-fixes, design row 1). Nothing renders
 * wrong in jest, so this guards the source instead.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..');

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else if (/\.(js|jsx|ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

it('uses no StyleSheet API that React Native 0.86 removed', () => {
  const offenders = walk(SRC)
    .filter((file) => file !== __filename)
    .filter((file) => /StyleSheet\.absoluteFillObject/.test(fs.readFileSync(file, 'utf8')))
    .map((file) => path.relative(SRC, file));
  expect(offenders).toEqual([]);
});

it('really is gone from this React Native', () => {
  const { StyleSheet } = jest.requireActual('react-native');
  expect(StyleSheet.absoluteFillObject).toBeUndefined();
  expect(StyleSheet.absoluteFill).toEqual(
    expect.objectContaining({ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }),
  );
});
```

- [ ] **Step 2: Run it — expect the first test to FAIL listing ~20 files**

Run: `npx jest src/__tests__/noRemovedStyleSheetApis.test.js`
If the second test fails because `jest.requireActual('react-native')` cannot load in this jest setup, delete that second test and say so in the task report — the first test is the guard.

- [ ] **Step 3: Replace** `StyleSheet.absoluteFillObject` with `StyleSheet.absoluteFill` in every listed file (code and comments). Mechanical: `...StyleSheet.absoluteFillObject,` → `...StyleSheet.absoluteFill,`.

- [ ] **Step 4: Run the guard and the full suite**

Run: `npx jest src/__tests__/noRemovedStyleSheetApis.test.js` → PASS. Then `npm test` → same pass/fail counts as the baseline plus the new tests.

- [ ] **Step 5: Commit** the changed files by name plus the test.

---

### Task 2: A readable camera permission screen that asks straight away (design row 2)

**Files:**
- Modify: `src/components/capture/DualShutterCamera.js` (styles block near `container`/`centred`; the permission branches near `if (!permission)` / `if (!permission.granted)`)
- Test: `src/components/capture/__tests__/DualShutterCamera.test.js`

**Interfaces:** Consumes Task 1's file state. Produces no new exports.

Root cause: the component uses `styles.checkingText`, `styles.deniedText`, `styles.primaryButton`, `styles.primaryButtonText`, `styles.secondaryButton`, `styles.secondaryButtonText`, none of which were ever defined (since `05b0e67`) — black default text on the `#000000` container. And it never asks: an `undetermined` permission shows the "can't use the camera" message until the person finds an invisible button.

- [ ] **Step 1: Write the failing tests** (use the file's existing `expo-camera` mock; the mock's permission hook state is set through its existing helpers — read the top of the test file for them):

```js
describe('permission screen (013-capture-fixes row 2)', () => {
  it('defines every style the permission screens use, in a colour readable on black', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'DualShutterCamera.js'), 'utf8');
    const used = [...new Set([...source.matchAll(/styles\.(\w+)/g)].map((m) => m[1]))];
    const defined = new Set([...source.matchAll(/^  (\w+): \{/gm)].map((m) => m[1]));
    expect(used.filter((name) => !defined.has(name))).toEqual([]);
  });

  it('asks iOS for the camera once, on first open, when the answer is not yet known', async () => {
    // permission: { granted: false, status: 'undetermined', canAskAgain: true }
    // render DualShutterCamera; flush effects
    // expect(requestPermission).toHaveBeenCalledTimes(1)
  });

  it('does not ask again once refused for good', async () => {
    // permission: { granted: false, status: 'denied', canAskAgain: false }
    // expect(requestPermission).not.toHaveBeenCalled(); the Open Settings control is shown
  });
});
```

Fill the two commented tests with the file's existing mock helpers for permission state and `requestPermission` (the mock exports them — the file already tests "a denied camera permission shows the inline message"). The assertion lines are fixed as written.

- [ ] **Step 2: Run — expect FAIL** (`npx jest src/components/capture/__tests__/DualShutterCamera.test.js`): missing styles listed; `requestPermission` not called.

- [ ] **Step 3: Implement**

Add to `StyleSheet.create({...})`:

```js
  checkingText: { color: '#FFFFFF', fontSize: 16 },
  deniedText: { color: '#FFFFFF', fontSize: 16, lineHeight: 22, textAlign: 'center', marginTop: 16, marginBottom: 24 },
  primaryButton: { backgroundColor: '#FFFFFF', borderRadius: 22, paddingVertical: 12, paddingHorizontal: 24, marginBottom: 12 },
  primaryButtonText: { color: '#000000', fontSize: 16, fontWeight: '600' },
  secondaryButton: { paddingVertical: 10, paddingHorizontal: 24 },
  secondaryButtonText: { color: '#FFFFFF', fontSize: 16 },
```

Add after the hooks, before any early return:

```js
  // Ask on first open (owner's decision, 013-capture-fixes): iOS's own prompt, once. A refusal
  // for good (`canAskAgain: false`) is never re-asked -- that is the Open Settings screen.
  const askedRef = useRef(false);
  useEffect(() => {
    if (askedRef.current) return;
    if (permission && !permission.granted && permission.canAskAgain && permission.status === 'undetermined') {
      askedRef.current = true;
      requestPermission().catch(() => {});
    }
  }, [permission, requestPermission]);
```

While the status is `undetermined`, the denied branch's message would flash before the prompt; render the "Checking camera access…" branch instead when `permission.status === 'undetermined' && permission.canAskAgain`.

- [ ] **Step 4: Run — PASS**, then the whole file.
- [ ] **Step 5: Commit.**

---

### Task 3: Start a video only once the camera is ready (design row 3)

**Files:**
- Modify: `src/components/capture/DualShutterCamera.js` (`<CameraView …>`, the recording effect that calls `recordAsync`)
- Test: `src/components/capture/__tests__/DualShutterCamera.test.js`

**Interfaces:** none new.

Root cause (device log): `recordAsync` is called in the effect the render after `mode` flips `picture → video`; iOS rejects with `CameraOutputNotReadyException: Camera is not ready yet. Wait for 'onCameraReady'`.

- [ ] **Step 1: Write the failing tests**

```js
describe('video waits for the camera (013-capture-fixes row 3)', () => {
  it('does not call recordAsync until the camera reports ready in video mode', async () => {
    // render granted; press camera-video-button
    // expect(recordAsync).not.toHaveBeenCalled()
    // act(() => preview(tree).props.onCameraReady())   // the ExpoCameraViewMock host element
    // expect(recordAsync).toHaveBeenCalledTimes(1)
  });

  it('retries a not-ready rejection rather than losing the video', async () => {
    // recordAsync.mockRejectedValueOnce(Object.assign(new Error('Camera is not ready yet'),
    //   { code: 'ERR_CAMERA_NOT_READY' }))
    // press video, fire onCameraReady, advance timers 250 ms
    // expect(recordAsync).toHaveBeenCalledTimes(2); no 'camera-capture-failed' notice
  });
});
```

Existing video tests start a recording by pressing the shutter alone; after this task each must also fire `onCameraReady` on the preview. Update them — that is the new contract, not a workaround.

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement**
  - `const [cameraReady, setCameraReady] = useState(false);` and `onCameraReady={() => setCameraReady(true)}` on `CameraView`.
  - When `isRecording` turns true (the mode flip), `setCameraReady(false)` in `beginRecording` just before `setIsRecording(true)`.
  - The recording effect's guard becomes `if (!isRecording || !cameraReady || !pendingRecordRef.current) return;` and its deps `[isRecording, cameraReady, maxVideoSeconds]`.
  - Backstop: wrap `recordAsync` in a loop that, on an error whose message contains `not ready`, waits 200 ms and tries again, at most 5 attempts; any other error, or the 5th, falls through to the existing failure path unchanged. (`onCameraReady` is not guaranteed to fire again after a mode change on every iOS version; the retry covers that.)
  - Remove nothing from the existing failure signalling.

- [ ] **Step 4: Run — PASS** (whole file).
- [ ] **Step 5: Commit.** Device check is in the final verification.

---

### Task 4: Show photos and videos while composing or editing (design row 4)

**Files:**
- Modify: `src/components/capture/PieceList.js` (`PieceRow`'s last branch, `detailFor`, styles)
- Test: `src/components/capture/__tests__/PieceList.test.js`

**Interfaces:** Consumes `DerivativeImage` (`src/components/media/DerivativeImage.js`, default export, props `media`, `style`, `resizeMode`, `testID`) and `VideoThumbnail` (`src/components/media/VideoThumbnail.js`, named export; `media` prop for a saved item, or the legacy `videoUri` + `duration` + `width` + `height` props for a local file). A piece carries either `uri` (just captured, local file) or `savedItem` (from an edit, `CaptureScreen.pieceFromMediaItem`).

- [ ] **Step 1: Write the failing tests**

```js
it('shows a new photo as the picture itself', () => {
  const tree = render([{ localId: 'p', kind: 'photo', uri: 'file:///a.jpg', capturedAt: AT }]);
  const image = tree.root.findByProps({ testID: 'piece-photo-0' });
  expect(image.props.media).toEqual({ localPath: 'file:///a.jpg' });
});

it('shows an edited photo from the item the memory already has', () => {
  const saved = { id: 'm1', thumbnailUrl: 'https://cdn/t.webp', url: 'https://cdn/a.jpg' };
  const tree = render([{ localId: 'p', kind: 'photo', savedItem: saved, capturedAt: AT }]);
  expect(tree.root.findByProps({ testID: 'piece-photo-0' }).props.media).toBe(saved);
});

it('shows a video as a thumbnail with its length', () => {
  const tree = render([{ localId: 'v', kind: 'video', uri: 'file:///v.mov', duration: 7, capturedAt: AT }]);
  expect(tree.root.findByProps({ testID: 'piece-video-0' })).toBeTruthy();
});
```

(`render` / `AT` — reuse the file's existing helpers; mock `DerivativeImage` and `VideoThumbnail` with `jest.mock` host elements the way other card tests in `src/components/journal/__tests__` do, so no media hook runs.)

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement** — in `PieceRow`, before the generic detail branch:

```jsx
) : piece.kind === 'photo' ? (
  <DerivativeImage
    testID={`piece-photo-${index}`}
    media={piece.savedItem ?? { localPath: piece.uri }}
    style={styles.media}
    resizeMode="cover"
  />
) : piece.kind === 'video' ? (
  piece.savedItem ? (
    <VideoThumbnail testID={`piece-video-${index}`} media={piece.savedItem}
      duration={piece.duration} width={MEDIA_WIDTH} height={MEDIA_HEIGHT} />
  ) : (
    <VideoThumbnail testID={`piece-video-${index}`} videoUri={piece.uri}
      duration={piece.duration} width={MEDIA_WIDTH} height={MEDIA_HEIGHT} />
  )
) : (
```

with `const MEDIA_HEIGHT = 180;`, `MEDIA_WIDTH` from `Dimensions.get('window').width - 32` (the list's 16 px padding each side), and `media: { width: '100%', height: MEDIA_HEIGHT, borderRadius: 10, marginTop: 8, backgroundColor: '#F2F2F7' }`. Keep `detailFor` for unknown kinds only. If `VideoThumbnail` does not forward `testID`, wrap it in a `View testID=…`.

- [ ] **Step 4: Run — PASS** (`PieceList.test.js`, then `src/screens/capture/__tests__/CaptureScreen.test.js`, which renders the list).
- [ ] **Step 5: Commit.**

---

### Task 5: Send whole seconds, and keep the server's reason (design row 5)

**Files:**
- Create: `src/utils/wholeSeconds.js`
- Modify: `src/api/JournalApi.js` (`_formatEntryForApi` — it serves `createEntry`, `updateEntry` and both halves of `batchSync`), `src/api/MediaApi.js` (the two `duration` fields, ~`:150` and ~`:367`), `src/api/ApiClient.js` (`_handleResponse` content-type check)
- Test: `src/utils/__tests__/wholeSeconds.test.js`, `src/api/__tests__/JournalApi.batchSync.test.js`, `src/api/__tests__/ApiClient.auth.test.js` (or a new `ApiClient.problemJson.test.js`)

**Interfaces:** Produces `wholeSeconds(value): number | null | undefined` — rounds a finite number to the nearest integer, returns `null`/`undefined` unchanged, and returns `null` for anything else.

Root cause (device log): `400 … "$.contentBlocks[1].duration": "The JSON value could not be converted"` — a voice clip's measured `4.37`; the server's `Duration` is `int?`. The app logged "server sent no body" because `_handleResponse` parses only `application/json` and the reply was `application/problem+json`.

- [ ] **Step 1: Write the failing tests**

```js
// src/utils/__tests__/wholeSeconds.test.js
import { wholeSeconds } from '../wholeSeconds';
it.each([[4.37, 4], [4.5, 5], [0.2, 0], [12, 12], [null, null], [undefined, undefined], ['7', null], [NaN, null]])(
  'wholeSeconds(%p) is %p', (input, expected) => expect(wholeSeconds(input)).toBe(expected));
```

```js
// in JournalApi.batchSync.test.js
it('sends every duration as whole seconds, on blocks and on media items', async () => {
  const entry = { localId: 'L', contentBlocks: [
    { type: 'audio', duration: 4.37, media: [] },
    { type: 'videos', media: [{ id: 'm', duration: 11.6 }] },
  ] };
  await JournalApi.batchSync({ creates: [entry] });
  const sent = /* the body the file's ApiClient mock captured */;
  expect(sent.creates[0].contentBlocks[0].duration).toBe(4);
  expect(sent.creates[0].contentBlocks[1].media[0].duration).toBe(12);
});
```

```js
// ApiClient: a problem+json 400 keeps its body
it('reads an application/problem+json error body', async () => {
  // fetch mock -> { ok: false, status: 400, headers: content-type 'application/problem+json; charset=utf-8',
  //   json: async () => ({ title: 'One or more validation errors occurred.', errors: { '$.x': ['bad'] } }) }
  // expect the thrown ApiError .data.errors to equal { '$.x': ['bad'] } and .message to contain '$.x'
});
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement**

```js
// src/utils/wholeSeconds.js
/** The server's durations are whole seconds (`int?`); a measured 4.37 is refused with a 400. */
export function wholeSeconds(value) {
  if (value === null || value === undefined) return value;
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
}
```

In `_formatEntryForApi`, map the parsed blocks once:

```js
const roundDurations = (blocks) => blocks.map((block) => ({
  ...block,
  ...(block.duration !== undefined ? { duration: wholeSeconds(block.duration) } : {}),
  ...(Array.isArray(block.media)
    ? { media: block.media.map((item) => (item && item.duration !== undefined
        ? { ...item, duration: wholeSeconds(item.duration) } : item)) }
    : {}),
}));
// contentBlocks: roundDurations(this._parseContentBlocks(entry.content_blocks || entry.contentBlocks)),
```

`MediaApi`: `duration: wholeSeconds(mediaInfo.duration)` and `duration: wholeSeconds(params.duration) ?? null`.
`ApiClient._handleResponse`: `if (contentType && /application\/([\w.+-]*\+)?json/i.test(contentType))`.
Local storage keeps the precise value — only the wire is rounded.

- [ ] **Step 4: Run — PASS** (the three files, then `src/sync` and `src/api` folders).
- [ ] **Step 5: Commit.**

Note for the PR: memories that already failed three times are not retried (`SyncQueue` caps at 3), and installing the new build means deleting the app, so the owner's test memories from 2026-11-11 will not upload. No re-arm is built — only the owner ran 013.

---

### Task 6: The recording bar spans the dock (design row 6)

**Files:**
- Modify: `src/components/capture/CaptureDock.js` (`voiceSlotRecording`)
- Test: create `src/components/capture/__tests__/CaptureDock.test.js`

Root cause: `voiceSlot` sets `width: 88`; `voiceSlotRecording` sets `width: undefined`, which in a style array does not reset it, so the bar stays 88 px wide at one side and "Stop" wraps.

- [ ] **Step 1: Failing test**

```js
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { StyleSheet, Text } from 'react-native';
import CaptureDock from '../CaptureDock';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

it('lays the recording bar across the whole dock, not in an 88 px slot', () => {
  let tree;
  act(() => { tree = renderer.create(<CaptureDock voice={<Text testID="voice" />} isRecording />); });
  const slot = tree.root.findByProps({ testID: 'voice' }).parent;
  const style = StyleSheet.flatten(slot.props.style);
  expect(style.position).toBe('absolute');
  expect(style.left).toBe(0);
  expect(style.right).toBe(0);
  expect(style.width).toBe('100%');
});
```

(Adjust `.parent` if the host tree nests differently; the assertion is on the slot `View`.)

- [ ] **Step 2: FAIL.** **Step 3:** `voiceSlotRecording: { position: 'absolute', left: 0, right: 0, bottom: DOCK_ROW_HEIGHT, width: '100%', paddingHorizontal: 12, alignItems: 'stretch' }`, and drop `marginHorizontal: 12` from `CaptureScreen`'s `recordingBar` style so the inset is not doubled. **Step 4: PASS** (+ `VoiceRecorderBar.test.js`, `CaptureScreen.test.js`). **Step 5: Commit.**

---

### Task 7: The memory map zooms (design row 7)

**Files:**
- Modify: `src/components/map/MemoryRouteMap.js` (MapView props ~`:183-186`; add zoom buttons inside `memory-route-map-frame`)
- Test: `src/components/map/__tests__/MemoryRouteMap.test.js` (replace the `zoomEnabled === false` assertion at ~`:281`)

The map sits inside the Journal's scrolling list, so one-finger drag must keep scrolling the list (the existing test's reason). Decision: **pinch to zoom on, one-finger pan off, plus `+` and `−` buttons** on the map's corner.

- [ ] **Step 1: Failing tests**

```js
it('zooms with a pinch, but leaves one-finger drags to the list', () => {
  const tree = render({ entry: { contentBlocks: [text('a', { location: BUS })] } });
  expect(map(tree).props.zoomEnabled).toBe(true);
  expect(map(tree).props.scrollEnabled).toBe(false);
});

it('zooms in and out with its buttons', () => {
  const tree = render({ entry: { contentBlocks: [text('a', { location: BUS })] } });
  const before = map(tree).props.region.latitudeDelta;
  act(() => tree.root.findByProps({ testID: 'memory-route-map-zoom-in' }).props.onPress());
  expect(map(tree).props.region.latitudeDelta).toBeCloseTo(before / 2);
  act(() => tree.root.findByProps({ testID: 'memory-route-map-zoom-out' }).props.onPress());
  act(() => tree.root.findByProps({ testID: 'memory-route-map-zoom-out' }).props.onPress());
  expect(map(tree).props.region.latitudeDelta).toBeCloseTo(before * 2);
});
```

- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement** — `const [zoom, setZoom] = useState(1);` (reset to 1 when the memory's region changes); pass `region={zoomedRegion}` where `zoomedRegion = useMemo(() => region && { ...region, latitudeDelta: region.latitudeDelta / zoom, longitudeDelta: region.longitudeDelta / zoom }, [region, zoom])`; `zoomEnabled` → `true`; two 36 px round `TouchableOpacity` buttons (`memory-route-map-zoom-in` "+", `memory-route-map-zoom-out` "−", `accessibilityLabel` "Zoom in" / "Zoom out") stacked at the frame's top-right, `zoom` clamped to `[1/8, 64]`, each press ×2 or ÷2. Same in `MemoryRouteMap.web.js` only if it renders a map (it does not — leave it).
- [ ] **Step 4: PASS.** **Step 5: Commit.**

---

### Task 8: Events leave Timeline; Home's "See all" opens Events (design row 8)

**Files:**
- Modify: `src/screens/TimelineScreen.js` (remove `ViewSwitch`, `EventsPane`, the `view` state + its `route.params.view` effect, the `useUpcomingEvents` call, `EVENTS_PANE_OPTIONS`, the `EventsList` and `useUpcomingEvents` imports, and their styles)
- Modify: `src/screens/HomeScreen.js:94` → `onPress={() => navigation.navigate('Events')}`
- Test: `src/screens/__tests__/TimelineScreen.events.test.js` (rewrite), `src/screens/__tests__/HomeScreen.comingUp.test.js`

The `Events` stack screen already exists (`AppNavigator.js:182`).

- [ ] **Step 1: Failing tests** — Timeline: renders no "Events" switch text and never calls `useUpcomingEvents` (mock it and assert `not.toHaveBeenCalled()`); Home: pressing the Coming-up card calls `navigation.navigate` with exactly `('Events')`.
- [ ] **Step 2: FAIL.** **Step 3: Implement** the removals and the one-line Home change; run `git grep -n "view: 'events'" -- src` and fix any other caller. **Step 4: PASS** (both files, `src/navigation/__tests__`, `EventsScreen.*.test.js`). **Step 5: Commit.**

---

### Task 9: The Journal bar's Camera opens the camera (design row 9)

**Files:**
- Modify: `src/screens/JournalScreen.js` (`openCapture` ~`:634`; the bar's `onCameraPress` ~`:1351`)
- Modify: `src/screens/capture/CaptureScreen.js` (read `route.params.open`; open the camera once on mount)
- Test: `src/screens/__tests__/JournalScreen.capture.test.js`, `src/screens/capture/__tests__/CaptureScreen.test.js`

- [ ] **Step 1: Failing tests** — Journal: pressing the bar's camera navigates to `('Capture', { mode: 'new', open: 'camera', … })` (audience still carried when given); Capture: mounted with `route.params.open === 'camera'` renders `capture-camera-overlay` without any tap, and only once (closing it does not reopen it on re-render).
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Implement**
  - `openCapture` gains a second argument: `const openCapture = useCallback((visibility, open) => navigation.navigate('Capture', { mode: 'new', ...(typeof visibility === 'string' ? { audience: visibility } : null), ...(open === 'camera' ? { open: 'camera' } : null) }), [navigation]);`
  - `onCameraPress={(visibility) => openCapture(visibility, 'camera')}` (keep the press-event guard: only a string visibility is passed on).
  - In `CaptureScreen`: `const openedFromParamRef = useRef(false); useEffect(() => { if (!openedFromParamRef.current && route?.params?.open === 'camera') { openedFromParamRef.current = true; openCamera(); } }, [route?.params?.open, openCamera]);`
- [ ] **Step 4: PASS.** **Step 5: Commit.**

---

## Final verification (sskit small-story step 7)

- [ ] `git grep -n "\[DIAG\]" -- .` returns nothing.
- [ ] `npm test` — full suite; quote passed/failed/total against the baseline.
- [ ] On the iPhone (development build, owner): camera opens with iOS's prompt; photo + Done shows the photo in the list; a 3-second video records and shows; Journal bar Camera opens the camera; recording bar spans the dock; map pinch and +/− zoom; Timeline has no Events; Home "See all" opens Events; a memory with a voice note **and** a video saves and the Metro log shows `pushed: 1` with no 400.
