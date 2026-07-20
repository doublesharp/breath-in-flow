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
  plugins: {
    // SplashScreen configuration
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#0f172a',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    // Status bar configuration (optional)
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0f172a',
    },
    // Keyboard configuration (optional)
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
  ios: {
    // iOS specific settings
    contentInset: 'automatic',
    scheme: 'Breath in Flow',
    backgroundColor: '#0f172a',
  },
  android: {
    // Android specific settings
    backgroundColor: '#0f172a',
    allowMixedContent: false,
  },
};

export default config;
