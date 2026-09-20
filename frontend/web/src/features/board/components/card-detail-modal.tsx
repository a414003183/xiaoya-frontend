import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, errorText } from '@zentao/api-client'
import {
  Button,
  Descriptions,
  HasPerm,
  Modal,
  PageLoading,
  Popconfirm,
  Space,
  StatusTag,
  Typography,
  useMessage,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  archiveCardAction,
  type CardView,
  deleteCardAction,
  fetchCard,
  type LaneView,
  patchCard,
  qk,
  unarchiveCardAction,
} from '../api/board.api'
import { CardFormModal } from '../forms/card-form-modal'
import { cardStatusTone } from '../model'

/**
 * 卡片详情弹窗（T-7 / project §6 D 范式，看板页内打开）：
 * 归档/取消归档走 POST /cards/{cardId}/archive|unarchive（不改 status），状态直改走 PATCH /cards/{cardId} 的 status 白名单。
 */
export function CardDetailModal({
  boardId,
  cardId,
  lanes,
  open,
  onClose,
}: {
  boardId: number
  cardId: number | null
  lanes: readonly LaneView[]
  open: boolean
  onClose: () => void
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)
  const card = useQuery({
    queryKey: qk.card.detail(cardId ?? 0),
    queryFn: () => fetchCard(cardId ?? 0),
    enabled: open && cardId !== null,
  })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['getBoard'] })
    void queryClient.invalidateQueries({ queryKey: ['getCard'] })
  }

  const archive = useMutation({
    mutationFn: (target: CardView) => archiveCardAction(target.id),
    onSuccess: () => {
      message.success(t('common.message.saved'))
      refresh()
      onClose()
    },
  })
  // 取消归档（B-PRJ-13）：与归档入口对称，archived 卡片原位换成取消归档
  const unarchive = useMutation({
    mutationFn: (target: CardView) => unarchiveCardAction(target.id),
    onSuccess: () => {
      message.success(t('common.message.saved'))
      refresh()
    },
  })
  const toggleStatus = useMutation({
    mutationFn: (target: CardView) =>
      patchCard(target.id, { status: target.status === 'done' ? 'doing' : 'done', lockVersion: target.lockVersion }),
    onSuccess: () => {
      message.success(t('common.message.saved'))
      refresh()
    },
  })
  const remove = useMutation({
    mutationFn: (target: CardView) => deleteCardAction(target.id),
    onSuccess: () => {
      message.success(t('common.message.deleted'))
      refresh()
      onClose()
    },
  })

  const view = card.data
  const lane = lanes.find((item) => item.id === view?.laneId)

  return (
    <Modal
      open={open}
      destroyOnHidden
      title={t('board.title.card')}
      onCancel={onClose}
      footer={
        <Space>
          <HasPerm perm="board-card-edit">
            <Button disabled={!view} onClick={() => setEditOpen(true)}>
              {t('common.action.edit')}
            </Button>
            <Button disabled={!view} loading={toggleStatus.isPending} onClick={() => view && toggleStatus.mutate(view)}>
              {view?.status === 'done' ? t('board.action.reopenCard') : t('board.action.finishCard')}
            </Button>
            {view?.archived ? (
              <Button
                aria-label="card-unarchive"
                disabled={!view}
                loading={unarchive.isPending}
                onClick={() => view && unarchive.mutate(view)}
              >
                {t('board.action.unarchiveCard')}
              </Button>
            ) : (
              <Popconfirm
                title={t('board.message.archiveHint')}
                onConfirm={() => view && archive.mutate(view)}
                disabled={!view}
              >
                <Button danger disabled={!view} loading={archive.isPending}>
                  {t('board.action.archiveCard')}
                </Button>
              </Popconfirm>
            )}
            <Popconfirm
              title={t('board.message.deleteCardHint')}
              onConfirm={() => view && remove.mutate(view)}
              disabled={!view}
            >
              <Button danger disabled={!view} loading={remove.isPending} aria-label="card-delete">
                {t('common.action.delete')}
              </Button>
            </Popconfirm>
          </HasPerm>
        </Space>
      }
    >
      {card.isPending ? (
        <PageLoading />
      ) : (
        <Space direction="vertical" className="tw:w-full">
          <Descriptions
            column={1}
            items={[
              { key: 'id', label: t('board.field.id'), children: view?.id ?? '-' },
              {
                key: 'name',
                label: t('board.field.cardName'),
                children: <Typography.Text strong>{view?.name ?? '-'}</Typography.Text>,
              },
              {
                key: 'lane',
                label: t('board.field.lane'),
                children: lane?.name ?? view?.laneId ?? '-',
              },
              {
                key: 'status',
                label: t('common.field.status'),
                children: (
                  <StatusTag tone={cardStatusTone(view?.status ?? 'doing')}>
                    {t(`board.cardStatus.${view?.status ?? 'doing'}`)}
                  </StatusTag>
                ),
              },
              {
                key: 'priority',
                label: t('common.field.priority'),
                children: t(`common.priority.${view?.priority ?? 3}`),
              },
              { key: 'assignee', label: t('common.field.assignee'), children: view?.assignee ?? '-' },
              { key: 'beginDate', label: t('board.field.beginDate'), children: view?.beginDate ?? '-' },
              { key: 'endDate', label: t('board.field.endDate'), children: view?.endDate ?? '-' },
              { key: 'estimate', label: t('board.field.estimate'), children: view?.estimateHours ?? '-' },
              {
                key: 'progress',
                label: t('board.field.progress'),
                children: `${view?.progress ?? 0}%`,
              },
              { key: 'createdBy', label: t('common.field.createdBy'), children: view?.createdBy ?? '-' },
              {
                key: 'description',
                label: t('common.field.description'),
                children: view?.description ?? t('board.message.noDescription'),
              },
            ]}
          />
          {archive.error || toggleStatus.error || unarchive.error || remove.error ? (
            <Typography.Paragraph type="danger">
              {errorText(
                [archive.error, toggleStatus.error, unarchive.error, remove.error].find((e) => e instanceof ApiError) ??
                  archive.error,
                t,
              )}
            </Typography.Paragraph>
          ) : null}
        </Space>
      )}
      {view ? (
        <CardFormModal boardId={boardId} lanes={lanes} card={view} open={editOpen} onClose={() => setEditOpen(false)} />
      ) : null}
    </Modal>
  )
}
