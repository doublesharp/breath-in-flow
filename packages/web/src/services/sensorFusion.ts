import type { IBISample } from '@breath-in-flow/shared';

export interface FusedIBISample extends IBISample {
  source: 'ppg' | 'scg' | 'fused';
  ppgInterval?: number;
  scgInterval?: number;
  confidence: number; // 0-1
}

interface SensorFusionCallbacks {
  onFusedIBI?: (sample: FusedIBISample) => void;
  onQualityChange?: (quality: number) => void;
}

class SensorFusionService {
  private callbacks: SensorFusionCallbacks = {};
  private pendingPPG: IBISample[] = [];
  private pendingSCG: IBISample[] = [];
  private matchWindowMs = 100; // ±100ms to match beats
  private matchTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private consecutiveMatches = 0;
  private fusedQuality = 0;

  setCallbacks(callbacks: SensorFusionCallbacks): void {
    this.callbacks = callbacks;
  }

  // Called by PPG service when it detects a beat
  addPPGSample(sample: IBISample): void {
    this.pendingPPG.push({
      ...sample,
      provenance: { source: 'ppg', method: 'peak-detected' },
    });
    this.tryMatch();
  }

  // Called by SCG service when it detects a beat
  addSCGSample(sample: IBISample): void {
    this.pendingSCG.push({
      ...sample,
      provenance: { source: 'scg', method: 'peak-detected' },
    });
    this.tryMatch();
  }

  private tryMatch(): void {
    while (this.pendingPPG.length > 0 && this.pendingSCG.length > 0) {
      let closestPPGIndex = -1;
      let closestSCGIndex = -1;
      let closestTimeDiff = Infinity;

      for (let ppgIndex = 0; ppgIndex < this.pendingPPG.length; ppgIndex++) {
        for (let scgIndex = 0; scgIndex < this.pendingSCG.length; scgIndex++) {
          const timeDiff = Math.abs(
            this.pendingPPG[ppgIndex].timestamp - this.pendingSCG[scgIndex].timestamp
          );
          if (timeDiff < closestTimeDiff) {
            closestTimeDiff = timeDiff;
            closestPPGIndex = ppgIndex;
            closestSCGIndex = scgIndex;
          }
        }
      }

      if (closestTimeDiff <= this.matchWindowMs) {
        const [ppgSample] = this.pendingPPG.splice(closestPPGIndex, 1);
        const [scgSample] = this.pendingSCG.splice(closestSCGIndex, 1);
        // Matched! Both sensors detected the same beat
        const intervalDiff = Math.abs(ppgSample.interval - scgSample.interval);

        let fusedInterval: number;
        let confidence: number;

        if (intervalDiff <= 30) {
          // Agree closely — quality-weighted average
          const totalQ = ppgSample.quality + scgSample.quality;
          fusedInterval =
            totalQ > 0
              ? (ppgSample.interval * ppgSample.quality + scgSample.interval * scgSample.quality) /
                totalQ
              : (ppgSample.interval + scgSample.interval) / 2;
          this.consecutiveMatches++;
          confidence = Math.min(
            1,
            ((ppgSample.quality + scgSample.quality) / 2) *
              (this.consecutiveMatches >= 5 ? 1.2 : 1.0)
          );
        } else {
          // Disagree — use higher quality source
          fusedInterval =
            ppgSample.quality >= scgSample.quality ? ppgSample.interval : scgSample.interval;
          this.consecutiveMatches = 0;
          confidence = Math.max(ppgSample.quality, scgSample.quality) * 0.7;
        }

        const fused: FusedIBISample = {
          timestamp: (ppgSample.timestamp + scgSample.timestamp) / 2,
          interval: fusedInterval,
          quality: confidence,
          provenance: { source: 'fused', method: 'peak-detected' },
          source: 'fused',
          ppgInterval: ppgSample.interval,
          scgInterval: scgSample.interval,
          confidence,
        };

        this.emit(fused);
        continue;
      }

      break;
    }

    const hasPendingSamples = this.pendingPPG.length > 0 || this.pendingSCG.length > 0;
    if (hasPendingSamples && !this.matchTimeoutId) {
      this.matchTimeoutId = setTimeout(() => {
        this.flushPending();
      }, this.matchWindowMs);
    } else if (!hasPendingSamples) {
      this.clearMatchTimeout();
    }
  }

  private flushPending(): void {
    this.clearMatchTimeout();

    const pending = [
      ...this.pendingPPG.map((sample) => ({ sample, source: 'ppg' as const })),
      ...this.pendingSCG.map((sample) => ({ sample, source: 'scg' as const })),
    ].sort((a, b) => a.sample.timestamp - b.sample.timestamp);

    this.pendingPPG = [];
    this.pendingSCG = [];

    for (const { sample, source } of pending) {
      this.emit({
        ...sample,
        provenance: { source, method: 'peak-detected' },
        source,
        ...(source === 'ppg' ? { ppgInterval: sample.interval } : { scgInterval: sample.interval }),
        confidence: sample.quality * 0.8,
      } as FusedIBISample);
    }
    this.consecutiveMatches = 0;
  }

  private emit(sample: FusedIBISample): void {
    this.fusedQuality = sample.confidence;
    this.callbacks.onFusedIBI?.(sample);
    this.callbacks.onQualityChange?.(sample.confidence);
  }

  private clearMatchTimeout(): void {
    if (this.matchTimeoutId) {
      clearTimeout(this.matchTimeoutId);
      this.matchTimeoutId = null;
    }
  }

  getQuality(): number {
    return this.fusedQuality;
  }

  reset(): void {
    this.pendingPPG = [];
    this.pendingSCG = [];
    this.consecutiveMatches = 0;
    this.fusedQuality = 0;
    this.clearMatchTimeout();
  }
}

export const sensorFusionService = new SensorFusionService();
