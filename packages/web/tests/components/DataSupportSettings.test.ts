import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import DataSupportSettings from '../../src/components/DataSupportSettings.vue';
import { usePreferences } from '../../src/composables';
import { BackupRestoreError } from '../../src/services/backupService';

enableAutoUnmount(afterEach);

// Backup + support are mocked so the component test drives UI flows (preview,
// confirm, cancel, rollback, reset) without touching real storage or plugins.
const backupServiceMock = vi.hoisted(() => ({
  createBackup: vi.fn(),
  parseBackupFile: vi.fn(),
  parseBackupText: vi.fn(),
  restoreBackup: vi.fn(),
}));
const supportMocks = vi.hoisted(() => ({
  sendSupportMessage: vi.fn(),
  shareBackupFile: vi.fn(),
  createSupportMessage: vi.fn(),
}));

vi.mock('@/services/appBackupService', () => ({
  createDefaultBackupService: vi.fn(() => backupServiceMock),
}));
vi.mock('@/services/supportService', () => ({
  sendSupportMessage: supportMocks.sendSupportMessage,
  shareBackupFile: supportMocks.shareBackupFile,
  createSupportMessage: supportMocks.createSupportMessage,
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
      measurements: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }],
      assessments: [],
    },
  };
}

function attachFile(wrapper: VueWrapper, contents = '{}') {
  const input = wrapper.get('[data-testid="import-backup-input"]');
  const file = new File([contents], 'backup.json', { type: 'application/json' });
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true });
  return input;
}

describe('DataSupportSettings.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    usePreferences().clearGoal();
    supportMocks.sendSupportMessage.mockResolvedValue({ method: 'share' });
    supportMocks.shareBackupFile.mockResolvedValue({ method: 'download' });
    backupServiceMock.createBackup.mockResolvedValue({
      json: '{"formatVersion":1}',
      summary: { counts: {} },
    });
    backupServiceMock.restoreBackup.mockResolvedValue(undefined);
    backupServiceMock.parseBackupFile.mockResolvedValue(parsedBackupFixture());
  });

  it('renders the selected goal', () => {
    usePreferences().setGoal('BUILD_CONSISTENCY');
    const wrapper = mount(DataSupportSettings);
    expect(wrapper.get('[data-testid="selected-goal"]').text()).toContain('consistent');
  });

  it('changes each of the four goals', async () => {
    const wrapper = mount(DataSupportSettings);
    const prefs = usePreferences();

    for (const [testId, goal] of [
      ['goal-relax', 'RELAX'],
      ['goal-diaphragm', 'TRAIN_DIAPHRAGM'],
      ['goal-consistency', 'BUILD_CONSISTENCY'],
      ['goal-pulse', 'EXPLORE_PULSE_VARIABILITY'],
    ] as const) {
      await wrapper.get(`[data-testid="${testId}"]`).setValue();
      expect(prefs.selectedGoal.value).toBe(goal);
    }
  });

  it('does not touch native or backup APIs on mount', () => {
    mount(DataSupportSettings);
    expect(supportMocks.sendSupportMessage).not.toHaveBeenCalled();
    expect(supportMocks.shareBackupFile).not.toHaveBeenCalled();
    expect(supportMocks.createSupportMessage).not.toHaveBeenCalled();
    expect(backupServiceMock.createBackup).not.toHaveBeenCalled();
    expect(backupServiceMock.parseBackupFile).not.toHaveBeenCalled();
    expect(backupServiceMock.restoreBackup).not.toHaveBeenCalled();
  });

  it('exports a backup by creating it and sharing the JSON', async () => {
    const wrapper = mount(DataSupportSettings);
    await wrapper.get('[data-testid="export-backup"]').trigger('click');
    await flushPromises();

    expect(backupServiceMock.createBackup).toHaveBeenCalledTimes(1);
    expect(supportMocks.shareBackupFile).toHaveBeenCalledTimes(1);
    expect(supportMocks.shareBackupFile.mock.calls[0][0]).toBe('{"formatVersion":1}');
    expect(wrapper.get('[data-testid="export-status"]').text().length).toBeGreaterThan(0);
  });

  it('surfaces an export failure message', async () => {
    backupServiceMock.createBackup.mockRejectedValue(new Error('disk full'));
    const wrapper = mount(DataSupportSettings);
    await wrapper.get('[data-testid="export-backup"]').trigger('click');
    await flushPromises();

    expect(wrapper.get('[data-testid="export-status"]').text().toLowerCase()).toContain('export');
    expect(supportMocks.shareBackupFile).not.toHaveBeenCalled();
  });

  it('shows no export status when the user cancels the share sheet', async () => {
    supportMocks.shareBackupFile.mockResolvedValue({ method: 'cancel' });
    const wrapper = mount(DataSupportSettings);
    await wrapper.get('[data-testid="export-backup"]').trigger('click');
    await flushPromises();

    expect(backupServiceMock.createBackup).toHaveBeenCalledTimes(1);
    expect(wrapper.find('[data-testid="export-status"]').exists()).toBe(false);
  });

  it('previews an imported backup without restoring it', async () => {
    const wrapper = mount(DataSupportSettings);
    const input = attachFile(wrapper);
    await input.trigger('change');
    await flushPromises();

    const preview = wrapper.get('[data-testid="backup-preview"]').text();
    expect(preview).toContain('2 sessions');
    expect(preview).toContain('3 measurements');
    expect(backupServiceMock.restoreBackup).not.toHaveBeenCalled();
  });

  it('restores only after the confirmation is accepted', async () => {
    const wrapper = mount(DataSupportSettings);
    const input = attachFile(wrapper);
    await input.trigger('change');
    await flushPromises();

    expect(wrapper.get('[data-testid="backup-preview"]').text()).toContain('2 sessions');
    expect(backupServiceMock.restoreBackup).not.toHaveBeenCalled();

    await wrapper.get('[data-testid="confirm-restore"]').trigger('click');
    await flushPromises();

    expect(backupServiceMock.restoreBackup).toHaveBeenCalledTimes(1);
    expect(wrapper.get('[data-testid="restore-status"]').text().length).toBeGreaterThan(0);
  });

  it('exposes an accessible confirmation dialog', async () => {
    const wrapper = mount(DataSupportSettings, { attachTo: document.body });
    const input = attachFile(wrapper);
    await input.trigger('change');
    await flushPromises();

    const dialog = document.body.querySelector('[data-testid="restore-confirm-dialog"]');
    expect(dialog?.getAttribute('role')).toBe('dialog');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-labelledby')).toBeTruthy();
  });

  it('cancels without performing any write', async () => {
    const wrapper = mount(DataSupportSettings);
    const input = attachFile(wrapper);
    await input.trigger('change');
    await flushPromises();

    await wrapper.get('[data-testid="cancel-restore"]').trigger('click');
    await flushPromises();

    expect(backupServiceMock.restoreBackup).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="backup-preview"]').exists()).toBe(false);
  });

  it('surfaces a rollback error message', async () => {
    backupServiceMock.restoreBackup.mockRejectedValue(
      new BackupRestoreError('rollback', 'Rollback failed; data may be inconsistent.')
    );
    const wrapper = mount(DataSupportSettings);
    const input = attachFile(wrapper);
    await input.trigger('change');
    await flushPromises();
    await wrapper.get('[data-testid="confirm-restore"]').trigger('click');
    await flushPromises();

    expect(wrapper.get('[data-testid="restore-status"]').text().toLowerCase()).toContain(
      'inconsistent'
    );
  });

  it('resets the file input so the same file can be retried', async () => {
    const wrapper = mount(DataSupportSettings);
    const input = attachFile(wrapper);
    await input.trigger('change');
    await flushPromises();

    expect((input.element as HTMLInputElement).value).toBe('');
  });

  it('rejects an oversize backup with a message', async () => {
    backupServiceMock.parseBackupFile.mockRejectedValue(
      new BackupRestoreError('validate', 'Backup file exceeds the maximum allowed size.')
    );
    const wrapper = mount(DataSupportSettings);
    const input = attachFile(wrapper);
    await input.trigger('change');
    await flushPromises();

    expect(wrapper.get('[data-testid="restore-status"]').text().toLowerCase()).toContain('size');
    expect(wrapper.find('[data-testid="backup-preview"]').exists()).toBe(false);
  });

  it('shows a validation failure for an invalid import', async () => {
    backupServiceMock.parseBackupFile.mockRejectedValue(
      new BackupRestoreError('validate', 'Backup envelope failed schema validation.')
    );
    const wrapper = mount(DataSupportSettings);
    const input = attachFile(wrapper);
    await input.trigger('change');
    await flushPromises();

    expect(wrapper.get('[data-testid="restore-status"]').text().toLowerCase()).toContain(
      'validation'
    );
  });

  it('sends feedback and reports which channel succeeded', async () => {
    supportMocks.sendSupportMessage.mockResolvedValue({ method: 'clipboard' });
    const wrapper = mount(DataSupportSettings);
    await wrapper.get('[data-testid="send-feedback"]').trigger('click');
    await flushPromises();

    expect(supportMocks.sendSupportMessage).toHaveBeenCalledTimes(1);
    expect(wrapper.get('[data-testid="feedback-status"]').text().toLowerCase()).toContain(
      'clipboard'
    );
  });

  it('shows no feedback status when the user cancels the share sheet', async () => {
    supportMocks.sendSupportMessage.mockResolvedValue({ method: 'cancel' });
    const wrapper = mount(DataSupportSettings);
    await wrapper.get('[data-testid="send-feedback"]').trigger('click');
    await flushPromises();

    expect(supportMocks.sendSupportMessage).toHaveBeenCalledTimes(1);
    expect(wrapper.find('[data-testid="feedback-status"]').exists()).toBe(false);
  });

  it('surfaces an error when every feedback channel fails', async () => {
    // share unavailable -> mailto open throws -> clipboard write rejects all
    // surface as a rejected sendSupportMessage; the UI must report the failure.
    supportMocks.sendSupportMessage.mockRejectedValue(new Error('no channel available'));
    const wrapper = mount(DataSupportSettings);
    await wrapper.get('[data-testid="send-feedback"]').trigger('click');
    await flushPromises();

    expect(wrapper.get('[data-testid="feedback-status"]').text().toLowerCase()).toContain(
      'could not'
    );
  });
});
