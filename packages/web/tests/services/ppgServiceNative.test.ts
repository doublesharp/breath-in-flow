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
  callbacks: { onError?: (error: Error) => void };
  disableNativeTorchForGeneration: (generation: number) => Promise<void>;
  nativeTorchDesiredGeneration: number | null;
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
      pendingCandidate: null,
      nativeTorchDesiredGeneration: null,
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
    const ownerCallbacks = { onRawSignal: vi.fn() };
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

    const pending = ppgService.start({ callbacks: ownerCallbacks });
    await vi.waitFor(() => expect(nativeMocks.enable).toHaveBeenCalledOnce());
    ppgService.stop();

    expect(nativeMocks.disable).toHaveBeenCalledOnce();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(removeChild).toHaveBeenCalledOnce();
    expect(ppgService.getStatus()).toBe('idle');
    expect((ppgService as unknown as { callbacks: typeof ownerCallbacks }).callbacks).toBe(
      ownerCallbacks
    );

    resolveEnable();

    await expect(pending).resolves.toMatchObject({ ok: false, reason: 'start-failed' });
    expect(nativeMocks.disable).toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(removeChild).toHaveBeenCalledOnce();
    expect(ppgService.getStatus()).toBe('idle');
    expect((ppgService as unknown as NativeTorchService).torchEnabled).toBe(false);
  });

  it('does not let a stale native torch continuation disable a newer capture', async () => {
    let resolveOldEnable!: () => void;
    let resolveOldDisable!: () => void;
    nativeMocks.isAvailable.mockResolvedValue({ available: true });
    nativeMocks.enable
      .mockImplementationOnce(() => new Promise<void>((resolve) => (resolveOldEnable = resolve)))
      .mockResolvedValueOnce(undefined);
    nativeMocks.disable
      .mockImplementationOnce(() => new Promise<void>((resolve) => (resolveOldDisable = resolve)))
      .mockResolvedValue(undefined);
    const oldTrack = { stop: vi.fn() } as unknown as MediaStreamTrack;
    const newTrack = { stop: vi.fn() } as unknown as MediaStreamTrack;
    const oldStream = {
      getTracks: () => [oldTrack],
      getVideoTracks: () => [oldTrack],
    } as unknown as MediaStream;
    const newStream = {
      getTracks: () => [newTrack],
      getVideoTracks: () => [newTrack],
    } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValueOnce(oldStream).mockResolvedValueOnce(newStream);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    const makeVideo = () =>
      ({
        srcObject: null,
        playsInline: false,
        muted: false,
        readyState: 4,
        videoWidth: 320,
        videoHeight: 240,
        style: {} as CSSStyleDeclaration,
        setAttribute: vi.fn(),
        parentNode: { removeChild: vi.fn() },
        play: vi.fn().mockResolvedValue(undefined),
      }) as unknown as HTMLVideoElement;
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node as Node);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') return makeVideo();
      if (tag === 'canvas') {
        return {
          width: 320,
          height: 240,
          getContext: vi.fn().mockReturnValue({}),
        } as unknown as HTMLCanvasElement;
      }
      return document.createElement(tag);
    });
    const oldCallbacks = { onRawSignal: vi.fn() };
    const newCallbacks = { onRawSignal: vi.fn() };

    const oldPending = ppgService.start({ callbacks: oldCallbacks });
    await vi.waitFor(() => expect(nativeMocks.enable).toHaveBeenCalledOnce());
    ppgService.stop();
    expect(nativeMocks.disable).toHaveBeenCalledOnce();

    const retry = ppgService.start({ callbacks: newCallbacks });
    if (retry === oldPending) {
      resolveOldEnable();
      await oldPending;
      expect(retry).not.toBe(oldPending);
      return;
    }

    await expect(retry).resolves.toEqual({ ok: true });
    expect(ppgService.getStatus()).toBe('capturing');
    expect((ppgService as unknown as { callbacks: typeof newCallbacks }).callbacks).toBe(
      newCallbacks
    );

    resolveOldDisable();
    await vi.waitFor(() => expect(nativeMocks.enable).toHaveBeenCalledTimes(3));
    resolveOldEnable();
    await expect(oldPending).resolves.toMatchObject({ ok: false, reason: 'start-failed' });

    expect(nativeMocks.disable).toHaveBeenCalledOnce();
    expect(oldTrack.stop).toHaveBeenCalledOnce();
    expect(newTrack.stop).not.toHaveBeenCalled();
    expect(ppgService.getStatus()).toBe('capturing');
    expect((ppgService as unknown as NativeTorchService).torchEnabled).toBe(true);
    expect((ppgService as unknown as { callbacks: typeof newCallbacks }).callbacks).toBe(
      newCallbacks
    );
  });

  it('does not let an active capture stop completion clear newer torch ownership', async () => {
    let resolveOldDisable!: () => void;
    nativeMocks.isAvailable.mockResolvedValue({ available: true });
    nativeMocks.enable.mockResolvedValue(undefined);
    nativeMocks.disable
      .mockImplementationOnce(() => new Promise<void>((resolve) => (resolveOldDisable = resolve)))
      .mockResolvedValue(undefined);
    const firstTrack = { stop: vi.fn() } as unknown as MediaStreamTrack;
    const secondTrack = { stop: vi.fn() } as unknown as MediaStreamTrack;
    const makeStream = (track: MediaStreamTrack) =>
      ({
        getTracks: () => [track],
        getVideoTracks: () => [track],
      }) as unknown as MediaStream;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi
          .fn()
          .mockResolvedValueOnce(makeStream(firstTrack))
          .mockResolvedValueOnce(makeStream(secondTrack)),
      },
    });
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
          parentNode: { removeChild: vi.fn() },
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

    await expect(ppgService.start()).resolves.toEqual({ ok: true });
    ppgService.stop();
    expect(nativeMocks.disable).toHaveBeenCalledOnce();
    expect(firstTrack.stop).toHaveBeenCalledOnce();

    await expect(ppgService.start()).resolves.toEqual({ ok: true });
    expect(ppgService.getStatus()).toBe('capturing');
    expect((ppgService as unknown as NativeTorchService).torchEnabled).toBe(true);

    resolveOldDisable();
    await vi.waitFor(() => expect(nativeMocks.enable).toHaveBeenCalledTimes(3));

    expect((ppgService as unknown as NativeTorchService).torchEnabled).toBe(true);
    ppgService.stop();
    expect(nativeMocks.disable).toHaveBeenCalledTimes(2);
    expect(secondTrack.stop).toHaveBeenCalledOnce();
    expect(ppgService.getStatus()).toBe('idle');
  });

  it('clears and reports newer torch ownership when stale-disable recovery fails', async () => {
    nativeMocks.disable.mockResolvedValue(undefined);
    nativeMocks.enable.mockRejectedValue(new Error('native torch unavailable'));
    const onError = vi.fn();
    const service = ppgService as unknown as NativeTorchService;
    service.callbacks = { onError };
    service.torchEnabled = true;
    service.nativeTorchDesiredGeneration = 2;

    await service.disableNativeTorchForGeneration(1);

    expect(service.nativeTorchDesiredGeneration).toBeNull();
    expect(service.torchEnabled).toBe(false);
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0].message).toContain('could not be restored');
  });
});
