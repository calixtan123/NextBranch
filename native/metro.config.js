const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const config = getDefaultConfig(__dirname);
config.watchFolders.push(path.resolve(__dirname, '../src/lib'), path.resolve(__dirname, '../data/tfl-station-platform-inventory'));
// Allow shared modules to fall back to the native runtime's Zod installation.
config.resolver.extraNodeModules = { ...config.resolver.extraNodeModules, zod: path.resolve(__dirname, 'node_modules/zod') };

module.exports = config;
