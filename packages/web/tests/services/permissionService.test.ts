import { beforeEach, describe, expect, it, vi } from 'vitest';

const capacitorState = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => false),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: capacitorState.isNativePlatform,
  },
}));

import {
  getPermissionDeniedMessage,
  requestSensorPermissions,
} from '../../src/services/permissionService';

function mockMediaDevices(getUserMedia: () => Promise<MediaStream>): void {
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia },
    configurable: true,
  });
}

function mockCameraPermissionState(state: PermissionState): void {
  Object.defineProperty(navigator, 'permissions', {
    value: {
      query: vi.fn().mockResolvedValue({ state }),
    },
    configurable: true,
  });
}

describe('permissionService', () => {
  beforeEach(() => {
    capacitorState.isNativePlatform.mockReturnValue(false);
    vi.restoreAllMocks();
    mockCameraPermissionState('prompt');
  });

  it('leaves a camera prompt for sensor startup without opening a temporary stream', async () => {
    const stop = vi.fn();
    const getUserMedia = vi.fn(() =>
      Promise.resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream)
    );
    mockMediaDevices(getUserMedia);

    const result = await requestSensorPermissions('camera');

    expect(result).toEqual({ camera: 'prompt', motion: 'unknown' });
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
  });

  it('uses granted camera permission state without opening a stream', async () => {
    mockCameraPermissionState('granted');
    const getUserMedia = vi.fn();
    mockMediaDevices(getUserMedia);

    const result = await requestSensorPermissions('camera');

    expect(result).toEqual({ camera: 'granted', motion: 'unknown' });
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('marks camera permission denied when the permission API reports denial', async () => {
    mockCameraPermissionState('denied');
    const getUserMedia = vi.fn();
    mockMediaDevices(getUserMedia);

    const result = await requestSensorPermissions('camera');

    expect(result).toEqual({ camera: 'denied', motion: 'unknown' });
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('does not probe camera hardware while checking permission state', async () => {
    const error = Object.assign(new Error('camera busy'), { name: 'NotReadableError' });
    const getUserMedia = vi.fn(() => Promise.reject(error));
    mockMediaDevices(getUserMedia);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await requestSensorPermissions('camera');

    expect(result).toEqual({ camera: 'prompt', motion: 'unknown' });
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('grants motion permission on native Capacitor platforms', async () => {
    capacitorState.isNativePlatform.mockReturnValue(true);

    const result = await requestSensorPermissions('accelerometer');

    expect(result).toEqual({ camera: 'unknown', motion: 'granted' });
  });

  it('uses browser DeviceMotion permission requests when available', async () => {
    const originalDeviceMotionEvent = globalThis.DeviceMotionEvent;
    const requestPermission = vi.fn().mockResolvedValue('denied');
    Object.defineProperty(globalThis, 'DeviceMotionEvent', {
      value: { requestPermission },
      configurable: true,
    });

    const result = await requestSensorPermissions('accelerometer');

    expect(result).toEqual({ camera: 'unknown', motion: 'denied' });
    expect(requestPermission).toHaveBeenCalledOnce();

    Object.defineProperty(globalThis, 'DeviceMotionEvent', {
      value: originalDeviceMotionEvent,
      configurable: true,
    });
  });

  it('returns no denied message when all requested permissions are available', () => {
    expect(getPermissionDeniedMessage({ camera: 'granted', motion: 'granted' })).toBeNull();
  });

  it('formats browser denied permission guidance', () => {
    expect(getPermissionDeniedMessage({ camera: 'denied', motion: 'unknown' })).toBe(
      'Camera permission denied. Please allow access in your browser settings and reload.'
    );
  });

  it('formats native denied permission guidance', () => {
    capacitorState.isNativePlatform.mockReturnValue(true);

    expect(getPermissionDeniedMessage({ camera: 'denied', motion: 'denied' })).toBe(
      'Camera and Motion sensor permission denied. Go to Settings -> Apps -> Breath in Flow -> Permissions to enable.'
    );
  });
});
