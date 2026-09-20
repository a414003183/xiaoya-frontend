import { HolderOutlined, PushpinOutlined, SettingOutlined } from '@ant-design/icons'
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import type { TableColumnsType } from 'antd'
import { Alert, Button, Checkbox, Divider, Flex, Segmented, Tooltip, Typography, theme } from 'antd'
import { type CSSProperties, createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { spacing } from '../tokens/spacing'
import { Modal } from './app-modal'

/** 列身份：antd 列 key → dataIndex → 序号（前两者都缺时按位置，保证同一表格内稳定唯一）。 */
type ColumnLike = { key?: React.Key; dataIndex?: unknown; title?: ReactNode }

export type ColumnMeta = { id: string; title: ReactNode }

/** 列设置的一项（与契约 ColumnPrefItem 同形）：顺序即展示顺序，fixed 为固定方向。 */
export type ColumnPrefItem = { key: string; visible: boolean; fixed: 'left' | 'right' | null }

/** 列设置整表（与契约 ColumnPref 同形）。 */
export type ColumnPref = ColumnPrefItem[]

/**
 * 列设置持久化能力（app 注入；01 §3.2 组合根）：design-system 不认识后端，
 * 只认这三个方法——web 侧 `shared/column-pref` 用 react-query + 生成客户端实现，MSW/测试可注入桩。
 * `usePref` 是 hook：列表页每次渲染都会调用（`resource` 为空串表示不持久化，实现应 `enabled: false`）。
 */
export type ColumnPrefStore = {
  usePref(resource: string): { pref: ColumnPref | null | undefined; loading: boolean }
  save(resource: string, pref: ColumnPref): Promise<unknown>
  reset(resource: string): Promise<unknown>
}

/** 缺省 = 无 Provider：弹窗照常可用，保存/重置只关弹窗（不落任何地方）。 */
export const ColumnPrefContext = createContext<ColumnPrefStore | undefined>(undefined)

const NO_STORE: ColumnPrefStore = {
  usePref: () => ({ pref: null, loading: false }),
  save: async () => undefined,
  reset: async () => undefined,
}

export function columnMetas<T>(columns: TableColumnsType<T>): ColumnMeta[] {
  return (columns ?? []).flatMap((column, index) => {
    if (!isFlatColumn(column)) return []
    const title = (column as ColumnLike).title
    if (title === undefined) return []
    return [{ id: columnId(column as ColumnLike, index), title }]
  })
}

/** 可配置列 = 非空对象且非分组列（分组列的配置面在子列，本能力不展开）。 */
function isFlatColumn<T>(column: TableColumnsType<T>[number] | null): boolean {
  return column !== null && typeof column === 'object' && !('children' in column)
}

function columnId(column: ColumnLike, index: number): string {
  if (column.key !== undefined) return String(column.key)
  const dataIndex = column.dataIndex
  if (typeof dataIndex === 'string') return dataIndex
  if (Array.isArray(dataIndex)) return dataIndex.join('.')
  return `column-${index}`
}

/** 只改 fixed：`fixed: null` 必须删键而不是写 null（antd 的 fixed 无 null 取值）。 */
function withFixed<T>(column: TableColumnsType<T>[number], fixed: ColumnPrefItem['fixed']) {
  const next = { ...column } as TableColumnsType<T>[number]
  if (fixed === null) {
    delete (next as { fixed?: unknown }).fixed
  } else {
    ;(next as { fixed?: unknown }).fixed = fixed
  }
  return next
}

/**
 * 应用列设置：按 pref 的顺序重排、按 visible 过滤、按 fixed 设固定位。
 * - pref 缺省/为空 → 原样返回（未设置 = 页面默认列，请求在途时也不闪）；
 * - pref 不认识的列（新上线的列、分组列）原样补在末尾且可见——新列不会因旧偏好而消失；
 * - 至少留一列可见：全隐（偏好与当前列集不匹配）时退回原列集，绝不产出空表。
 */
export function applyColumnPref<T>(columns: TableColumnsType<T>, pref?: ColumnPref | null): TableColumnsType<T> {
  if (pref === undefined || pref === null || pref.length === 0) {
    return columns
  }
  const all = columns ?? []
  const placed = new Set<string>()
  const ordered: { column: TableColumnsType<T>[number]; item: ColumnPrefItem | null }[] = []
  for (const item of pref) {
    all.forEach((column, index) => {
      if (!isFlatColumn(column) || placed.has(item.key) || columnId(column as ColumnLike, index) !== item.key) return
      placed.add(item.key)
      ordered.push({ column: withFixed(column, item.fixed), item })
    })
  }
  all.forEach((column, index) => {
    if (isFlatColumn(column) && placed.has(columnId(column as ColumnLike, index))) return
    ordered.push({ column, item: null })
  })
  const visible = ordered.filter(({ item }) => item === null || item.visible).map(({ column }) => column)
  return visible.length > 0 ? visible : all
}

/** 弹窗草稿：以 pref 顺序为准，pref 不认识的列补在末尾（可见、不固定）。 */
function draftOf(metas: ColumnMeta[], pref: ColumnPref | null | undefined): ColumnPrefItem[] {
  const known = new Set(metas.map((meta) => meta.id))
  const draft = (pref ?? []).filter((item) => known.has(item.key)).map((item) => ({ ...item }))
  const ordered = new Set(draft.map((item) => item.key))
  for (const meta of metas) {
    if (!ordered.has(meta.id)) draft.push({ key: meta.id, visible: true, fixed: null })
  }
  return draft
}

/** 固定方向分段控件的取值：'none' 是 UI 值，落库为 null。 */
type FixChoice = 'left' | 'none' | 'right'

/**
 * 固定方向三态（用户要求「左固定/不固定那块占据的位置太大了，你可以用 icon 代替」）：
 * 一个图钉按方向旋转——左固定 -90°、不固定原样（淡色 = 没插上）、右固定 +90°（antd 图标无 rotate 属性，
 * 旋转走内联 style）。三段不画文字，故控件从 208px 的文字段收成图标段。
 *
 * 无障碍不缩水：i18n 键仍是 Tooltip 标题，同时作为**图标自己的无障碍名**——分段是 label 包 input
 * 的形态，input 的名字取自 label 内容，而图标（role=img）的名字会被算进去，读屏与测试照旧按名定位。
 */
function fixOptions(t: (key: string) => string, mutedColor: string) {
  const option = (value: FixChoice, rotate: number, key: string, color?: string) => ({
    value,
    icon: (
      <PushpinOutlined
        aria-label={t(key)}
        style={{ transform: `rotate(${rotate}deg)`, ...(color === undefined ? {} : { color }) }}
      />
    ),
    tooltip: t(key),
  })
  return [
    option('left', -90, 'common.columnPref.fixLeft'),
    option('none', 0, 'common.columnPref.fixNone', mutedColor),
    option('right', 90, 'common.columnPref.fixRight'),
  ]
}

/**
 * 列设置状态（列表页列设置唯一入口）：`columns` 已是「排序 + 过滤 + 固定」后的结果，
 * `setting` 是要放进工具栏的列设置控件（齿轮 → 模态设置）。
 * `resource` 是持久化身份（ListCard 传 columnSettingKey，一般即页面路径）——列设置存**服务端**（个人偏好），
 * 浏览器本地不留任何副本；缺省（无 Provider 或 resource 为空）时弹窗照常可用但不保存。
 */
export function useColumnSetting<T>(columns: TableColumnsType<T>, resource?: string, label?: string) {
  const { t } = useTranslation()
  const store = useContext(ColumnPrefContext) ?? NO_STORE
  const { pref } = store.usePref(resource ?? '')
  const [open, setOpen] = useState(false)
  const metas = useMemo(() => columnMetas(columns), [columns])
  const applied = useMemo(() => applyColumnPref(columns, pref), [columns, pref])

  return {
    columns: applied,
    setting: (
      <>
        <Tooltip title={label ?? t('common.action.columnSetting')}>
          <Button
            type="text"
            aria-label={label ?? t('common.action.columnSetting')}
            icon={<SettingOutlined />}
            onClick={() => setOpen(true)}
          />
        </Tooltip>
        <ColumnSettingModal
          open={open}
          metas={metas}
          pref={pref ?? null}
          resource={resource}
          store={store}
          onClose={() => setOpen(false)}
        />
      </>
    ),
  }
}

/** 一行的行高与列表一致的小尺寸控件；拖拽时抬高避免被相邻行遮住。 */
function SortableColumnRow({
  item,
  title,
  canHide,
  onVisibleChange,
  onFixedChange,
}: {
  item: ColumnPrefItem
  title: ReactNode
  canHide: boolean
  onVisibleChange: (visible: boolean) => void
  onFixedChange: (fixed: ColumnPrefItem['fixed']) => void
}) {
  const { t } = useTranslation()
  const { token } = theme.useToken()
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.key,
  })
  const style: CSSProperties = {
    ...(transform ? { transform: `translate3d(0, ${Math.round(transform.y)}px, 0)` } : {}),
    transition,
    ...(isDragging ? { position: 'relative', zIndex: 1 } : {}),
  }
  return (
    <Flex ref={setNodeRef} style={style} align="center" gap={spacing.sm} wrap={false}>
      <Button
        ref={setActivatorNodeRef}
        type="text"
        size="small"
        aria-label={t('common.columnPref.dragHint')}
        icon={<HolderOutlined />}
        style={{ cursor: 'grab', flexShrink: 0 }}
        {...attributes}
        {...listeners}
      />
      <Checkbox
        checked={item.visible}
        disabled={!canHide}
        title={t('common.columnPref.visible')}
        onChange={(event) => onVisibleChange(event.target.checked)}
        style={{ flex: '1 1 auto', minWidth: 0 }}
      >
        {title}
      </Checkbox>
      <Segmented
        size="small"
        style={{ flexShrink: 0 }}
        aria-label={typeof title === 'string' ? title : t('common.columnPref.fix')}
        value={item.fixed ?? 'none'}
        options={fixOptions(t, token.colorTextTertiary)}
        onChange={(value) => onFixedChange(value === 'none' ? null : (value as 'left' | 'right'))}
      />
    </Flex>
  )
}

/**
 * 列设置弹窗（列表工具栏齿轮的落点）：拖拽排序 + 显隐勾选 + 左/中/右固定三态，保存整表覆盖服务端偏好。
 * 保存 = 有改动才可点；重置 = 删服务端偏好回页面默认；失败保留弹窗与草稿（不静默丢用户排序）。
 */
export function ColumnSettingModal({
  open,
  metas,
  pref,
  resource,
  store,
  onClose,
}: {
  open: boolean
  metas: ColumnMeta[]
  /** 当前生效的偏好（null = 未设置/无持久化）。 */
  pref: ColumnPref | null
  /** 持久化身份；缺省 = 只关弹窗不保存。 */
  resource?: string | undefined
  store: ColumnPrefStore
  onClose: () => void
}) {
  const { t } = useTranslation()
  const initial = useMemo(() => draftOf(metas, pref), [metas, pref])
  const [draft, setDraft] = useState<ColumnPrefItem[]>(initial)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (open) {
      setDraft(initial)
      setFailed(false)
    }
  }, [open, initial])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const visibleCount = draft.filter((item) => item.visible).length
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(initial), [draft, initial])

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event
    if (over === null || active.id === over.id) return
    setDraft((prev) => {
      const from = prev.findIndex((item) => item.key === active.id)
      const to = prev.findIndex((item) => item.key === over.id)
      return from < 0 || to < 0 ? prev : arrayMove(prev, from, to)
    })
  }

  const run = (action: () => Promise<unknown>): void => {
    setBusy(true)
    setFailed(false)
    action()
      .then(() => onClose())
      .catch(() => setFailed(true))
      .finally(() => setBusy(false))
  }

  const submit = (): void => {
    if (resource === undefined || resource === '') {
      onClose()
      return
    }
    run(() => store.save(resource, draft))
  }

  const reset = (): void => {
    if (resource === undefined || resource === '') {
      onClose()
      return
    }
    run(() => store.reset(resource))
  }

  const update = (key: string, patch: Partial<ColumnPrefItem>): void => {
    setDraft((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)))
  }

  return (
    <Modal
      open={open}
      width={560}
      title={t('common.columnPref.title')}
      onCancel={onClose}
      mask={{ closable: !dirty }}
      footer={
        <Flex justify="space-between" align="center" gap={spacing.sm}>
          <Button onClick={reset} disabled={busy || pref === null}>
            {t('common.columnPref.reset')}
          </Button>
          <Flex gap={spacing.sm}>
            <Button onClick={onClose}>{t('common.action.cancel')}</Button>
            <Button type="primary" disabled={!dirty} loading={busy} onClick={submit}>
              {t('common.columnPref.save')}
            </Button>
          </Flex>
        </Flex>
      }
    >
      <Typography.Text type="secondary">{t('common.columnPref.hint')}</Typography.Text>
      {failed ? (
        <>
          <Alert type="error" showIcon message={t('common.message.failed')} />
          <Divider style={{ marginBlock: spacing.sm }} />
        </>
      ) : null}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={draft.map((item) => item.key)} strategy={verticalListSortingStrategy}>
          <Flex vertical gap={spacing.xs}>
            {draft.map((item) => {
              const meta = metas.find((candidate) => candidate.id === item.key)
              return (
                <SortableColumnRow
                  key={item.key}
                  item={item}
                  title={meta?.title ?? item.key}
                  /* 至少留一列可见（与 applyColumnPref 同一条规则）：最后一列不可取消勾选 */
                  canHide={!item.visible || visibleCount > 1}
                  onVisibleChange={(visible) => update(item.key, { visible })}
                  onFixedChange={(fixed) => update(item.key, { fixed })}
                />
              )
            })}
          </Flex>
        </SortableContext>
      </DndContext>
    </Modal>
  )
}
