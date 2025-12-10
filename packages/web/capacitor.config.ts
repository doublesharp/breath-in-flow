import { AppConfig } from '@breath-in-flow/shared';
import type { CapacitorConfig } from '@capacitor/cli';


const config: CapacitorConfig = {
  appId: AppConfig.appId,
  appName: AppConfig.appName,
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
    scheme: AppConfig.appName,
    backgroundColor: '#0f172a',
  },
  android: {
    // Android specific settings
    backgroundColor: '#0f172a',
    // Allow mixed content for development
    allowMixedContent: true,
  },
};

export default config;
