/** @route /my @title workspace.title.dashboard @perm my-view @menu dashboard @order 1 */
import { closestCenter, DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { rectSortingStrategy, SortableContext, useSortable } from '@dnd-kit/sortable'
import {
  Button,
  Card,
  Checkbox,
  EmptyState,
  PageContainer,
  PageLoading,
  Space,
  Typography,
} from '@zentao/design-system'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import DashboardWidget from '../components/dashboard-widget'
import {
  type DashboardLayoutItem,
  type DashboardWidgetKind,
  defaultDashboardLayout,
  isDefaultDashboardLayout,
  patchDashboardLayout,
  reorderDashboardLayout,
  visibleDashboardLayout,
} from '../model'
import { useDashboardLayout } from '../use-dashboard-layout'

/**
 * 地盘首页（T-15 / §3.5：可配置 widget 网格）。
 * 拖拽排序（@dnd-kit）、显隐开关、半栏/通栏切换；布局走个人级 setting（dashboard.layout），
 * 失败或损坏回退缺省。计数卡点击跳对应 /my/* 列表。
 */
export default function MyDashboardPage() {
  const { t } = useTranslation()
  const { layout, isPending, commit } = useDashboardLayout()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const visible = visibleDashboardLayout(layout)
  const ordered = [...layout].sort((a, b) => a.order - b.order)

  if (isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }

  const onDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event
    if (!over || active.id === over.id) {
      return
    }
    commit(
      reorderDashboardLayout(layout, String(active.id) as DashboardWidgetKind, String(over.id) as DashboardWidgetKind),
    )
  }

  return (
    <PageContainer>
      <Card
        size="small"
        title={t('dashboard.layout.title')}
        extra={
          <Button
            size="small"
            disabled={isDefaultDashboardLayout(layout)}
            onClick={() => commit(defaultDashboardLayout())}
          >
            {t('dashboard.layout.reset')}
          </Button>
        }
      >
        <Space wrap size="small">
          {ordered.map((item) => (
            <Checkbox
              key={item.widget}
              checked={item.visible}
              onChange={(event) => commit(patchDashboardLayout(layout, item.widget, { visible: event.target.checked }))}
            >
              {t(`dashboard.widget.${item.widget}`)}
            </Checkbox>
          ))}
          <Typography.Text type="secondary" className="tw:text-xs">
            {t('dashboard.layout.hint')}
          </Typography.Text>
        </Space>
      </Card>
      {visible.length === 0 ? (
        <Card>
          <EmptyState description={t('dashboard.empty')} />
        </Card>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={visible.map((item) => item.widget)} strategy={rectSortingStrategy}>
            <div className="tw:grid tw:grid-cols-1 tw:items-start tw:gap-4 tw:lg:grid-cols-2">
              {visible.map((item) => (
                <SortableWidget
                  key={item.widget}
                  item={item}
                  onToggleSize={() =>
                    commit(
                      patchDashboardLayout(layout, item.widget, {
                        size: item.size === 'full' ? 'half' : 'full',
                      }),
                    )
                  }
                  onHide={() => commit(patchDashboardLayout(layout, item.widget, { visible: false }))}
                >
                  <DashboardWidget widget={item.widget} />
                </SortableWidget>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </PageContainer>
  )
}

/** 单个 widget 卡：拖动把手在卡头、半栏/通栏切换、隐藏；通栏占满两列（lg 起）。 */
function SortableWidget({
  item,
  onToggleSize,
  onHide,
  children,
}: {
  item: DashboardLayoutItem
  onToggleSize: () => void
  onHide: () => void
  children: ReactNode
}) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.widget,
  })
  const style = {
    ...(transform ? { transform: `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)` } : {}),
    ...(transition ? { transition } : {}),
    ...(isDragging ? { zIndex: 10, opacity: 0.7 } : {}),
  }
  return (
    <div ref={setNodeRef} style={style} className={item.size === 'full' ? 'tw:lg:col-span-2' : undefined}>
      <Card
        size="small"
        title={
          <Space size={4}>
            <Button
              ref={setActivatorNodeRef}
              size="small"
              type="text"
              className="tw:cursor-grab"
              aria-label={`dashboard-handle-${item.widget}`}
              {...attributes}
              {...listeners}
            >
              ⠿
            </Button>
            <Typography.Text strong>{t(`dashboard.widget.${item.widget}`)}</Typography.Text>
          </Space>
        }
        extra={
          <Space size="small">
            <Button size="small" aria-label={`dashboard-size-${item.widget}`} onClick={onToggleSize}>
              {item.size === 'full' ? t('dashboard.size.half') : t('dashboard.size.full')}
            </Button>
            <Button size="small" aria-label={`dashboard-hide-${item.widget}`} onClick={onHide}>
              {t('dashboard.action.hide')}
            </Button>
          </Space>
        }
      >
        {children}
      </Card>
    </div>
  )
}
