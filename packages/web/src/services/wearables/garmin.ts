// Garmin Connect API Integration
// Note: Full OAuth implementation requires server-side component for security
// This provides the client-side interface and mock data for development

import type {
  WearableService,
  StressDataPoint,
  HeartRateDataPoint,
  HRVDataPoint,
  SpO2DataPoint,
  SessionBiometrics,
  BiometricData,
} from './types';

const GARMIN_STORAGE_KEY = 'garmin_connection';

interface GarminConnectionData {
  connected: boolean;
  lastSync?: string;
  mockMode: boolean;
}

const DEFAULT_CONNECTION_DATA: GarminConnectionData = {
  connected: false,
  mockMode: true,
};

export class GarminService implements WearableService {
  providerId = 'garmin';
  providerName = 'Garmin Connect';

  private connectionData: GarminConnectionData = { ...DEFAULT_CONNECTION_DATA };

  constructor() {
    this.loadConnectionState();
  }

  private getStorage(): Storage | null {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  }

  private loadConnectionState(): void {
    const storage = this.getStorage();
    if (!storage) return;

    try {
      const stored = storage.getItem(GARMIN_STORAGE_KEY);
      if (!stored) return;

      const parsed = JSON.parse(stored) as Partial<GarminConnectionData>;
      this.connectionData = {
        connected: parsed.connected === true,
        mockMode: typeof parsed.mockMode === 'boolean' ? parsed.mockMode : true,
        lastSync: typeof parsed.lastSync === 'string' ? parsed.lastSync : undefined,
      };
    } catch {
      this.connectionData = { ...DEFAULT_CONNECTION_DATA };
    }
  }

  private saveConnectionState(): void {
    try {
      this.getStorage()?.setItem(GARMIN_STORAGE_KEY, JSON.stringify(this.connectionData));
    } catch {
      // Persistence is best-effort; connection state remains available in memory.
    }
  }

  isConnected(): boolean {
    return this.connectionData.connected;
  }

  async connect(): Promise<boolean> {
    // For now, simulate connection with mock data
    // Real implementation would redirect to Garmin OAuth
    this.connectionData.connected = true;
    this.connectionData.lastSync = new Date().toISOString();
    this.connectionData.mockMode = true;
    this.saveConnectionState();
    return true;
  }

  async disconnect(): Promise<void> {
    this.connectionData.connected = false;
    this.connectionData.lastSync = undefined;
    this.saveConnectionState();
  }

  getAuthUrl(): string {
    // Real implementation would return Garmin OAuth URL
    // Garmin Connect API requires partner access
    return 'https://connect.garmin.com/oauthConfirm';
  }

  async handleAuthCallback(_code: string): Promise<boolean> {
    // Real implementation would exchange code for tokens
    return this.connect();
  }

  // Generate realistic mock stress data
  private generateMockStressData(start: Date, end: Date): StressDataPoint[] {
    const data: StressDataPoint[] = [];
    const interval = 5 * 60 * 1000; // 5-minute intervals
    let currentTime = start.getTime();

    // Base stress with realistic patterns
    let baseStress = 40 + Math.random() * 20;

    while (currentTime <= end.getTime()) {
      // Add some variation
      const variation = (Math.random() - 0.5) * 15;
      const timeOfDay = new Date(currentTime).getHours();

      // Higher stress during work hours
      let timeModifier = 0;
      if (timeOfDay >= 9 && timeOfDay <= 17) {
        timeModifier = 10;
      }

      const value = Math.max(0, Math.min(100, baseStress + variation + timeModifier));

      data.push({
        timestamp: new Date(currentTime),
        value: Math.round(value),
        source: 'garmin',
      });

      // Gradual drift in base stress
      baseStress += (Math.random() - 0.5) * 5;
      baseStress = Math.max(20, Math.min(70, baseStress));

      currentTime += interval;
    }

    return data;
  }

  // Generate mock heart rate data
  private generateMockHeartRateData(start: Date, end: Date): HeartRateDataPoint[] {
    const data: HeartRateDataPoint[] = [];
    const interval = 60 * 1000; // 1-minute intervals
    let currentTime = start.getTime();
    let baseHR = 65 + Math.random() * 15;

    while (currentTime <= end.getTime()) {
      const variation = (Math.random() - 0.5) * 10;
      const value = Math.max(50, Math.min(120, baseHR + variation));

      data.push({
        timestamp: new Date(currentTime),
        value: Math.round(value),
        source: 'garmin',
      });

      baseHR += (Math.random() - 0.5) * 3;
      baseHR = Math.max(55, Math.min(85, baseHR));

      currentTime += interval;
    }

    return data;
  }

  // Generate mock HRV data
  private generateMockHRVData(start: Date, end: Date): HRVDataPoint[] {
    const data: HRVDataPoint[] = [];
    const interval = 5 * 60 * 1000; // 5-minute intervals
    let currentTime = start.getTime();
    let baseHRV = 40 + Math.random() * 20;

    while (currentTime <= end.getTime()) {
      const variation = (Math.random() - 0.5) * 15;
      const value = Math.max(10, Math.min(100, baseHRV + variation));

      data.push({
        timestamp: new Date(currentTime),
        value: Math.round(value),
        source: 'garmin',
      });

      baseHRV += (Math.random() - 0.5) * 5;
      baseHRV = Math.max(30, Math.min(70, baseHRV));

      currentTime += interval;
    }

    return data;
  }

  async getStressData(start: Date, end: Date): Promise<StressDataPoint[]> {
    if (!this.isConnected()) {
      return [];
    }

    // In mock mode, generate realistic data
    if (this.connectionData.mockMode) {
      return this.generateMockStressData(start, end);
    }

    // Real API call would go here
    // const response = await fetch(`https://api.garmin.com/wellness/stress?start=${start.toISOString()}&end=${end.toISOString()}`);
    return [];
  }

  async getHeartRateData(start: Date, end: Date): Promise<HeartRateDataPoint[]> {
    if (!this.isConnected()) {
      return [];
    }

    if (this.connectionData.mockMode) {
      return this.generateMockHeartRateData(start, end);
    }

    return [];
  }

  async getHRVData(start: Date, end: Date): Promise<HRVDataPoint[]> {
    if (!this.isConnected()) {
      return [];
    }

    if (this.connectionData.mockMode) {
      return this.generateMockHRVData(start, end);
    }

    return [];
  }

  async getSpO2Data(_start: Date, _end: Date): Promise<SpO2DataPoint[]> {
    // Garmin devices with SpO2 support
    return [];
  }

  async getSessionBiometrics(
    sessionStart: Date,
    sessionEnd: Date,
    preMinutes: number = 10,
    postMinutes: number = 10
  ): Promise<SessionBiometrics> {
    const preStart = new Date(sessionStart.getTime() - preMinutes * 60 * 1000);
    const postEnd = new Date(sessionEnd.getTime() + postMinutes * 60 * 1000);

    const [preStress, duringStress, postStress] = await Promise.all([
      this.getStressData(preStart, sessionStart),
      this.getStressData(sessionStart, sessionEnd),
      this.getStressData(sessionEnd, postEnd),
    ]);

    const [preHR, duringHR, postHR] = await Promise.all([
      this.getHeartRateData(preStart, sessionStart),
      this.getHeartRateData(sessionStart, sessionEnd),
      this.getHeartRateData(sessionEnd, postEnd),
    ]);

    const [preHRV, duringHRV, postHRV] = await Promise.all([
      this.getHRVData(preStart, sessionStart),
      this.getHRVData(sessionStart, sessionEnd),
      this.getHRVData(sessionEnd, postEnd),
    ]);

    const preSessionData: BiometricData = {
      stress: preStress,
      heartRate: preHR,
      hrv: preHRV,
      spo2: [],
    };

    const duringSessionData: BiometricData = {
      stress: duringStress,
      heartRate: duringHR,
      hrv: duringHRV,
      spo2: [],
    };

    const postSessionData: BiometricData = {
      stress: postStress,
      heartRate: postHR,
      hrv: postHRV,
      spo2: [],
    };

    // Calculate averages
    const avgPreStress = this.average(preStress.map((d) => d.value));
    const avgPostStress = this.average(postStress.map((d) => d.value));
    const avgPreHR = this.average(preHR.map((d) => d.value));
    const avgPostHR = this.average(postHR.map((d) => d.value));
    const avgPreHRV = this.average(preHRV.map((d) => d.value));
    const avgPostHRV = this.average(postHRV.map((d) => d.value));

    return {
      sessionId: `${sessionStart.getTime()}`,
      sessionStart,
      sessionEnd,
      preSession: preSessionData,
      duringSession: duringSessionData,
      postSession: postSessionData,
      averages: {
        preStress: avgPreStress,
        postStress: avgPostStress,
        stressReduction:
          avgPreStress !== undefined && avgPostStress !== undefined
            ? avgPreStress - avgPostStress
            : undefined,
        preHR: avgPreHR,
        postHR: avgPostHR,
        preHRV: avgPreHRV,
        postHRV: avgPostHRV,
      },
    };
  }

  private average(values: number[]): number | undefined {
    if (values.length === 0) return undefined;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }
}

// Singleton instance
export const garminService = new GarminService();
