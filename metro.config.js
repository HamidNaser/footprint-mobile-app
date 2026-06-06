// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Ensure platform-specific extensions are properly ordered for web
// Metro should resolve .web.js before .js for web platform
const platformExtensions = config.resolver.sourceExts || [];

// Remove any existing web extensions and add them at the beginning
const cleanedExts = platformExtensions.filter(ext => !ext.startsWith('web.'));
config.resolver.sourceExts = [
  'web.js',
  'web.jsx', 
  'web.ts',
  'web.tsx',
  ...cleanedExts,
];

module.exports = config;
