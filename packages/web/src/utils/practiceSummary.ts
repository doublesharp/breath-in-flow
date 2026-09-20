import {
  BreathingConfigSchema,
  type BreathingConfig,
  type ExtendedHoldMode,
  type ExtendedHoldType,
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

function scheduledHoldSeconds(mode: ExtendedHoldMode, duration: number): number {
  return mode === 'TIMED' ? duration : 0;
}

function preparationSeconds(
  holdType: ExtendedHoldType,
  precedingPhase: ExtendedHoldType | 'EXHALE',
  inhaleTime: number,
  exhaleTime: number
): number {
  if (holdType === 'INHALE') return inhaleTime;
  return precedingPhase === 'INHALE' ? exhaleTime : 0;
}

export function getPracticeSummary(config: BreathingConfig): PracticeSummary | null {
  const result = BreathingConfigSchema.safeParse(config);
  if (!result.success) return null;

  const parsed = result.data;
  const cycleSeconds =
    parsed.inhaleTime + parsed.inhaleHoldTime + parsed.exhaleTime + parsed.exhaleHoldTime;
  let setSeconds = cycleSeconds * parsed.repetitions;
  let hasUserControlledHold = false;

  if (parsed.extendedHoldEnabled) {
    setSeconds += preparationSeconds(
      parsed.extendedHoldType,
      'EXHALE',
      parsed.inhaleTime,
      parsed.exhaleTime
    );
    setSeconds += scheduledHoldSeconds(parsed.extendedHoldMode, parsed.extendedHoldDuration);
    hasUserControlledHold ||= parsed.extendedHoldMode === 'TOLERANCE';

    if (parsed.secondExtendedHoldEnabled) {
      setSeconds += preparationSeconds(
        parsed.secondExtendedHoldType,
        parsed.extendedHoldType,
        parsed.inhaleTime,
        parsed.exhaleTime
      );
      setSeconds += scheduledHoldSeconds(
        parsed.secondExtendedHoldMode,
        parsed.secondExtendedHoldDuration
      );
      hasUserControlledHold ||= parsed.secondExtendedHoldMode === 'TOLERANCE';
    }
  }

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
