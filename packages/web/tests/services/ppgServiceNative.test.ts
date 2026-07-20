import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    Object.assign(ppgService as unknown as Record<string, unknown>, {
      status: 'idle',
      stream: null,
      video: null,
      canvas: null,
      ctx: null,
      animFrameId: null,
      callbacks: {},
      torchEnabled: false,
      startGeneration: 0,
      pendingStartPromise: null,
    });
    vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(42));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    ppgService.stop();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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

  it('disables a native torch whose enable resolves after startup was stopped', async () => {
    let resolveEnable!: () => void;
    nativeMocks.isAvailable.mockResolvedValue({ available: true });
    nativeMocks.enable.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveEnable = resolve;
      })
    );
    nativeMocks.disable.mockResolvedValue(undefined);
    const track = { stop: vi.fn() } as unknown as MediaStreamTrack;
    const stream = {
      getTracks: () => [track],
      getVideoTracks: () => [track],
    } as unknown as MediaStream;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });
    const removeChild = vi.fn();
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node as Node);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') {
        return {
          srcObject: null,
          playsInline: false,
          muted: false,
          readyState: 4,
          videoWidth: 320,
          videoHeight: 240,
          style: {} as CSSStyleDeclaration,
          setAttribute: vi.fn(),
          parentNode: { removeChild },
          play: vi.fn().mockResolvedValue(undefined),
        } as unknown as HTMLVideoElement;
      }
      if (tag === 'canvas') {
        return {
          width: 320,
          height: 240,
          getContext: vi.fn().mockReturnValue({}),
        } as unknown as HTMLCanvasElement;
      }
      return document.createElement(tag);
    });

    const pending = ppgService.start();
    await vi.waitFor(() => expect(nativeMocks.enable).toHaveBeenCalledOnce());
    ppgService.stop();
    resolveEnable();

    await expect(pending).resolves.toMatchObject({ ok: false, reason: 'start-failed' });
    expect(nativeMocks.disable).toHaveBeenCalledOnce();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(removeChild).toHaveBeenCalledOnce();
    expect(ppgService.getStatus()).toBe('idle');
    expect((ppgService as unknown as NativeTorchService).torchEnabled).toBe(false);
  });
});
