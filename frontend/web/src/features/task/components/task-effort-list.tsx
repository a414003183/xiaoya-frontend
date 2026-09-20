import { useQuery } from '@tanstack/react-query'
import { Button, EmptyState, ListCard, type TableColumnsType, Typography } from '@zentao/design-system'
import { useTranslation } from 'react-i18next'
import { type EffortView, fetchTaskEfforts, qk } from '../api/task.api'

/** 任务工时流水（T-11 / task §3b）：详情页工时页签与登记抽屉共用，行可进入编辑抽屉。
 *  详情页传 `columnSettingKey`（列设置齿轮固定在本卡右上角）；登记抽屉不传 = 齿轮可用但不落服务端偏好。 */
export function TaskEffortList({
  taskId,
  onEdit,
  columnSettingKey,
}: {
  taskId: number
  onEdit?: (effort: EffortView) => void
  columnSettingKey?: string | undefined
}) {
  const { t } = useTranslation()
  const efforts = useQuery({
    queryKey: qk.task.efforts(taskId),
    queryFn: () => fetchTaskEfforts(taskId, { limit: 200 }),
  })
  const items = efforts.data?.items ?? []

  const columns: TableColumnsType<EffortView> = [
    { title: t('effort.field.workDate'), dataIndex: 'workDate', width: 120 },
    { title: t('effort.field.account'), dataIndex: 'account', width: 120 },
    { title: t('effort.field.consumed'), dataIndex: 'consumedHours', width: 110 },
    {
      title: t('effort.field.left'),
      dataIndex: 'leftHours',
      width: 110,
      render: (value: number | null | undefined) =>
        value === null || value === undefined ? '-' : <Typography.Text>{value}</Typography.Text>,
    },
    { title: t('effort.field.work'), dataIndex: 'work', render: (value: string | null) => value ?? '-' },
    ...(onEdit
      ? [
          {
            title: t('common.action.manage'),
            key: 'actions',
            width: 90,
            render: (_: unknown, record: EffortView) => (
              <Button size="small" type="link" onClick={() => onEdit(record)}>
                {t('effort.action.edit')}
              </Button>
            ),
          },
        ]
      : []),
  ]

  if (!efforts.isPending && items.length === 0) {
    return <EmptyState description={t('effort.message.empty')} />
  }

  /* exactOptionalPropertyTypes：`columnSettingKey: string | undefined` 不是 `columnSettingKey?: string` 的合法值，按需展开。 */
  const settingProps = columnSettingKey === undefined ? {} : { columnSettingKey }

  return (
    <ListCard
      columns={columns}
      {...settingProps}
      rowKey="id"
      loading={efforts.isPending}
      dataSource={items}
      pagination={false}
    />
  )
}
