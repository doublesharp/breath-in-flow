import type { HRVAnalysis } from './types.js';

export interface FusedTrialResult {
  rate: number;
  ppgAnalysis?: HRVAnalysis;
  scgAnalysis?: HRVAnalysis;
  fusedMetrics: {
    lfPower: number;
    peakToTroughAmplitude: number;
    waveformSmoothness: number;
    phaseSynchrony: number;
    confidence: number;
  };
  source: 'ppg' | 'scg' | 'fused';
}

/**
 * Fuse HRV analysis results from PPG and SCG runs for a single trial rate.
 *
 * When only one source is available, its metrics are used directly.
 * When both are available, metrics are weighted by signal quality and
 * confidence is boosted when the two sources agree.
 */
export function fuseTrialResults(
  ppgAnalysis: HRVAnalysis | undefined,
  scgAnalysis: HRVAnalysis | undefined,
  rate: number,
): FusedTrialResult {
  // Neither source
  if (!ppgAnalysis && !scgAnalysis) {
    return {
      rate,
      fusedMetrics: {
        lfPower: 0,
        peakToTroughAmplitude: 0,
        waveformSmoothness: 0,
        phaseSynchrony: 0,
        confidence: 0,
      },
      source: 'ppg',
    };
  }

  // Single source: PPG only
  if (ppgAnalysis && !scgAnalysis) {
    return {
      rate,
      ppgAnalysis,
      fusedMetrics: {
        lfPower: ppgAnalysis.frequencyDomain.lfPower,
        peakToTroughAmplitude: ppgAnalysis.resonance.peakToTroughAmplitude,
        waveformSmoothness: ppgAnalysis.resonance.waveformSmoothness,
        phaseSynchrony: ppgAnalysis.resonance.phaseSynchrony,
        confidence: ppgAnalysis.quality.meanSignalQuality,
      },
      source: 'ppg',
    };
  }

  // Single source: SCG only
  if (!ppgAnalysis && scgAnalysis) {
    return {
      rate,
      scgAnalysis,
      fusedMetrics: {
        lfPower: scgAnalysis.frequencyDomain.lfPower,
        peakToTroughAmplitude: scgAnalysis.resonance.peakToTroughAmplitude,
        waveformSmoothness: scgAnalysis.resonance.waveformSmoothness,
        phaseSynchrony: scgAnalysis.resonance.phaseSynchrony,
        confidence: scgAnalysis.quality.meanSignalQuality,
      },
      source: 'scg',
    };
  }

  // Both sources — weighted fusion
  const ppg = ppgAnalysis!;
  const scg = scgAnalysis!;

  const wPpg = ppg.quality.meanSignalQuality;
  const wScg = scg.quality.meanSignalQuality;
  const wTotal = wPpg + wScg;

  // Avoid division by zero
  if (wTotal === 0) {
    return {
      rate,
      ppgAnalysis: ppg,
      scgAnalysis: scg,
      fusedMetrics: {
        lfPower: 0,
        peakToTroughAmplitude: 0,
        waveformSmoothness: 0,
        phaseSynchrony: 0,
        confidence: 0,
      },
      source: 'fused',
    };
  }

  const fuse = (ppgVal: number, scgVal: number): number =>
    (ppgVal * wPpg + scgVal * wScg) / wTotal;

  const fusedLfPower = fuse(
    ppg.frequencyDomain.lfPower,
    scg.frequencyDomain.lfPower,
  );
  const fusedAmplitude = fuse(
    ppg.resonance.peakToTroughAmplitude,
    scg.resonance.peakToTroughAmplitude,
  );
  const fusedSmoothness = fuse(
    ppg.resonance.waveformSmoothness,
    scg.resonance.waveformSmoothness,
  );
  const fusedSynchrony = fuse(
    ppg.resonance.phaseSynchrony,
    scg.resonance.phaseSynchrony,
  );

  // Determine if metrics agree (within 25% relative difference)
  const metricsAgree = checkMetricsAgree(ppg, scg);
  const avgQuality = (wPpg + wScg) / 2;
  const maxQuality = Math.max(wPpg, wScg);

  const confidence = metricsAgree
    ? Math.min(1, avgQuality * 1.2)
    : maxQuality * 0.7;

  return {
    rate,
    ppgAnalysis: ppg,
    scgAnalysis: scg,
    fusedMetrics: {
      lfPower: fusedLfPower,
      peakToTroughAmplitude: fusedAmplitude,
      waveformSmoothness: fusedSmoothness,
      phaseSynchrony: fusedSynchrony,
      confidence,
    },
    source: 'fused',
  };
}

/**
 * Check if the key resonance metrics from two analyses agree within 25%.
 * Uses relative difference: |a - b| / max(|a|, |b|) <= 0.25
 */
function checkMetricsAgree(ppg: HRVAnalysis, scg: HRVAnalysis): boolean {
  const pairs = [
    [ppg.frequencyDomain.lfPower, scg.frequencyDomain.lfPower],
    [ppg.resonance.peakToTroughAmplitude, scg.resonance.peakToTroughAmplitude],
    [ppg.resonance.waveformSmoothness, scg.resonance.waveformSmoothness],
    [ppg.resonance.phaseSynchrony, scg.resonance.phaseSynchrony],
  ];

  for (const [a, b] of pairs) {
    const maxAbs = Math.max(Math.abs(a), Math.abs(b));
    if (maxAbs === 0) continue; // both zero — agree
    const relDiff = Math.abs(a - b) / maxAbs;
    if (relDiff > 0.25) return false;
  }

  return true;
}

/**
 * Fuse results from full PPG and SCG assessment runs.
 * Matches trials by rate and produces a FusedTrialResult for each unique rate.
 */
export function fuseAssessmentRuns(
  ppgTrials: { rate: number; analysis: HRVAnalysis }[],
  scgTrials: { rate: number; analysis: HRVAnalysis }[],
): FusedTrialResult[] {
  // Collect all unique rates
  const rateSet = new Set<number>();
  for (const t of ppgTrials) rateSet.add(t.rate);
  for (const t of scgTrials) rateSet.add(t.rate);

  const rates = Array.from(rateSet).sort((a, b) => b - a); // descending

  return rates.map((rate) => {
    const ppg = ppgTrials.find((t) => t.rate === rate)?.analysis;
    const scg = scgTrials.find((t) => t.rate === rate)?.analysis;
    return fuseTrialResults(ppg, scg, rate);
  });
}
