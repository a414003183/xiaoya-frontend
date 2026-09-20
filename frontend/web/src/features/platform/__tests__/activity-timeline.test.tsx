import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createQueryClient } from '@zentao/api-client'
import { AppProvider, ConfigProvider, createTheme } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { describe, expect, test, vi } from 'vitest'
import { ActivityTimeline } from '../components/activity-timeline'

initI18n()

type Page = {
  items: {
    id: number
    objectType: string
    objectId: number
    actor: string
    action: string
    remark: string | null
    occurredAt: string
  }[]
  hasMore: boolean
}

function renderTimeline(fetchPage: (beforeId?: number) => Promise<Page>) {
  return render(
    <ConfigProvider theme={createTheme()}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <ActivityTimeline fetchPage={fetchPage} />
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

describe('ActivityTimeline', () => {
  test('倒序渲染动态并可「加载更多」补齐下一页', async () => {
    const user = userEvent.setup()
    const pages = [
      {
        items: [
          {
            id: 3,
            objectType: 'account',
            objectId: 2,
            actor: 'admin',
            action: 'commented',
            remark: '第三条',
            occurredAt: '2026-03-01T00:00:00Z',
          },
          {
            id: 2,
            objectType: 'account',
            objectId: 2,
            actor: 'admin',
            action: 'enabled',
            remark: null,
            occurredAt: '2026-02-01T00:00:00Z',
          },
        ],
        hasMore: true,
      },
      {
        items: [
          {
            id: 1,
            objectType: 'account',
            objectId: 2,
            actor: 'admin',
            action: 'created',
            remark: null,
            occurredAt: '2026-01-01T00:00:00Z',
          },
        ],
        hasMore: false,
      },
    ]
    const calls: (number | undefined)[] = []
    const fetchPage = vi.fn(async (beforeId?: number) => {
      calls.push(beforeId)
      return pages[calls.length - 1] as Page
    })

    renderTimeline(fetchPage)
    expect(await screen.findByText('第三条')).toBeInTheDocument()
    expect(screen.queryByText('第一条不存在')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '加载更多' }))
    expect(await screen.findByText('创建')).toBeInTheDocument()
    expect(calls).toEqual([undefined, 2])
    expect(screen.queryByRole('button', { name: '加载更多' })).not.toBeInTheDocument()
  })

  test('空动态显示空态', async () => {
    renderTimeline(async () => ({ items: [], hasMore: false }))
    expect(await screen.findByText('暂无动态')).toBeInTheDocument()
  })
})
