// Vitest setup: mock heavy browser APIs and chart components to avoid warnings in tests
import { vi } from 'vitest';

// Mock HTMLCanvasElement.getContext for happy-dom (canvas 2D API not supported in happy-dom)
const mockCtx = {
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  font: '',
  textAlign: 'left',
  shadowColor: '',
  shadowBlur: 0,
  lineCap: 'butt',
  lineJoin: 'miter',
  globalAlpha: 1,
  fillRect: vi.fn(),
  clearRect: vi.fn(),
  strokeRect: vi.fn(),
  beginPath: vi.fn(),
  closePath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  arc: vi.fn(),
  bezierCurveTo: vi.fn(),
  quadraticCurveTo: vi.fn(),
  roundRect: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  scale: vi.fn(),
  translate: vi.fn(),
  rotate: vi.fn(),
  rect: vi.fn(),
  clip: vi.fn(),
  setLineDash: vi.fn(),
  getLineDash: vi.fn(() => []),
  fillText: vi.fn(),
  strokeText: vi.fn(),
  measureText: vi.fn(() => ({ width: 0 })),
  createLinearGradient: vi.fn(() => ({
    addColorStop: vi.fn(),
  })),
  createRadialGradient: vi.fn(() => ({
    addColorStop: vi.fn(),
  })),
  createPattern: vi.fn(() => null),
  drawImage: vi.fn(),
  getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(0) })),
  putImageData: vi.fn(),
  setTransform: vi.fn(),
  resetTransform: vi.fn(),
};

// Patch HTMLCanvasElement prototype to return mock context
if (typeof HTMLCanvasElement !== 'undefined') {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    value: vi.fn(() => mockCtx),
    writable: true,
    configurable: true,
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'getBoundingClientRect', {
    value: vi.fn(() => ({ width: 400, height: 200, top: 0, left: 0, right: 400, bottom: 200 })),
    writable: true,
    configurable: true,
  });
}

// Mock vue-chartjs to render a simple canvas stub component instead of creating real Chart instances
vi.mock('vue-chartjs', async () => {
  const { defineComponent, h } = await import('vue');
  const CanvasStub = defineComponent({
    name: 'CanvasStub',
    render() {
      return h('canvas');
    },
  });
  return {
    Line: CanvasStub,
    Bar: CanvasStub,
  };
});

// Provide a no-op console.error override for Chart creation failures (keeps test output tidy)
// but don't completely silence other errors.
const origConsoleError = console.error.bind(console);
console.error = (...args) => {
  if (
    typeof args[0] === 'string' &&
    args[0].includes("can't acquire context from the given item")
  ) {
    // swallow chart.js context error in happy-dom
    return;
  }
  origConsoleError(...args);
};
