const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const defaultConfig = getDefaultConfig(__dirname);

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * `.note` is registered as an asset so assets/blank.note ships inside the plugin package
 * (it becomes the helper note; see src/features/snapPage.ts).
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    useWatchman: !process.env.CI,
    assetExts: [...defaultConfig.resolver.assetExts, 'note'],
  },
};

module.exports = mergeConfig(defaultConfig, config);
