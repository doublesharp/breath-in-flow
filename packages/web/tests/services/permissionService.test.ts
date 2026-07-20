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

  it('requests camera permission immediately and releases the preflight stream', async () => {
    const stop = vi.fn();
    let resolveStream!: (stream: MediaStream) => void;
    const getUserMedia = vi.fn(
      () =>
        new Promise<MediaStream>((resolve) => {
          resolveStream = resolve;
        })
    );
    mockMediaDevices(getUserMedia);

    const resultPromise = requestSensorPermissions('camera');

    expect(getUserMedia).toHaveBeenCalledWith({ video: true, audio: false });
    resolveStream({ getTracks: () => [{ stop }] } as unknown as MediaStream);

    await expect(resultPromise).resolves.toEqual({ camera: 'granted', motion: 'unknown' });
    expect(stop).toHaveBeenCalledOnce();
  });

  it('releases every track acquired during camera preflight', async () => {
    mockCameraPermissionState('granted');
    const stopVideo = vi.fn();
    const stopAudio = vi.fn();
    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: stopVideo }, { stop: stopAudio }],
    } as unknown as MediaStream);
    mockMediaDevices(getUserMedia);

    const result = await requestSensorPermissions('camera');

    expect(result).toEqual({ camera: 'granted', motion: 'unknown' });
    expect(stopVideo).toHaveBeenCalledOnce();
    expect(stopAudio).toHaveBeenCalledOnce();
  });

  it('marks camera permission denied when acquisition is rejected by the user', async () => {
    mockCameraPermissionState('denied');
    const error = Object.assign(new Error('camera permission denied'), { name: 'NotAllowedError' });
    const getUserMedia = vi.fn().mockRejectedValue(error);
    mockMediaDevices(getUserMedia);

    const result = await requestSensorPermissions('camera');

    expect(result).toEqual({ camera: 'denied', motion: 'unknown' });
    expect(getUserMedia).toHaveBeenCalledOnce();
  });

  it('keeps non-permission camera startup errors distinct from denial', async () => {
    const error = Object.assign(new Error('camera busy'), { name: 'NotReadableError' });
    const getUserMedia = vi.fn(() => Promise.reject(error));
    mockMediaDevices(getUserMedia);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await requestSensorPermissions('camera');

    expect(result).toEqual({ camera: 'unknown', motion: 'unknown' });
    expect(getUserMedia).toHaveBeenCalledOnce();
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

  it('requests dual-mode motion permission before the first await can lose user activation', async () => {
    const originalDeviceMotionEvent = globalThis.DeviceMotionEvent;
    const requestPermission = vi.fn().mockResolvedValue('granted');
    Object.defineProperty(globalThis, 'DeviceMotionEvent', {
      value: { requestPermission },
      configurable: true,
    });
    const stop = vi.fn();
    let resolveCameraStream!: (stream: MediaStream) => void;
    const getUserMedia = vi.fn(
      () =>
        new Promise<MediaStream>((resolve) => {
          resolveCameraStream = resolve;
        })
    );
    mockMediaDevices(getUserMedia);

    const resultPromise = requestSensorPermissions('dual');

    expect(requestPermission).toHaveBeenCalledOnce();
    expect(getUserMedia).toHaveBeenCalledOnce();
    resolveCameraStream({ getTracks: () => [{ stop }] } as unknown as MediaStream);
    await expect(resultPromise).resolves.toEqual({ camera: 'granted', motion: 'granted' });
    expect(stop).toHaveBeenCalledOnce();

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
