import { afterEach, describe, it, expect, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import HelpSystem from '../../src/components/HelpSystem.vue';

enableAutoUnmount(afterEach);

// Backup + support services are mocked so the embedded Data & Support flow can
// reach the restore-confirmation dialog without touching real storage/plugins.
const backupServiceMock = vi.hoisted(() => ({
  createBackup: vi.fn(),
  parseBackupFile: vi.fn(),
  parseBackupText: vi.fn(),
  restoreBackup: vi.fn(),
}));

vi.mock('@/services/appBackupService', () => ({
  createDefaultBackupService: vi.fn(() => backupServiceMock),
}));
vi.mock('@/services/supportService', () => ({
  sendSupportMessage: vi.fn().mockResolvedValue({ method: 'share' }),
  shareBackupFile: vi.fn().mockResolvedValue({ method: 'download' }),
  createSupportMessage: vi.fn(),
}));

function parsedBackupFixture() {
  return {
    envelope: {
      formatVersion: 1,
      metadata: { appVersion: '1.0.0', exportedAt: '2026-07-01T10:00:00.000Z' },
      data: {},
    },
    data: {
      preferences: { version: 1, goal: 'RELAX' },
      configs: [{ id: 'c1' }],
      sessions: [{ id: 's1' }, { id: 's2' }],
      soundTheme: 'wood',
      lastConfig: null,
      measurements: [{ id: 'm1' }],
      assessments: [],
    },
  };
}

describe('HelpSystem.vue', () => {
  it('opens and displays modal when help button clicked', async () => {
    const wrapper = mount(HelpSystem);

    const trigger = wrapper.find('button.help-trigger');
    expect(trigger.exists()).toBe(true);

    await trigger.trigger('click');
    await wrapper.vm.$nextTick();

    // Modal should be present
    // happy-dom may render '&' as '&amp;' in innerHTML
    const html = document.body.innerHTML;
    expect(html.includes('Help & Guide') || html.includes('Help &amp; Guide')).toBe(true);

    // Switch tab - click second tab button
    const tabButtons = document.body.querySelectorAll('.help-tab');
    if (tabButtons.length > 1) {
      (tabButtons[1] as HTMLElement).click();
      await wrapper.vm.$nextTick();
      expect(document.body.querySelectorAll('.help-tab-active').length).toBeGreaterThanOrEqual(1);
    }
  });

  it('explains PRV limits, supported sensor instructions, and diaphragm safety', async () => {
    const wrapper = mount(HelpSystem);
    await wrapper.find('button.help-trigger').trigger('click');
    await wrapper.vm.$nextTick();

    const labTab = Array.from(document.body.querySelectorAll('.help-tab')).find((button) =>
      button.textContent?.includes('Pulse')
    ) as HTMLElement;
    expect(labTab).toBeTruthy();
    labTab.click();
    await wrapper.vm.$nextTick();

    expect(document.body.textContent?.toLowerCase()).toContain('pulse variability');
    expect(document.body.textContent).toContain('Chest Motion');
    expect(document.body.textContent).toContain('pulse-rate variability (PRV)');
    expect(document.body.textContent).not.toMatch(/\b(?:experimental|beta)\b/i);
    expect(document.body.textContent).toContain('five minutes');

    const techniquesTab = Array.from(document.body.querySelectorAll('.help-tab')).find((button) =>
      button.textContent?.includes('Techniques')
    ) as HTMLElement;
    techniquesTab.click();
    await wrapper.vm.$nextTick();

    expect(document.body.textContent).toContain('Diaphragm Resistance Training');
    expect(document.body.textContent).toContain('purpose-designed inspiratory resistance trainer');
    expect(document.body.textContent).toContain('Stop for dizziness');

    wrapper.unmount();
  });

  it('isolates the page, focuses the close action, and restores focus after Escape', async () => {
    const wrapper = mount(HelpSystem, { attachTo: document.body });
    const trigger = wrapper.get<HTMLElement>('button.help-trigger');
    trigger.element.focus();
    await trigger.trigger('click');
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    const dialog = document.body.querySelector<HTMLElement>('[data-testid="help-dialog"]');
    expect(dialog?.getAttribute('role')).toBe('dialog');
    expect(dialog?.getAttribute('aria-labelledby')).toBe('help-dialog-title');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Close help');
    const background = Array.from(document.body.children).find(
      (element) => element === wrapper.element || element.contains(wrapper.element)
    ) as HTMLElement;
    expect(background.getAttribute('inert')).toBe('');
    expect(background.getAttribute('aria-hidden')).toBe('true');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(document.body.querySelector('[data-testid="help-dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger.element);
    expect(background.hasAttribute('inert')).toBe(false);
  });

  it('embeds the Data & Support controls in the Data tab', async () => {
    const wrapper = mount(HelpSystem, { attachTo: document.body });
    await wrapper.get('button.help-trigger').trigger('click');
    await wrapper.vm.$nextTick();

    const dataTab = Array.from(document.body.querySelectorAll('.help-tab')).find((button) =>
      button.textContent?.includes('Data')
    ) as HTMLElement;
    expect(dataTab).toBeTruthy();
    dataTab.click();
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    expect(document.body.querySelector('[data-testid="data-support-settings"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="export-backup"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="send-feedback"]')).not.toBeNull();

    wrapper.unmount();
  });

  it('handles modal Escape without triggering the active background Escape action', async () => {
    const backgroundEscape = vi.fn();
    window.addEventListener('keydown', backgroundEscape);
    const wrapper = mount(HelpSystem, { attachTo: document.body });
    await wrapper.get('button.help-trigger').trigger('click');
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    const escape = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(escape);
    window.removeEventListener('keydown', backgroundEscape);
    await wrapper.vm.$nextTick();

    expect(document.body.querySelector('[data-testid="help-dialog"]')).toBeNull();
    expect(escape.defaultPrevented).toBe(true);
    expect(backgroundEscape).not.toHaveBeenCalled();
  });

  it('scopes Escape to the restore-confirmation dialog nested in the Help modal', async () => {
    backupServiceMock.parseBackupFile.mockResolvedValue(parsedBackupFixture());
    backupServiceMock.restoreBackup.mockResolvedValue(undefined);

    const wrapper = mount(HelpSystem, { attachTo: document.body });
    await wrapper.get('button.help-trigger').trigger('click');
    await wrapper.vm.$nextTick();

    const dataTab = Array.from(document.body.querySelectorAll('.help-tab')).find((button) =>
      button.textContent?.includes('Data')
    ) as HTMLElement;
    dataTab.click();
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    // Drive the restore flow to open the nested confirmation dialog.
    const input = document.body.querySelector<HTMLInputElement>(
      '[data-testid="import-backup-input"]'
    )!;
    const file = new File(['{}'], 'backup.json', { type: 'application/json' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await flushPromises();
    await wrapper.vm.$nextTick();

    expect(document.body.querySelector('[data-testid="restore-confirm-dialog"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="help-dialog"]')).not.toBeNull();

    // Escape with the confirmation open cancels ONLY the confirmation dialog.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flushPromises();
    await wrapper.vm.$nextTick();

    expect(document.body.querySelector('[data-testid="restore-confirm-dialog"]')).toBeNull();
    expect(document.body.querySelector('[data-testid="help-dialog"]')).not.toBeNull();
    expect(backupServiceMock.restoreBackup).not.toHaveBeenCalled();

    // Escape again now closes the Help modal.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wrapper.vm.$nextTick();

    expect(document.body.querySelector('[data-testid="help-dialog"]')).toBeNull();
  });
});
