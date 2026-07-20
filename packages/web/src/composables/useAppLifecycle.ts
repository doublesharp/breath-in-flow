import { App } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { onMounted, onUnmounted } from 'vue';

interface AppLifecycleOptions {
  onInactive: () => void | Promise<void>;
  onActive: () => void | Promise<void>;
}

export function useAppLifecycle({ onInactive, onActive }: AppLifecycleOptions) {
  let documentActive = document.visibilityState !== 'hidden';
  let nativeActive: boolean | null = null;
  let active = documentActive;
  let nativeHandle: PluginListenerHandle | null = null;
  let nativeRegistration: Promise<void> | null = null;
  let disposePromise: Promise<void> | null = null;
  let disposed = false;

  const updateActiveState = () => {
    if (disposed) return;

    const nextActive = documentActive && nativeActive !== false;
    if (nextActive === active) return;

    active = nextActive;
    if (active) {
      void onActive();
    } else {
      void onInactive();
    }
  };

  const handleVisibilityChange = () => {
    documentActive = document.visibilityState !== 'hidden';
    updateActiveState();
  };

  onMounted(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    nativeRegistration = App.addListener('appStateChange', ({ isActive }) => {
      nativeActive = isActive;
      updateActiveState();
    })
      .then((handle) => {
        nativeHandle = handle;
      })
      .catch(() => {
        nativeActive = null;
      });
  });

  async function dispose(): Promise<void> {
    if (disposePromise) return disposePromise;

    disposed = true;
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    disposePromise = (async () => {
      await nativeRegistration;
      await nativeHandle?.remove();
      nativeHandle = null;
    })();
    return disposePromise;
  }

  onUnmounted(() => {
    void dispose();
  });

  return { dispose };
}
