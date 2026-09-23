import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ConfigProvider, createTheme } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { MemoryRouter, useSearchParams } from 'react-router'
import { describe, expect, test } from 'vitest'
import { dateRangeField, ListFilterForm } from '../list-filter'

/**
 * 日期区间筛选项（dateRangeField）：表单值是单个 `a..b` 串，与后端 Filters 同口径
 * （platform/filters/Filters.java：含 `..` 才是 RANGE，裸值按 EQ）——单日裸值不再是合法输入。
 *
 * 控件自 T07 起是 design-system 的 `DateRangePicker`（antd RangePicker + 8 个预设），驱动方式随之改变：
 * 两半按 **placeholder** 定位（antd 把同一个 aria-label 同时发给两个 input，按 label 查会命中两个）；
 * 选值走真机路径——点开面板点日期格 / 点预设。断言仍走 ListFilterForm 的真实提交路径
 * （表单值 → URL 参数），不探控件内部。
 */
initI18n()

const FIELDS = [dateRangeField('deadline', '截止日期')]

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
const half = (which: 'from' | 'to'): HTMLInputElement =>
  screen.getByPlaceholderText(which === 'from' ? '开始日期' : '结束日期') as HTMLInputElement
/** 「查询」提交后 onFinish 走异步校验链，URL 要等一拍。 */
const submit = (): void => {
  // antd 在两个汉字之间插了空格（「搜 索」），用正则容错
  fireEvent.click(screen.getByRole('button', { name: /搜\s*索/ }))
}
/** 打开面板后点某一天（面板渲染两个月的格子，同一天可能出现两次，取第一个）。 */
const clickDay = (iso: string): void => {
  fireEvent.click(screen.getAllByTitle(iso)[0] as HTMLElement)
}
/** 本地日期 → YYYY-MM-DD（不用 toISOString：UTC 偏移会让「今天」错一天）。 */
const iso = (day: Date): string =>
  `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
const shift = (days: number): string => {
  const day = new Date()
  day.setDate(day.getDate() + days)
  return iso(day)
}

describe('dateRangeField（RangePicker + 预设）', () => {
  test('面板里点起止两天：提交为闭区间 deadline=a..b', async () => {
    renderFilter()
    fireEvent.click(half('from'))
    clickDay(shift(-2))
    clickDay(shift(0))
    submit()
    await waitFor(() => {
      expect(param()).toBe(`deadline=${shift(-2)}..${shift(0)}`)
    })
    expect(half('from')).toHaveValue(shift(-2))
    expect(half('to')).toHaveValue(shift(0))
  })

  /* T07（用户事项 6）：面板里点预设即得区间，比手点两轮日历快。 */
  test('预设「近 7 天」一键落成区间（含当天共 7 天）', async () => {
    renderFilter()
    fireEvent.click(half('from'))
    fireEvent.click(await screen.findByText('近 7 天'))
    submit()
    await waitFor(() => {
      expect(param()).toBe(`deadline=${shift(-6)}..${shift(0)}`)
    })
  })

  test('预设「上周」落在上一个整周（周一到周日）', async () => {
    renderFilter()
    fireEvent.click(half('from'))
    fireEvent.click(await screen.findByText('上周'))
    submit()
    const monday = new Date()
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) - 7)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    await waitFor(() => {
      expect(param()).toBe(`deadline=${iso(monday)}..${iso(sunday)}`)
    })
  })

  test('两端都空：重置后不发 deadline 参数（表单值为 undefined）', async () => {
    renderFilter('/tasks?deadline=2026-01-01..2026-01-31')
    fireEvent.click(screen.getByRole('button', { name: /重\s*置/ }))
    await waitFor(() => {
      expect(param()).toBe('')
    })
    expect(half('from')).toHaveValue('')
    expect(half('to')).toHaveValue('')
  })

  test('URL 回灌两半；清除按钮删掉参数', async () => {
    renderFilter('/tasks?deadline=2026-01-01..2026-01-31')
    expect(half('from')).toHaveValue('2026-01-01')
    expect(half('to')).toHaveValue('2026-01-31')

    const clear = document.querySelector('.ant-picker-clear')
    expect(clear).not.toBeNull()
    fireEvent.click(clear as HTMLElement)
    submit()
    await waitFor(() => {
      expect(param()).toBe('')
    })
  })

  /* 开区间（`a..` / `..b`）是后端 Filters 的合法口径，控件必须原样保留：
     antd 面板不再产出半边值（点一格即算选中，落值要等第二格），但 URL 里的开区间回灌后原样提交。 */
  test('URL 里的开区间原样保留（a.. 与 ..b）', async () => {
    renderFilter('/tasks?deadline=2026-01-01..')
    expect(half('from')).toHaveValue('2026-01-01')
    expect(half('to')).toHaveValue('')
    submit()
    await waitFor(() => {
      expect(param()).toBe('deadline=2026-01-01..')
    })
  })
})
