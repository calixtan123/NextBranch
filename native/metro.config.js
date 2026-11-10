const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const config = getDefaultConfig(__dirname);
config.watchFolders.push(path.resolve(__dirname, '../src/lib/northern'));

module.exports = config;
