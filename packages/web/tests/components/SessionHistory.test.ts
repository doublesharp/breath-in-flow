import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DOMWrapper, enableAutoUnmount, mount } from '@vue/test-utils';
import { DEFAULT_BREATHING_CONFIG, type Session } from '@breath-in-flow/shared';
import SessionHistory from '../../src/components/SessionHistory.vue';

const { useStorageMock } = vi.hoisted(() => ({ useStorageMock: vi.fn() }));
vi.mock('../../src/composables', () => ({ useStorage: useStorageMock }));
enableAutoUnmount(afterEach);

const mockSession: Session = {
  targetSets: 1,
  id: 'session-1',
  configSnapshot: { ...DEFAULT_BREATHING_CONFIG, name: 'Quick Practice', inhaleTime: 4, exhaleTime: 4, repetitions: 4 },
  status: 'COMPLETED',
  sets: [],
  startedAt: new Date(),
  completedSets: 1,
};

const mockSessionWithHolds: Session = {
  targetSets: 1,
  id: 'session-2',
  configSnapshot: { ...DEFAULT_BREATHING_CONFIG, name: 'Extended Hold Practice', inhaleTime: 4, inhaleHoldTime: 3, exhaleTime: 4, exhaleHoldTime: 2, repetitions: 4 },
  status: 'COMPLETED',
  sets: [
    {
      setNumber: 1,
      completedRepetitions: 4,
      extendedHolds: [
        { type: 'EXHALE', mode: 'TOLERANCE', actualDuration: 30, completedAt: new Date() },
        { type: 'INHALE', mode: 'TIMED', actualDuration: 25, completedAt: new Date() },
      ],
      startedAt: new Date(),
      completedAt: new Date(),
    },
  ],
  completedSets: 1,
  notes: 'Great session with improved tolerance',
  startedAt: new Date(),
  completedAt: new Date(),
};

const mockSessionWithoutHolds: Session = {
  targetSets: 1,
  id: 'session-3',
  configSnapshot: { ...DEFAULT_BREATHING_CONFIG, name: 'Simple Practice', inhaleTime: 3, exhaleTime: 3, repetitions: 5 },
  status: 'COMPLETED',
  sets: [
    {
      setNumber: 1,
      completedRepetitions: 5,
      extendedHolds: [],
      startedAt: new Date(),
      completedAt: new Date(),
    },
  ],
  completedSets: 1,
  startedAt: new Date(),
  completedAt: new Date(),
};

const mockSessionWithCheckIn: Session = {
  targetSets: 1,
  id: 'session-4',
  configSnapshot: { ...DEFAULT_BREATHING_CONFIG, name: 'Reflected Practice', inhaleTime: 4, exhaleTime: 4, repetitions: 4 },
  status: 'COMPLETED',
  sets: [],
  completedSets: 1,
  startedAt: new Date(),
  completedAt: new Date(),
  checkIn: { before: 2, after: 4, comment: 'Felt easier by the end' },
};

describe('SessionHistory.vue', () => {
  beforeEach(() => {
    useStorageMock.mockReset();
  });

  it('shows sessions and opens delete modal', async () => {
    const deleteSession = vi.fn(() => true);
    useStorageMock.mockReturnValue({
      getAllSessions: () => [mockSession],
      stats: { value: { totalSessions: 1, totalSets: 1, avgHoldTime: 10, maxHoldTime: 20 } },
      deleteSession,
    });

    const wrapper = mount(SessionHistory);

    expect(wrapper.text()).toContain('Session History');
    expect(wrapper.text()).toContain('Quick Practice');

    const deleteBtn = wrapper.get('button[aria-label="Delete session"]');

    await deleteBtn.trigger('click');
    await wrapper.vm.$nextTick();

    // Modal should appear in document.body
    expect(document.body.innerHTML).toContain('Delete Session');

    // Confirm delete - find delete button in modal by text
    const modalDelete = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Delete'
    );
    expect(modalDelete).toBeDefined();
    modalDelete!.click();
    await wrapper.vm.$nextTick();
    expect(deleteSession).toHaveBeenCalledExactlyOnceWith('session-1');
    expect(document.body.innerHTML).not.toContain('Delete Session');
  });

  it('displays extended holds when present', async () => {
    useStorageMock.mockReturnValue({
      getAllSessions: () => [mockSessionWithHolds],
      stats: { value: { totalSessions: 1, totalSets: 1, avgHoldTime: 27.5, maxHoldTime: 30 } },
      deleteSession: vi.fn(() => true),
    });

    const wrapper = mount(SessionHistory);

    expect(wrapper.text()).toContain('Extended Hold Practice');
    expect(wrapper.text()).toContain('4s · 3s · 4s · 2s');
    expect(wrapper.get('.session-status').get('svg').attributes('aria-hidden')).toBe('true');
    expect(wrapper.text()).toContain('EXHALE');
    expect(wrapper.text()).toContain('INHALE');
    expect(wrapper.text()).toContain('Extended Holds');
  });

  it('displays session notes when present', async () => {
    useStorageMock.mockReturnValue({
      getAllSessions: () => [mockSessionWithHolds],
      stats: { value: { totalSessions: 1, totalSets: 1, avgHoldTime: 27.5, maxHoldTime: 30 } },
      deleteSession: vi.fn(() => true),
    });

    const wrapper = mount(SessionHistory);

    expect(wrapper.text()).toContain('Great session with improved tolerance');
    expect(wrapper.text()).toContain('Notes');
  });

  it('shows empty state when no sessions exist', async () => {
    useStorageMock.mockReturnValue({
      getAllSessions: () => [],
      stats: { value: { totalSessions: 0, totalSets: 0, avgHoldTime: 0, maxHoldTime: 0 } },
      deleteSession: vi.fn(() => true),
    });

    const wrapper = mount(SessionHistory);

    expect(wrapper.text()).toContain('No sessions recorded yet');
  });

  it('displays session details correctly', async () => {
    useStorageMock.mockReturnValue({
      getAllSessions: () => [mockSessionWithoutHolds],
      stats: { value: { totalSessions: 1, totalSets: 1, avgHoldTime: 0, maxHoldTime: 0 } },
      deleteSession: vi.fn(() => true),
    });

    const wrapper = mount(SessionHistory);

    // Check session details are displayed
    expect(wrapper.text()).toContain('Simple Practice');
    expect(wrapper.text()).toContain('3s · 3s');
    expect(wrapper.text()).toContain('Completed');
    expect(wrapper.text()).toContain('5'); // repetitions
  });

  it('renders submitted check-in values with comfort labels and comment', async () => {
    useStorageMock.mockReturnValue({
      getAllSessions: () => [mockSessionWithCheckIn],
      stats: { value: { totalSessions: 1, totalSets: 1, avgHoldTime: 0, maxHoldTime: 0 } },
      deleteSession: vi.fn(() => true),
    });

    const wrapper = mount(SessionHistory);

    expect(wrapper.text()).toContain('Check-In');
    expect(wrapper.text()).toContain('Uncomfortable');
    expect(wrapper.text()).toContain('Comfortable');
    expect(wrapper.text()).toContain('Felt easier by the end');
  });

  it('renders no check-in section when a session has none', async () => {
    useStorageMock.mockReturnValue({
      getAllSessions: () => [mockSessionWithoutHolds],
      stats: { value: { totalSessions: 1, totalSets: 1, avgHoldTime: 0, maxHoldTime: 0 } },
      deleteSession: vi.fn(() => true),
    });

    const wrapper = mount(SessionHistory);

    expect(wrapper.find('[data-testid="session-checkin"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Check-In');
  });

  it.each([
    ['button[aria-label="Delete session"]', 'delete-session-title', 'Delete Session'],
    ['Clear All', 'clear-sessions-title', 'Clear All Sessions'],
  ])('isolates the %s confirmation and restores focus after Escape', async (selector, titleId, title) => {
    const deleteSession = vi.fn(() => true);
    const deleteAllSessions = vi.fn();
    useStorageMock.mockReturnValue({
      getAllSessions: () => [mockSession],
      stats: { value: { totalSessions: 1, totalSets: 1, avgHoldTime: 10, maxHoldTime: 20 } },
      deleteSession,
      deleteAllSessions,
    });
    const wrapper = mount(SessionHistory, { attachTo: document.body });
    const trigger = selector === 'Clear All'
      ? wrapper.findAll('button').find((button) => button.text() === selector)
      : wrapper.get<HTMLButtonElement>(selector);
    expect(trigger).toBeDefined();
    trigger!.element.focus();
    await trigger!.trigger('click');
    await wrapper.vm.$nextTick();

    const page = new DOMWrapper(document.body);
    const dialogSelector = `[role="alertdialog"][aria-modal="true"][aria-labelledby="${titleId}"]`;
    const dialog = page.get(dialogSelector);
    expect(dialog.get(`#${titleId}`).text()).toBe(title);
    const cancel = dialog.get('button.btn-secondary');
    expect(cancel.text()).toBe('Cancel');
    expect(document.activeElement).toBe(cancel.element);
    expect(trigger!.element.closest('[inert]')).not.toBeNull();

    await cancel.trigger('keydown', { key: 'Escape' });
    expect(page.find(dialogSelector).exists()).toBe(false);
    expect(trigger!.element.closest('[inert]')).toBeNull();
    expect(document.activeElement).toBe(trigger!.element);
    expect(deleteSession).not.toHaveBeenCalled();
    expect(deleteAllSessions).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Quick Practice');
  });

  it('renders readable completed, cancelled, and in-progress states', () => {
    useStorageMock.mockReturnValue({
      getAllSessions: () => [
        mockSession,
        { ...mockSessionWithHolds, status: 'CANCELLED' },
        { ...mockSessionWithoutHolds, status: 'IN_PROGRESS' },
      ],
      stats: { value: { totalSessions: 1, totalSets: 1, avgHoldTime: 0, maxHoldTime: 0 } },
    });

    const wrapper = mount(SessionHistory);
    const statuses = wrapper.findAll('span.rounded-full.text-xs');
    expect(statuses.map((badge) => badge.text())).toEqual(['Completed', 'Cancelled', 'In progress']);
    expect(statuses[1].attributes('data-status')).toBe('CANCELLED');
    expect(statuses[1].classes()).toContain('session-status');
  });
});
