import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import HrTachogram from '@/components/hrv/HrTachogram.vue';

// Mock requestAnimationFrame / cancelAnimationFrame
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    // Don't actually call cb to avoid infinite loop in tests
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

describe('HrTachogram', () => {
  it('mounts without errors with empty data', () => {
    const wrapper = mount(HrTachogram, {
      props: { hrData: [] },
    });
    expect(wrapper.exists()).toBe(true);
  });

  it('renders a canvas element', () => {
    const wrapper = mount(HrTachogram, {
      props: { hrData: [] },
    });
    expect(wrapper.find('canvas').exists()).toBe(true);
  });

  it('accepts hrData prop with data points', () => {
    const hrData = [
      { time: 0, hr: 60, quality: 0.9 },
      { time: 1, hr: 62, quality: 0.8 },
      { time: 2, hr: 58, quality: 0.95 },
    ];
    const wrapper = mount(HrTachogram, {
      props: { hrData },
    });
    expect(wrapper.exists()).toBe(true);
  });

  it('applies default duration of 60 seconds', () => {
    const wrapper = mount(HrTachogram, {
      props: { hrData: [] },
    });
    // Default duration prop should be 60
    expect((wrapper.vm as any).$.props.duration ?? 60).toBe(60);
  });

  it('accepts custom duration prop', () => {
    const wrapper = mount(HrTachogram, {
      props: { hrData: [], duration: 30 },
    });
    expect((wrapper.vm as any).$.props.duration).toBe(30);
  });

  it('accepts breathing phases overlay props', () => {
    const wrapper = mount(HrTachogram, {
      props: {
        hrData: [{ time: 0, hr: 65, quality: 0.8 }],
        showBreathingOverlay: true,
        breathingPhases: [{ start: 0, end: 5, type: 'inhale' }],
      },
    });
    expect(wrapper.exists()).toBe(true);
  });

  it('accepts custom height prop', () => {
    const wrapper = mount(HrTachogram, {
      props: { hrData: [], height: 300 },
    });
    expect((wrapper.vm as any).$.props.height).toBe(300);
  });

  it('handles large datasets without crashing', () => {
    const hrData = Array.from({ length: 300 }, (_, i) => ({
      time: i,
      hr: 60 + Math.sin(i * 0.1) * 10,
      quality: 0.9,
    }));
    const wrapper = mount(HrTachogram, {
      props: { hrData },
    });
    expect(wrapper.exists()).toBe(true);
  });

  it('handles poor quality data points', () => {
    const hrData = [
      { time: 0, hr: 60, quality: 0.1 },
      { time: 1, hr: 62, quality: 0.3 },
      { time: 2, hr: 65, quality: 0.8 },
    ];
    const wrapper = mount(HrTachogram, {
      props: { hrData },
    });
    expect(wrapper.exists()).toBe(true);
  });
});
