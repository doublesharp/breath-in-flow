import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GarminService } from '../../src/services/wearables/garmin';
import type { StressDataPoint, HeartRateDataPoint, HRVDataPoint } from '../../src/services/wearables/types';

describe('GarminService', () => {
  let service: GarminService;
  const mockStorage: Record<string, string> = {};

  beforeEach(() => {
    // Mock localStorage
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => {
      return mockStorage[key] || null;
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key: string, value: string) => {
      mockStorage[key] = value;
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation((key: string) => {
      delete mockStorage[key];
    });

    // Clear storage before each test
    Object.keys(mockStorage).forEach(key => delete mockStorage[key]);

    // Create fresh instance
    service = new GarminService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('connection management', () => {
    it('should start disconnected', () => {
      expect(service.isConnected()).toBe(false);
    });

    it('should connect successfully', async () => {
      const result = await service.connect();

      expect(result).toBe(true);
      expect(service.isConnected()).toBe(true);
    });

    it('should disconnect successfully', async () => {
      await service.connect();
      expect(service.isConnected()).toBe(true);

      await service.disconnect();
      expect(service.isConnected()).toBe(false);
    });

    it('should persist connection state to localStorage', async () => {
      await service.connect();

      expect(mockStorage['garmin_connection']).toBeDefined();
      const stored = JSON.parse(mockStorage['garmin_connection']);
      expect(stored.connected).toBe(true);
      expect(stored.mockMode).toBe(true);
    });

    it('should restore connection state from localStorage', async () => {
      // Set up stored connection
      mockStorage['garmin_connection'] = JSON.stringify({
        connected: true,
        mockMode: true,
        connectedAt: new Date().toISOString(),
      });

      // Create new instance - should restore state
      const newService = new GarminService();
      expect(newService.isConnected()).toBe(true);
    });

    it('should update localStorage state on disconnect', async () => {
      await service.connect();
      expect(mockStorage['garmin_connection']).toBeDefined();

      await service.disconnect();
      // Disconnect saves state with connected: false, rather than removing the key
      expect(mockStorage['garmin_connection']).toBeDefined();
      const stored = JSON.parse(mockStorage['garmin_connection']);
      expect(stored.connected).toBe(false);
    });
  });

  describe('getStressData', () => {
    beforeEach(async () => {
      await service.connect();
    });

    it('should return empty array when not connected', async () => {
      await service.disconnect();
      const data = await service.getStressData(new Date(), new Date());

      expect(data).toEqual([]);
    });

    it('should return stress data array when connected', async () => {
      const startDate = new Date('2024-01-15T10:00:00');
      const endDate = new Date('2024-01-15T10:30:00');
      const data = await service.getStressData(startDate, endDate);

      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
    });

    it('should return valid stress data points', async () => {
      const startDate = new Date('2024-01-15T10:00:00');
      const endDate = new Date('2024-01-15T10:30:00');
      const data = await service.getStressData(startDate, endDate);

      data.forEach((point: StressDataPoint) => {
        expect(point).toHaveProperty('timestamp');
        expect(point).toHaveProperty('value');
        expect(point.timestamp).toBeInstanceOf(Date);
        expect(point.value).toBeGreaterThanOrEqual(0);
        expect(point.value).toBeLessThanOrEqual(100);
      });
    });

    it('should generate data within requested time range', async () => {
      const startDate = new Date('2024-01-15T10:00:00');
      const endDate = new Date('2024-01-15T10:30:00');
      const data = await service.getStressData(startDate, endDate);

      data.forEach((point: StressDataPoint) => {
        expect(point.timestamp.getTime()).toBeGreaterThanOrEqual(startDate.getTime());
        expect(point.timestamp.getTime()).toBeLessThanOrEqual(endDate.getTime());
      });
    });
  });

  describe('getHeartRateData', () => {
    beforeEach(async () => {
      await service.connect();
    });

    it('should return empty array when not connected', async () => {
      await service.disconnect();
      const data = await service.getHeartRateData(new Date(), new Date());

      expect(data).toEqual([]);
    });

    it('should return heart rate data array when connected', async () => {
      const startDate = new Date('2024-01-15T10:00:00');
      const endDate = new Date('2024-01-15T10:30:00');
      const data = await service.getHeartRateData(startDate, endDate);

      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
    });

    it('should return valid heart rate data points', async () => {
      const startDate = new Date('2024-01-15T10:00:00');
      const endDate = new Date('2024-01-15T10:30:00');
      const data = await service.getHeartRateData(startDate, endDate);

      data.forEach((point: HeartRateDataPoint) => {
        expect(point).toHaveProperty('timestamp');
        expect(point).toHaveProperty('value');
        expect(point.timestamp).toBeInstanceOf(Date);
        // Realistic heart rate range: 40-200 BPM
        expect(point.value).toBeGreaterThanOrEqual(40);
        expect(point.value).toBeLessThanOrEqual(200);
      });
    });
  });

  describe('getHRVData', () => {
    beforeEach(async () => {
      await service.connect();
    });

    it('should return empty array when not connected', async () => {
      await service.disconnect();
      const data = await service.getHRVData(new Date(), new Date());

      expect(data).toEqual([]);
    });

    it('should return HRV data array when connected', async () => {
      const startDate = new Date('2024-01-15T10:00:00');
      const endDate = new Date('2024-01-15T10:30:00');
      const data = await service.getHRVData(startDate, endDate);

      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
    });

    it('should return valid HRV data points', async () => {
      const startDate = new Date('2024-01-15T10:00:00');
      const endDate = new Date('2024-01-15T10:30:00');
      const data = await service.getHRVData(startDate, endDate);

      data.forEach((point: HRVDataPoint) => {
        expect(point).toHaveProperty('timestamp');
        expect(point).toHaveProperty('value');
        expect(point.timestamp).toBeInstanceOf(Date);
        // RMSSD typically ranges from 10-100ms for most people
        expect(point.value).toBeGreaterThanOrEqual(0);
        expect(point.value).toBeLessThanOrEqual(150);
      });
    });
  });

  describe('getSessionBiometrics', () => {
    beforeEach(async () => {
      await service.connect();
    });

    it('should return session biometrics with pre/during/post data', async () => {
      const sessionStart = new Date('2024-01-15T10:00:00');
      const sessionEnd = new Date('2024-01-15T10:30:00');

      const data = await service.getSessionBiometrics(sessionStart, sessionEnd);

      expect(data).not.toBeNull();
      expect(data).toHaveProperty('preSession');
      expect(data).toHaveProperty('duringSession');
      expect(data).toHaveProperty('postSession');
      expect(data).toHaveProperty('averages');
    });

    it('should include biometric data for each session phase', async () => {
      const sessionStart = new Date('2024-01-15T10:00:00');
      const sessionEnd = new Date('2024-01-15T10:30:00');

      const data = await service.getSessionBiometrics(sessionStart, sessionEnd);

      // Check preSession structure
      expect(data.preSession).toHaveProperty('stress');
      expect(data.preSession).toHaveProperty('heartRate');
      expect(data.preSession).toHaveProperty('hrv');
      expect(Array.isArray(data.preSession.stress)).toBe(true);
      expect(Array.isArray(data.preSession.heartRate)).toBe(true);
      expect(Array.isArray(data.preSession.hrv)).toBe(true);

      // Check duringSession structure
      expect(data.duringSession).toHaveProperty('stress');
      expect(data.duringSession).toHaveProperty('heartRate');
      expect(data.duringSession).toHaveProperty('hrv');

      // Check postSession structure
      expect(data.postSession).toHaveProperty('stress');
      expect(data.postSession).toHaveProperty('heartRate');
      expect(data.postSession).toHaveProperty('hrv');
    });

    it('should calculate averages for stress', async () => {
      const sessionStart = new Date('2024-01-15T10:00:00');
      const sessionEnd = new Date('2024-01-15T10:30:00');

      const data = await service.getSessionBiometrics(sessionStart, sessionEnd);

      expect(data.averages).toHaveProperty('preStress');
      expect(data.averages).toHaveProperty('postStress');
      expect(data.averages).toHaveProperty('stressReduction');

      // Averages should be numbers or undefined
      if (data.averages.preStress !== undefined) {
        expect(typeof data.averages.preStress).toBe('number');
        expect(data.averages.preStress).toBeGreaterThanOrEqual(0);
        expect(data.averages.preStress).toBeLessThanOrEqual(100);
      }

      if (data.averages.postStress !== undefined) {
        expect(typeof data.averages.postStress).toBe('number');
        expect(data.averages.postStress).toBeGreaterThanOrEqual(0);
        expect(data.averages.postStress).toBeLessThanOrEqual(100);
      }
    });

    it('should calculate averages for heart rate', async () => {
      const sessionStart = new Date('2024-01-15T10:00:00');
      const sessionEnd = new Date('2024-01-15T10:30:00');

      const data = await service.getSessionBiometrics(sessionStart, sessionEnd);

      expect(data.averages).toHaveProperty('preHR');
      expect(data.averages).toHaveProperty('postHR');

      if (data.averages.preHR !== undefined) {
        expect(typeof data.averages.preHR).toBe('number');
        expect(data.averages.preHR).toBeGreaterThanOrEqual(40);
        expect(data.averages.preHR).toBeLessThanOrEqual(200);
      }

      if (data.averages.postHR !== undefined) {
        expect(typeof data.averages.postHR).toBe('number');
        expect(data.averages.postHR).toBeGreaterThanOrEqual(40);
        expect(data.averages.postHR).toBeLessThanOrEqual(200);
      }
    });

    it('should calculate averages for HRV', async () => {
      const sessionStart = new Date('2024-01-15T10:00:00');
      const sessionEnd = new Date('2024-01-15T10:30:00');

      const data = await service.getSessionBiometrics(sessionStart, sessionEnd);

      expect(data.averages).toHaveProperty('preHRV');
      expect(data.averages).toHaveProperty('postHRV');

      if (data.averages.preHRV !== undefined) {
        expect(typeof data.averages.preHRV).toBe('number');
        expect(data.averages.preHRV).toBeGreaterThanOrEqual(0);
      }

      if (data.averages.postHRV !== undefined) {
        expect(typeof data.averages.postHRV).toBe('number');
        expect(data.averages.postHRV).toBeGreaterThanOrEqual(0);
      }
    });

    it('should accept custom pre and post minutes', async () => {
      const sessionStart = new Date('2024-01-15T10:00:00');
      const sessionEnd = new Date('2024-01-15T10:30:00');

      const data = await service.getSessionBiometrics(sessionStart, sessionEnd, 5, 5);

      expect(data).not.toBeNull();
      expect(data.sessionStart).toEqual(sessionStart);
      expect(data.sessionEnd).toEqual(sessionEnd);
    });

    it('should include session metadata', async () => {
      const sessionStart = new Date('2024-01-15T10:00:00');
      const sessionEnd = new Date('2024-01-15T10:30:00');

      const data = await service.getSessionBiometrics(sessionStart, sessionEnd);

      expect(data).toHaveProperty('sessionId');
      expect(data).toHaveProperty('sessionStart');
      expect(data).toHaveProperty('sessionEnd');
      expect(typeof data.sessionId).toBe('string');
      expect(data.sessionStart).toEqual(sessionStart);
      expect(data.sessionEnd).toEqual(sessionEnd);
    });
  });

  describe('provider properties', () => {
    it('should have correct provider ID', () => {
      expect(service.providerId).toBe('garmin');
    });

    it('should have correct provider name', () => {
      expect(service.providerName).toBe('Garmin Connect');
    });
  });

  describe('mock mode', () => {
    it('should operate in mock mode by default', async () => {
      await service.connect();
      
      // Mock mode is internal but we can verify by checking that data is generated
      const data = await service.getStressData(
        new Date('2024-01-15T10:00:00'),
        new Date('2024-01-15T10:30:00')
      );

      expect(data).not.toBeNull();
      expect(data!.length).toBeGreaterThan(0);
    });
  });
});

describe('GarminService singleton', () => {
  it('should export a singleton instance', async () => {
    const { garminService } = await import('../../src/services/wearables/garmin');
    
    expect(garminService).toBeDefined();
    expect(garminService).toBeInstanceOf(GarminService);
  });
});
