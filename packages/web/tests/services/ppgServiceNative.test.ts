import { beforeEach, describe, expect, it, vi } from 'vitest';

const nativeMocks = vi.hoisted(() => ({
  isAvailable: vi.fn(),
  enable: vi.fn(),
  disable: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
}));

vi.mock('@capawesome/capacitor-torch', () => ({
  Torch: nativeMocks,
}));

import { ppgService } from '../../src/services/ppgService';

type NativeTorchService = {
  torchEnabled: boolean;
  enableTorch: () => Promise<void>;
  disableTorch: () => Promise<void>;
};

describe('PPG native torch lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (ppgService as unknown as NativeTorchService).torchEnabled = false;
  });

  it('enables and disables the native torch when it is available', async () => {
    nativeMocks.isAvailable.mockResolvedValue({ available: true });
    nativeMocks.enable.mockResolvedValue(undefined);
    nativeMocks.disable.mockResolvedValue(undefined);
    const service = ppgService as unknown as NativeTorchService;

    await service.enableTorch();
    expect(nativeMocks.enable).toHaveBeenCalledOnce();
    expect(service.torchEnabled).toBe(true);

    await service.disableTorch();
    expect(nativeMocks.disable).toHaveBeenCalledOnce();
    expect(service.torchEnabled).toBe(false);
  });

  it('leaves torch disabled when the native plugin reports it unavailable', async () => {
    nativeMocks.isAvailable.mockResolvedValue({ available: false });
    const service = ppgService as unknown as NativeTorchService;

    await service.enableTorch();

    expect(nativeMocks.enable).not.toHaveBeenCalled();
    expect(service.torchEnabled).toBe(false);
  });
});
