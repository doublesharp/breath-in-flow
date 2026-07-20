import type { IBISample } from '@breath-in-flow/shared';

export interface FusedIBISample extends IBISample {
  source: 'ppg' | 'scg' | 'fused';
  ppgInterval?: number;
  scgInterval?: number;
  confidence: number;
}

interface SensorFusionCallbacks {
  onFusedIBI?: (sample: FusedIBISample) => void;
  onQualityChange?: (quality: number) => void;
}

type Source = 'ppg' | 'scg';

interface PendingSample {
  sample: IBISample;
  receivedAt: number;
}

const MATCH_WINDOW_MS = 100;
const OFFSET_DISCOVERY_WINDOW_MS = 160;
const OFFSET_CANDIDATE_LIMIT = 9;
const MIN_OFFSET_CANDIDATES = 3;

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function hasDirectPeakProvenance(sample: IBISample, source: Source): boolean {
  return sample.provenance?.source === source && sample.provenance.method === 'peak-detected';
}

export class SensorFusionService {
  private callbacks: SensorFusionCallbacks = {};
  private pendingPPG: PendingSample[] = [];
  private pendingSCG: PendingSample[] = [];
  private offsetCandidates: number[] = [];
  private matchTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private consecutiveMatches = 0;
  private fusedQuality = 0;

  setCallbacks(callbacks: SensorFusionCallbacks): void {
    this.callbacks = callbacks;
  }

  addPPGSample(sample: IBISample): void {
    if (!hasDirectPeakProvenance(sample, 'ppg')) return;
    this.pendingPPG.push({
      sample: { ...sample },
      receivedAt: Date.now(),
    });
    this.tryMatch();
    this.scheduleFlush();
  }

  addSCGSample(sample: IBISample): void {
    if (!hasDirectPeakProvenance(sample, 'scg')) return;
    this.pendingSCG.push({
      sample: { ...sample },
      receivedAt: Date.now(),
    });
    this.tryMatch();
    this.scheduleFlush();
  }

  getEstimatedOffset(): number | null {
    return this.offsetCandidates.length >= MIN_OFFSET_CANDIDATES
      ? median(this.offsetCandidates)
      : null;
  }

  getQuality(): number {
    return this.fusedQuality;
  }

  reset(): void {
    this.pendingPPG = [];
    this.pendingSCG = [];
    this.offsetCandidates = [];
    this.consecutiveMatches = 0;
    this.fusedQuality = 0;
    this.clearMatchTimeout();
  }

  private tryMatch(): void {
    while (true) {
      const match = this.findBestMatch();
      if (!match) return;

      // Remove both inputs together before emitting, so neither can later flush as a fallback.
      const [ppg] = this.pendingPPG.splice(match.ppgIndex, 1);
      const [scg] = this.pendingSCG.splice(match.scgIndex, 1);
      this.recordOffset(ppg.sample.timestamp - scg.sample.timestamp);
      this.emitMatch(ppg.sample, scg.sample);
    }
  }

  private findBestMatch(): { ppgIndex: number; scgIndex: number } | null {
    const estimatedOffset = this.getEstimatedOffset();
    const pairingWindow = estimatedOffset === null ? OFFSET_DISCOVERY_WINDOW_MS : MATCH_WINDOW_MS;
    let best: { ppgIndex: number; scgIndex: number; residual: number } | null = null;

    for (let ppgIndex = 0; ppgIndex < this.pendingPPG.length; ppgIndex++) {
      for (let scgIndex = 0; scgIndex < this.pendingSCG.length; scgIndex++) {
        const signedOffset =
          this.pendingPPG[ppgIndex].sample.timestamp - this.pendingSCG[scgIndex].sample.timestamp;
        const residual = Math.abs(signedOffset - (estimatedOffset ?? 0));
        if (residual <= pairingWindow && (best === null || residual < best.residual)) {
          best = { ppgIndex, scgIndex, residual };
        }
      }
    }

    return best;
  }

  private recordOffset(offset: number): void {
    this.offsetCandidates.push(offset);
    if (this.offsetCandidates.length > OFFSET_CANDIDATE_LIMIT) this.offsetCandidates.shift();
  }

  private emitMatch(ppgSample: IBISample, scgSample: IBISample): void {
    const intervalDiff = Math.abs(ppgSample.interval - scgSample.interval);
    let interval: number;
    let confidence: number;

    if (intervalDiff <= 30) {
      const totalQuality = ppgSample.quality + scgSample.quality;
      interval =
        totalQuality > 0
          ? (ppgSample.interval * ppgSample.quality + scgSample.interval * scgSample.quality) /
            totalQuality
          : (ppgSample.interval + scgSample.interval) / 2;
      this.consecutiveMatches++;
      confidence = Math.min(
        1,
        ((ppgSample.quality + scgSample.quality) / 2) * (this.consecutiveMatches >= 5 ? 1.2 : 1)
      );
    } else {
      interval = ppgSample.quality >= scgSample.quality ? ppgSample.interval : scgSample.interval;
      this.consecutiveMatches = 0;
      confidence = Math.max(ppgSample.quality, scgSample.quality) * 0.7;
    }

    this.emit({
      timestamp: (ppgSample.timestamp + scgSample.timestamp) / 2,
      interval,
      quality: confidence,
      provenance: { source: 'fused', method: 'peak-detected' },
      source: 'fused',
      ppgInterval: ppgSample.interval,
      scgInterval: scgSample.interval,
      confidence,
    });
  }

  private scheduleFlush(): void {
    this.clearMatchTimeout();
    const oldestArrival = Math.min(
      ...this.pendingPPG.map((entry) => entry.receivedAt),
      ...this.pendingSCG.map((entry) => entry.receivedAt)
    );
    if (!Number.isFinite(oldestArrival)) return;

    const delay = Math.max(0, this.getPairingHorizonMs() - (Date.now() - oldestArrival));
    this.matchTimeoutId = setTimeout(() => this.flushExpired(), delay);
  }

  private flushExpired(): void {
    this.matchTimeoutId = null;
    const expiry = Date.now() - this.getPairingHorizonMs();
    const expired: Array<{ sample: IBISample; source: Source }> = [];

    this.pendingPPG = this.pendingPPG.filter((entry) => {
      if (entry.receivedAt > expiry) return true;
      expired.push({ sample: entry.sample, source: 'ppg' });
      return false;
    });
    this.pendingSCG = this.pendingSCG.filter((entry) => {
      if (entry.receivedAt > expiry) return true;
      expired.push({ sample: entry.sample, source: 'scg' });
      return false;
    });

    for (const { sample, source } of expired.sort(
      (left, right) => left.sample.timestamp - right.sample.timestamp
    )) {
      this.emitFallback(sample, source);
    }
    if (expired.length > 0) this.consecutiveMatches = 0;

    this.tryMatch();
    this.scheduleFlush();
  }

  private getPairingHorizonMs(): number {
    const estimatedOffset = this.getEstimatedOffset();
    if (estimatedOffset === null) return OFFSET_DISCOVERY_WINDOW_MS;
    return Math.min(Math.abs(estimatedOffset), OFFSET_DISCOVERY_WINDOW_MS) + MATCH_WINDOW_MS;
  }

  private emitFallback(sample: IBISample, source: Source): void {
    this.emit({
      ...sample,
      source,
      ...(source === 'ppg' ? { ppgInterval: sample.interval } : { scgInterval: sample.interval }),
      confidence: sample.quality * 0.8,
    });
  }

  private emit(sample: FusedIBISample): void {
    this.fusedQuality = sample.confidence;
    this.callbacks.onFusedIBI?.(sample);
    this.callbacks.onQualityChange?.(sample.confidence);
  }

  private clearMatchTimeout(): void {
    if (this.matchTimeoutId !== null) {
      clearTimeout(this.matchTimeoutId);
      this.matchTimeoutId = null;
    }
  }
}

export function createSensorFusionService(): SensorFusionService {
  return new SensorFusionService();
}

export const sensorFusionService = createSensorFusionService();
