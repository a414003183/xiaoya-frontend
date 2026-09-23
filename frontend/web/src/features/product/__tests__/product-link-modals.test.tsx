import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createQueryClient } from '@zentao/api-client'
import type { PlanView } from '@zentao/api-client/generated/model/planView'
import { AppProvider, ConfigProvider, createTheme, destroyStaticMessages, PermScope } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { setupServer } from 'msw/node'
import { MemoryRouter } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { db, resetMockData } from '../../../mocks/db'
import { handlers } from '../../../mocks/handlers'
import { PlanLinkModal } from '../components/plan-link-modal'

/**
 * plan 族关联弹窗等价测试（T72 / AUDIT FE-11 三处等价之一）：
 * LinkObjectsModal 已收敛到 design-system 的 LinkPickerModal（select 形态），本测逐项冻结旧交互——
 * 页签（需求/Bug）、多选下拉 + 体内关联、空选点击仍走成功分支（存量语义）、已关联表逐行移除关联、
 * 成功即失效缓存（getBoard 同口径的请求计数探针，FE-14）。
 */
initI18n()

const server = setupServer(...handlers)

/** 缓存失效探针：GET /plans/1/stories 计数（onDone → invalidate listPlanStories 的可观测面）。 */
const planStoryGets: string[] = []

beforeAll(() => {
  server.events.on('request:start', ({ request }) => {
    const url = new URL(request.url)
    if (request.method === 'GET' && /\/plans\/1\/stories$/.test(url.pathname)) {
      planStoryGets.push(url.pathname)
    }
  })
  server.listen({ onUnhandledRequest: 'error' })
})
beforeEach(() => {
  resetMockData()
  db.sessionActive = true
  db.currentAccountId = 1
  planStoryGets.length = 0
})
afterEach(() => {
  destroyStaticMessages()
  for (const node of document.querySelectorAll('.ant-message .ant-message-notice')) {
    node.remove()
  }
  server.resetHandlers()
})
afterAll(() => server.close())

function renderModal(onClose: () => void): void {
  const plan = db.plans.find((item) => item.id === 1) as PlanView
  render(
    <ConfigProvider theme={createTheme()}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <PermScope privileges={['plan-view', 'plan-link']}>
            <MemoryRouter>
              <PlanLinkModal plan={plan} open onClose={onClose} />
            </MemoryRouter>
          </PermScope>
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

describe('PlanLinkModal（LinkPicker select 形态等价）', () => {
  test('页签 + 多选下拉 + 体内关联按钮 + 提示 + 已关联表（逐行移除关联）', async () => {
    renderModal(() => {})
    expect(await screen.findByRole('combobox', { name: 'link-stories' })).toBeInTheDocument()
    // 页签（需求/Bug）与体内部关联按钮、提示行
    expect(screen.getByText('需求列表')).toBeInTheDocument()
    expect(screen.getByText('Bug')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^关\s*联需\s*求$/ })).toBeInTheDocument()
    expect(screen.getByText('仅可关联同产品且未关闭的对象。')).toBeInTheDocument()
    // 已关联表：story 1（planId=1）在表内且带移除关联按钮
    expect(await screen.findByText('Support SMS captcha on login page')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '移除关联' })).toBeInTheDocument()
  })

  test('空选点关联：沿存量语义走成功分支（提示已保存并触发失效）', async () => {
    const user = userEvent.setup()
    renderModal(() => {})
    await screen.findByRole('combobox', { name: 'link-stories' })
    await waitFor(() => expect(planStoryGets.length).toBe(1))
    await user.click(screen.getByRole('button', { name: /^关\s*联需\s*求$/ }))
    expect(await screen.findByText('已保存')).toBeInTheDocument()
    await waitFor(() => expect(planStoryGets.length).toBe(2))
  })

  test('选候选并关联：需求进入已关联表（POST link → 失效重取）', async () => {
    const user = userEvent.setup()
    renderModal(() => {})
    await user.click(await screen.findByRole('combobox', { name: 'link-stories' }))
    await user.click(await screen.findByText('#2 Support WeCom login'))
    await user.click(screen.getByRole('button', { name: /^关\s*联需\s*求$/ }))
    expect(await screen.findByText('已保存')).toBeInTheDocument()
    // 重取后候选排除已关联、已关联表出现新行（#2 的标题）
    await waitFor(() => {
      expect(screen.getAllByText('Support WeCom login').length).toBeGreaterThan(0)
    })
  })

  test('移除关联：POST unlink → 已保存 + 失效重取 + 行消失', async () => {
    const user = userEvent.setup()
    renderModal(() => {})
    await screen.findByText('Support SMS captcha on login page')
    await waitFor(() => expect(planStoryGets.length).toBe(1))
    await user.click(screen.getByRole('button', { name: '移除关联' }))
    expect(await screen.findByText('已保存')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Support SMS captcha on login page')).not.toBeInTheDocument())
    expect(db.stories.find((story) => story.id === 1)?.planId).not.toBe(1)
  })

  test('Bug 页签：只有空态（Bug 关联未接通），无选择器', async () => {
    renderModal(() => {})
    fireEvent.click(await screen.findByText('Bug'))
    expect(await screen.findByText('Bug 关联在 quality 域接通前暂不可用。')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'link-stories' })).not.toBeInTheDocument()
  })
})
