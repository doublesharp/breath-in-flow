import { mount } from '@vue/test-utils';
import { defineComponent, nextTick, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useModalIsolation } from '@/composables/useModalIsolation';

const Harness = defineComponent({
  setup() {
    const open = ref(false);
    const escapeSafe = ref(true);
    const showActions = ref(true);
    const dialogRef = ref<HTMLElement | null>(null);
    const backgroundRef = ref<HTMLElement | null>(null);
    const close = vi.fn(() => {
      open.value = false;
    });

    useModalIsolation(dialogRef, open, {
      backgroundRef,
      initialFocus: () =>
        dialogRef.value?.querySelector<HTMLElement>('[data-testid="initial"]') ?? null,
      onEscape: close,
      canEscape: () => escapeSafe.value,
    });

    return { open, escapeSafe, showActions, dialogRef, backgroundRef, close };
  },
  template: `
    <div>
      <main ref="backgroundRef" data-testid="background">
        <button data-testid="trigger" @click="open = true">Open</button>
      </main>
      <div v-if="open" ref="dialogRef" role="dialog">
        <template v-if="showActions">
          <button data-testid="initial">First</button>
          <button data-testid="last">Last</button>
        </template>
      </div>
    </div>
  `,
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

async function openHarness() {
  const wrapper = mount(Harness, { attachTo: document.body });
  const trigger = wrapper.get<HTMLElement>('[data-testid="trigger"]');
  trigger.element.focus();
  await trigger.trigger('click');
  await nextTick();
  await nextTick();
  return { wrapper, trigger };
}

describe('useModalIsolation', () => {
  it('moves focus into the dialog and isolates the background while open', async () => {
    const { wrapper } = await openHarness();
    const background = wrapper.get('[data-testid="background"]');

    expect(document.activeElement).toBe(wrapper.get('[data-testid="initial"]').element);
    expect(background.attributes('inert')).toBe('');
    expect(background.attributes('aria-hidden')).toBe('true');
  });

  it('wraps Tab and Shift+Tab within the dialog', async () => {
    const { wrapper } = await openHarness();
    const first = wrapper.get<HTMLElement>('[data-testid="initial"]').element;
    const last = wrapper.get<HTMLElement>('[data-testid="last"]').element;

    last.focus();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    );
    expect(document.activeElement).toBe(first);

    first.focus();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
    );
    expect(document.activeElement).toBe(last);
  });

  it('restores focus and background attributes when the dialog closes', async () => {
    const { wrapper, trigger } = await openHarness();

    (wrapper.vm as unknown as { open: boolean }).open = false;
    await nextTick();

    const background = wrapper.get('[data-testid="background"]');
    expect(document.activeElement).toBe(trigger.element);
    expect(background.attributes('inert')).toBeUndefined();
    expect(background.attributes('aria-hidden')).toBeUndefined();
  });

  it('preserves background attributes that existed before the dialog opened', async () => {
    const wrapper = mount(Harness, { attachTo: document.body });
    const background = wrapper.get('[data-testid="background"]');
    background.element.setAttribute('inert', '');
    background.element.setAttribute('aria-hidden', 'status-message');

    await wrapper.get('[data-testid="trigger"]').trigger('click');
    await nextTick();
    await nextTick();
    (wrapper.vm as unknown as { open: boolean }).open = false;
    await nextTick();

    expect(background.attributes('inert')).toBe('');
    expect(background.attributes('aria-hidden')).toBe('status-message');
  });

  it('keeps focus on the dialog when it has no focusable controls', async () => {
    const wrapper = mount(Harness, { attachTo: document.body });
    (wrapper.vm as unknown as { showActions: boolean }).showActions = false;
    await nextTick();
    await wrapper.get('[data-testid="trigger"]').trigger('click');
    await nextTick();
    await nextTick();

    const dialog = wrapper.get<HTMLElement>('[role="dialog"]').element;
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    );

    expect(document.activeElement).toBe(dialog);
  });

  it('only handles Escape when cancellation is safe', async () => {
    const { wrapper } = await openHarness();
    const vm = wrapper.vm as unknown as { escapeSafe: boolean; close: ReturnType<typeof vi.fn> };

    vm.escapeSafe = false;
    await nextTick();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(vm.close).not.toHaveBeenCalled();

    vm.escapeSafe = true;
    await nextTick();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(vm.close).toHaveBeenCalledOnce();
  });

  it('removes its key listener and restores isolation when unmounted', async () => {
    const removeListener = vi.spyOn(document, 'removeEventListener');
    const { wrapper } = await openHarness();
    const background = wrapper.get('[data-testid="background"]').element;

    wrapper.unmount();

    expect(removeListener).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(background.hasAttribute('inert')).toBe(false);
    expect(background.hasAttribute('aria-hidden')).toBe(false);
  });
});
