import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ConfigProvider, createTheme, filterSelectWidth, Select } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import type { ReactNode } from 'react'
import { MemoryRouter, useSearchParams } from 'react-router'
import { describe, expect, test } from 'vitest'
import { dateRangeField, ListFilterForm, selectField } from '../list-filter'

/**
 * 无值筛选项显示「全部」（用户要求）：注入在 ListFilterForm 一处完成（withAllPlaceholder）——
 * 标准 Select 身份判定 + 不吞字段自带 placeholder，页面的筛选区一行不用改。
 * 「全部」只是**占位**：空值仍是「无筛选」，提交时 URL 不带该键（01 §3.3 的请求 DSL 不变）。
 */
initI18n()

/** URL 探针：把提交后的参数读出来（列表筛选状态一律在 URL，01 §3.3）。 */
function UrlProbe() {
  const [searchParams] = useSearchParams()
  return <span data-testid="url">{searchParams.toString()}</span>
}

function renderFilter(fields: Parameters<typeof ListFilterForm>[0]['fields'], entry = '/products'): void {
  render(
    <ConfigProvider theme={createTheme()}>
      <MemoryRouter initialEntries={[entry]}>
        <ListFilterForm fields={fields} />
        <UrlProbe />
      </MemoryRouter>
    </ConfigProvider>,
  )
}

const param = (): string | null => screen.getByTestId('url').textContent

/** 「查询」提交后 onFinish 走异步校验链，URL 要等一拍（antd 在两个汉字间插空格，正则容错）。 */
const submit = (): void => {
  fireEvent.click(screen.getByRole('button', { name: /搜\s*索/ }))
}

/** 页面内联写的下拉（与页面同源：都从 design-system 再导出面取 Select）。 */
function OwnPlaceholderSelect(): ReactNode {
  return <Select allowClear style={{ width: filterSelectWidth }} placeholder="请选择文档" options={[]} />
}

describe('无值筛选项显示「全部」', () => {
  test('selectField 无值时框内显示「全部」', () => {
    renderFilter([selectField('status', '状态', [{ value: 'doing', label: '进行中' }])])
    expect(screen.getByText('全部')).toBeInTheDocument()
  })

  test('页面内联的 Select（未自带 placeholder）同样被注入「全部」', () => {
    renderFilter([
      { name: 'type', label: '类型', control: <Select allowClear style={{ width: filterSelectWidth }} options={[]} /> },
    ])
    expect(screen.getByText('全部')).toBeInTheDocument()
  })

  test('字段自带 placeholder 的保留原文案（比「全部」更具体的语义，不被覆盖）', () => {
    renderFilter([{ name: 'docId', label: '文档', control: <OwnPlaceholderSelect /> }])
    expect(screen.getByText('请选择文档')).toBeInTheDocument()
    expect(screen.queryByText('全部')).not.toBeInTheDocument()
  })

  test('「全部」只是占位：不选值提交后 URL 不带该键（请求 DSL 不变）', async () => {
    renderFilter([selectField('status', '状态', [{ value: 'doing', label: '进行中' }])])
    submit()
    await waitFor(() => {
      expect(param()).toBe('')
    })
  })

  test('区间控件不注入「全部」（空值即无筛选），保留自己的两半 placeholder', () => {
    renderFilter([dateRangeField('deadline', '截止日期')])
    expect(screen.queryByText('全部')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('开始日期')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('结束日期')).toBeInTheDocument()
  })
})
