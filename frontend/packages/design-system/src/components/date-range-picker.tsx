import { DatePicker } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useTranslation } from 'react-i18next'
import { filterInputWidth } from '../tokens/spacing'

const { RangePicker } = DatePicker

export type DateRangeValue = string | undefined

/** 一周从周一起算（国内口径；dayjs 默认周日起算，故不依赖 locale 手动折算）。 */
function mondayOf(day: Dayjs): Dayjs {
  return day.subtract((day.day() + 6) % 7, 'day')
}

/**
 * 一键预设（T07 用户事项 6）：今日/昨日/本周/上周/本月/上月/近 7 天/近 30 天。
 * 本周/本月取**整周/整月**（含未来几天）——与「区间筛选」的语义一致，不偷偷截到当天。
 */
function presets(t: (key: string) => string): { label: string; value: [Dayjs, Dayjs] }[] {
  const today = dayjs().startOf('day')
  const monday = mondayOf(today)
  const monthStart = today.startOf('month')
  return [
    { label: t('common.datePreset.today'), value: [today, today] },
    { label: t('common.datePreset.yesterday'), value: [today.subtract(1, 'day'), today.subtract(1, 'day')] },
    { label: t('common.datePreset.thisWeek'), value: [monday, monday.add(6, 'day')] },
    { label: t('common.datePreset.lastWeek'), value: [monday.subtract(7, 'day'), monday.subtract(1, 'day')] },
    { label: t('common.datePreset.thisMonth'), value: [monthStart, monthStart.endOf('month').startOf('day')] },
    {
      label: t('common.datePreset.lastMonth'),
      value: [monthStart.subtract(1, 'month'), monthStart.subtract(1, 'day')],
    },
    { label: t('common.datePreset.last7Days'), value: [today.subtract(6, 'day'), today] },
    { label: t('common.datePreset.last30Days'), value: [today.subtract(29, 'day'), today] },
  ]
}

/** `a..b` → dayjs 两端（空半边 = 开区间 = null）。 */
function toRange(value: DateRangeValue): [Dayjs | null, Dayjs | null] {
  const [from = '', to = ''] = (value ?? '').split('..')
  return [from === '' ? null : dayjs(from), to === '' ? null : dayjs(to)]
}

/** dayjs 两端 → `a..b`（两端都空即无值；单边空即开区间，与后端 Filters 同口径）。 */
function toValue(range: null | [Dayjs | null, Dayjs | null]): DateRangeValue {
  const from = range?.[0]?.format('YYYY-MM-DD') ?? ''
  const to = range?.[1]?.format('YYYY-MM-DD') ?? ''
  return from === '' && to === '' ? undefined : `${from}..${to}`
}

/**
 * 日期区间选择器（T07 / 用户事项 6）：**全站唯一的日期筛选控件**，业务代码不直接用 antd RangePicker。
 *
 * - 值形态与后端 Filters 一致：单个 `a..b` 串（含 `..` 才是 RANGE），单边留空即开区间；
 *   两端都空回调 undefined（表单侧即删键），故页面无需知道 dayjs。
 * - 面板自带 8 个一键预设（今日…近 30 天），比纯手点两轮日历快；
 * - `id` 落在 antd 的**左半边输入**上，Form.Item 的标签（htmlFor）因此指向区间起点；
 *   两半的区分靠 `placeholder`（开始日期/结束日期）而非 aria-label——antd 把 aria-label 同时发给两半。
 */
export function DateRangePicker({
  value,
  onChange,
  id,
  width = filterInputWidth,
}: {
  /** 表单值 `a..b`（单边可空）；两端都空即无值。 */
  value?: DateRangeValue
  onChange?: ((value: DateRangeValue) => void) | undefined
  /** Form.Item 注入的控件 id：落在左半边，使标签的 htmlFor 有落点。 */
  id?: string | undefined
  /** 控件宽（缺省与其它筛选项同宽）。 */
  width?: number | string
}) {
  const { t } = useTranslation()
  /* 按需展开：exactOptionalPropertyTypes 下显式 undefined 不是合法 prop 值 */
  const idProps = id === undefined ? {} : { id }
  return (
    <RangePicker
      {...idProps}
      style={{ width }}
      format="YYYY-MM-DD"
      allowClear
      value={toRange(value)}
      presets={presets(t)}
      placeholder={[t('common.filter.dateStart'), t('common.filter.dateEnd')]}
      /* 单边选择即开区间（"a.." / "..b"）：antd 的 range 允许任一端为 null */
      onChange={(range) => onChange?.(toValue(range as [Dayjs | null, Dayjs | null] | null))}
    />
  )
}
