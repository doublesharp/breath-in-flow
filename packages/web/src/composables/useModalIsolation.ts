import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue';

interface ModalIsolationOptions {
  backgroundRef?: Ref<HTMLElement | null>;
  initialFocus?: () => HTMLElement | null;
  onEscape?: () => void;
  canEscape?: () => boolean;
}

interface RestoredAttribute {
  readonly element: HTMLElement;
  readonly inert: boolean;
  readonly ariaHidden: string | null;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.getAttribute('aria-hidden') !== 'true' && !element.hasAttribute('inert')
  );
}

export function useModalIsolation(
  dialogRef: Ref<HTMLElement | null>,
  openRef: Readonly<Ref<boolean>>,
  options: ModalIsolationOptions = {}
) {
  let focusBeforeOpen: HTMLElement | null = null;
  let restoredAttributes: RestoredAttribute[] = [];
  let listening = false;
  let activationId = 0;

  function backgroundElements(dialog: HTMLElement): HTMLElement[] {
    if (options.backgroundRef?.value) return [options.backgroundRef.value];

    return Array.from(document.body.children)
      .filter((element): element is HTMLElement => element instanceof HTMLElement)
      .filter((element) => element !== dialog && !element.contains(dialog));
  }

  function isolateBackground(dialog: HTMLElement) {
    restoredAttributes = backgroundElements(dialog).map((element) => ({
      element,
      inert: element.hasAttribute('inert'),
      ariaHidden: element.getAttribute('aria-hidden'),
    }));

    for (const { element } of restoredAttributes) {
      element.setAttribute('inert', '');
      element.setAttribute('aria-hidden', 'true');
    }
  }

  function restoreBackground() {
    for (const { element, inert, ariaHidden } of restoredAttributes) {
      if (inert) element.setAttribute('inert', '');
      else element.removeAttribute('inert');

      if (ariaHidden === null) element.removeAttribute('aria-hidden');
      else element.setAttribute('aria-hidden', ariaHidden);
    }
    restoredAttributes = [];
  }

  function handleKeydown(event: KeyboardEvent) {
    const dialog = dialogRef.value;
    if (!openRef.value || !dialog) return;

    if (event.key === 'Escape') {
      if (!options.onEscape || options.canEscape?.() === false) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      options.onEscape();
      return;
    }

    if (event.key !== 'Tab') return;
    const focusable = focusableElements(dialog);
    if (focusable.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !dialog.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  function listen() {
    if (listening) return;
    document.addEventListener('keydown', handleKeydown, true);
    listening = true;
  }

  function unlisten() {
    if (!listening) return;
    document.removeEventListener('keydown', handleKeydown, true);
    listening = false;
  }

  async function activate() {
    const currentActivation = ++activationId;
    focusBeforeOpen = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    await nextTick();
    if (currentActivation !== activationId || !openRef.value || !dialogRef.value) return;

    const dialog = dialogRef.value;
    isolateBackground(dialog);
    listen();
    const focusTarget = options.initialFocus?.() ?? focusableElements(dialog)[0] ?? dialog;
    focusTarget.focus();
  }

  function deactivate({ restoreFocus = true } = {}) {
    activationId += 1;
    unlisten();
    restoreBackground();
    const focusTarget = focusBeforeOpen;
    focusBeforeOpen = null;
    if (restoreFocus && focusTarget?.isConnected) focusTarget.focus();
  }

  const stopWatching = watch(openRef, (open) => {
    if (open) void activate();
    else deactivate();
  });

  onBeforeUnmount(() => {
    stopWatching();
    deactivate({ restoreFocus: false });
  });

  return { deactivate };
}

export type { ModalIsolationOptions };
