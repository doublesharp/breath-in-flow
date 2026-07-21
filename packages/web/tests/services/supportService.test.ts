import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Every native/web capability the support service can reach is mocked so we can
// drive the full fallback matrix (share -> email -> clipboard) deterministically
// and prove the generated message never touches stored data.
const mocks = vi.hoisted(() => ({
  appGetInfo: vi.fn(),
  deviceGetInfo: vi.fn(),
  share: vi.fn(),
  isNativePlatform: vi.fn(() => false),
  writeFile: vi.fn(),
  deleteFile: vi.fn(),
}));

vi.mock('@capacitor/app', () => ({ App: { getInfo: mocks.appGetInfo } }));
vi.mock('@capacitor/device', () => ({ Device: { getInfo: mocks.deviceGetInfo } }));
vi.mock('@capacitor/share', () => ({ Share: { share: mocks.share } }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: mocks.isNativePlatform },
}));
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { writeFile: mocks.writeFile, deleteFile: mocks.deleteFile },
  Directory: { Cache: 'CACHE' },
  Encoding: { UTF8: 'utf8' },
}));

import {
  createSupportMessage,
  sendSupportMessage,
  shareBackupFile,
} from '../../src/services/supportService';

const APP_INFO = {
  name: 'Breath In Flow',
  id: 'com.breathinflow.app',
  build: '42',
  version: '1.0.0',
};
const DEVICE_INFO = {
  platform: 'ios',
  operatingSystem: 'ios',
  osVersion: '17.2',
  model: 'iPhone15,2',
};

function stubClipboard(writeText = vi.fn().mockResolvedValue(undefined)) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
  return writeText;
}

describe('supportService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isNativePlatform.mockReturnValue(false);
    mocks.appGetInfo.mockResolvedValue(APP_INFO);
    mocks.deviceGetInfo.mockResolvedValue(DEVICE_INFO);
    mocks.deleteFile.mockResolvedValue(undefined);
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createSupportMessage', () => {
    it('includes app, build, platform, OS, and model when available', async () => {
      const message = await createSupportMessage();

      expect(message).toContain('Breath In Flow');
      expect(message).toContain('1.0.0');
      expect(message).toContain('42'); // build
      expect(message).toContain('ios'); // platform / OS
      expect(message).toContain('17.2'); // OS version
      expect(message).toContain('iPhone15,2'); // model
      expect(message).toContain('Feedback:');
    });

    it('gathers native info only when called, never on import', async () => {
      // Merely importing the module must not have probed any native API.
      expect(mocks.appGetInfo).not.toHaveBeenCalled();
      expect(mocks.deviceGetInfo).not.toHaveBeenCalled();

      await createSupportMessage();

      expect(mocks.appGetInfo).toHaveBeenCalledTimes(1);
      expect(mocks.deviceGetInfo).toHaveBeenCalledTimes(1);
    });

    it('excludes stored data and sensitive tokens', async () => {
      // Seed storage with data that must never leak into a support message.
      localStorage.setItem(
        'breath-in-flow-sessions',
        JSON.stringify([{ id: 'x', configSnapshot: { name: 'Morning Ritual Secret' } }])
      );
      localStorage.setItem('breath-in-flow-hrv-rmssd', '55');
      localStorage.setItem(
        'breath-in-flow-check-in',
        JSON.stringify({ checkIn: { mood: 'anxious' } })
      );

      const message = await createSupportMessage();

      expect(message).not.toContain('Morning Ritual Secret');
      expect(message).not.toMatch(/rmssd/i);
      expect(message).not.toMatch(/checkIn/i);
      expect(message).not.toMatch(/camera/i);
    });

    it('still returns a usable message when native info is unavailable', async () => {
      mocks.appGetInfo.mockRejectedValue(new Error('no app plugin'));
      mocks.deviceGetInfo.mockRejectedValue(new Error('no device plugin'));

      const message = await createSupportMessage();

      expect(message).toContain('Feedback:');
      expect(message).not.toContain('undefined');
    });
  });

  describe('sendSupportMessage fallback order', () => {
    it('uses the Capacitor share sheet first', async () => {
      mocks.share.mockResolvedValue(undefined);

      const result = await sendSupportMessage();

      expect(result.method).toBe('share');
      expect(mocks.share).toHaveBeenCalledTimes(1);
      const shareArg = mocks.share.mock.calls[0][0];
      expect(shareArg.text).toContain('Feedback:');
    });

    it('falls back to an encoded mailto when share fails', async () => {
      mocks.share.mockRejectedValue(new Error('no share'));
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      const writeText = stubClipboard();

      const result = await sendSupportMessage();

      expect(result.method).toBe('email');
      expect(open).toHaveBeenCalledTimes(1);
      const url = String(open.mock.calls[0][0]);
      expect(url.startsWith('mailto:hello@breathinflow.app')).toBe(true);
      expect(url).toContain('body=');
      expect(writeText).not.toHaveBeenCalled();
    });

    it('falls back to the clipboard when share and email both fail', async () => {
      mocks.share.mockRejectedValue(new Error('no share'));
      vi.spyOn(window, 'open').mockImplementation(() => {
        throw new Error('blocked');
      });
      const writeText = stubClipboard();

      const result = await sendSupportMessage();

      expect(result.method).toBe('clipboard');
      expect(writeText).toHaveBeenCalledTimes(1);
      expect(String(writeText.mock.calls[0][0])).toContain('Feedback:');
    });

    it('treats a cancelled share sheet as a quiet no-op — no email, no clipboard', async () => {
      // Native iOS/Android reject a user cancellation with the exact string
      // "Share canceled" (see @capacitor/share SharePlugin.swift / SharePlugin.java).
      mocks.share.mockRejectedValue(new Error('Share canceled'));
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      const writeText = stubClipboard();

      const result = await sendSupportMessage();

      expect(result.method).toBe('cancel');
      expect(open).not.toHaveBeenCalled();
      expect(writeText).not.toHaveBeenCalled();
    });

    it('treats a web share AbortError as a quiet cancel, not a fallback', async () => {
      // On web the Share plugin delegates to navigator.share, which rejects with
      // a DOMException named "AbortError" when the user dismisses the sheet.
      mocks.share.mockRejectedValue(new DOMException('The user aborted a request.', 'AbortError'));
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      const writeText = stubClipboard();

      const result = await sendSupportMessage();

      expect(result.method).toBe('cancel');
      expect(open).not.toHaveBeenCalled();
      expect(writeText).not.toHaveBeenCalled();
    });
  });

  describe('shareBackupFile', () => {
    const JSON_PAYLOAD = '{"formatVersion":1}';
    const FILENAME = 'breath-in-flow-backup.json';

    it('writes to the cache, shares the URI, and deletes the temp file on native', async () => {
      mocks.isNativePlatform.mockReturnValue(true);
      mocks.writeFile.mockResolvedValue({ uri: 'file:///cache/backup.json' });
      mocks.share.mockResolvedValue(undefined);

      const result = await shareBackupFile(JSON_PAYLOAD, FILENAME);

      expect(result.method).toBe('share');
      expect(mocks.writeFile).toHaveBeenCalledWith(
        expect.objectContaining({
          path: FILENAME,
          data: JSON_PAYLOAD,
          directory: 'CACHE',
          encoding: 'utf8',
        })
      );
      expect(mocks.share).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'file:///cache/backup.json' })
      );
      expect(mocks.deleteFile).toHaveBeenCalledWith(
        expect.objectContaining({ path: FILENAME, directory: 'CACHE' })
      );
    });

    it('deletes the temp file even when the native share fails', async () => {
      mocks.isNativePlatform.mockReturnValue(true);
      mocks.writeFile.mockResolvedValue({ uri: 'file:///cache/backup.json' });
      // A genuine failure (not the "Share canceled" cancel string) still throws.
      mocks.share.mockRejectedValue(new Error('user cancelled'));

      await expect(shareBackupFile(JSON_PAYLOAD, FILENAME)).rejects.toThrow();
      expect(mocks.deleteFile).toHaveBeenCalledWith(
        expect.objectContaining({ path: FILENAME, directory: 'CACHE' })
      );
    });

    it('treats a native share cancel as a quiet no-op and still deletes the temp file', async () => {
      mocks.isNativePlatform.mockReturnValue(true);
      mocks.writeFile.mockResolvedValue({ uri: 'file:///cache/backup.json' });
      mocks.share.mockRejectedValue(new Error('Share canceled'));

      const result = await shareBackupFile(JSON_PAYLOAD, FILENAME);

      expect(result.method).toBe('cancel');
      expect(mocks.deleteFile).toHaveBeenCalledWith(
        expect.objectContaining({ path: FILENAME, directory: 'CACHE' })
      );
    });

    it('treats a web share cancel (AbortError) as a quiet no-op with no download fallback', async () => {
      mocks.isNativePlatform.mockReturnValue(false);
      const share = vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError'));
      Object.defineProperty(navigator, 'share', { value: share, configurable: true });
      Object.defineProperty(navigator, 'canShare', {
        value: vi.fn().mockReturnValue(true),
        configurable: true,
      });
      const createObjectURL = vi.fn().mockReturnValue('blob:mock');
      Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });

      const result = await shareBackupFile(JSON_PAYLOAD, FILENAME);

      expect(result.method).toBe('cancel');
      expect(createObjectURL).not.toHaveBeenCalled();
    });

    it('downloads when the web share rejects for a real reason', async () => {
      mocks.isNativePlatform.mockReturnValue(false);
      const share = vi.fn().mockRejectedValue(new Error('permission denied'));
      Object.defineProperty(navigator, 'share', { value: share, configurable: true });
      Object.defineProperty(navigator, 'canShare', {
        value: vi.fn().mockReturnValue(true),
        configurable: true,
      });
      const createObjectURL = vi.fn().mockReturnValue('blob:mock');
      const revokeObjectURL = vi.fn();
      Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
      Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });

      const result = await shareBackupFile(JSON_PAYLOAD, FILENAME);

      expect(result.method).toBe('download');
      expect(createObjectURL).toHaveBeenCalledTimes(1);
    });

    it('prefers navigator.share with files on the web', async () => {
      mocks.isNativePlatform.mockReturnValue(false);
      const share = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'share', { value: share, configurable: true });
      Object.defineProperty(navigator, 'canShare', {
        value: vi.fn().mockReturnValue(true),
        configurable: true,
      });

      const result = await shareBackupFile(JSON_PAYLOAD, FILENAME);

      expect(result.method).toBe('share');
      expect(share).toHaveBeenCalledTimes(1);
      expect(share.mock.calls[0][0].files).toHaveLength(1);
    });

    it('downloads via a revoked object URL when web share is unavailable', async () => {
      mocks.isNativePlatform.mockReturnValue(false);
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
      const createObjectURL = vi.fn().mockReturnValue('blob:mock');
      const revokeObjectURL = vi.fn();
      Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
      Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });

      const result = await shareBackupFile(JSON_PAYLOAD, FILENAME);

      expect(result.method).toBe('download');
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
    });
  });
});
