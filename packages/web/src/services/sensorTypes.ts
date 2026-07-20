export type SensorStartFailureReason =
  | 'permission-denied'
  | 'unavailable'
  | 'device-busy'
  | 'start-failed';

export type SensorStartResult =
  | { ok: true }
  | {
      ok: false;
      reason: SensorStartFailureReason;
      message: string;
    };

export function sensorStartFailure(
  reason: SensorStartFailureReason,
  message: string,
): SensorStartResult {
  return { ok: false, reason, message };
}
