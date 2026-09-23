/** @route /board-spaces/:boardSpaceId @title board.title.spaceDetail @perm board-view @hide @activeMenu /board-spaces */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Button,
  Card,
  Descriptions,
  HasPerm,
  ListCard,
  PageContainer,
  PageHeader,
  PageLoading,
  Popconfirm,
  Space,
  StatusTag,
  type TableColumnsType,
  Typography,
  useMessage,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { useMutationFeedback } from '../../../shared/use-mutation-feedback'
import {
  activateBoardSpaceAction,
  BOARD_QUERY_ROOTS,
  type BoardView,
  closeBoardSpaceAction,
  deleteBoardAction,
  fetchBoardSpace,
  qk,
} from '../api/board.api'
import { BoardFormModal } from '../forms/board-form-modal'
import { BoardSpaceFormModal } from '../forms/board-space-form-modal'
import { boardStatusTone } from '../model'

/** 看板空间详情（T-7 / project §6 D 范式：空间概况 + 空间下看板列表）。 */
export default function BoardSpaceDetailPage() {
  const message = useMessage()
  const feedback = useMutationFeedback()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const boardSpaceId = Number(useParams().boardSpaceId)
  const [editOpen, setEditOpen] = useState(false)
  const [boardCreateOpen, setBoardCreateOpen] = useState(false)

  const space = useQuery({
    queryKey: qk.boardSpace.detail(boardSpaceId),
    queryFn: () => fetchBoardSpace(boardSpaceId),
  })

  const toggleStatus = useMutation({
    mutationFn: (status: string) =>
      status === 'closed' ? activateBoardSpaceAction(boardSpaceId) : closeBoardSpaceAction(boardSpaceId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['getBoardSpace'] }),
    onError: feedback.failed,
  })
  const removeBoard = useMutation({
    mutationFn: (boardId: number) => deleteBoardAction(boardId),
    onSuccess: () => {
      message.success(t('common.message.deleted'))
      for (const root of BOARD_QUERY_ROOTS) {
        void queryClient.invalidateQueries({ queryKey: [root] })
      }
    },
    // 看板内仍有卡片 → 42203（project §3.4 delete 守卫）
    onError: (error) => message.error(errorText(error, t, 'common.message.failed')),
  })

  if (space.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }
  const view = space.data

  const columns: TableColumnsType<BoardView> = [
    { title: t('board.field.id'), dataIndex: 'id', width: 70 },
    {
      title: t('board.field.name'),
      dataIndex: 'name',
      render: (name: string, record: BoardView) => (
        <Typography.Link onClick={() => navigate(`/boards/${record.id}`)}>{name}</Typography.Link>
      ),
    },
    {
      title: t('common.field.status'),
      dataIndex: 'status',
      width: 110,
      render: (status: string) => <StatusTag tone={boardStatusTone(status)}>{t(`board.status.${status}`)}</StatusTag>,
    },
    { title: t('board.field.owner'), dataIndex: 'owner', width: 110 },
    {
      title: t('board.field.acl'),
      dataIndex: 'acl',
      width: 110,
      render: (acl: string) => t(`board.acl.${acl}`),
    },
    { title: t('common.field.sort'), dataIndex: 'sort', width: 80 },
    {
      title: t('common.action.manage'),
      key: 'actions',
      width: 160,
      render: (_: unknown, record: BoardView) => (
        <Space size={4}>
          <Button size="small" type="link" onClick={() => navigate(`/boards/${record.id}`)}>
            {t('common.action.detail')}
          </Button>
          <HasPerm perm="board-edit">
            <Popconfirm title={t('board.message.deleteBoardHint')} onConfirm={() => removeBoard.mutate(record.id)}>
              <Button size="small" type="link" danger aria-label={`board-delete-${record.id}`}>
                {t('common.action.delete')}
              </Button>
            </Popconfirm>
          </HasPerm>
        </Space>
      ),
    },
  ]

  return (
    <PageContainer>
      <PageHeader
        title={
          <Space>
            {view?.name ?? ''}
            <StatusTag tone={boardStatusTone(view?.status ?? 'active')}>
              {t(`board.status.${view?.status ?? 'active'}`)}
            </StatusTag>
          </Space>
        }
        backTo="/board-spaces"
        extra={
          <>
            <HasPerm perm="board-space-edit">
              <Button onClick={() => setEditOpen(true)}>{t('common.action.edit')}</Button>
            </HasPerm>
            <HasPerm perm="board-space-close">
              <Button loading={toggleStatus.isPending} onClick={() => view && toggleStatus.mutate(view.status)}>
                {view?.status === 'closed' ? t('board.action.activateSpace') : t('board.action.closeSpace')}
              </Button>
            </HasPerm>
            <HasPerm perm="board-create">
              <Button type="primary" onClick={() => setBoardCreateOpen(true)}>
                {t('board.action.createBoard')}
              </Button>
            </HasPerm>
          </>
        }
      />
      <Card>
        <Descriptions
          column={3}
          items={[
            { key: 'id', label: t('board.field.id'), children: view?.id ?? '-' },
            {
              key: 'type',
              label: t('board.field.type'),
              children: t(`board.spaceType.${view?.type ?? 'cooperation'}`),
            },
            { key: 'owner', label: t('board.field.owner'), children: view?.owner ?? '-' },
            { key: 'acl', label: t('board.field.acl'), children: t(`board.acl.${view?.acl ?? 'open'}`) },
            { key: 'sort', label: t('common.field.sort'), children: view?.sort ?? 0 },
            { key: 'createdBy', label: t('common.field.createdBy'), children: view?.createdBy ?? '-' },
            {
              key: 'description',
              label: t('common.field.description'),
              children: view?.description ?? t('board.message.noDescription'),
            },
          ]}
        />
      </Card>
      <ListCard
        title={t('board.title.spaceBoards')}
        columns={columns}
        columnSettingKey="board-space-boards"
        rowKey="id"
        pagination={false}
        dataSource={view?.boards ?? []}
      />
      {view ? <BoardSpaceFormModal space={view} open={editOpen} onClose={() => setEditOpen(false)} /> : null}
      <BoardFormModal spaceId={boardSpaceId} open={boardCreateOpen} onClose={() => setBoardCreateOpen(false)} />
    </PageContainer>
  )
}
