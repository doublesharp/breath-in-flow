import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppLifecycle } from '@/composables/useAppLifecycle';

const appMocks = vi.hoisted(() => ({
  addListener: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: appMocks.addListener,
  },
}));

describe('useAppLifecycle', () => {
  let visibilityState: DocumentVisibilityState;
  let nativeStateChange: ((state: { isActive: boolean }) => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    visibilityState = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibilityState);
    appMocks.remove.mockResolvedValue(undefined);
    appMocks.addListener.mockImplementation(
      async (_event: string, listener: (state: { isActive: boolean }) => void) => {
        nativeStateChange = listener;
        return { remove: appMocks.remove };
      }
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mountLifecycle(onInactive = vi.fn(), onActive = vi.fn()) {
    const Component = defineComponent({
      setup() {
        return useAppLifecycle({ onInactive, onActive });
      },
      template: '<div />',
    });

    return { wrapper: mount(Component), onInactive, onActive };
  }

  it('coalesces native and document events into one callback per active-state transition', async () => {
    const { wrapper, onInactive, onActive } = mountLifecycle();
    await flushPromises();

    nativeStateChange?.({ isActive: false });
    visibilityState = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));

    expect(onInactive).toHaveBeenCalledOnce();
    expect(onActive).not.toHaveBeenCalled();

    visibilityState = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    nativeStateChange?.({ isActive: true });

    expect(onActive).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it('removes native and document listeners and ignores events after disposal', async () => {
    const removeDocumentListener = vi.spyOn(document, 'removeEventListener');
    const { wrapper, onInactive, onActive } = mountLifecycle();
    await flushPromises();

    await (wrapper.vm as unknown as { dispose: () => Promise<void> }).dispose();

    expect(appMocks.remove).toHaveBeenCalledOnce();
    expect(removeDocumentListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));

    nativeStateChange?.({ isActive: false });
    visibilityState = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));

    expect(onInactive).not.toHaveBeenCalled();
    expect(onActive).not.toHaveBeenCalled();
  });

  it('keeps the document fallback when native listener registration rejects', async () => {
    appMocks.addListener.mockRejectedValueOnce(new Error('native app plugin unavailable'));
    const { wrapper, onInactive, onActive } = mountLifecycle();
    await flushPromises();

    visibilityState = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    visibilityState = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));

    expect(onInactive).toHaveBeenCalledOnce();
    expect(onActive).toHaveBeenCalledOnce();

    wrapper.unmount();
  });
});
