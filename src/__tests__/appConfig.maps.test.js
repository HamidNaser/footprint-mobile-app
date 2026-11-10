/**
 * 013 T067 -- `app.config.js`'s `react-native-maps` plugin entry (research R6, FR-022 in part).
 *
 * Per R6, a store or preview Android build shows a **blank map** until
 * `androidGoogleMapsApiKey` reaches the `react-native-maps` config plugin
 * (`node_modules/react-native-maps/plugin/build/android.js`: it writes the
 * `com.google.android.geo.API_KEY` manifest meta-data when the prop is truthy, and removes it
 * otherwise -- so a missing/undefined key degrades to "no key", not a crash). `app.config.js`
 * supplies that prop from the EAS environment variable **`GOOGLE_MAPS_ANDROID_API_KEY`**, read
 * at config-evaluation time, never from a file.
 *
 * ⚠ **Never commit a Maps API key.** It comes only from an EAS environment variable (R6);
 * agents never read `.env*` or any secret, and the real key is created by a person (T003), not
 * here. This file exists to prove the opposite of a leak: with the variable unset, config
 * evaluation still succeeds and produces no key string anywhere, and the static `app.json`
 * never carries one either -- so a reviewer (or a future edit) cannot quietly bake one in.
 *
 * Three cases, matching the task:
 *  1. the plugin entry exists, with `androidGoogleMapsApiKey` sourced from the env var;
 *  2. with the env var unset, evaluating the config neither throws nor yields a key string;
 *  3. `app.json` itself (the static, committed file) contains no key and no reference that
 *     could resolve to one outside the env var.
 */

const fs = require('fs');
const path = require('path');

const APP_JSON_PATH = path.join(__dirname, '..', '..', 'app.json');
const APP_CONFIG_PATH = path.join(__dirname, '..', '..', 'app.config.js');

/** A real Google Maps key's own shape (`AIza` + 35 more base64url characters) -- the string a
 * leaked key would actually look like, as opposed to the env var's *name*, which legitimately
 * appears in the source. */
const LOOKS_LIKE_A_REAL_KEY = /AIza[0-9A-Za-z\-_]{35}/;

function loadAppConfig() {
  jest.resetModules();
  // eslint-disable-next-line global-require, import/no-dynamic-require
  return require(APP_CONFIG_PATH);
}

/** The base Expo would hand a dynamic config: the static `app.json`'s own `expo` object. */
function baseContextConfig() {
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const appJson = require(APP_JSON_PATH);
  return { ...appJson.expo };
}

const ORIGINAL_ENV_KEY = process.env.GOOGLE_MAPS_ANDROID_API_KEY;

afterEach(() => {
  if (ORIGINAL_ENV_KEY === undefined) {
    delete process.env.GOOGLE_MAPS_ANDROID_API_KEY;
  } else {
    process.env.GOOGLE_MAPS_ANDROID_API_KEY = ORIGINAL_ENV_KEY;
  }
});

describe('app.config.js: the react-native-maps Android key (T067, research R6)', () => {
  it("adds the react-native-maps plugin with androidGoogleMapsApiKey from process.env.GOOGLE_MAPS_ANDROID_API_KEY", () => {
    process.env.GOOGLE_MAPS_ANDROID_API_KEY = 'test-only-fake-key-value';
    const appConfig = loadAppConfig();

    expect(typeof appConfig).toBe('function');
    const result = appConfig({ config: baseContextConfig() });

    const entry = (result.plugins || []).find(
      (p) => Array.isArray(p) && p[0] === 'react-native-maps'
    );
    expect(entry).toBeDefined();
    expect(entry[1]).toEqual({ androidGoogleMapsApiKey: 'test-only-fake-key-value' });

    // The rest of app.json's own plugin list (e.g. expo-audio, T023) survives -- this extends
    // app.json, it does not replace its plugins.
    expect(result.plugins.some((p) => p === 'expo-audio' || (Array.isArray(p) && p[0] === 'expo-audio'))).toBe(true);
  });

  it('with the variable unset, config still builds and contains no key string', () => {
    delete process.env.GOOGLE_MAPS_ANDROID_API_KEY;
    const appConfig = loadAppConfig();

    let result;
    expect(() => {
      result = appConfig({ config: baseContextConfig() });
    }).not.toThrow();

    const entry = (result.plugins || []).find(
      (p) => Array.isArray(p) && p[0] === 'react-native-maps'
    );
    expect(entry).toBeDefined();
    expect(entry[1].androidGoogleMapsApiKey).toBeUndefined();

    // No key-shaped string anywhere in the evaluated config -- there is nothing to leak when
    // the variable isn't set.
    expect(JSON.stringify(result)).not.toMatch(LOOKS_LIKE_A_REAL_KEY);
  });

  it('app.json itself contains no key', () => {
    const raw = fs.readFileSync(APP_JSON_PATH, 'utf8');

    expect(raw).not.toMatch(LOOKS_LIKE_A_REAL_KEY);
    expect(raw).not.toMatch(/androidGoogleMapsApiKey/);
    // The static file never names react-native-maps either -- that plugin entry lives only in
    // app.config.js, sourced from the env var, never from app.json.
    expect(raw).not.toMatch(/react-native-maps/);
  });
});
