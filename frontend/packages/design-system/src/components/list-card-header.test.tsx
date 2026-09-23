// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, test } from 'vitest'
import { ListCardHeader } from './list-card'

/**
 * 列表卡头标准件（T72 / AUDIT FE-12）：「左功能按钮 / 右工具栏」一行的唯一实现。
 * 两处手写卡头（plan 看板视图 / 分类树页）与 ListCard 内部都走它，标准件演进不漂移。
 */
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
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
})

afterEach(() => {
  cleanup()
})

describe('ListCardHeader', () => {
  test('标题/功能按钮/工具栏/追加位各就各位', () => {
    render(
      <ListCardHeader
        title="卡片标题"
        actions={<button type="button">新建</button>}
        toolbar={<span>列表/看板</span>}
        extra={<button type="button">齿轮</button>}
      />,
    )
    expect(screen.getByText('卡片标题')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^新\s*建$/ })).toBeInTheDocument()
    expect(screen.getByText('列表/看板')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^齿\s*轮$/ })).toBeInTheDocument()
  })

  test('无标题/无工具栏的左组单按钮形态（分类树页同款）', () => {
    render(<ListCardHeader actions={<button type="button">新建分类</button>} />)
    expect(screen.getByRole('button', { name: '新建分类' })).toBeInTheDocument()
  })
})
