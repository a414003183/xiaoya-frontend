import type { ReactNode } from 'react'
import { narrowPageWidth, pagePadding, spacing } from '../tokens/spacing'

/**
 * 页面骨架 · 唯一页面根容器（06 A3-1 / D-A4）：
 * - variant="wide"（默认）：全宽，列表/详情页；
 * - variant="narrow"：居中 720，表单/设置类窄页——页面禁手写 max-width 的机器替代。
 * 统一 padding 与垂直间距（spacing 阶梯），页面本体只管内容块。
 *
 * 铺满（用户裁决 2026-09-19）：根节点恒撑满内容区高度（内容更高时随内容长高、由外壳滚动），
 * 列表卡吃满剩余高度——空数据页也不再只画一小块（style.css 的 .zt-page 规则配套）。
 */
export function PageContainer({ variant = 'wide', children }: { variant?: 'wide' | 'narrow'; children: ReactNode }) {
  return (
    <div
      className="zt-page"
      style={{
        width: '100%',
        maxWidth: variant === 'narrow' ? narrowPageWidth : undefined,
        marginInline: variant === 'narrow' ? 'auto' : undefined,
        padding: pagePadding,
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.lg,
      }}
    >
      {children}
    </div>
  )
}
