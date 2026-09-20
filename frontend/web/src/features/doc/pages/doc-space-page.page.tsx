/** @route /doc/spaces/:docSpaceId @title docSpace.title.detail @perm doc-space-view @hide @activeMenu /doc/spaces */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import type { DocCategoryNode } from '@zentao/api-client/generated/model/docCategoryNode'
import type { DocView } from '@zentao/api-client/generated/model/docView'
import {
  Button,
  Card,
  HasPerm,
  ListCard,
  PageContainer,
  PageHeader,
  PageLoading,
  Popconfirm,
  Space,
  StatusTag,
  type TableColumnsType,
  Tree,
  Typography,
  useMessage,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { formatDateTime } from '../../../shared/format'
import { keywordField, ListFilterForm, selectField } from '../../../shared/list-filter'
import { useMetaOptions } from '../../../shared/meta-options'
import { withParam } from '../../../shared/url'
import {
  DOC_QUERY_ROOTS,
  fetchDocCategories,
  fetchDocSpace,
  fetchSpaceDocs,
  qk,
  submitBatchDocs,
  TREE_LIMIT,
} from '../api/doc.api'
import { DocCategoryManageModal } from '../components/doc-category-manage-modal'
import { DocMoveModal } from '../components/doc-move-modal'
import { DocCreateModal } from '../forms/doc-create-modal'
import {
  buildDocTree,
  type DocNode,
  docCountByCategory,
  docStatusKey,
  docStatusTone,
  docTypeKey,
  flattenCategories,
  showDraftBadge,
} from '../model'

/** 左目录树「全部文档」键（URL 不带 categoryId 即全部；'0' 节点 = 未分类，与 filters[categoryId] 值同形）。 */
const ALL_KEY = 'all'

type CategoryTreeNode = { key: string; title: string; children: CategoryTreeNode[] }

/** 目录树（响应已嵌套 children）→ antd treeData，计数按当前加载的文档集现算。 */
function categoryTreeData(nodes: readonly DocCategoryNode[], counts: Map<number, number>): CategoryTreeNode[] {
  return nodes.map((node) => ({
    key: String(node.id),
    title: `${node.name} (${counts.get(node.id) ?? 0})`,
    children: categoryTreeData(node.children ?? [], counts),
  }))
}

/** 章节树全部行 id（受控展开：默认全展开，用户折叠后以覆盖值优先）。 */
function nodeIds(nodes: readonly DocNode[]): number[] {
  return nodes.flatMap((node) => [node.id, ...nodeIds(node.children)])
}

/** 库内文档（T-4 / doc §6 L 范式：左目录树 + 右章节列表；章节树由 docs 的 parentId 客户端组树）。 */
export default function DocSpacePage() {
  const message = useMessage()
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const docSpaceId = Number(useParams().docSpaceId)
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [collapsed, setCollapsed] = useState<number[] | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const docMeta = useMetaOptions('doc')

  // '' = 全部文档（URL 不带 categoryId）
  const categoryId = searchParams.get('categoryId') ?? ''
  const status = searchParams.get('status') ?? ''
  const type = searchParams.get('type') ?? ''
  const acl = searchParams.get('acl') ?? ''
  const q = searchParams.get('q') ?? ''

  const space = useQuery({ queryKey: qk.doc.space(docSpaceId), queryFn: () => fetchDocSpace(docSpaceId) })
  const categories = useQuery({
    queryKey: qk.doc.categories(docSpaceId),
    queryFn: () => fetchDocCategories(docSpaceId),
  })
  const docs = useQuery({
    queryKey: qk.doc.spaceDocs(docSpaceId, { categoryId, status, type, acl, q }),
    queryFn: () =>
      fetchSpaceDocs(docSpaceId, {
        // 章节树需同页数据：单库取契约 limit 上限，>200 条由目录/搜索收窄（ponytail: 上限即契约上限）
        limit: TREE_LIMIT,
        q,
        filters: {
          ...(categoryId === '' ? {} : { categoryId }),
          ...(status === '' ? {} : { status }),
          ...(type === '' ? {} : { type }),
          ...(acl === '' ? {} : { acl }),
        },
      }),
  })

  const batchRemove = useMutation({
    mutationFn: (ids: number[]) => submitBatchDocs({ ids, action: 'delete' }),
    onSuccess: (result) => {
      const failed = result.results.filter((item) => !item.ok).length
      if (failed === 0) {
        message.success(t('common.message.deleted'))
      } else {
        message.warning(t('doc.message.batchPartial', { failed }))
      }
      setSelectedIds([])
      for (const root of DOC_QUERY_ROOTS) {
        void queryClient.invalidateQueries({ queryKey: [root] })
      }
    },
    onError: (error) => message.error(errorText(error, t, 'common.message.failed')),
  })

  if (space.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }
  // 库不可见 → 40302、不存在 → 40401，原样呈现服务端文案（§7）
  if (space.error) {
    return (
      <PageContainer>
        <PageHeader title={t('docSpace.title.detail')} backTo="/doc/spaces" />
        <Typography.Text type="danger">{errorText(space.error, t, 'common.message.failed')}</Typography.Text>
      </PageContainer>
    )
  }

  const items = docs.data?.items ?? []
  const counts = docCountByCategory(items)
  const treeData: CategoryTreeNode[] = [
    { key: ALL_KEY, title: `${t('doc.message.allDocs')} (${docs.data?.total ?? 0})`, children: [] },
    ...categoryTreeData(categories.data ?? [], counts),
    { key: '0', title: `${t('doc.message.uncategorized')} (${counts.get(0) ?? 0})`, children: [] },
  ]
  const tree = buildDocTree(items)
  const categoryName =
    categoryId === ''
      ? t('doc.message.allDocs')
      : categoryId === '0'
        ? t('doc.message.uncategorized')
        : (flattenCategories(categories.data ?? []).find((item) => String(item.id) === categoryId)?.name ?? '')

  const columns: TableColumnsType<DocNode | DocView> = [
    { title: t('doc.field.id'), dataIndex: 'id', width: 70 },
    {
      title: t('doc.field.title'),
      dataIndex: 'title',
      render: (title: string, record: DocView) => (
        <Space size={4}>
          <Typography.Link onClick={() => navigate(`/docs/${record.id}`)}>{title}</Typography.Link>
          {showDraftBadge(record) ? <StatusTag tone="warning">{t('doc.field.hasDraft')}</StatusTag> : null}
        </Space>
      ),
    },
    {
      title: t('doc.field.status'),
      dataIndex: 'status',
      width: 100,
      render: (value: string) => <StatusTag tone={docStatusTone(value)}>{t(docStatusKey(value))}</StatusTag>,
    },
    {
      title: t('doc.field.type'),
      dataIndex: 'type',
      width: 100,
      render: (value: string) => t(docTypeKey(value)),
    },
    { title: t('doc.field.version'), dataIndex: 'version', width: 90 },
    { title: t('doc.field.views'), dataIndex: 'views', width: 80 },
    { title: t('doc.field.updatedBy'), dataIndex: 'updatedBy', width: 110 },
    {
      title: t('doc.field.updatedAt'),
      dataIndex: 'updatedAt',
      width: 180,
      render: (value: string | null) => formatDateTime(value) || '-',
    },
  ]

  return (
    <PageContainer>
      <PageHeader
        title={
          <Space>
            <Typography.Text strong>{space.data?.name ?? ''}</Typography.Text>
            <Typography.Text type="secondary">
              {t('docSpace.field.docCount')}：{space.data?.docCount ?? 0}
            </Typography.Text>
          </Space>
        }
        backTo="/doc/spaces"
        extra={
          <HasPerm perm="doc-create">
            <Button type="primary" onClick={() => setCreateOpen(true)}>
              {t('doc.action.create')}
            </Button>
          </HasPerm>
        }
      />
      <Card>
        {space.data?.description ? (
          <Typography.Paragraph>{space.data.description}</Typography.Paragraph>
        ) : (
          <Typography.Text type="secondary">{t('docSpace.message.noDescription')}</Typography.Text>
        )}
      </Card>
      <div className="zt-split tw:gap-4">
        <Card
          title={t('doc.field.category')}
          size="small"
          extra={
            <HasPerm perm="doc-edit">
              <Button size="small" onClick={() => setCategoryOpen(true)} aria-label="doc-manage-categories">
                {t('docCategory.title.manage')}
              </Button>
            </HasPerm>
          }
        >
          <Tree
            selectable
            defaultExpandAll
            selectedKeys={[categoryId === '' ? ALL_KEY : categoryId]}
            treeData={treeData}
            onSelect={(keys) => {
              const key = keys[0] === undefined ? ALL_KEY : String(keys[0])
              setSearchParams(withParam(searchParams, 'categoryId', key === ALL_KEY ? undefined : key))
            }}
          />
        </Card>
        <div className="zt-split-main tw:gap-4">
          <ListFilterForm
            fields={[
              keywordField(t('doc.field.keywords'), t('common.action.search')),
              selectField('status', t('common.field.status'), docMeta.options('status')),
              selectField('type', t('doc.field.type'), docMeta.options('type')),
              selectField('acl', t('doc.field.acl'), docMeta.options('acl')),
            ]}
          />
          <ListCard<DocNode | DocView>
            columns={columns}
            columnSettingKey="doc-files"
            actions={
              <>
                <Button
                  disabled={selectedIds.length === 0}
                  onClick={() => setMoveOpen(true)}
                  aria-label="doc-batch-move"
                >
                  {t('doc.action.move')}
                </Button>
                <Popconfirm
                  title={t('doc.message.batchDeleteHint', { count: selectedIds.length })}
                  onConfirm={() => batchRemove.mutate(selectedIds)}
                >
                  <Button disabled={selectedIds.length === 0} danger aria-label="doc-batch-delete">
                    {t('common.action.delete')}
                  </Button>
                </Popconfirm>
              </>
            }
            toolbar={<Typography.Text strong>{categoryName}</Typography.Text>}
            rowKey="id"
            loading={docs.isPending}
            dataSource={tree}
            pagination={false}
            expandable={{
              expandedRowKeys: collapsed ?? nodeIds(tree),
              onExpandedRowsChange: (keys) => setCollapsed(keys.map((key) => Number(key))),
            }}
            rowSelection={{
              selectedRowKeys: selectedIds,
              onChange: (keys) => setSelectedIds(keys.map((key) => Number(key))),
            }}
          />
        </div>
      </div>
      <DocCreateModal
        docSpaceId={docSpaceId}
        defaultCategoryId={categoryId === '' ? 0 : Number(categoryId)}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(docId) => navigate(`/docs/${docId}/edit`)}
      />
      <DocMoveModal docIds={selectedIds} open={moveOpen} onClose={() => setMoveOpen(false)} />
      <DocCategoryManageModal docSpaceId={docSpaceId} open={categoryOpen} onClose={() => setCategoryOpen(false)} />
    </PageContainer>
  )
}
