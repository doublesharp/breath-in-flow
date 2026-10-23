import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.breathinflow.app',
  appName: 'Breath in Flow',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  ios: {
    // iOS specific settings
    contentInset: 'automatic',
    backgroundColor: '#201e1a',
  },
  android: {
    // Android specific settings
    backgroundColor: '#201e1a',
    allowMixedContent: false,
  },
};

export default config;
