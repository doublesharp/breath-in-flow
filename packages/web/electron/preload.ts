import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Platform info
  platform: process.platform,
  isElectron: true,

  // Window controls (for custom titlebar if needed)
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  // App info
  getVersion: () => ipcRenderer.invoke('get-app-version'),

  // Notifications (using system notifications)
  showNotification: (title: string, body: string) => {
    ipcRenderer.send('show-notification', { title, body });
  },

  // File system operations (if needed later)
  // exportData: (data: string) => ipcRenderer.invoke('export-data', data),
  // importData: () => ipcRenderer.invoke('import-data'),
});

// Type definition for the exposed API
declare global {
  interface Window {
    electronAPI?: {
      platform: string;
      isElectron: boolean;
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      getVersion: () => Promise<string>;
      showNotification: (title: string, body: string) => void;
    };
  }
}
