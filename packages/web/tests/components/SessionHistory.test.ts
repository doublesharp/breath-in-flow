import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import SessionHistory from '../../src/components/SessionHistory.vue';

const mockSession = {
  id: 'session-1',
  configSnapshot: { name: 'Quick Practice', inhaleTime: 4, exhaleTime: 4, repetitions: 4 },
  status: 'COMPLETED',
  sets: [],
  startedAt: new Date(),
  completedSets: 1,
};

vi.mock('../../src/composables', () => ({
  useStorage: () => ({
    getAllSessions: () => [mockSession],
    stats: { value: { totalSessions: 1, totalSets: 1, avgHoldTime: 10, maxHoldTime: 20 } },
    deleteSession: vi.fn(() => true),
  }),
}));

describe('SessionHistory.vue', () => {
  it('shows sessions and opens delete modal', async () => {
    const wrapper = mount(SessionHistory);

    expect(wrapper.text()).toContain('Session History');
    expect(wrapper.text()).toContain('Quick Practice');

    // Find the delete button by title
    const deleteBtn = wrapper.find('button[title="Delete session"]');
    expect(deleteBtn.exists()).toBe(true);

    await deleteBtn.trigger('click');
    await wrapper.vm.$nextTick();

    // Modal should appear in document.body
    expect(document.body.innerHTML).toContain('Delete Session');

    // Confirm delete - find delete button in modal by text
    const modalDelete = Array.from(document.body.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'Delete'
    );
    if (modalDelete) {
      (modalDelete as HTMLButtonElement).click();
      await wrapper.vm.$nextTick();
      // ensure modal closed
      expect(document.body.innerHTML).not.toContain('Delete Session');
    }
  });
});
