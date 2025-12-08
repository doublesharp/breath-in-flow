// Vitest setup: mock heavy browser APIs and chart components to avoid warnings in tests
import { vi } from 'vitest'

// Mock vue-chartjs to render a simple canvas stub component instead of creating real Chart instances
vi.mock('vue-chartjs', () => {
  const { defineComponent, h } = require('vue')
  const CanvasStub = defineComponent({
    name: 'CanvasStub',
    render() {
      return h('canvas')
    },
  })
  return {
    Line: CanvasStub,
    Bar: CanvasStub,
  }
})

// Provide a no-op console.error override for Chart creation failures (keeps test output tidy)
// but don't completely silence other errors.
const origConsoleError = console.error.bind(console)
console.error = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes("can't acquire context from the given item")) {
    // swallow chart.js context error in happy-dom
    return
  }
  origConsoleError(...args)
}
