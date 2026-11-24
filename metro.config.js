const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// expo-sqlite ships a WebAssembly build that is used when the app runs in a browser.
config.resolver.assetExts.push('wasm');
// The offline dictionary (assets/dict/krdict.db) is bundled as a file.
config.resolver.assetExts.push('db');
// Web build: the same dictionary, gzip-compressed (made by scripts/gzip-dict.mjs).
config.resolver.assetExts.push('gz');

module.exports = config;
