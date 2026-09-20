import type { ActivityView } from '@zentao/api-client/generated/model/activityView'
import type { BugDistributionReport } from '@zentao/api-client/generated/model/bugDistributionReport'
import type { BurnReport } from '@zentao/api-client/generated/model/burnReport'
import type { CasePassRateReport } from '@zentao/api-client/generated/model/casePassRateReport'
import type { StorySummaryReport } from '@zentao/api-client/generated/model/storySummaryReport'
import type { TodoView } from '@zentao/api-client/generated/model/todoView'
import type { StatusTone } from '@zentao/design-system'
import type { EChartsCoreOption } from 'echarts/core'
import type { MetaField } from '../../shared/meta'
import type { BatchCreateResultItem } from './api/workspace.api'

/** workspace 域纯逻辑（01 §3.2 model.ts）：待办状态/日期页签、我的地盘 role 映射、批量行装配、动态分组、周报/报表图表 option。 */

// ── Todo（workspace §3.1/§4） ──

export const TODO_STATUSES = ['wait', 'doing', 'done', 'closed'] as const
export const TODO_PRIORITIES = [1, 2, 3, 4] as const

/** 状态色（§4 四态）；meta.statusVisuals 的 tone 词表与 design-system 不同源，前端只认本表。 */
const TODO_TONE: Record<string, StatusTone> = {
  wait: 'pending',
  doing: 'active',
  done: 'active',
  closed: 'closed',
}

export function todoStatusTone(status: string): StatusTone {
  return TODO_TONE[status] ?? 'neutral'
}

export function todoStatusKey(status: string): string {
  return `todo.status.${(TODO_STATUSES as readonly string[]).includes(status) ? status : 'wait'}`
}

/** 优先级文案 key（§3.1 复用 common.priority.*，1–4，越界回落 3=中）。 */
export function todoPriorityKey(priority: number | null | undefined): string {
  const value = priority ?? 3
  return `common.priority.${(TODO_PRIORITIES as readonly number[]).includes(value) ? value : 3}`
}

export function todoTypeKey(type: string): string {
  return `todo.type.${type}`
}

/** 响应视图兜底（§3.1）：type≠custom 且 title 为空时展示现算 objectTitle，不回写存储。 */
export function todoDisplayTitle(todo: Pick<TodoView, 'title' | 'objectTitle'>): string {
  return todo.title?.trim() || todo.objectTitle || ''
}

/** 关联对象条件必填（§3.1：type≠custom 时 objectId 必填且对象存在）。 */
export function todoObjectRequired(type: string): boolean {
  return type !== 'custom'
}

/** 对象选择器的搜索 scope（契约 /search scope 白名单子集）；testRun 未注册 scope → null（退化为 id 输入）。 */
export function todoObjectScope(type: string): 'story' | 'epic' | 'requirement' | 'task' | 'bug' | null {
  return type === 'story' || type === 'epic' || type === 'requirement' || type === 'task' || type === 'bug'
    ? type
    : null
}

// ── meta 字段目录（03 §5：表单标签/长度与后端同源，前端不另立一份） ──

export function metaFieldLabel(fields: readonly MetaField[] | undefined, key: string, fallback: string): string {
  return (fields ?? []).find((field) => field.key === key)?.i18n ?? fallback
}

export function metaFieldMaxLength(fields: readonly MetaField[] | undefined, key: string, fallback: number): number {
  return (fields ?? []).find((field) => field.key === key)?.maxLength ?? fallback
}

// ── 日期页签（§6 /my/todos：今天/本周/待定/全部 = filters[date] 单值/区间/@null/缺省） ──

export type TodoDateTab = 'today' | 'week' | 'undated' | 'all'

export const TODO_DATE_TABS: readonly TodoDateTab[] = ['today', 'week', 'undated', 'all']

const DAY_MS = 86_400_000

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

/** 任意日期 → 所在周周一（周日归上一周，与服务端 mondayOf 同口径）。 */
export function mondayOf(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()
  return addDays(date, day === 0 ? -6 : 1 - day)
}

/** 页签 → filters[date]；全部返回 undefined（URL 不带该键）。 */
export function todoDateFilter(tab: TodoDateTab, today: string): string | undefined {
  switch (tab) {
    case 'today':
      return today
    case 'week': {
      const monday = mondayOf(today)
      return `${monday}..${addDays(monday, 6)}`
    }
    case 'undated':
      return '@null'
    default:
      return undefined
  }
}

/** URL 页签解析（缺省今天；非法值回落今天）。 */
export function normalizeDateTab(value: string | null | undefined): TodoDateTab {
  return value !== null && value !== undefined && (TODO_DATE_TABS as readonly string[]).includes(value)
    ? (value as TodoDateTab)
    : 'today'
}

// ── PATCH 装配（§5；03 §1 键缺失 = 不修改） ──

export type TodoEditValues = {
  title: string
  type: string
  objectId: number | null
  date: string
  beginTime: string
  endTime: string
  priority: number
  description: string
  isPrivate: boolean
}

/** 只提交改动过的键 + lockVersion（日期/时间为空 = 不下发；后端 null 即不修改，本域不支持清空）。 */
export function todoPatchBody(todo: TodoView, values: TodoEditValues): Record<string, unknown> {
  const body: Record<string, unknown> = { lockVersion: todo.lockVersion }
  const title = values.title.trim()
  if (title !== todo.title) {
    body.title = title
  }
  if (values.type !== todo.type) {
    body.type = values.type
  }
  if (todoObjectRequired(values.type) && values.objectId !== null && values.objectId !== todo.objectId) {
    body.objectId = values.objectId
  }
  // 转回 custom 时解绑（§3.1 objectId 0 = 无，非 custom 才要求对象存在）
  if (values.type === 'custom' && todo.objectId !== 0) {
    body.objectId = 0
  }
  if (values.date !== '' && values.date !== todo.date) {
    body.date = values.date
  }
  if (values.beginTime !== (todo.beginTime ?? '')) {
    body.beginTime = values.beginTime === '' ? null : values.beginTime
  }
  if (values.endTime !== (todo.endTime ?? '')) {
    body.endTime = values.endTime === '' ? null : values.endTime
  }
  if (values.priority !== todo.priority) {
    body.priority = values.priority
  }
  if (values.description !== (todo.description ?? '')) {
    body.description = values.description === '' ? null : values.description
  }
  if (values.isPrivate !== todo.isPrivate) {
    body.isPrivate = values.isPrivate
  }
  return body
}

export type TodoCreateValues = TodoEditValues & { assignee: string }

/** 创建请求体（§3.1）：日期留空 = 待定（null）；type≠custom 才下发 objectId；空文本归一 null。 */
export function todoCreateBody(values: TodoCreateValues): Record<string, unknown> {
  return {
    title: values.title.trim(),
    type: values.type,
    ...(todoObjectRequired(values.type) && values.objectId !== null ? { objectId: values.objectId } : {}),
    date: values.date === '' ? null : values.date,
    beginTime: values.beginTime === '' ? null : values.beginTime,
    endTime: values.endTime === '' ? null : values.endTime,
    priority: values.priority,
    description: values.description === '' ? null : values.description,
    isPrivate: values.isPrivate,
    assignee: values.assignee,
  }
}

// ── 我的地盘 role 页签（§3.4 映射真源 / §6 页签文案） ──

export const MY_ROLES = {
  tasks: ['assignee', 'creator', 'finisher', 'closer'],
  bugs: ['assignee', 'creator', 'resolver', 'closer'],
  stories: ['assignee', 'creator', 'reviewer', 'closer'],
} as const

export type MyListKind = keyof typeof MY_ROLES
/** 各列表的 role 白名单联合（与契约 ListMy*Role 逐字对应；A6-1 起直接作为请求参数类型）。 */
export type MyRole<K extends MyListKind> = (typeof MY_ROLES)[K][number]

export const DEFAULT_MY_ROLE = 'assignee'

/** 页签文案 key（由我完成/由我解决/由我评审随列表类型而异）。 */
export function myRoleKey(kind: MyListKind, role: string): string {
  return `my.role.${kind}.${role}`
}

/** URL role 解析：白名单外一律回落 assignee（非法值本就 40001，不下发）。 */
export function normalizeMyRole<K extends MyListKind>(kind: K, role: string | null | undefined): MyRole<K> {
  return role !== null && role !== undefined && (MY_ROLES[kind] as readonly string[]).includes(role)
    ? (role as MyRole<K>)
    : (DEFAULT_MY_ROLE as MyRole<K>)
}

// ── 动态分组（§6 /my/activities 按日期分组） ──

/** 动态所属日（本地时区 YYYY-MM-DD，与界面 toLocaleString 同一时区口径）。 */
export function activityDateKey(occurredAt: string): string {
  const date = new Date(occurredAt)
  if (Number.isNaN(date.getTime())) {
    return occurredAt.slice(0, 10)
  }
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export type ActivityGroup<T> = { date: string; items: T[] }

/** 已倒序的游标页 → 相邻同日的合并分组（保持原顺序，不重排）。 */
export function groupActivitiesByDate<T extends Pick<ActivityView, 'occurredAt'>>(
  items: readonly T[],
): ActivityGroup<T>[] {
  const groups: ActivityGroup<T>[] = []
  for (const item of items) {
    const date = activityDateKey(item.occurredAt)
    const last = groups[groups.length - 1]
    if (last !== undefined && last.date === date) {
      last.items.push(item)
    } else {
      groups.push({ date, items: [item] })
    }
  }
  return groups
}

// ── 批量创建（§5：items ≤50，逐项结果 results[].index） ──

export type TodoBatchRow = {
  key: number
  title: string
  type: string
  objectId: number | null
  date: string
  beginTime: string
  endTime: string
  priority: number
  assignee: string | null
}

export const TODO_BATCH_MAX_ROWS = 50

/** 行 → items：丢弃未填标题的行；空日期不下发（服务端 null = 待定，缺省由表单给今天）；objectId 仅 type≠custom 下发。 */
export function todoBatchItems(rows: readonly TodoBatchRow[]): {
  items: Record<string, unknown>[]
  keys: number[]
} {
  const items: Record<string, unknown>[] = []
  const keys: number[] = []
  for (const row of rows) {
    const title = row.title.trim()
    if (title.length === 0) {
      continue
    }
    items.push({
      title,
      type: row.type,
      ...(todoObjectRequired(row.type) && row.objectId !== null ? { objectId: row.objectId } : {}),
      ...(row.date === '' ? {} : { date: row.date }),
      ...(row.beginTime === '' ? {} : { beginTime: row.beginTime }),
      ...(row.endTime === '' ? {} : { endTime: row.endTime }),
      priority: row.priority,
      ...(row.assignee === null || row.assignee === '' ? {} : { assignee: row.assignee }),
    })
    keys.push(row.key)
  }
  return { items, keys }
}

export type TodoBatchOutcome = { ok: boolean; id: number | null; error: string | null }

/** 逐项结果（results[].index 对齐已提交行）→ 行结果；服务端未返回该下标按失败计。 */
export function todoBatchOutcomes(
  rows: readonly TodoBatchRow[],
  results: readonly BatchCreateResultItem[],
): Map<number, TodoBatchOutcome> {
  const { keys } = todoBatchItems(rows)
  const outcomes = new Map<number, TodoBatchOutcome>()
  keys.forEach((key, index) => {
    const result = results.find((entry) => entry.index === index)
    outcomes.set(key, {
      ok: result?.ok ?? false,
      id: result?.id ?? null,
      error: result?.ok === true ? null : (result?.error ?? 'todo.message.batchFailed'),
    })
  })
  return outcomes
}

// ── 周报与固定报表（§3.2/§3.3/§5）：周导航与「报表结构 → 图表 option」映射 ──

/** 本地日期 YYYY-MM-DD（页面默认值；与界面上周/月口径同时区）。 */
export function todayIso(): string {
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** 周导航：任意日期 ±n 周（传周内任意一天即可，服务端归一到周一）。 */
export function shiftWeek(date: string, weeks: number): string {
  return addDays(date, weeks * 7)
}

/** analysis 纯文本按 `\n` 分行（§3.2：前端禁 HTML 注入，逐行渲染；空行丢弃）。 */
export function analysisLines(analysis: string): string[] {
  return analysis
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

/** 图表点：name 为已翻译文案（图表内部不做 i18n）。 */
export type ChartPoint = { name: string; value: number }

/** 分布分组点：labelKey 供页面 t() 展开，模型层只做结构映射（与 quality model 同范式）。 */
export type DistributionPoint = { key: string; labelKey: string; value: number }

/** 分布点 → 图表点（translator 传 i18n 的 t；保持纯函数便于测试）。 */
export function localizedPoints(
  points: readonly DistributionPoint[],
  translate: (key: string) => string,
): ChartPoint[] {
  return points.map((point) => ({ name: translate(point.labelKey), value: point.value }))
}

export type StorySummaryGroups = {
  byStatus: DistributionPoint[]
  byPriority: DistributionPoint[]
  byStage: DistributionPoint[]
  byType: DistributionPoint[]
}

/** StorySummaryReport → 四组分布点（文案 key 与 story/bug 域既有译名同源）。 */
export function storySummaryGroups(report: StorySummaryReport): StorySummaryGroups {
  return {
    byStatus: report.byStatus.map((row) => ({
      key: row.status,
      labelKey: `story.status.${row.status}`,
      value: row.count,
    })),
    byPriority: report.byPriority.map((row) => ({
      key: String(row.priority),
      labelKey: `common.priority.${row.priority}`,
      value: row.count,
    })),
    byStage: report.byStage.map((row) => ({ key: row.stage, labelKey: `story.stage.${row.stage}`, value: row.count })),
    byType: report.byType.map((row) => ({ key: row.type, labelKey: `story.type.${row.type}`, value: row.count })),
  }
}

export type BugDistributionGroups = {
  bySeverity: DistributionPoint[]
  byStatus: DistributionPoint[]
  byResolution: DistributionPoint[]
}

/** BugDistributionReport → 三组分布点（resolution 空值桶固定为 `unresolved`，§5）。 */
export function bugDistributionGroups(report: BugDistributionReport): BugDistributionGroups {
  return {
    bySeverity: report.bySeverity.map((row) => ({
      key: String(row.severity),
      labelKey: `bug.severity.${row.severity}`,
      value: row.count,
    })),
    byStatus: report.byStatus.map((row) => ({
      key: row.status,
      labelKey: `bug.status.${row.status}`,
      value: row.count,
    })),
    byResolution: report.byResolution.map((row) => ({
      key: row.resolution,
      labelKey: row.resolution === 'unresolved' ? 'report.resolution.unresolved' : `bug.resolution.${row.resolution}`,
      value: row.count,
    })),
  }
}

/** CasePassRateReport → 四种执行结果的分布点（不适用单列，§5）。 */
export function caseResultPoints(report: CasePassRateReport): DistributionPoint[] {
  return [
    { key: 'passed', labelKey: 'report.result.passed', value: report.passed },
    { key: 'failed', labelKey: 'report.result.failed', value: report.failed },
    { key: 'blocked', labelKey: 'report.result.blocked', value: report.blocked },
    { key: 'na', labelKey: 'report.result.na', value: report.na },
  ]
}

/** 水平条形图（分布类报表通用；x=数量，y=名称，条尾显示数值）。 */
export function barOption(points: readonly ChartPoint[], seriesName: string): EChartsCoreOption {
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 8, right: 32, top: 8, bottom: 8, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' },
    xAxis: { type: 'value', minInterval: 1 },
    yAxis: { type: 'category', data: points.map((point) => point.name), inverse: true },
    series: [
      {
        name: seriesName,
        type: 'bar',
        barMaxWidth: 18,
        data: points.map((point) => point.value),
        label: { show: true, position: 'right' },
      },
    ],
  }
}

/** 堆叠条形图（工作量类报表：x=人员/分类，每个 series 一段堆叠）。 */
export function stackedBarOption(
  categories: readonly string[],
  series: readonly { name: string; values: readonly number[] }[],
): EChartsCoreOption {
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { bottom: 0 },
    grid: { left: 8, right: 24, top: 8, bottom: 32, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' },
    xAxis: { type: 'category', data: [...categories] },
    yAxis: { type: 'value' },
    series: series.map((entry) => ({
      name: entry.name,
      type: 'bar',
      stack: 'total',
      barMaxWidth: 28,
      data: [...entry.values],
    })),
  }
}

/** 燃尽折线（§5 BurnReport）：ideal 虚线参考线 + remaining 实际线，x 轴为日期。 */
export function burnOption(report: BurnReport, labels: { ideal: string; remaining: string }): EChartsCoreOption {
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: [labels.ideal, labels.remaining], bottom: 0 },
    grid: { left: 8, right: 16, top: 16, bottom: 32, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' },
    xAxis: { type: 'category', data: report.dates },
    yAxis: { type: 'value' },
    series: [
      { name: labels.ideal, type: 'line', symbol: 'none', lineStyle: { type: 'dashed' }, data: report.ideal },
      { name: labels.remaining, type: 'line', symbol: 'circle', data: report.remaining },
    ],
  }
}

/** 环形图（用例通过率四种结果占比）。 */
export function donutOption(points: readonly ChartPoint[]): EChartsCoreOption {
  return {
    tooltip: { trigger: 'item' },
    legend: { bottom: 0 },
    series: [
      {
        type: 'pie',
        radius: ['52%', '72%'],
        center: ['50%', '45%'],
        avoidLabelOverlap: true,
        label: { show: true, formatter: '{b}: {c}' },
        data: points.map((point) => ({ name: point.name, value: point.value })),
      },
    ],
  }
}

// ── 地盘首页 widget 布局（§3.5）：目录常量 + 解析/回退/增删改纯函数 ──

export type DashboardWidgetKind = 'summary' | 'myTodos' | 'myTasks' | 'myBugs' | 'myStories' | 'myActivities'
export type DashboardWidgetSize = 'half' | 'full'
export type DashboardLayoutItem = {
  widget: DashboardWidgetKind
  visible: boolean
  order: number
  size: DashboardWidgetSize
}

/** 个人级 setting 键（§3.5：owner=@me，免 setting-manage 码）。 */
export const DASHBOARD_LAYOUT_KEY = 'dashboard.layout'

/** widget 目录（固定 6 种，顺序即缺省布局序；summary 通栏居首）。 */
export const DASHBOARD_WIDGETS: readonly { widget: DashboardWidgetKind; size: DashboardWidgetSize }[] = [
  { widget: 'summary', size: 'full' },
  { widget: 'myTodos', size: 'half' },
  { widget: 'myTasks', size: 'half' },
  { widget: 'myBugs', size: 'half' },
  { widget: 'myStories', size: 'half' },
  { widget: 'myActivities', size: 'full' },
]

/** 缺省布局：全部 6 种按目录序、全部可见。 */
export function defaultDashboardLayout(): DashboardLayoutItem[] {
  return DASHBOARD_WIDGETS.map((entry, index) => ({
    widget: entry.widget,
    visible: true,
    order: index + 1,
    size: entry.size,
  }))
}

function isWidgetKind(value: unknown): value is DashboardWidgetKind {
  return DASHBOARD_WIDGETS.some((entry) => entry.widget === value)
}

/**
 * 布局合法性（§3.5）：6 项、widget 名在目录内且不重复、visible/order/size 类型正确。
 * 解析与「损坏即静默覆写」判定共用本谓词（数组形态；字符串值先由调用方 JSON.parse）。
 */
export function isDashboardLayout(value: unknown): value is DashboardLayoutItem[] {
  if (!Array.isArray(value) || value.length !== DASHBOARD_WIDGETS.length) {
    return false
  }
  const seen = new Set<DashboardWidgetKind>()
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) {
      return false
    }
    const { widget, visible, order, size } = entry as Record<string, unknown>
    if (
      !isWidgetKind(widget) ||
      seen.has(widget) ||
      typeof visible !== 'boolean' ||
      typeof order !== 'number' ||
      !Number.isFinite(order) ||
      (size !== 'half' && size !== 'full')
    ) {
      return false
    }
    seen.add(widget)
  }
  return true
}

/**
 * 布局解析（§3.5）：合法值按 order 升序并重编号；任何损坏（非数组/JSON 解析失败/非法 widget 名/缺项）
 * → 回退缺省布局（调用方负责静默覆写）。
 */
export function parseDashboardLayout(value: unknown): DashboardLayoutItem[] {
  let raw: unknown = value
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      return defaultDashboardLayout()
    }
  }
  if (!isDashboardLayout(raw)) {
    return defaultDashboardLayout()
  }
  return [...raw].sort((a, b) => a.order - b.order).map((item, index) => ({ ...item, order: index + 1 }))
}

/** 拖拽换序（hidden 项保留在序列中，不改变其相对位置；换序后重编 order）。 */
export function reorderDashboardLayout(
  layout: readonly DashboardLayoutItem[],
  active: DashboardWidgetKind,
  over: DashboardWidgetKind,
): DashboardLayoutItem[] {
  const ordered = [...layout].sort((a, b) => a.order - b.order)
  const from = ordered.findIndex((item) => item.widget === active)
  const to = ordered.findIndex((item) => item.widget === over)
  if (from < 0 || to < 0 || from === to) {
    return [...layout]
  }
  const [moved] = ordered.splice(from, 1)
  if (!moved) {
    return [...layout]
  }
  ordered.splice(to, 0, moved)
  return ordered.map((item, index) => ({ ...item, order: index + 1 }))
}

/** 单项改写（显隐/半栏通栏共用）。 */
export function patchDashboardLayout(
  layout: readonly DashboardLayoutItem[],
  widget: DashboardWidgetKind,
  patch: Partial<Pick<DashboardLayoutItem, 'visible' | 'size'>>,
): DashboardLayoutItem[] {
  return layout.map((item) => (item.widget === widget ? { ...item, ...patch } : item))
}

/** 仅可见项、按 order 升序（渲染序）。 */
export function visibleDashboardLayout(layout: readonly DashboardLayoutItem[]): DashboardLayoutItem[] {
  return [...layout].filter((item) => item.visible).sort((a, b) => a.order - b.order)
}

/** 是否与缺省布局等价（用于「恢复默认」按钮的禁用态）。 */
export function isDefaultDashboardLayout(layout: readonly DashboardLayoutItem[]): boolean {
  const ordered = [...layout].sort((a, b) => a.order - b.order)
  return ordered.every((item, index) => {
    const fallback = DASHBOARD_WIDGETS[index]
    return (
      fallback !== undefined &&
      item.widget === fallback.widget &&
      item.size === fallback.size &&
      item.visible &&
      item.order === index + 1
    )
  })
}
