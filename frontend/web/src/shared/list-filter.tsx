import {
  type FilterField,
  FilterForm,
  type FilterValues,
  Flex,
  filterInputWidth,
  filterSelectWidth,
  Input,
  Select,
  spacing,
  Typography,
} from '@zentao/design-system'
import { cloneElement, isValidElement, type ReactNode, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { withParams } from './url'

/** 关键词筛选项（标准控件宽 + allowClear；字段名缺省 q——列表 DSL 的关键词参数就叫 q，03 §3）。 */
export function keywordField(label: string, placeholder: string, name = 'q'): FilterField {
  return {
    name,
    label,
    control: <Input allowClear style={{ width: filterInputWidth }} placeholder={placeholder} />,
  }
}

/** 值域筛选项（标准下拉宽 + allowClear；无值时显示「全部」占位，见 ListFilterForm 的注入规则）。
 *  数值型选项的 value 请传字符串，与 URL 同形。 */
export function selectField(name: string, label: string, options: { value: string; label: string }[]): FilterField {
  return { name, label, control: <Select allowClear style={{ width: filterSelectWidth }} options={options} /> }
}

/** `a..b` → 两半；无值与缺边（`a..`、`..b`）的空半边一律折成空串。 */
function splitRange(value: string | undefined): [string, string] {
  const [from = '', to = ''] = (value ?? '').split('..')
  return [from, to]
}

/**
 * 日期区间控件（表单值是单个 `a..b` 串，与 URL 参数同形）：两半都空 → undefined，
 * 只填一端 → `a..` / `..b`（开区间，另一半不设限）。
 * 两半留在本地 state 以容纳输入过程，外部值（URL 回灌 / 查询 / 重置）变化时回写。
 */
export function DateRangeControl({
  value,
  onChange,
  id,
  ariaLabelFrom,
  ariaLabelTo,
}: {
  /** 表单值 `a..b`（单边可空）；两端都空即无值。 */
  value?: string | undefined
  /** 变更回调：两端都空时回 undefined（表单侧即删键）。 */
  onChange?: ((value: string | undefined) => void) | undefined
  /** Form.Item 注入的控件 id：落在左半边，使标签的 htmlFor 有落点。 */
  id?: string | undefined
  /** 两半的无障碍名（本仓惯例是 kebab 标识串，如 task-list-filter-deadline-from）。 */
  ariaLabelFrom?: string | undefined
  ariaLabelTo?: string | undefined
}) {
  const [halves, setHalves] = useState<[string, string]>(() => splitRange(value))

  useEffect(() => {
    setHalves(splitRange(value))
  }, [value])

  const emit = (next: [string, string]): void => {
    setHalves(next)
    const [from, to] = next
    onChange?.(from === '' && to === '' ? undefined : `${from}..${to}`)
  }

  return (
    <Flex align="center" gap={spacing.xs}>
      <Input
        type="date"
        id={id}
        aria-label={ariaLabelFrom}
        style={{ width: filterInputWidth / 2 }}
        value={halves[0]}
        onChange={(event) => emit([event.target.value, halves[1]])}
      />
      <Typography.Text type="secondary">～</Typography.Text>
      <Input
        type="date"
        aria-label={ariaLabelTo}
        style={{ width: filterInputWidth / 2 }}
        value={halves[1]}
        onChange={(event) => emit([halves[0], event.target.value])}
      />
    </Flex>
  )
}

/**
 * 日期区间筛选项（闭区间，URL 形如 filters[deadline]=2026-01-01..2026-01-31）。
 * 口径与后端一致（platform/filters/Filters.java：含 `..` 才是 RANGE，裸值按 EQ），
 * 故本控件永远发 `a..b`（单边留空即开区间），不再发单日裸值。
 * 两半是**原生日期输入**（type=date）：浏览器只画自己的格式提示、不渲染 placeholder，
 * 故「无值显示全部」的注入规则（withAllPlaceholder）不适用于本控件，空值即无筛选。
 */
export function dateRangeField(
  name: string,
  label: string,
  ariaLabels?: { from?: string | undefined; to?: string | undefined },
): FilterField {
  return {
    name,
    label,
    colon: false,
    control: <DateRangeControl ariaLabelFrom={ariaLabels?.from} ariaLabelTo={ariaLabels?.to} />,
  }
}

/** 表单值 → URL 参数：空值（undefined/null/空串/空数组）一律删键；数组逗号折叠；其余转字符串。 */
function toParam(value: FilterValues[string]): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(',') : undefined
  }
  return String(value)
}

/**
 * 无值筛选控件统一显示「全部」（用户要求：「所有的筛选项如果没有默认值的，就默认选择全部，
 * 这个全部也需要在框里显示出来」）：
 * - 只认**标准控件身份**——页面与本文件引的是同一个 `@zentao/design-system` 的 `Select` 对象
 *   （ui.ts 再导出面），故 `type === Select` 是可靠判定，页面内联写的 `<Select>` 一并覆盖；
 * - 字段自带 placeholder 的不动（如「选择文档」「全部部门」）——那是比「全部」更具体的语义；
 * - 空值即无筛选（提交时 toParam 删 URL 键），所以占位符就是正确的表达方式：**不加空值选项**，
 *   那会改掉请求 DSL（01 §3.3）。原生日期输入（type=date）不吃 placeholder，故不在规则内。
 */
function withAllPlaceholder(field: FilterField, all: string): FilterField {
  const control = field.control
  if (!isValidElement<{ placeholder?: ReactNode }>(control) || control.type !== Select) return field
  if (control.props.placeholder !== undefined) return field
  return { ...field, control: cloneElement(control, { placeholder: all }) }
}

/**
 * 列表筛选表单（URL 绑定版 · 06 A3-1）：字段名即 URL 参数名——列表筛选状态一律在 URL（01 §3.3），
 * 所以这里只做「表单草稿 → URL」的一次转换，页面不再各自拼 setSearchParams。
 * 「查询」写回非空值并重置 page；「重置」删掉本次声明的全部筛选键（含 page）；其余参数（上下文 id 等）原样保留。
 *
 * 功能按钮不在这里（UI 三项修订 2026-09-20）：新建/批量/导出归 ListCard（与表格同卡），
 * 筛选区只留查询条件与固定右下角的「查询/重置」。
 *
 * 无值控件的「全部」占位在**本组件一处注入**（withAllPlaceholder）：标准控件身份判定 + 不吞字段
 * 自带 placeholder，故 24 个列表页一行不用改就统一口径。
 */
export function ListFilterForm({
  fields,
  defaults,
}: {
  fields: FilterField[]
  /**
   * 字段缺省值（URL 无该参数时表单显示什么）：与页面自己的取值兜底保持一致
   * （如待办日期缺省「今天」）。缺省值不写入 URL，「重置」后回到缺省。
   */
  defaults?: Record<string, string>
}) {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const shown = useMemo(() => fields.map((field) => withAllPlaceholder(field, t('common.filter.all'))), [fields, t])
  const values: FilterValues = Object.fromEntries(
    fields.map((field) => [field.name, searchParams.get(field.name) ?? defaults?.[field.name]]),
  )

  const commit = (next: FilterValues): void => {
    const patch: Record<string, string | undefined> = { page: undefined }
    for (const field of fields) {
      patch[field.name] = toParam(next[field.name])
    }
    setSearchParams(withParams(searchParams, patch))
  }

  return <FilterForm fields={shown} values={values} onSearch={commit} onReset={() => commit({})} />
}
