/**
 * Permission handling for camera and motion sensors.
 * On Android Capacitor, we need to ensure permissions are granted before
 * getUserMedia or DeviceMotion will work in the WebView.
 */

import { Capacitor } from '@capacitor/core';

export type PermissionStatus = 'granted' | 'denied' | 'prompt' | 'unknown';

/**
 * Check and request camera permission.
 * Returns 'granted' if permission is available.
 */
export async function requestCameraPermission(): Promise<PermissionStatus> {
  // Try navigator.permissions API first (Chrome, some WebViews)
  try {
    if (navigator.permissions) {
      const result = await navigator.permissions.query({ name: 'camera' as PermissionName });
      console.log('Camera permission status:', result.state);
      if (result.state === 'granted') return 'granted';
      if (result.state === 'denied') return 'denied';
    }
  } catch {
    // permissions.query not supported for camera — continue
  }

  // Try getUserMedia to trigger the permission prompt
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    // Got it — immediately release
    stream.getTracks().forEach(t => t.stop());
    return 'granted';
  } catch (err) {
    const error = err as Error;
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      return 'denied';
    }
    // NotFoundError = no camera, NotReadableError = camera in use
    console.warn('Camera permission check failed:', error.name, error.message);
    return 'unknown';
  }
}

/**
 * Check if DeviceMotion is available and permitted.
 * iOS 13+ requires explicit permission request.
 * Android Capacitor WebView may not have DeviceMotionEvent — use @capacitor/motion instead.
 */
export async function requestMotionPermission(): Promise<PermissionStatus> {
  // iOS 13+ requires explicit permission
  if (typeof window !== 'undefined' && 'DeviceMotionEvent' in window &&
    typeof (DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> })
      .requestPermission === 'function') {
    try {
      const permission = await (
        DeviceMotionEvent as unknown as { requestPermission: () => Promise<string> }
      ).requestPermission();
      return permission === 'granted' ? 'granted' : 'denied';
    } catch {
      return 'denied';
    }
  }

  // On native Capacitor, @capacitor/motion handles this — always available
  if (Capacitor.isNativePlatform()) {
    return 'granted';
  }

  // Desktop/web — check if DeviceMotionEvent exists
  if (typeof window !== 'undefined' && 'DeviceMotionEvent' in window) {
    return 'granted';
  }

  return 'unknown';
}

/**
 * Request all permissions needed for sensor mode.
 * Returns an object with the status of each permission.
 */
export async function requestSensorPermissions(
  mode: 'camera' | 'accelerometer' | 'dual'
): Promise<{ camera: PermissionStatus; motion: PermissionStatus }> {
  const result = { camera: 'unknown' as PermissionStatus, motion: 'unknown' as PermissionStatus };

  if (mode === 'camera' || mode === 'dual') {
    result.camera = await requestCameraPermission();
  }

  if (mode === 'accelerometer' || mode === 'dual') {
    result.motion = await requestMotionPermission();
  }

  return result;
}

/**
 * Get a user-friendly message for denied permissions.
 */
export function getPermissionDeniedMessage(perms: { camera: PermissionStatus; motion: PermissionStatus }): string | null {
  const denied: string[] = [];
  if (perms.camera === 'denied') denied.push('Camera');
  if (perms.motion === 'denied') denied.push('Motion sensor');

  if (denied.length === 0) return null;

  if (Capacitor.isNativePlatform()) {
    return `${denied.join(' and ')} permission denied. Go to Settings → Apps → Breath in Flow → Permissions to enable.`;
  }
  return `${denied.join(' and ')} permission denied. Please allow access in your browser settings and reload.`;
}
