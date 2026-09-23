// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { initI18n } from '@zentao/i18n'
import { afterEach, expect, test, vi } from 'vitest'
import { ErrorBoundary } from './error-boundary'

/** FE-P0-1：子组件抛错时降级为兜底页（不再整页白屏），并留一条 console.error 给后续上报挂点。 */

initI18n()

afterEach(cleanup)

function Boom(): never {
  throw new Error('boom')
}

test('子组件抛错时渲染兜底页并记录 console.error', () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  render(
    <ErrorBoundary>
      <Boom />
    </ErrorBoundary>,
  )

  // 文案断言走真实 zh-CN 语言包：缺键会渲染裸键，这里就能看见
  expect(screen.getByText('页面出错了')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '刷新页面' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '回到首页' })).toBeInTheDocument()

  const logged = consoleError.mock.calls.find((call) => call[0] === '[error-boundary]')
  expect(logged?.[1]).toBeInstanceOf(Error)
  consoleError.mockRestore()
})

test('子组件正常时不渲染兜底页', () => {
  render(
    <ErrorBoundary>
      <span>safe-child</span>
    </ErrorBoundary>,
  )

  expect(screen.getByText('safe-child')).toBeInTheDocument()
  expect(screen.queryByText('页面出错了')).not.toBeInTheDocument()
})

test('fallback 传入时优先用自定义兜底', () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  render(
    <ErrorBoundary fallback={<span>custom-fallback</span>}>
      <Boom />
    </ErrorBoundary>,
  )

  expect(screen.getByText('custom-fallback')).toBeInTheDocument()
  consoleError.mockRestore()
})
