import { fireEvent, render, screen } from '@testing-library/react'
import { ConfigProvider, createTheme } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { beforeEach, describe, expect, test } from 'vitest'
import { RowNameLink } from '../row-name-link'

/**
 * 列表名称列入口（用户要求 2026-09-20：点名称进详情、操作列去掉「详情」）：
 * 钉子是真链接（href → 键盘/右键可开）与「普通左键 SPA 导航、修饰键不拦截」两条。
 */
initI18n()

/** 落点探针：SPA 导航后 MemoryRouter 的 pathname 变成本地 state，不触发整页跳转。 */
function Landing() {
  const location = useLocation()
  return <span data-testid="landing">{location.pathname}</span>
}

function renderLink(): void {
  render(
    <ConfigProvider theme={createTheme()}>
      <MemoryRouter initialEntries={['/stories']}>
        <Routes>
          <Route
            path="/stories"
            element={
              <RowNameLink to="/stories/7">
                <span>需求甲</span>
              </RowNameLink>
            }
          />
          <Route path="/stories/:storyId" element={<Landing />} />
        </Routes>
      </MemoryRouter>
    </ConfigProvider>,
  )
}

describe('RowNameLink', () => {
  beforeEach(() => {
    renderLink()
  })

  test('渲染为带 href 的真链接（键盘可聚焦、Enter 可开）', () => {
    const link = screen.getByRole('link', { name: '需求甲' })
    expect(link).toHaveAttribute('href', '/stories/7')
  })

  test('普通左键走 SPA 导航到目标路由', () => {
    fireEvent.click(screen.getByRole('link', { name: '需求甲' }))
    expect(screen.getByTestId('landing')).toHaveTextContent('/stories/7')
  })

  test('Ctrl 左键不拦截：交给浏览器新标签页', () => {
    // React 挂在容器上、document 监听在其后：document 阶段看到的 defaultPrevented 即本件的决定
    const decisions: boolean[] = []
    const observe = (event: Event): void => {
      decisions.push(event.defaultPrevented)
      event.preventDefault() // 只观察：拦掉 jsdom 未实现的真实跳转噪音
    }
    document.addEventListener('click', observe)
    fireEvent.click(screen.getByRole('link', { name: '需求甲' }), { ctrlKey: true })
    document.removeEventListener('click', observe)

    expect(decisions).toEqual([false]) // 未 preventDefault = 浏览器新标签页行为保留
    expect(screen.queryByTestId('landing')).not.toBeInTheDocument() // 也不该发生 SPA 导航
  })
})
