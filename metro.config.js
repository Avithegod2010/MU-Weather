// Metro config: force audio asset extensions into the resolver.
// SDK 57's bundled Metro reported "Unable to resolve module .../alarm-dawn.wav"
// on EAS's eager-bundle phase even though @expo/metro-config's defaults list
// wav — pushing it explicitly makes the resolution deterministic everywhere.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const AUDIO_EXTS = ['wav', 'mp3', 'aac', 'm4a', 'ogg'];
config.resolver.assetExts = [...new Set([...config.resolver.assetExts, ...AUDIO_EXTS])];

module.exports = config;
