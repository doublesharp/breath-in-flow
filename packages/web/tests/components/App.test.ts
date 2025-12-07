import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import App from '../../src/App.vue';

describe('App.vue', () => {
  it('renders header and navigation buttons', () => {
    const wrapper = mount(App, {
      global: {
        stubs: {
          BreathingPractice: true,
          SessionHistory: true,
          SavedConfigs: true,
          AnalyticsDashboard: true,
          HelpSystem: true,
        },
      },
    });

    expect(wrapper.text()).toContain('Breath in Flow');

    // Desktop nav buttons (rendered in header)
    expect(wrapper.findAll('button').some((b) => b.text().includes('Practice'))).toBeTruthy();
    expect(wrapper.findAll('button').some((b) => b.text().includes('History'))).toBeTruthy();
    expect(wrapper.findAll('button').some((b) => b.text().includes('Presets'))).toBeTruthy();
    expect(wrapper.findAll('button').some((b) => b.text().includes('Analytics'))).toBeTruthy();
  });
});
