/**
 * app.config.js -- extends app.json with the react-native-maps Android key (research R6).
 *
 * `app.json` has no Maps key and no `react-native-maps` plugin, so a store/preview build shows
 * a blank map on Android (`JournalMapView.js` forces `PROVIDER_GOOGLE` there) until
 * `androidGoogleMapsApiKey` reaches the plugin. That key is never written to a file in this
 * repository: it is read here, at config-evaluation time, from the EAS environment variable
 * `GOOGLE_MAPS_ANDROID_API_KEY`, which a person sets as an EAS secret for preview/production
 * builds (T003) -- never committed, never read from `.env*`. With the variable unset (e.g. a
 * local `expo start`, or this file's own test), the plugin simply receives `undefined` and
 * removes the manifest meta-data instead of writing it (`react-native-maps`'s own plugin,
 * `node_modules/react-native-maps/plugin/build/android.js`) -- config evaluation still
 * succeeds, it just means a blank map, same as today.
 *
 * `config` here is Expo's own context config -- already `app.json`'s `expo` object merged with
 * defaults (see `@expo/config`'s `getConfig`) -- so spreading it and appending to its
 * `plugins` is "extending app.json", not replacing it.
 */
module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins || []),
    [
      'react-native-maps',
      {
        androidGoogleMapsApiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY,
      },
    ],
  ],
});
