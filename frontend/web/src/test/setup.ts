import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom 未实现 matchMedia，antd 响应式栅格需要
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
})

// jsdom 未实现 ResizeObserver，antd Tree 等组件依赖
Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  },
})

// jsdom 未实现 canvas 2D（ECharts SVG 渲染的文本测量会触达）：显式返回 null，
// 与 jsdom 默认行为一致但不再向控制台刷 "Not implemented" 噪音
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  writable: true,
  configurable: true,
  value: () => null,
})

afterEach(() => {
  cleanup()
})
