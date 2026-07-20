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
async function requestCameraPermission(): Promise<PermissionStatus> {
  if (!navigator.mediaDevices?.getUserMedia) return 'unknown';

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch {
        // Permission was acquired; track teardown remains best effort.
      }
    }
    return 'granted';
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    return name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unknown';
  }
}

/**
 * Check if DeviceMotion is available and permitted.
 * iOS 13+ requires explicit permission request.
 * Android Capacitor WebView may not have DeviceMotionEvent — use @capacitor/motion instead.
 */
async function requestMotionPermission(): Promise<PermissionStatus> {
  // iOS 13+ requires explicit permission
  if (
    typeof window !== 'undefined' &&
    'DeviceMotionEvent' in window &&
    typeof (DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> })
      .requestPermission === 'function'
  ) {
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
  // Start gesture-gated motion access before yielding to any camera permission
  // promise. In dual mode this keeps both checks in the same user-activation turn.
  const motionPermission =
    mode === 'accelerometer' || mode === 'dual'
      ? requestMotionPermission()
      : Promise.resolve<PermissionStatus>('unknown');
  const cameraPermission =
    mode === 'camera' || mode === 'dual'
      ? requestCameraPermission()
      : Promise.resolve<PermissionStatus>('unknown');

  const [camera, motion] = await Promise.all([cameraPermission, motionPermission]);
  return { camera, motion };
}

/**
 * Get a user-friendly message for denied permissions.
 */
export function getPermissionDeniedMessage(perms: {
  camera: PermissionStatus;
  motion: PermissionStatus;
}): string | null {
  const denied: string[] = [];
  if (perms.camera === 'denied') denied.push('Camera');
  if (perms.motion === 'denied') denied.push('Motion sensor');

  if (denied.length === 0) return null;

  if (Capacitor.isNativePlatform()) {
    return `${denied.join(' and ')} permission denied. Go to Settings -> Apps -> Breath in Flow -> Permissions to enable.`;
  }
  return `${denied.join(' and ')} permission denied. Please allow access in your browser settings and reload.`;
}
