import { describe, expect, test } from 'vitest'
import { CARD_RENDER_ALL_BELOW, cardWindow, pinCardIndex } from '../use-card-window'

/**
 * 车道卡片窗口化边界（T72 / AUDIT FE-10）：视口 ±buffer 折算行索引 + 前后垫片 + 端点夹紧。
 * 行高/视口单位一律 px；jsdom 形态（scrollTop=0、viewport=0）也在这里钉死。
 */
describe('cardWindow（窗口边界）', () => {
  test('小列表（≤CARD_RENDER_ALL_BELOW）恒全量、零垫片', () => {
    expect(cardWindow(CARD_RENDER_ALL_BELOW, 0, 0)).toEqual({ start: 0, end: 30, topPad: 0, bottomPad: 0 })
    expect(cardWindow(0, 0, 0)).toEqual({ start: 0, end: 0, topPad: 0, bottomPad: 0 })
  })

  test('buffer 生效：视口外的缓冲行也进窗口（去 buffer 即红——只剩严格视口行）', () => {
    // 视口恰 1 行（0..96），buffer 96 → 窗口含缓冲行 [0,2)；buffer=0 时只剩 [0,1)
    expect(cardWindow(100, 0, 96, 96, 96)).toEqual({ start: 0, end: 2, topPad: 0, bottomPad: 98 * 96 })
  })

  test('顶部（jsdom 形态：视口 0）：scrollTop=0 时窗口=顶部 buffer 行', () => {
    expect(cardWindow(50, 0, 0, 96, 480)).toEqual({ start: 0, end: 5, topPad: 0, bottomPad: 45 * 96 })
  })

  test('深滚：窗口落在可见行 ± buffer，垫片按索引折算', () => {
    expect(cardWindow(100, 1000, 200, 100, 200)).toEqual({ start: 8, end: 14, topPad: 800, bottomPad: 8600 })
  })

  test('端点夹紧：scrollTop 近顶不越 0，近底不越 count 且尾垫片归零', () => {
    expect(cardWindow(50, 50, 100, 100, 200)).toEqual({ start: 0, end: 4, topPad: 0, bottomPad: 4600 })
    expect(cardWindow(100, 9800, 200, 100, 200)).toEqual({ start: 96, end: 100, topPad: 9600, bottomPad: 0 })
    // 越界 scrollTop（弹性回弹瞬态）也不产生倒挂窗口
    expect(cardWindow(31, -500, 100, 100, 200).start).toBe(0)
    const pastEnd = cardWindow(31, 99_999, 100, 100, 200)
    expect(pastEnd.end).toBe(31)
    expect(pastEnd.start).toBeLessThanOrEqual(pastEnd.end)
  })
})

describe('pinCardIndex（拖拽中卡片钉窗）', () => {
  const win = { start: 10, end: 20, topPad: 1000, bottomPad: 800 }

  test('索引已在窗口内或非法：原样返回', () => {
    expect(pinCardIndex(win, 15, 100, 100)).toBe(win)
    expect(pinCardIndex(win, -1, 100, 100)).toBe(win)
    expect(pinCardIndex(win, 100, 100, 100)).toBe(win)
  })

  test('索引在窗口下方/上方：窗口外扩含它且垫片重算', () => {
    expect(pinCardIndex(win, 3, 100, 100)).toEqual({ start: 3, end: 20, topPad: 300, bottomPad: 8000 })
    expect(pinCardIndex(win, 25, 100, 100)).toEqual({ start: 10, end: 26, topPad: 1000, bottomPad: 7400 })
  })
})
