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
  private pendingPPG: IBISample | null = null;
  private pendingSCG: IBISample | null = null;
  private matchWindowMs = 100; // ±100ms to match beats
  private matchTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private consecutiveMatches = 0;
  private fusedQuality = 0;

  setCallbacks(callbacks: SensorFusionCallbacks): void {
    this.callbacks = callbacks;
  }

  // Called by PPG service when it detects a beat
  addPPGSample(sample: IBISample): void {
    this.pendingPPG = sample;
    this.tryMatch();
  }

  // Called by SCG service when it detects a beat
  addSCGSample(sample: IBISample): void {
    this.pendingSCG = sample;
    this.tryMatch();
  }

  private tryMatch(): void {
    // If both pending, check if timestamps are within matchWindowMs
    if (this.pendingPPG && this.pendingSCG) {
      const timeDiff = Math.abs(this.pendingPPG.timestamp - this.pendingSCG.timestamp);

      if (timeDiff <= this.matchWindowMs) {
        // Matched! Both sensors detected the same beat
        const intervalDiff = Math.abs(this.pendingPPG.interval - this.pendingSCG.interval);

        let fusedInterval: number;
        let confidence: number;

        if (intervalDiff <= 30) {
          // Agree closely — quality-weighted average
          const totalQ = this.pendingPPG.quality + this.pendingSCG.quality;
          fusedInterval =
            totalQ > 0
              ? (this.pendingPPG.interval * this.pendingPPG.quality +
                  this.pendingSCG.interval * this.pendingSCG.quality) /
                totalQ
              : (this.pendingPPG.interval + this.pendingSCG.interval) / 2;
          this.consecutiveMatches++;
          confidence = Math.min(
            1,
            ((this.pendingPPG.quality + this.pendingSCG.quality) / 2) *
              (this.consecutiveMatches >= 5 ? 1.2 : 1.0),
          );
        } else {
          // Disagree — use higher quality source
          fusedInterval =
            this.pendingPPG.quality >= this.pendingSCG.quality
              ? this.pendingPPG.interval
              : this.pendingSCG.interval;
          this.consecutiveMatches = 0;
          confidence = Math.max(this.pendingPPG.quality, this.pendingSCG.quality) * 0.7;
        }

        const fused: FusedIBISample = {
          timestamp: (this.pendingPPG.timestamp + this.pendingSCG.timestamp) / 2,
          interval: fusedInterval,
          quality: confidence,
          source: 'fused',
          ppgInterval: this.pendingPPG.interval,
          scgInterval: this.pendingSCG.interval,
          confidence,
        };

        this.emit(fused);
        this.pendingPPG = null;
        this.pendingSCG = null;
        this.clearMatchTimeout();
        return;
      }
    }

    // Set a timeout — if the other sensor doesn't match within the window, emit the single sample
    if (!this.matchTimeoutId) {
      this.matchTimeoutId = setTimeout(() => {
        this.flushPending();
      }, this.matchWindowMs);
    }
  }

  private flushPending(): void {
    this.clearMatchTimeout();

    if (this.pendingPPG && !this.pendingSCG) {
      this.emit({
        ...this.pendingPPG,
        source: 'ppg',
        ppgInterval: this.pendingPPG.interval,
        confidence: this.pendingPPG.quality * 0.8,
      } as FusedIBISample);
      this.pendingPPG = null;
      this.consecutiveMatches = 0;
    }

    if (this.pendingSCG && !this.pendingPPG) {
      this.emit({
        ...this.pendingSCG,
        source: 'scg',
        scgInterval: this.pendingSCG.interval,
        confidence: this.pendingSCG.quality * 0.8,
      } as FusedIBISample);
      this.pendingSCG = null;
      this.consecutiveMatches = 0;
    }
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
    this.pendingPPG = null;
    this.pendingSCG = null;
    this.consecutiveMatches = 0;
    this.fusedQuality = 0;
    this.clearMatchTimeout();
  }
}

export const sensorFusionService = new SensorFusionService();
