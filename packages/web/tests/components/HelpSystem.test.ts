import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import HelpSystem from '../../src/components/HelpSystem.vue';

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

  it('explains pulse variability limits, experimental sensors, and diaphragm safety', async () => {
    const wrapper = mount(HelpSystem);
    await wrapper.find('button.help-trigger').trigger('click');
    await wrapper.vm.$nextTick();

    const labTab = Array.from(document.body.querySelectorAll('.help-tab')).find(
      (button) => button.textContent?.includes('Lab')
    ) as HTMLElement;
    expect(labTab).toBeTruthy();
    labTab.click();
    await wrapper.vm.$nextTick();

    expect(document.body.textContent).toContain('pulse variability');
    expect(document.body.textContent).toContain('Chest Motion');
    expect(document.body.textContent?.toLowerCase()).toContain('experimental');
    expect(document.body.textContent).toContain('five minutes');

    const techniquesTab = Array.from(document.body.querySelectorAll('.help-tab')).find(
      (button) => button.textContent?.includes('Techniques')
    ) as HTMLElement;
    techniquesTab.click();
    await wrapper.vm.$nextTick();

    expect(document.body.textContent).toContain('Diaphragm Resistance Training');
    expect(document.body.textContent).toContain('purpose-designed inspiratory resistance trainer');
    expect(document.body.textContent).toContain('Stop for dizziness');

    wrapper.unmount();
  });
});
