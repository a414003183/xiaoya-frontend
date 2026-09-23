import { Card, Flex, Table, type TableColumnsType, type TableProps, Typography } from 'antd'
import { type ReactNode, useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { spacing } from '../tokens/spacing'
import { ColumnPrefContext, useColumnSetting } from './column-setting'

export type ListCardProps<T> = {
  /** 列定义是列表卡的输入：本组件负责「列设置过滤 + 渲染」，页面不再自己拼 Table 的列。 */
  columns: TableColumnsType<T>
  /** 列设置的资源标识（一般传页面路径式的 kebab 串，如 quality-bugs）：**服务端个人偏好的主键**。 */
  columnSettingKey?: string
  /** 列设置面板标题（缺省「列设置」）。 */
  columnSettingLabel?: string
  /** 卡标题（详情页内的子列表用它保留区块名；列表页一般不需要——页签/菜单已表明页面）。 */
  title?: ReactNode
  /** 左区功能按钮：主操作（新建）、批量操作、导出——**与表格同卡**，与筛选区分离。 */
  actions?: ReactNode
  /** 右区：视图切换（列表/看板）等显示态控件；列设置固定最右。 */
  toolbar?: ReactNode
} & Omit<TableProps<T>, 'columns' | 'title'>

/**
 * 页面骨架 · 列表卡（UI 三项修订 2026-09-20 / 二次修订 2026-09-20）：一张卡里承载
 * **功能按钮 + 表格 + 列设置**；**凡是列表都用它**——列设置齿轮因此恒定在同一位置（表卡右上角），
 * 详情页内的子列表（版本/成员/用例/工时…）同样适用，只需给唯一的 `columnSettingKey`。
 * 唯一的例外：整表可编辑的批量页（B 范式：批量新建/批量编辑）不是列表而是表单，不接列设置。
 *
 * **规范**：列表页怎么写、例外怎么标，见 `docs/plan/CONVENTIONS.md` §3.2
 * （T12 收口：本组件是唯一列表载体，页面不得自绘齿轮/分页/工具栏）。
 *
 * 形态对照 Element UI 的成熟管理后台：功能按钮贴表顶左、显示态控件与列设置贴表顶右，
 * 而不是混在筛选区里——筛选区（FilterForm）只放查询条件与查询/重置。列设置全站统一在本组件内，
 * 页面只管给 `columns`（同一份列定义同时供表格与列设置面板使用，不会漂移）。
 *
 * 列设置的持久化（2026-09-20 二次修订）：偏好存**服务端**（`ColumnPrefContext` 注入的能力，
 * 键 = `columnSettingKey`），浏览器本地不留副本；无 Provider 时弹窗照常可用但不保存。
 *
 * 结果计数（用户裁决 2026-09-20 二次修订）：**「共 N 条」属于分页，固定渲染在表格底部与分页同排**
 * （antd `pagination.showTotal`），不再挂到表顶工具栏——表顶只留功能按钮、显示态控件与列设置。
 * 分页被显式关掉（`pagination={false}`）时不渲染计数（字典级小列表，行数一眼可数）。
 * 表体缺省 `size="small"`：管理后台同屏信息密度优先，个别页要宽松可自行覆盖。
 */
export type ListCardHeaderProps = {
  /** 卡标题（详情页内的子列表用它保留区块名；列表页一般不需要——页签/菜单已表明页面）。 */
  title?: ReactNode | undefined
  /** 左区功能按钮：主操作（新建）、批量操作、导出。 */
  actions?: ReactNode | undefined
  /** 右区：视图切换（列表/看板）等显示态控件。 */
  toolbar?: ReactNode | undefined
  /** 右区追加位（ListCard 传列设置齿轮；页面一般不需要）。 */
  extra?: ReactNode | undefined
}

/**
 * 列表卡头标准件（T72 / AUDIT FE-12）：「左功能按钮 / 右工具栏」一行的唯一实现——
 * ListCard 内部用它，非表格页（看板视图/树管理页）的手写卡头同样用它，标准件演进不再漂移。
 */
export function ListCardHeader({ title, actions, toolbar, extra }: ListCardHeaderProps) {
  return (
    <Flex justify="space-between" align="center" gap={spacing.md} wrap style={{ marginBottom: spacing.lg }}>
      <Flex align="center" gap={spacing.sm} wrap>
        {title !== undefined && <Typography.Text strong>{title}</Typography.Text>}
        {actions}
      </Flex>
      {/* 右组必须自己贴右：左组（标题/功能按钮）为空时 antd 的 `.ant-flex:empty{display:none}`
          会把它从布局里摘掉，space-between 只剩一个子项 → 齿轮落到卡头最左（T13 真机发现）。
          auto 外边距不依赖兄弟项存在，左组在不在都贴右。 */}
      <Flex align="center" gap={spacing.sm} wrap style={{ marginInlineStart: 'auto' }}>
        {toolbar}
        {extra}
      </Flex>
    </Flex>
  )
}

export function ListCard<T extends object>({
  columns,
  columnSettingKey,
  columnSettingLabel,
  title,
  actions,
  toolbar,
  size = 'small',
  pagination,
  scroll,
  ...tableProps
}: ListCardProps<T>) {
  const { t } = useTranslation()
  /* 列设置持久化能力（app 注入）：无 Provider = 不保存（弹窗仍可用）；resource 恒取 columnSettingKey。 */
  const store = useContext(ColumnPrefContext)
  const { columns: visibleColumns, setting } = useColumnSetting(
    columns,
    store === undefined ? undefined : columnSettingKey,
    columnSettingLabel,
  )
  /* 计数随分页（缺省补 showTotal；页面显式给了 showTotal 或关掉分页则以页面为准）。
     走「按需展开」而非传 undefined：exactOptionalPropertyTypes 下显式 undefined 不是合法 prop 值。 */
  const paginationProps =
    pagination === undefined
      ? {}
      : {
          pagination:
            pagination === false
              ? (false as const)
              : { showTotal: (total: number) => t('common.message.total', { total }), ...pagination },
        }
  /* 横向滚动缺省开启（T04，用户事项 4）：列宽总和超出容器时由**表体自己**出横向滚动条，
     而不是把页面撑破；固定列（列设置 pin）也依赖 scroll.x 才能算出吸附区。页面显式传 scroll 时以其为准。 */
  const scrollProps = { scroll: { x: 'max-content', ...scroll } as const }
  return (
    <Card>
      {/* 列设置只在给了 columnSettingKey（可持久化的页面身份）时出现：
          无身份的表格（如弹窗内的工时清单）不该出现一个「关掉就没了」的齿轮 */}
      <ListCardHeader
        title={title}
        actions={actions}
        toolbar={toolbar}
        extra={columnSettingKey === undefined ? null : setting}
      />
      <Table<T> size={size} columns={visibleColumns} {...paginationProps} {...scrollProps} {...tableProps} />
    </Card>
  )
}
