/** @route /board-spaces @title board.title.spaceList @perm board-view @menu project @order 4 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Button,
  HasPerm,
  ListCard,
  PageContainer,
  Popconfirm,
  Space,
  StatusTag,
  type TableColumnsType,
  useMessage,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { keywordField, ListFilterForm, selectField } from '../../../shared/list-filter'
import { useMetaOptions } from '../../../shared/meta-options'
import { RowNameLink } from '../../../shared/row-name-link'
import { withParam } from '../../../shared/url'
import { BOARD_QUERY_ROOTS, type BoardSpaceView, deleteBoardSpaceAction, fetchBoardSpaces, qk } from '../api/board.api'
import { BoardSpaceFormModal } from '../forms/board-space-form-modal'
import { boardStatusTone } from '../model'

/** 看板空间列表（T-7 / project §6 L 范式：状态下拉筛选 = filters[status]，空间详情进看板列表）。
 * 筛选值域来自 meta/board_space（与空间创建表单同源，前端不留常量清单）。 */
export default function BoardSpaceListPage() {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [createOpen, setCreateOpen] = useState(false)
  const spaceMeta = useMetaOptions('board_space')

  const status = searchParams.get('status') ?? ''
  const type = searchParams.get('type') ?? ''
  const acl = searchParams.get('acl') ?? ''
  const q = searchParams.get('q') ?? ''
  const page = Number(searchParams.get('page') ?? 1)

  const spaces = useQuery({
    queryKey: qk.boardSpace.list({ status, type, acl, q, page }),
    queryFn: () =>
      fetchBoardSpaces({
        page,
        limit: 20,
        q,
        filters: { ...(status ? { status } : {}), ...(type ? { type } : {}), ...(acl ? { acl } : {}) },
      }),
  })
  const remove = useMutation({
    mutationFn: (boardSpaceId: number) => deleteBoardSpaceAction(boardSpaceId),
    onSuccess: () => {
      message.success(t('common.message.deleted'))
      for (const root of BOARD_QUERY_ROOTS) {
        void queryClient.invalidateQueries({ queryKey: [root] })
      }
    },
    // 空间内仍有看板 → 42203（project §3.3 delete 守卫）
    onError: (error) => message.error(errorText(error, t, 'common.message.failed')),
  })

  const columns: TableColumnsType<BoardSpaceView> = [
    { title: t('board.field.id'), dataIndex: 'id', width: 70 },
    {
      title: t('board.field.name'),
      dataIndex: 'name',
      render: (name: string, record: BoardSpaceView) => (
        <RowNameLink to={`/board-spaces/${record.id}`}>{name}</RowNameLink>
      ),
    },
    {
      title: t('board.field.type'),
      dataIndex: 'type',
      width: 110,
      render: (type: string) => t(`board.spaceType.${type}`),
    },
    {
      title: t('common.field.status'),
      dataIndex: 'status',
      width: 110,
      render: (value: string) => <StatusTag tone={boardStatusTone(value)}>{t(`board.status.${value}`)}</StatusTag>,
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
      render: (_: unknown, record: BoardSpaceView) => (
        <Space size={4}>
          <HasPerm perm="board-space-edit">
            <Popconfirm title={t('board.message.deleteSpaceHint')} onConfirm={() => remove.mutate(record.id)}>
              <Button size="small" type="link" danger aria-label={`board-space-delete-${record.id}`}>
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
      <ListFilterForm
        fields={[
          keywordField(t('board.field.name'), t('common.action.search')),
          selectField('status', t('common.field.status'), spaceMeta.options('status')),
          selectField('type', t('board.field.type'), spaceMeta.options('type')),
          selectField('acl', t('board.field.acl'), spaceMeta.options('acl')),
        ]}
      />
      <ListCard
        columns={columns}
        columnSettingKey="board-spaces"
        actions={
          <HasPerm perm="board-space-create">
            <Button type="primary" onClick={() => setCreateOpen(true)}>
              {t('board.action.createSpace')}
            </Button>
          </HasPerm>
        }
        rowKey="id"
        loading={spaces.isPending}
        dataSource={spaces.data?.items ?? []}
        pagination={{
          current: page,
          pageSize: 20,
          total: spaces.data?.total ?? 0,
          onChange: (next) => setSearchParams(withParam(searchParams, 'page', next)),
        }}
      />
      <BoardSpaceFormModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </PageContainer>
  )
}
