import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Device } from '@capacitor/device';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

// User-initiated support only: this module reads no stored practice/HRV data. A
// support message is assembled purely from App/Device info plus a static prompt,
// so it can never leak sessions, measurements, check-ins, or camera data.
const SUPPORT_EMAIL = 'hello@breathinflow.app';
const SUPPORT_TITLE = 'Breath in Flow feedback';

export type SupportSendMethod = 'share' | 'email' | 'clipboard';

export interface SupportSendResult {
  method: SupportSendMethod;
  message: string;
}

export type BackupShareMethod = 'share' | 'download';

export interface BackupShareResult {
  method: BackupShareMethod;
}

// Gathers device/app context lazily, only when invoked (never on import/mount).
// Each native call is tolerated independently so a missing plugin still yields a
// usable message rather than throwing.
export async function createSupportMessage(): Promise<string> {
  const lines: string[] = [];
  const [appResult, deviceResult] = await Promise.allSettled([App.getInfo(), Device.getInfo()]);

  if (appResult.status === 'fulfilled') {
    const app = appResult.value;
    lines.push(`App: ${app.name} ${app.version} (${app.build})`);
  }
  if (deviceResult.status === 'fulfilled') {
    const device = deviceResult.value;
    lines.push(`Platform: ${device.platform}`);
    lines.push(`OS: ${device.operatingSystem} ${device.osVersion}`);
    lines.push(`Device: ${device.model}`);
  }

  lines.push('', 'Feedback:');
  return lines.join('\n');
}

// Fallback order: Capacitor Share sheet -> encoded mailto -> clipboard. Returns
// which channel actually opened so the UI can tell the user what happened.
export async function sendSupportMessage(): Promise<SupportSendResult> {
  const message = await createSupportMessage();

  try {
    await Share.share({ title: SUPPORT_TITLE, text: message, dialogTitle: SUPPORT_TITLE });
    return { method: 'share', message };
  } catch {
    // Share unavailable or dismissed — try email next.
  }

  try {
    const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
      SUPPORT_TITLE
    )}&body=${encodeURIComponent(message)}`;
    window.open(mailto, '_self');
    return { method: 'email', message };
  } catch {
    // No mail handler — fall back to copying the message.
  }

  await navigator.clipboard.writeText(message);
  return { method: 'clipboard', message };
}

async function shareBackupFileNative(json: string, filename: string): Promise<BackupShareResult> {
  const { uri } = await Filesystem.writeFile({
    path: filename,
    data: json,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  });

  try {
    await Share.share({ title: SUPPORT_TITLE, url: uri, dialogTitle: 'Share your backup' });
    return { method: 'share' };
  } finally {
    // Always remove the exported copy from the cache — it holds personal data and
    // must not linger whether the share succeeded, failed, or was cancelled.
    await Filesystem.deleteFile({ path: filename, directory: Directory.Cache }).catch(() => {});
  }
}

async function shareBackupFileWeb(json: string, filename: string): Promise<BackupShareResult> {
  const file = new File([json], filename, { type: 'application/json' });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };

  if (typeof nav.share === 'function' && (!nav.canShare || nav.canShare({ files: [file] }))) {
    try {
      await nav.share({ files: [file], title: SUPPORT_TITLE });
      return { method: 'share' };
    } catch {
      // Web share dismissed/unsupported — fall through to a direct download.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return { method: 'download' };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Shares a backup JSON payload. On native it round-trips through a temporary
// cache file (required by the share sheet's URI contract); on web it prefers the
// Web Share API and otherwise triggers a download.
export async function shareBackupFile(json: string, filename: string): Promise<BackupShareResult> {
  if (Capacitor.isNativePlatform()) {
    return shareBackupFileNative(json, filename);
  }
  return shareBackupFileWeb(json, filename);
}
