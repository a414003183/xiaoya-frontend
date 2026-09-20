import { useResolvedThemeMode } from '@zentao/app-shell'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import type { EChartsCoreOption, EChartsType } from 'echarts/core'
import * as echarts from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'
import { useEffect, useRef } from 'react'

/** 域内按需注册（T-12）：只装实际用到的图表/组件 + SVG 渲染器（无 canvas 依赖，jsdom 可降级）。 */
echarts.use([BarChart, LineChart, PieChart, GridComponent, LegendComponent, TooltipComponent, SVGRenderer])

export type ReportChartProps = {
  option: EChartsCoreOption
  /** 图表高度（px）；宽度随容器自适应。 */
  height?: number
  /** 无障碍标签（图表为纯展示，读屏以对象名/标题为准）。 */
  ariaLabel?: string
}

/**
 * ECharts 6 的 React 薄封装（workspace 卡 T-12，仅本域消费；01 §1 无 packages 级图表包）。
 * 保留最小接口：option 变更 setOption(notMerge)、容器尺寸变化 resize、卸载 dispose。
 * 主题随外壳亮暗（06 A2-4）：dark 用 ECharts 内置暗色注册主题 + 背景透明，模式切换即重建。
 * 初始化失败（jsdom / 无布局环境）静默留空，页面其余部分不受影响。
 */
export default function ReportChart({ option, height = 260, ariaLabel }: ReportChartProps) {
  const resolvedMode = useResolvedThemeMode()
  const hostRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<EChartsType | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) {
      return
    }
    let chart: EChartsType | null = null
    try {
      chart = echarts.init(host, resolvedMode === 'dark' ? 'dark' : undefined, {
        renderer: 'svg',
        // 无布局环境（jsdom）clientWidth=0，给缺省宽度避免 ECharts 尺寸告警
        width: host.clientWidth > 0 ? host.clientWidth : 600,
        height,
      })
    } catch {
      return
    }
    chartRef.current = chart
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            chart?.resize()
          })
    observer?.observe(host)
    return () => {
      observer?.disconnect()
      chart?.dispose()
      chartRef.current = null
    }
  }, [height, resolvedMode])

  useEffect(() => {
    // dark 主题自带深色底，页面卡片已有暗色容器——背景透出容器底色保持一致
    chartRef.current?.setOption({ ...option, backgroundColor: 'transparent' }, true)
  }, [option])

  return <div ref={hostRef} role="img" aria-label={ariaLabel} style={{ height }} className="tw:w-full" />
}
