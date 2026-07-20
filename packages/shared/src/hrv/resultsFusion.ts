import type { HRVAnalysis } from './types.js';

export interface FusedTrialResult {
  rate: number;
  ppgAnalysis?: HRVAnalysis;
  scgAnalysis?: HRVAnalysis;
  fusedMetrics: {
    lfPowerNorm: number | null;
    peakToTroughAmplitude: number | null;
    waveformSmoothness: number | null;
    phaseSynchrony: number | null;
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
  rate: number
): FusedTrialResult {
  // Neither source
  if (!ppgAnalysis && !scgAnalysis) {
    return {
      rate,
      fusedMetrics: {
        lfPowerNorm: null,
        peakToTroughAmplitude: null,
        waveformSmoothness: null,
        phaseSynchrony: null,
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
        lfPowerNorm: frequencyLfPowerNorm(ppgAnalysis),
        peakToTroughAmplitude: resonanceMetric(ppgAnalysis, 'peakToTroughAmplitude'),
        waveformSmoothness: resonanceMetric(ppgAnalysis, 'waveformSmoothness'),
        phaseSynchrony: resonanceMetric(ppgAnalysis, 'phaseSynchrony'),
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
        lfPowerNorm: frequencyLfPowerNorm(scgAnalysis),
        peakToTroughAmplitude: resonanceMetric(scgAnalysis, 'peakToTroughAmplitude'),
        waveformSmoothness: resonanceMetric(scgAnalysis, 'waveformSmoothness'),
        phaseSynchrony: resonanceMetric(scgAnalysis, 'phaseSynchrony'),
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
        lfPowerNorm: null,
        peakToTroughAmplitude: null,
        waveformSmoothness: null,
        phaseSynchrony: null,
        confidence: 0,
      },
      source: 'fused',
    };
  }

  const fuse = (ppgVal: number, scgVal: number): number => (ppgVal * wPpg + scgVal * wScg) / wTotal;
  const fuseAvailable = (ppgVal: number | null, scgVal: number | null): number | null => {
    if (ppgVal != null && scgVal != null) return fuse(ppgVal, scgVal);
    return ppgVal ?? scgVal;
  };

  const fusedLfPowerNorm = fuseAvailable(frequencyLfPowerNorm(ppg), frequencyLfPowerNorm(scg));
  const fusedAmplitude = fuseAvailable(
    resonanceMetric(ppg, 'peakToTroughAmplitude'),
    resonanceMetric(scg, 'peakToTroughAmplitude')
  );
  const fusedSmoothness = fuseAvailable(
    resonanceMetric(ppg, 'waveformSmoothness'),
    resonanceMetric(scg, 'waveformSmoothness')
  );
  const fusedSynchrony = fuseAvailable(
    resonanceMetric(ppg, 'phaseSynchrony'),
    resonanceMetric(scg, 'phaseSynchrony')
  );

  // Determine if metrics agree (within 25% relative difference)
  const metricsAgree = checkMetricsAgree(ppg, scg);
  const avgQuality = (wPpg + wScg) / 2;
  const maxQuality = Math.max(wPpg, wScg);

  const confidence = metricsAgree ? Math.min(1, avgQuality * 1.2) : maxQuality * 0.7;

  return {
    rate,
    ppgAnalysis: ppg,
    scgAnalysis: scg,
    fusedMetrics: {
      lfPowerNorm: fusedLfPowerNorm,
      peakToTroughAmplitude: fusedAmplitude,
      waveformSmoothness: fusedSmoothness,
      phaseSynchrony: fusedSynchrony,
      confidence,
    },
    source: 'fused',
  };
}

function frequencyLfPowerNorm(analysis: HRVAnalysis): number | null {
  return analysis.frequencyDomain.available ? analysis.frequencyDomain.value.lfPowerNorm : null;
}

function resonanceMetric(
  analysis: HRVAnalysis,
  metric: 'peakToTroughAmplitude' | 'waveformSmoothness' | 'phaseSynchrony'
): number | null {
  return analysis.resonance.available ? analysis.resonance.value[metric] : null;
}

/**
 * Check if the key resonance metrics from two analyses agree within 25%.
 * Uses relative difference: |a - b| / max(|a|, |b|) <= 0.25
 */
function checkMetricsAgree(ppg: HRVAnalysis, scg: HRVAnalysis): boolean {
  const pairs = [
    [frequencyLfPowerNorm(ppg), frequencyLfPowerNorm(scg)],
    [resonanceMetric(ppg, 'peakToTroughAmplitude'), resonanceMetric(scg, 'peakToTroughAmplitude')],
    [resonanceMetric(ppg, 'waveformSmoothness'), resonanceMetric(scg, 'waveformSmoothness')],
    [resonanceMetric(ppg, 'phaseSynchrony'), resonanceMetric(scg, 'phaseSynchrony')],
  ];

  let comparedMetrics = 0;
  for (const [a, b] of pairs) {
    if (a == null || b == null) continue;
    comparedMetrics++;
    const maxAbs = Math.max(Math.abs(a), Math.abs(b));
    if (maxAbs === 0) continue; // both zero — agree
    const relDiff = Math.abs(a - b) / maxAbs;
    if (relDiff > 0.25) return false;
  }

  return comparedMetrics > 0;
}

/**
 * Fuse results from full PPG and SCG assessment runs.
 * Matches trials by rate and produces a FusedTrialResult for each unique rate.
 */
export function fuseAssessmentRuns(
  ppgTrials: { rate: number; analysis: HRVAnalysis }[],
  scgTrials: { rate: number; analysis: HRVAnalysis }[]
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
