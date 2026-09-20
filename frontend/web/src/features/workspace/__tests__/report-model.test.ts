import type { BugDistributionReport } from '@zentao/api-client/generated/model/bugDistributionReport'
import type { BurnReport } from '@zentao/api-client/generated/model/burnReport'
import type { CasePassRateReport } from '@zentao/api-client/generated/model/casePassRateReport'
import type { StorySummaryReport } from '@zentao/api-client/generated/model/storySummaryReport'
import type { EChartsCoreOption } from 'echarts/core'
import { describe, expect, test } from 'vitest'
import {
  analysisLines,
  barOption,
  bugDistributionGroups,
  burnOption,
  caseResultPoints,
  donutOption,
  localizedPoints,
  shiftWeek,
  stackedBarOption,
  storySummaryGroups,
  todayIso,
} from '../model'

/** 周报/报表纯逻辑：周导航、analysis 分行、分布映射与图表 option 结构。 */

function seriesOf(option: EChartsCoreOption): Record<string, unknown>[] {
  return (option as { series?: Record<string, unknown>[] }).series ?? []
}

describe('周导航与结论分行（§3.2）', () => {
  test('shiftWeek 前后平移一周（跨月/跨年）', () => {
    expect(shiftWeek('2026-02-05', -1)).toBe('2026-01-29')
    expect(shiftWeek('2026-02-05', 1)).toBe('2026-02-12')
    expect(shiftWeek('2026-12-31', 1)).toBe('2027-01-07')
  })

  test('analysisLines 按 \\n 分行并丢弃空行（前端禁 HTML 注入）', () => {
    expect(analysisLines('进度偏差 -5.0%，成本偏差 3.0%。\n\n  进度落后  \n')).toEqual([
      '进度偏差 -5.0%，成本偏差 3.0%。',
      '进度落后',
    ])
    expect(analysisLines('')).toEqual([])
  })

  test('todayIso 为本地 YYYY-MM-DD', () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('分布分组映射（§5 报表结构）', () => {
  const storyReport: StorySummaryReport = {
    total: 5,
    byStatus: [
      { status: 'active', count: 3 },
      { status: 'closed', count: 2 },
    ],
    byPriority: [{ priority: 2, count: 5 }],
    byStage: [{ stage: 'developing', count: 4 }],
    byType: [{ type: 'story', count: 5 }],
  }
  const bugReport: BugDistributionReport = {
    total: 4,
    bySeverity: [{ severity: 2, count: 4 }],
    byStatus: [{ status: 'active', count: 4 }],
    byResolution: [
      { resolution: 'fixed', count: 3 },
      { resolution: 'unresolved', count: 1 },
    ],
  }
  const passReport: CasePassRateReport = { total: 4, passed: 2, failed: 1, blocked: 0, na: 1, passRate: 66.67 }

  test('storySummaryGroups 四组与文案 key 同源 story 域', () => {
    const groups = storySummaryGroups(storyReport)
    expect(groups.byStatus).toEqual([
      { key: 'active', labelKey: 'story.status.active', value: 3 },
      { key: 'closed', labelKey: 'story.status.closed', value: 2 },
    ])
    expect(groups.byPriority[0]?.labelKey).toBe('common.priority.2')
    expect(groups.byStage[0]?.labelKey).toBe('story.stage.developing')
    expect(groups.byType[0]?.labelKey).toBe('story.type.story')
  })

  test('bugDistributionGroups：resolution 空值桶 unresolved 走 report 域文案', () => {
    const groups = bugDistributionGroups(bugReport)
    expect(groups.bySeverity[0]?.labelKey).toBe('bug.severity.2')
    expect(groups.byStatus[0]?.labelKey).toBe('bug.status.active')
    expect(groups.byResolution.map((point) => point.labelKey)).toEqual([
      'bug.resolution.fixed',
      'report.resolution.unresolved',
    ])
  })

  test('caseResultPoints 四种执行结果（不适用单列）', () => {
    expect(caseResultPoints(passReport)).toEqual([
      { key: 'passed', labelKey: 'report.result.passed', value: 2 },
      { key: 'failed', labelKey: 'report.result.failed', value: 1 },
      { key: 'blocked', labelKey: 'report.result.blocked', value: 0 },
      { key: 'na', labelKey: 'report.result.na', value: 1 },
    ])
  })

  test('localizedPoints 用 translator 展开文案', () => {
    expect(localizedPoints(caseResultPoints(passReport), (key) => `t:${key}`)).toEqual([
      { name: 't:report.result.passed', value: 2 },
      { name: 't:report.result.failed', value: 1 },
      { name: 't:report.result.blocked', value: 0 },
      { name: 't:report.result.na', value: 1 },
    ])
  })
})

describe('图表 option 映射（T-12）', () => {
  test('barOption：y 轴为名称、数值与 points 对齐并显示条尾标签', () => {
    const option = barOption(
      [
        { name: '激活', value: 3 },
        { name: '已关闭', value: 2 },
      ],
      '数量',
    )
    const yAxis = option.yAxis as { data: string[] }
    expect(yAxis.data).toEqual(['激活', '已关闭'])
    const series = seriesOf(option)[0] as { name: string; type: string; data: number[]; label: { show: boolean } }
    expect(series.name).toBe('数量')
    expect(series.type).toBe('bar')
    expect(series.data).toEqual([3, 2])
    expect(series.label.show).toBe(true)
  })

  test('stackedBarOption：多个 series 同 stack 且逐类对齐（T-14 工作量）', () => {
    const option = stackedBarOption(
      ['开发一号', '管理员'],
      [
        { name: '消耗工时', values: [8, 6] },
        { name: '其他', values: [1, 2] },
      ],
    )
    const xAxis = option.xAxis as { data: string[] }
    expect(xAxis.data).toEqual(['开发一号', '管理员'])
    const series = seriesOf(option) as { name: string; stack: string; data: number[] }[]
    expect(series.map((entry) => entry.stack)).toEqual(['total', 'total'])
    expect(series.map((entry) => entry.data)).toEqual([
      [8, 6],
      [1, 2],
    ])
  })

  test('burnOption：ideal 虚线 + remaining 实线，x 轴为日期', () => {
    const report: BurnReport = {
      beginDate: '2026-02-01',
      endDate: '2026-02-03',
      dates: ['2026-02-01', '2026-02-02', '2026-02-03'],
      ideal: [10, 5, 0],
      remaining: [12, 12, 7],
    }
    const option = burnOption(report, { ideal: '理想剩余', remaining: '实际剩余' })
    expect((option.xAxis as { data: string[] }).data).toEqual(report.dates)
    const series = seriesOf(option) as { name: string; lineStyle?: { type: string }; data: number[] }[]
    expect(series.map((entry) => entry.name)).toEqual(['理想剩余', '实际剩余'])
    expect(series[0]?.lineStyle?.type).toBe('dashed')
    expect(series[0]?.data).toEqual([10, 5, 0])
    expect(series[1]?.data).toEqual([12, 12, 7])
  })

  test('donutOption：环形图数据点与传入一致', () => {
    const option = donutOption([
      { name: '通过', value: 2 },
      { name: '失败', value: 1 },
    ])
    const series = seriesOf(option)[0] as { type: string; radius: string[]; data: { name: string; value: number }[] }
    expect(series.type).toBe('pie')
    expect(series.radius).toEqual(['52%', '72%'])
    expect(series.data).toEqual([
      { name: '通过', value: 2 },
      { name: '失败', value: 1 },
    ])
  })
})
