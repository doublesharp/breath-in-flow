import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nativeMocks = vi.hoisted(() => ({
  addListener: vi.fn(),
  isNativePlatform: vi.fn(() => true),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: nativeMocks.isNativePlatform },
}));

vi.mock('@capacitor/motion', () => ({
  Motion: { addListener: nativeMocks.addListener },
}));

import { scgService } from '../../src/services/scgService';

const motionEvent = {
  acceleration: { x: 0, y: 0, z: 9.81 },
  accelerationIncludingGravity: { x: 0, y: 0, z: 9.81 },
  interval: 10,
};

describe('SCG native motion startup', () => {
  beforeEach(() => {
    nativeMocks.isNativePlatform.mockReturnValue(true);
    nativeMocks.addListener.mockReset();
    scgService.stop();
    scgService.setCallbacks({});
  });

  afterEach(() => {
    scgService.stop();
    vi.restoreAllMocks();
  });

  it('captures Capacitor motion events and removes the native listener on stop', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    let listener:
      | ((event: {
          acceleration: { x: number; y: number; z: number };
          accelerationIncludingGravity: { x: number; y: number; z: number };
          interval: number;
        }) => void)
      | undefined;
    nativeMocks.addListener.mockImplementation(async (_eventName, callback) => {
      listener = callback;
      return { remove };
    });

    await expect(scgService.start()).resolves.toEqual({ ok: true });
    listener?.({
      acceleration: { x: 0, y: 0, z: 1 },
      accelerationIncludingGravity: { x: 0, y: 0, z: 1 },
      interval: 10,
    });
    expect(scgService.getStatus()).toBe('capturing');

    scgService.stop();
    expect(remove).toHaveBeenCalledOnce();
  });

  it('falls back to the web motion API when native listener registration fails', async () => {
    nativeMocks.addListener.mockRejectedValue(new Error('native listener unavailable'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(scgService.start()).resolves.toEqual({ ok: true });

    expect(scgService.getStatus()).toBe('capturing');
    expect(warn).toHaveBeenCalledWith(
      'SCG: Capacitor Motion failed, falling back to web API:',
      expect.objectContaining({ message: 'native listener unavailable' })
    );
  });

  it('measures native arrivals when the plugin reports a zero interval', async () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1_000);
    const onRawSignal = vi.fn();
    let listener!: (event: typeof motionEvent) => void;
    nativeMocks.addListener.mockImplementation(async (_name, callback) => {
      listener = callback;
      return { remove: vi.fn().mockResolvedValue(undefined) };
    });
    scgService.setCallbacks({ onRawSignal });
    await scgService.start();

    for (let index = 1; index <= 20; index++) {
      now.mockReturnValue(1_000 + index * 20);
      listener({ ...motionEvent, interval: 0 });
    }

    expect((scgService as unknown as { sampleRateHz: number }).sampleRateHz).toBeCloseTo(50);
    expect(onRawSignal).toHaveBeenLastCalledWith(9.81, 1_400);
  });

  it('shares a pending registration across concurrent starts without leaking a listener', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    let resolveRegistration!: (handle: { remove: typeof remove }) => void;
    nativeMocks.addListener.mockReturnValue(
      new Promise((resolve) => (resolveRegistration = resolve))
    );

    const first = scgService.start();
    const second = scgService.start();
    expect(nativeMocks.addListener).toHaveBeenCalledOnce();

    resolveRegistration({ remove });
    await expect(first).resolves.toEqual({ ok: true });
    await expect(second).resolves.toEqual({ ok: true });
    scgService.stop();
    expect(remove).toHaveBeenCalledOnce();
  });

  it('releases a late native handle without restarting a stopped capture', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    let resolveRegistration!: (handle: { remove: typeof remove }) => void;
    nativeMocks.addListener.mockReturnValue(
      new Promise((resolve) => (resolveRegistration = resolve))
    );
    const pending = scgService.start();
    scgService.stop();
    resolveRegistration({ remove });

    await expect(pending).resolves.toMatchObject({ ok: false, reason: 'start-failed' });
    expect(remove).toHaveBeenCalledOnce();
    expect(scgService.getStatus()).toBe('idle');
  });

  it('ignores callbacks and late handles from a capture replaced during startup', async () => {
    const oldRemove = vi.fn().mockResolvedValue(undefined);
    const currentRemove = vi.fn().mockResolvedValue(undefined);
    const onRawSignal = vi.fn();
    const callbacks: Array<(event: typeof motionEvent) => void> = [];
    let resolveOld!: (handle: { remove: typeof oldRemove }) => void;
    nativeMocks.addListener.mockImplementationOnce((_name, callback) => {
      callbacks.push(callback);
      return new Promise((resolve) => (resolveOld = resolve));
    });
    nativeMocks.addListener.mockImplementationOnce(async (_name, callback) => {
      callbacks.push(callback);
      return { remove: currentRemove };
    });
    scgService.setCallbacks({ onRawSignal });
    const oldStart = scgService.start();
    scgService.stop();
    await scgService.start();

    callbacks[0](motionEvent);
    expect(onRawSignal).not.toHaveBeenCalled();
    callbacks[1](motionEvent);
    expect(onRawSignal).toHaveBeenCalledOnce();

    resolveOld({ remove: oldRemove });
    await expect(oldStart).resolves.toMatchObject({ ok: false });
    expect(oldRemove).toHaveBeenCalledOnce();
    expect(currentRemove).not.toHaveBeenCalled();
    expect(scgService.getStatus()).toBe('capturing');
    scgService.stop();
    callbacks[1](motionEvent);
    expect(onRawSignal).toHaveBeenCalledOnce();
    expect(currentRemove).toHaveBeenCalledOnce();
  });

  it('does not fall back to web capture after a stopped native registration rejects', async () => {
    let rejectRegistration!: (error: Error) => void;
    nativeMocks.addListener.mockReturnValue(
      new Promise((_resolve, reject) => (rejectRegistration = reject))
    );
    const addEventListener = vi.spyOn(window, 'addEventListener');
    const onError = vi.fn();
    scgService.setCallbacks({ onError });
    const pending = scgService.start();
    scgService.stop();
    rejectRegistration(new Error('Registration cancelled'));

    await expect(pending).resolves.toMatchObject({ ok: false });
    expect(scgService.getStatus()).toBe('idle');
    expect(onError).not.toHaveBeenCalled();
    expect(addEventListener).not.toHaveBeenCalledWith('devicemotion', expect.any(Function));
  });
});
