import { contextBridge } from 'electron';

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Platform info
  platform: process.platform,
  isElectron: true,
});

// Type definition for the exposed API
declare global {
  interface Window {
    electronAPI?: {
      platform: string;
      isElectron: boolean;
    };
  }
}
