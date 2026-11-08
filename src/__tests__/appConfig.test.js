/**
 * 013 T023 -- the `expo-audio` plugin entry in `app.json` (FR-007, FR-009).
 *
 * Why a test on a config file: these three options are the whole of what makes voice
 * recording work on a real build, and nothing else in the suite can notice if one of them
 * is dropped.
 *   - `enableBackgroundRecording` adds iOS's `audio` background mode and, on Android, the
 *     foreground-service permissions and the recording foreground service -- without it
 *     recording stops when the phone is locked (FR-007), and no jest test can tell.
 *   - `recordAudioAndroid` supplies Android's `RECORD_AUDIO` permission, so voice recording
 *     is offered on Android as on iPhone (FR-009).
 *   - `microphonePermission` is the sentence a person reads when the phone asks.
 *
 * The plugin was listed without options (`"expo-audio"`), which takes every default --
 * including `enableBackgroundRecording: false`. That shape still *loads*, which is exactly
 * why it needs asserting rather than eyeballing. Native behaviour itself is a device check
 * on a release build (quickstart Q-D1-Q-D3); this only proves what is asked for.
 *
 * Read from `app.json` directly, not from `expo-constants`: the file is the artefact the
 * build reads, and T067 will extend it from an `app.config.js` that spreads it.
 */

const appJson = require('../../app.json');

const pluginEntry = (plugins, name) =>
  plugins.find((entry) => entry === name || (Array.isArray(entry) && entry[0] === name));

describe('app.json: the expo-audio plugin (FR-007, FR-009)', () => {
  const plugins = appJson.expo.plugins;

  it('lists expo-audio exactly once, with options', () => {
    const matches = plugins.filter(
      (entry) => entry === 'expo-audio' || (Array.isArray(entry) && entry[0] === 'expo-audio'),
    );
    expect(matches).toHaveLength(1);
    // The options form, not the bare string that takes every default.
    expect(Array.isArray(matches[0])).toBe(true);
    expect(typeof matches[0][1]).toBe('object');
  });

  it('enables background recording, so a locked phone keeps recording (FR-007)', () => {
    const [, options] = pluginEntry(plugins, 'expo-audio');
    expect(options.enableBackgroundRecording).toBe(true);
  });

  it('asks for Android RECORD_AUDIO, so Android records as iPhone does (FR-009)', () => {
    const [, options] = pluginEntry(plugins, 'expo-audio');
    expect(options.recordAudioAndroid).toBe(true);
  });

  it('explains what the microphone is for', () => {
    const [, options] = pluginEntry(plugins, 'expo-audio');
    expect(typeof options.microphonePermission).toBe('string');
    expect(options.microphonePermission.trim().length).toBeGreaterThan(0);
  });
});
