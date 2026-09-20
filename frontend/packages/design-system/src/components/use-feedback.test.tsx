// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { createTheme } from '../tokens/theme'
import { AppProvider, ConfigProvider } from './ui'
import { useMessage, useNotification } from './use-feedback'

/**
 * 08 B3-3 回归守卫：静态 `message`/`notification` 必须保持「不在再导出面」——
 * 它们拿不到 ConfigProvider 上下文（暗色下 toast 仍是亮色皮 + 运行期 warning），
 * 一旦有人把它们加回 ui.ts，本用例即红（这比 grep 门禁更早生效：编译期就没人能 import 到）。
 */
function Probe() {
  const message = useMessage()
  const notification = useNotification()
  return (
    <div>
      <span data-testid="message-api">{typeof message.success}</span>
      <span data-testid="notification-api">{typeof notification.open}</span>
      <button type="button" onClick={() => message.success('probe')}>
        fire
      </button>
    </div>
  )
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('design-system 反馈出口（B3-3）', () => {
  test('useMessage/useNotification 在 AppProvider 内可用', () => {
    render(
      <AppProvider>
        <Probe />
      </AppProvider>,
    )
    expect(screen.getByTestId('message-api').textContent).toBe('function')
    expect(screen.getByTestId('notification-api').textContent).toBe('function')
  })

  // 「主题感知」的可机器验证证据：toast 容器与 `.ant-app` 共享同一个 cssVar 作用域类
  // （`App.useApp()` 的实例带着应用的主题根渲染，故吃得到亮暗算法；静态 message 自建根，不带）。
  // 注意 antd 6 的消息仍 portal 到 body —— 所以判据是**作用域类**而不是 DOM 归属。
  test('toast 与应用共享 cssVar 作用域（= 主题生效）', async () => {
    render(
      <ConfigProvider theme={createTheme()}>
        <AppProvider>
          <Probe />
        </AppProvider>
      </ConfigProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'fire' }))
    await waitFor(() => {
      expect(document.querySelector('.ant-message')).not.toBeNull()
    })
    const scopeOf = (element: Element | null) =>
      [...(element?.classList ?? [])].filter((name) => name.startsWith('css-var-'))
    const appScope = scopeOf(document.querySelector('.ant-app'))
    expect(appScope.length).toBeGreaterThan(0)
    const messageScope = scopeOf(document.querySelector('.ant-message'))
    expect(messageScope.some((name) => appScope.includes(name))).toBe(true)
  })

  test('再导出面不含静态 message/notification', async () => {
    const surface = await import('../index')
    expect('message' in surface).toBe(false)
    expect('notification' in surface).toBe(false)
  })
})
