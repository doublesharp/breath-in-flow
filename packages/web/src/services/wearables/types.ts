// Wearable integration types

export interface StressDataPoint {
  timestamp: Date;
  value: number; // 0-100 scale
  source: string;
}

export interface HeartRateDataPoint {
  timestamp: Date;
  value: number; // BPM
  source: string;
}

export interface HRVDataPoint {
  timestamp: Date;
  value: number; // ms (RMSSD)
  source: string;
}

export interface SpO2DataPoint {
  timestamp: Date;
  value: number; // percentage
  source: string;
}

export interface BiometricData {
  stress: StressDataPoint[];
  heartRate: HeartRateDataPoint[];
  hrv: HRVDataPoint[];
  spo2: SpO2DataPoint[];
}

export interface SessionBiometrics {
  sessionId: string;
  sessionStart: Date;
  sessionEnd: Date;
  preSession: BiometricData;
  duringSession: BiometricData;
  postSession: BiometricData;
  averages: {
    preStress?: number;
    postStress?: number;
    stressReduction?: number;
    preHR?: number;
    postHR?: number;
    preHRV?: number;
    postHRV?: number;
  };
}

export interface WearableService {
  providerId: string;
  providerName: string;

  // Authentication
  isConnected(): boolean;
  connect(): Promise<boolean>;
  disconnect(): Promise<void>;
  getAuthUrl?(): string;
  handleAuthCallback?(code: string): Promise<boolean>;

  // Data fetching
  getStressData(start: Date, end: Date): Promise<StressDataPoint[]>;
  getHeartRateData(start: Date, end: Date): Promise<HeartRateDataPoint[]>;
  getHRVData(start: Date, end: Date): Promise<HRVDataPoint[]>;
  getSpO2Data?(start: Date, end: Date): Promise<SpO2DataPoint[]>;

  // Session analysis
  getSessionBiometrics(
    sessionStart: Date,
    sessionEnd: Date,
    preMinutes?: number,
    postMinutes?: number
  ): Promise<SessionBiometrics>;
}
