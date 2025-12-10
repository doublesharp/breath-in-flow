import { app, BrowserWindow, shell, screen } from 'electron';
import { join } from 'path';

// The built directory structure
//
// ├─┬ dist-electron
// │ ├─┬ main
// │ │ └── index.js    > Electron-Main
// │ └─┬ preload
// │   └── index.js    > Preload-Scripts
// ├─┬ dist
// │ └── index.html    > Electron-Renderer
//
process.env.DIST_ELECTRON = join(__dirname, '..');
process.env.DIST = join(process.env.DIST_ELECTRON, '../dist');
process.env.VITE_PUBLIC = process.env.VITE_DEV_SERVER_URL
  ? join(process.env.DIST_ELECTRON, '../public')
  : process.env.DIST;

let mainWindow: BrowserWindow | null = null;

// Here, you can also use other preload
const preload = join(__dirname, '../preload/preload.js');
const url = process.env.VITE_DEV_SERVER_URL;
const indexHtml = join(process.env.DIST, 'index.html');

async function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { height } = primaryDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    width: 450,
    height: Math.round(height * 0.67),
    minWidth: 400,
    minHeight: 600,
    title: 'Breath In Flow',
    icon: join(process.env.VITE_PUBLIC!, 'icon.png'),
    webPreferences: {
      preload,
      nodeIntegration: false,
      contextIsolation: true,
      // Enable Web Audio API for sound playback
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
    // Standard titlebar for dragging
    titleBarStyle: 'default',
    backgroundColor: '#0f172a', // slate-900
    show: false, // Show when ready to prevent flash
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Make all links open with the browser, not with the application
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    // Load the URL of the dev server if in development mode
    await mainWindow.loadURL(url!);
    // Open DevTools in development
    mainWindow.webContents.openDevTools();
  } else {
    // Load the index.html when not in development
    await mainWindow.loadFile(indexHtml);
    // Enable DevTools in production for debugging (can be removed later)
    // Open with Cmd+Option+I on macOS
  }

  // Add keyboard shortcut to toggle DevTools
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.meta && input.alt && input.key.toLowerCase() === 'i') {
      mainWindow?.webContents.toggleDevTools();
    }
  });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(createWindow);

// Quit when all windows are closed
app.on('window-all-closed', () => {
  app.quit();
  mainWindow = null;
});

// On macOS, re-create a window when dock icon is clicked
app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows();
  if (allWindows.length) {
    allWindows[0].focus();
  } else {
    createWindow();
  }
});

// Handle certificate errors in development
app.on('certificate-error', (event, _webContents, _url, _error, _certificate, callback) => {
  if (process.env.VITE_DEV_SERVER_URL) {
    event.preventDefault();
    callback(true);
  } else {
    callback(false);
  }
});
