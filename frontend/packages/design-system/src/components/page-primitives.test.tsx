// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Input, Select } from 'antd'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import { ConfirmAction } from './confirm-action'
import { FilterForm } from './filter-form'
import { PageContainer } from './page-container'
import { BackTargetScope, PageHeader } from './page-header'

// jsdom 缺 ResizeObserver/matchMedia（antd 按钮级与响应式栅格依赖）；antd/RTL 卸载偶发滞留需显式 cleanup（同 web 口径）
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
afterEach(cleanup)

describe('PageContainer（06 A3-1）', () => {
  test('wide 缺省全宽、统一 padding 24', () => {
    const { container } = render(
      <PageContainer>
        <div>x</div>
      </PageContainer>,
    )
    const root = container.firstElementChild as HTMLElement
    expect(root.style.maxWidth).toBe('')
    expect(root.style.padding).toBe('24px')
  })

  test('narrow 居中 720（窄页宽令牌）', () => {
    const { container } = render(
      <PageContainer variant="narrow">
        <div>x</div>
      </PageContainer>,
    )
    const root = container.firstElementChild as HTMLElement
    expect(root.style.maxWidth).toBe('720px')
    expect(root.style.marginInline).toBe('auto')
  })
})

describe('PageHeader（06 A3-1）', () => {
  test('无 backTo 不渲染返回钮；标题与操作区渲染', () => {
    render(
      <MemoryRouter>
        <PageHeader title="产品列表" extra={<button type="button">新建</button>} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: '产品列表' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新建' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'common.action.back' })).not.toBeInTheDocument()
  })

  test('传 backTo 渲染返回钮且点击导航到目标', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/stories/9']}>
        <Routes>
          <Route path="/stories/9" element={<PageHeader title="需求详情" backTo="/products" />} />
          <Route path="/products" element={<div>products-marker</div>} />
        </Routes>
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('button', { name: 'common.action.back' }))
    expect(screen.getByText('products-marker')).toBeInTheDocument()
  })

  // 06 A5-2 V-03：shell 注入的解析器把静态 backTo 换成带筛选参数的真实列表 URL
  test('BackTargetScope 注入时返回钮走解析后的 URL（筛选参数不丢）', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/products/9']}>
        <BackTargetScope resolve={(backTo) => `${backTo}?status=all`}>
          <Routes>
            <Route path="/products/9" element={<PageHeader title="产品详情" backTo="/products" />} />
            <Route path="/products" element={<div>list-marker</div>} />
          </Routes>
        </BackTargetScope>
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('button', { name: 'common.action.back' }))
    expect(screen.getByText('list-marker')).toBeInTheDocument()
  })

  /** 页头卡（.zt-page 的第一条）：贴顶通栏的实现锚点。 */
  const headerCard = (container: HTMLElement): HTMLElement => container.querySelector('.ant-card') as HTMLElement

  // 用户要求「返回键那一块和顶栏连在一起」：负外边距吃掉 pagePadding，再挂标记类给 style.css 收边框圆角
  test('传 backTo 时页头贴顶通栏（负外边距 = pagePadding，且挂 zt-page-header-attached）', () => {
    const { container } = render(
      <MemoryRouter>
        <PageContainer>
          <PageHeader title="需求详情" backTo="/products" />
          <div>正文</div>
        </PageContainer>
      </MemoryRouter>,
    )
    const header = headerCard(container)
    expect(header).toHaveClass('zt-page-header-attached')
    expect(header.style.marginTop).toBe('-24px')
    expect(header.style.marginInline).toBe('-24px')
    // 页签条下沿只有这一条：底边由 style.css 的规则给，DOM 侧钉住“去掉了整圈边框”的标记类
    expect(container.querySelector('.zt-page')?.firstElementChild).toBe(header)
  })

  test('无 backTo 的页头（侧栏菜单页）保持原卡片形态：不贴顶、不带标记类', () => {
    const { container } = render(
      <MemoryRouter>
        <PageContainer>
          <PageHeader title="产品列表" />
        </PageContainer>
      </MemoryRouter>,
    )
    const header = headerCard(container)
    expect(header).not.toHaveClass('zt-page-header-attached')
    expect(header.style.marginTop).toBe('')
    expect(header.style.marginInline).toBe('')
  })
})

describe('FilterForm（用户裁决 2026-09-19：键值表单 + 查询/重置）', () => {
  // 控件用 antd 真件（页面同源）：undefined 清空行为由控件自身决定，测试不吃裸 input 的差异
  const fields = [
    { name: 'q', label: '关键词', control: <Input aria-label="关键词" /> },
    { name: 'status', label: '状态', control: <Input aria-label="状态" /> },
  ]

  test('渲染键值对（标签 + 控件）', () => {
    render(<FilterForm fields={fields} values={{}} onSearch={vi.fn()} onReset={vi.fn()} />)
    expect(screen.getByText('关键词')).toBeInTheDocument()
    expect(screen.getByLabelText('关键词')).toBeInTheDocument()
    expect(screen.getByLabelText('状态')).toBeInTheDocument()
  })

  test('改草稿不变更生效值，点「查询」才提交', async () => {
    const user = userEvent.setup()
    const onSearch = vi.fn()
    render(<FilterForm fields={fields} values={{}} onSearch={onSearch} onReset={vi.fn()} />)
    await user.type(screen.getByLabelText('关键词'), '登录')
    expect(onSearch).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /common.action.search/ }))
    expect(onSearch).toHaveBeenCalledWith(expect.objectContaining({ q: '登录' }))
  })

  test('点「重置」清空草稿并回调', async () => {
    const user = userEvent.setup()
    const onSearch = vi.fn()
    const onReset = vi.fn()
    render(<FilterForm fields={fields} values={{ q: '登录' }} onSearch={onSearch} onReset={onReset} />)
    expect(screen.getByLabelText('关键词')).toHaveValue('登录')
    await user.click(screen.getByRole('button', { name: 'common.action.reset' }))
    expect(onReset).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('关键词')).toHaveValue('')
    expect(onSearch).not.toHaveBeenCalled()
  })

  test('外部生效值变化回灌草稿（前进后退/重置后 URL 回写）', () => {
    const { rerender } = render(
      <FilterForm fields={fields} values={{ q: '甲' }} onSearch={vi.fn()} onReset={vi.fn()} />,
    )
    expect(screen.getByLabelText('关键词')).toHaveValue('甲')
    rerender(<FilterForm fields={fields} values={{ q: '乙' }} onSearch={vi.fn()} onReset={vi.fn()} />)
    expect(screen.getByLabelText('关键词')).toHaveValue('乙')
  })

  test('「查询/重置」恒压筛选块右下角（换行容器末位 + 自动左外边距，条件多少都不漂）', () => {
    const { container } = render(<FilterForm fields={fields} values={{}} onSearch={vi.fn()} onReset={vi.fn()} />)
    // 筛选区自带卡片底（用户裁决 2026-09-20：独立成块，与表格卡同底）
    expect(container.querySelector('.ant-card')).not.toBeNull()
    const submit = screen.getByRole('button', { name: 'common.action.search' })
    const actions = submit.closest('.ant-flex') as HTMLElement
    expect(actions).not.toBeNull()
    // 动作组是换行容器的最后一个 flex 项，且靠 marginInlineStart:auto 顶到最右
    const row = actions.parentElement as HTMLElement
    expect(row.lastElementChild).toBe(actions)
    expect(getComputedStyle(actions).marginInlineStart).toBe('auto')
    // 条件控件与动作组同处一个换行容器（条件多时动作随末行右端）
    expect(row.querySelectorAll('.ant-form-item').length).toBe(fields.length)
  })

  test('「查询」钮不带图标（用户裁决 2026-09-20：去掉搜索图标）', () => {
    render(<FilterForm fields={fields} values={{}} onSearch={vi.fn()} onReset={vi.fn()} />)
    const submit = screen.getByRole('button', { name: 'common.action.search' })
    expect(submit.querySelector('.anticon')).toBeNull()
    expect(submit.querySelector('.ant-btn-icon')).toBeNull()
  })
})

describe('筛选下拉（FilterForm 字段里的值域控件）', () => {
  const fields = [
    {
      name: 'status',
      label: '状态',
      control: <Select aria-label="状态" options={[{ value: 'doing', label: '进行中' }]} />,
    },
  ]

  test('字段下拉选中后随「查询」回传生效值', async () => {
    const user = userEvent.setup()
    const onSearch = vi.fn()
    render(<FilterForm fields={fields} values={{}} onSearch={onSearch} onReset={vi.fn()} />)
    const combo = screen.getByRole('combobox', { name: '状态' })
    expect(combo).toBeInTheDocument()
    await user.click(combo)
    await user.click(await screen.findByTitle('进行中'))
    await user.click(screen.getByRole('button', { name: /common.action.search/ }))
    expect(onSearch).toHaveBeenCalledWith(expect.objectContaining({ status: 'doing' }))
  })

  test('生效值受控展示（外部值回灌）', () => {
    render(<FilterForm fields={fields} values={{ status: 'doing' }} onSearch={vi.fn()} onReset={vi.fn()} />)
    expect(screen.getByText('进行中')).toBeInTheDocument()
  })
})

describe('ConfirmAction（06 A3-1）', () => {
  test('危险操作需 Popconfirm 二次确认才触发', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(
      <ConfirmAction title="确认删除？" onConfirm={onConfirm}>
        <button type="button">删除</button>
      </ConfirmAction>,
    )
    await user.click(screen.getByRole('button', { name: '删除' }))
    expect(onConfirm).not.toHaveBeenCalled()
    // Popconfirm 弹层内主按钮（antd 默认 locale 为 zh）确认
    await user.click(
      document.querySelector('.ant-popover .ant-btn-primary, .ant-popconfirm .ant-btn-primary') as HTMLElement,
    )
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
