import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.breathinflow.app',
  appName: 'Breath in Flow',
  webDir: 'dist',
  server: {
    // For development with live reload
    // url: 'http://localhost:3003',
    // cleartext: true,
    androidScheme: 'https',
  },
  ios: {
    // iOS specific settings
    contentInset: 'automatic',
    backgroundColor: '#0f172a',
  },
  android: {
    // Android specific settings
    backgroundColor: '#0f172a',
    allowMixedContent: false,
  },
};

export default config;
