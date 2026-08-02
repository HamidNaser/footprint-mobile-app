// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// NOTE: Do NOT push 'web.js' & friends onto config.resolver.sourceExts.
//
// sourceExts is platform-agnostic. Metro resolves a module by trying, for every
// extension in that list, `name.<platform>.<ext>` then `name.native.<ext>` then
// `name.<ext>`. Putting 'web.js' first therefore makes an iOS build resolve
// `foo.web.js` before `foo.js` -- so the native app silently bundles the web
// implementation of every module that ships one.
//
// That is what broke iOS builds 1-12: @react-native-community/netinfo's
// nativeInterface.web.js calls `new NativeEventEmitter()` at module scope with
// no argument, tripping an iOS-only invariant during module load, before React
// mounts. Result: a blank white screen with no catchable error. It also meant
// src/database/index.web.js, the camera, media picker, audio recorder and map
// components all ran their web versions on device.
//
// Metro already resolves `.web.js` correctly for the web bundle via normal
// platform resolution (platform === 'web' tries `foo.web.js` first). No custom
// sourceExts ordering is needed, and adding it breaks native.

module.exports = config;
