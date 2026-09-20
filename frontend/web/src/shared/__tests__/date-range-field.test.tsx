import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ConfigProvider, createTheme } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { MemoryRouter, useSearchParams } from 'react-router'
import { describe, expect, test } from 'vitest'
import { dateRangeField, ListFilterForm } from '../list-filter'

/**
 * 截止日期区间筛选项（dateRangeField）：表单值是单个 `a..b` 串，与后端 Filters 同口径
 * （platform/filters/Filters.java：含 `..` 才是 RANGE，裸值按 EQ）——单日裸值不再是合法输入。
 * 断言走 ListFilterForm 的真实提交路径（表单值 → URL 参数），不探控件内部。
 */
initI18n()

const FIELDS = [dateRangeField('deadline', '截止日期', { from: 'deadline-from', to: 'deadline-to' })]

/** URL 探针：把提交后的参数读出来（列表筛选状态一律在 URL，01 §3.3）。 */
function UrlProbe() {
  const [searchParams] = useSearchParams()
  return <span data-testid="url">{searchParams.toString()}</span>
}

function renderFilter(entry = '/tasks'): void {
  render(
    <ConfigProvider theme={createTheme()}>
      <MemoryRouter initialEntries={[entry]}>
        <ListFilterForm fields={FIELDS} />
        <UrlProbe />
      </MemoryRouter>
    </ConfigProvider>,
  )
}

const param = (): string | null => screen.getByTestId('url').textContent
const fill = (label: string, value: string): void => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}
/** 「查询」提交后 onFinish 走异步校验链，URL 要等一拍。 */
const submit = (): void => {
  // antd 在两个汉字之间插了空格（「搜 索」），用正则容错
  fireEvent.click(screen.getByRole('button', { name: /搜\s*索/ }))
}

describe('dateRangeField', () => {
  test('两端都填：提交为闭区间 deadline=a..b', async () => {
    renderFilter()
    fill('deadline-from', '2026-01-01')
    fill('deadline-to', '2026-01-31')
    submit()
    await waitFor(() => {
      expect(param()).toBe('deadline=2026-01-01..2026-01-31')
    })
  })

  test('只填一端：开区间 a.. / ..b（另一端不设限）', async () => {
    renderFilter()
    fill('deadline-from', '2026-01-01')
    submit()
    await waitFor(() => {
      expect(param()).toBe('deadline=2026-01-01..')
    })

    fill('deadline-from', '')
    fill('deadline-to', '2026-01-31')
    submit()
    await waitFor(() => {
      expect(param()).toBe('deadline=..2026-01-31')
    })
  })

  test('两端都空：不发 deadline 参数（表单值为 undefined）', async () => {
    renderFilter('/tasks?deadline=2026-01-01..2026-01-31')
    fill('deadline-from', '')
    fill('deadline-to', '')
    submit()
    await waitFor(() => {
      expect(param()).toBe('')
    })
  })

  test('URL 回灌两半，重置清空', () => {
    renderFilter('/tasks?deadline=2026-01-01..2026-01-31')
    expect(screen.getByLabelText('deadline-from')).toHaveValue('2026-01-01')
    expect(screen.getByLabelText('deadline-to')).toHaveValue('2026-01-31')

    fireEvent.click(screen.getByRole('button', { name: /重\s*置/ }))
    expect(param()).toBe('')
    expect(screen.getByLabelText('deadline-from')).toHaveValue('')
    expect(screen.getByLabelText('deadline-to')).toHaveValue('')
  })
})
