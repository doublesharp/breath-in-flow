import {
  BreathingConfigSchema,
  calculateSetTime,
  type BreathingConfig,
} from '@breath-in-flow/shared';

export interface PracticeSummary {
  duration: string;
  detail: string;
}

function formatSeconds(totalSeconds: number): string {
  const roundedTotal = Number(totalSeconds.toFixed(2));
  const minutes = Math.floor(roundedTotal / 60);
  const seconds = Number((roundedTotal - minutes * 60).toFixed(2));
  const secondsText = `${seconds}s`;

  if (minutes === 0) return secondsText;
  if (seconds === 0) return `${minutes}m`;
  return `${minutes}m ${secondsText}`;
}

export function getPracticeSummary(config: BreathingConfig): PracticeSummary | null {
  const result = BreathingConfigSchema.safeParse(config);
  if (!result.success) return null;

  const parsed = result.data;
  const setSeconds = calculateSetTime(parsed);
  const hasUserControlledHold =
    parsed.extendedHoldEnabled &&
    (parsed.extendedHoldMode === 'TOLERANCE' ||
      (parsed.secondExtendedHoldEnabled && parsed.secondExtendedHoldMode === 'TOLERANCE'));

  const openEnded = parsed.targetSets === 0;
  const scheduledSeconds = openEnded
    ? setSeconds
    : setSeconds * parsed.targetSets +
      parsed.restBetweenSetsSeconds * Math.max(0, parsed.targetSets - 1);
  const duration = `${formatSeconds(scheduledSeconds)}${hasUserControlledHold ? '+' : ''}${
    openEnded ? ' / set' : ''
  }`;

  const detailParts = [
    `${parsed.repetitions} ${parsed.repetitions === 1 ? 'rep' : 'reps'}`,
    openEnded ? 'Open-ended' : `${parsed.targetSets} ${parsed.targetSets === 1 ? 'set' : 'sets'}`,
  ];
  if ((openEnded || parsed.targetSets > 1) && parsed.restBetweenSetsSeconds === 0) {
    detailParts.push('rests at your pace');
  }
  if (hasUserControlledHold) detailParts.push('holds at your pace');

  return { duration, detail: detailParts.join(' · ') };
}
