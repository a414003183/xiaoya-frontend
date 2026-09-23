import { type RefObject, useEffect, useRef, useState } from 'react'

/**
 * 车道卡片窗口化（T72 / AUDIT FE-10）：车道体是定高滚动容器，只渲染视口 ±buffer 的卡片，
 * 前后用垫片保住滚动高度——整板一次下发的大车道不再全量渲染。
 *
 * ponytail: 按「估算行高」切窗（行高不齐时窗口与真实视口会按滚动距离等比漂移，垫片高度同为估算值）——
 * 上限：单车道 ≤30 张一律整列直渲（不开滚动容器、无布局变化）；卡片高度极不齐或单车道 500+ 张时
 * 应换 @tanstack/react-virtual（实测行高 + 精确前缀和）。升级点只有本文件与 BoardLane 的渲染分支。
 */

/** 估算单卡行高（小卡 ≈ 标题 + 元信息 + 间距）。 */
export const CARD_ROW_ESTIMATE_PX = 96
/** 视口上下外扩量（px）：滚动/拖拽自动滚动时的缓冲行。 */
export const CARD_WINDOW_BUFFER_PX = 480
/** 该张数以下整列直渲：小列表全量渲染更快，也不引入滚动容器的布局变化。 */
export const CARD_RENDER_ALL_BELOW = 30
/** 开窗时车道体的固定高度（滚动容器必须定高才能算窗口）。 */
export const LANE_BODY_HEIGHT_PX = 560

export type CardWindow = { start: number; end: number; topPad: number; bottomPad: number }

function windowOf(start: number, end: number, count: number, rowPx: number): CardWindow {
  return { start, end, topPad: start * rowPx, bottomPad: (count - end) * rowPx }
}

/**
 * 行索引窗口（纯函数）：可见区 [scrollTop, scrollTop + viewportPx] 外扩 bufferPx 后按行高折算索引，
 * 端点夹紧到 [0, count]。小列表（≤CARD_RENDER_ALL_BELOW）恒全量。
 */
export function cardWindow(
  count: number,
  scrollTop: number,
  viewportPx: number,
  rowPx = CARD_ROW_ESTIMATE_PX,
  bufferPx = CARD_WINDOW_BUFFER_PX,
): CardWindow {
  if (count <= CARD_RENDER_ALL_BELOW) {
    return windowOf(0, count, count, rowPx)
  }
  const from = Math.max(0, scrollTop - bufferPx)
  const to = scrollTop + viewportPx + bufferPx
  const start = Math.min(Math.max(Math.floor(from / rowPx), 0), count)
  const end = Math.min(Math.max(Math.ceil(to / rowPx), start), count)
  return windowOf(start, end, count, rowPx)
}

/** 把指定行钉进窗口（拖拽中的卡片不许随窗口滚出而卸载，否则拖拽半途断掉）；已在窗口内/索引非法则原样返回。 */
export function pinCardIndex(win: CardWindow, index: number, count: number, rowPx = CARD_ROW_ESTIMATE_PX): CardWindow {
  if (index < 0 || index >= count || (index >= win.start && index < win.end)) {
    return win
  }
  return windowOf(Math.min(win.start, index), Math.max(win.end, index + 1), count, rowPx)
}

/**
 * 车道体滚动窗口：滚动/尺寸变化时重算。jsdom 无布局（scrollTop 恒 0、clientHeight 恒 0），
 * 该形态下窗口退化为「顶部 buffer 行」，测试里对小列表全量渲染无影响。
 */
export function useCardWindow(count: number): {
  containerRef: RefObject<HTMLElement | null>
  window: CardWindow
  windowed: boolean
} {
  const containerRef = useRef<HTMLElement | null>(null)
  const [scroll, setScroll] = useState({ scrollTop: 0, viewport: 0 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) {
      return
    }
    const measure = () => {
      setScroll((prev) => {
        const next = { scrollTop: el.scrollTop, viewport: el.clientHeight }
        return prev.scrollTop === next.scrollTop && prev.viewport === next.viewport ? prev : next
      })
    }
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      el.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
    }
  }, [])

  const windowed = count > CARD_RENDER_ALL_BELOW
  return { containerRef, window: cardWindow(count, scroll.scrollTop, scroll.viewport), windowed }
}
