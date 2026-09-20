/** @route /products/:productId/categories @title category.title.list @perm product-view @hide @activeMenu /products */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Button,
  Card,
  EmptyState,
  Flex,
  PageContainer,
  PageHeader,
  Popconfirm,
  Space,
  Spin,
  spacing,
  Tree,
  Typography,
  useMessage,
} from '@zentao/design-system'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useSearchParams } from 'react-router'
import { ListFilterForm, selectField } from '../../../shared/list-filter'
import { useMetaOptions } from '../../../shared/meta-options'
import { type CategoryView, fetchCategories, fetchProduct, patchCategory, qk, removeCategory } from '../api/product.api'
import { CategoryNodeModal } from '../components/category-node-modal'
import { buildCategoryTree, type CategoryNode } from '../model'

type TreeRow = { key: number; title: ReactNode; children: TreeRow[] }

/** 分类树管理（product 卡 §6 / T-7：type 下拉切三树、整树加载、拖拽改 parentId/sort、删除级联子级）。
 * 三树类型选项来自 meta/category。 */
export default function ProductCategoriesPage() {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const productId = Number(useParams().productId)
  const [searchParams] = useSearchParams()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<CategoryView | null>(null)
  const [parentId, setParentId] = useState(0)
  const categoryMeta = useMetaOptions('category')

  const type = searchParams.get('type') ?? 'story'
  const product = useQuery({ queryKey: qk.product.detail(productId), queryFn: () => fetchProduct(productId) })
  const categories = useQuery({
    queryKey: qk.category.list(productId, type),
    queryFn: () => fetchCategories(productId, type),
  })
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['listCategories'] })
  const move = useMutation({
    mutationFn: (input: { categoryId: number; parentId: number; sort: number; lockVersion: number }) =>
      patchCategory(input.categoryId, {
        parentId: input.parentId,
        sort: input.sort,
        lockVersion: input.lockVersion,
      }),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (categoryId: number) => removeCategory(categoryId),
    onSuccess: () => {
      message.success(t('common.message.deleted'))
      invalidate()
    },
  })

  const nodes = categories.data?.items ?? []
  const openCreate = (target: CategoryNode | null) => {
    setEditing(null)
    setParentId(target?.id ?? 0)
    setModalOpen(true)
  }
  const openEdit = (target: CategoryView, parent: number) => {
    setEditing(target)
    setParentId(parent)
    setModalOpen(true)
  }
  const rowAction = (node: CategoryNode, parent: number) => (
    <Space size={4}>
      <Button size="small" type="link" onClick={() => openCreate(node)}>
        {t('category.action.addChild')}
      </Button>
      <Button size="small" type="link" onClick={() => openEdit(node, parent)}>
        {t('common.action.edit')}
      </Button>
      <Popconfirm title={t('category.message.deleteCascade')} onConfirm={() => remove.mutate(node.id)}>
        <Button size="small" type="link" danger>
          {t('common.action.delete')}
        </Button>
      </Popconfirm>
    </Space>
  )
  const treeData = buildCategoryTree(nodes).map((node) => toTreeRow(node, rowAction, 0))

  return (
    <PageContainer>
      <PageHeader
        title={`${product.data?.name ?? ''} · ${t('category.title.list')}`}
        backTo={`/products/${productId}`}
      />
      <ListFilterForm fields={[selectField('type', t('common.field.type'), categoryMeta.options('type'))]} />
      {/* 分类树不是表格：列设置/ListCard 用不上，功能按钮照新骨架落在这张卡的卡头（贴内容顶上左） */}
      <Card>
        <Flex align="center" gap={spacing.sm} wrap style={{ marginBottom: spacing.lg }}>
          <Button type="primary" onClick={() => openCreate(null)}>
            {t('category.action.create')}
          </Button>
        </Flex>
        {categories.error ? (
          <Typography.Paragraph type="danger">
            {errorText(categories.error, t, 'common.message.failed')}
          </Typography.Paragraph>
        ) : null}
        {categories.isPending ? (
          <Spin />
        ) : treeData.length === 0 ? (
          <EmptyState description={t('category.message.empty')} />
        ) : (
          <Tree
            blockNode
            draggable
            defaultExpandAll
            treeData={treeData}
            onDrop={(info) => {
              // ponytail: 拖拽只支持「挂到目标节点」「与目标同级」两种落点，不重排整棵子树的 sort（精确排序走编辑弹窗）
              const dragId = Number(info.dragNode.key)
              const dropId = Number(info.node.key)
              const dragNode = nodes.find((node) => node.id === dragId)
              const dropNode = nodes.find((node) => node.id === dropId)
              if (!dragNode || !dropNode) {
                return
              }
              const nextParentId = info.dropToGap ? (dropNode.parentId ?? 0) : dropNode.id
              if (nextParentId === dragId) {
                return
              }
              move.mutate({
                categoryId: dragId,
                parentId: nextParentId,
                sort: info.dropToGap ? dropNode.sort : 0,
                lockVersion: dragNode.lockVersion,
              })
            }}
          />
        )}
      </Card>
      <CategoryNodeModal
        productId={productId}
        type={type}
        category={editing}
        parentId={parentId}
        parentOptions={nodes
          .filter((node) => node.id !== editing?.id)
          .map((node) => ({ value: node.id, label: node.name }))}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={invalidate}
      />
    </PageContainer>
  )
}

function toTreeRow(
  node: CategoryNode,
  action: (node: CategoryNode, parentId: number) => ReactNode,
  parentId: number,
): TreeRow {
  return {
    key: node.id,
    title: (
      <Space>
        <Typography.Text>{node.name}</Typography.Text>
        {action(node, parentId)}
      </Space>
    ),
    children: node.children.map((child) => toTreeRow(child, action, node.id)),
  }
}
