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

describe('SCG native motion startup', () => {
  beforeEach(() => {
    nativeMocks.isNativePlatform.mockReturnValue(true);
    nativeMocks.addListener.mockReset();
    scgService.stop();
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
});
