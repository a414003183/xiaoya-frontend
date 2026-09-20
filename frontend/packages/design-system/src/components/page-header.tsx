import { ArrowLeftOutlined } from '@ant-design/icons'
import { Button, Card, Flex, Space, Typography } from 'antd'
import { createContext, type ReactNode, useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { pagePadding, spacing } from '../tokens/spacing'

/** 静态 backTo 的解析注入点（06 A5-2 V-03）：shell 用它把静态路径换成「同前缀最近访问过的完整 URL」，筛选参数才不会丢；未注入时原样返回。 */
const BackTargetContext = createContext<(backTo: string) => string>((backTo) => backTo)

export function BackTargetScope({ resolve, children }: { resolve: (backTo: string) => string; children: ReactNode }) {
  return <BackTargetContext.Provider value={resolve}>{children}</BackTargetContext.Provider>
}

/**
 * 页面骨架 · 页头（06 A3-1 / D-A4）：标题（含副标题槽）+ 返回钮（**固定在标题左侧**，仅上下文页传
 * backTo 才出现）+ 右侧操作区槽。面包屑由 shell 渲染，页面不自绘。
 *
 * 卡片化（UI 三项修订 2026-09-20）：页头也是**一块白底卡**，与筛选区/表格/详情区块同底同圆角——
 * 整页从上到下是若干同规格的块，不再是「页头浮在灰底上、下面才是卡」的混排（对照 ant design pro
 * profile/advanced 的信息卡形态）。`children` 供详情页把首屏信息（头像、关键字段等）续接在卡内。
 *
 * 贴顶通栏（用户要求「返回键那一块和顶栏连在一起」，2026-09-20 四次修订）：传 `backTo` 的上下文页
 * 页头是页面第一条，故用**负外边距吃掉 PageContainer 的 pagePadding**（上 = 贴住页签条下沿、左右 =
 * 通栏铺满内容区），再挂 `zt-page-header-attached` 由 style.css 收掉边框圆角、只留一条底边——
 * 视觉上成为顶栏下沿的一条附件条，而不是浮在灰底上的又一朵卡。负外边距取令牌（pagePadding）算，
 * 页面不改一行。无 `backTo`（侧栏菜单页）保持原卡片形态。
 */
export function PageHeader({
  title,
  subtitle,
  backTo,
  extra,
  children,
}: {
  title: ReactNode
  subtitle?: ReactNode
  /** 返回目标路径；不传则不渲染返回钮（列表页/顶级页无返回）。 */
  backTo?: string
  /** 右侧操作区（主操作按钮等）。 */
  extra?: ReactNode
  /** 卡内续接区：详情页首屏信息（头像、关键字段、描述列表等）。 */
  children?: ReactNode
}) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const resolveBack = useContext(BackTargetContext)
  // 贴顶通栏：负外边距吃掉 pagePadding（上贴页签条、左右通栏）；标记类由 style.css 收边框圆角与底边
  const attached =
    backTo !== undefined
      ? { className: 'zt-page-header-attached', style: { marginTop: -pagePadding, marginInline: -pagePadding } }
      : {}
  return (
    <Card {...attached}>
      <Flex justify="space-between" align="center" gap={spacing.lg} wrap>
        <Flex align="center" gap={spacing.sm} style={{ minWidth: 0 }}>
          {backTo !== undefined && (
            <Button
              type="text"
              aria-label={t('common.action.back')}
              icon={<ArrowLeftOutlined />}
              onClick={() => void navigate(resolveBack(backTo))}
            />
          )}
          <div style={{ minWidth: 0 }}>
            <Typography.Title level={4} style={{ margin: 0 }} ellipsis>
              {title}
            </Typography.Title>
            {subtitle !== undefined && <Typography.Text type="secondary">{subtitle}</Typography.Text>}
          </div>
        </Flex>
        {extra !== undefined && <Space wrap>{extra}</Space>}
      </Flex>
      {children !== undefined && <div style={{ marginTop: spacing.lg }}>{children}</div>}
    </Card>
  )
}
