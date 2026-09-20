import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import type { DocCategoryNode } from '@zentao/api-client/generated/model/docCategoryNode'
import { Button, Form, Modal, Popconfirm, Space, Tree, Typography, useMessage } from '@zentao/design-system'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { NumberField, SelectField, TextField } from '../../../shared/form-fields'
import {
  DOC_QUERY_ROOTS,
  deleteDocCategoryAction,
  fetchDocCategories,
  patchDocCategory,
  qk,
  submitDocCategory,
} from '../api/doc.api'
import { flattenCategories } from '../model'

/**
 * 库内目录管理弹窗（B-DOC-01 / doc §6 F 范式：categories 四端点）。
 * 树 + 单表单区：默认新增（可选上级）；点节点「编辑」转 PATCH（改名/改父/排序），
 * 「新增子目录」预填上级；删除真实删除，有子节点或被文档引用 → 42203 toast（§3 doc_category）。
 */

export const docCategorySchema = z.object({
  name: z.string().trim().min(1, 'docCategory.message.nameRequired').max(60, 'docSpace.message.nameTooLong'),
  parentId: z.number(),
  sort: z.number().min(0),
})

export type DocCategoryFormValues = z.input<typeof docCategorySchema>

const ROOT = 0

export function DocCategoryManageModal({
  docSpaceId,
  open,
  onClose,
}: {
  docSpaceId: number
  open: boolean
  onClose: () => void
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [editingId, setEditingId] = useState<number | null>(null)
  const { control, handleSubmit, reset } = useForm<DocCategoryFormValues>({
    resolver: zodResolver(docCategorySchema),
    defaultValues: { name: '', parentId: ROOT, sort: 0 },
  })

  const categories = useQuery({
    queryKey: qk.doc.categories(docSpaceId),
    queryFn: () => fetchDocCategories(docSpaceId),
    enabled: open,
  })
  const flat = flattenCategories(categories.data ?? [])
  const editing = editingId === null ? null : (flat.find((item) => item.id === editingId) ?? null)

  const invalidate = () => {
    for (const root of DOC_QUERY_ROOTS) {
      void queryClient.invalidateQueries({ queryKey: [root] })
    }
  }
  const onError = (error: unknown) => message.error(errorText(error, t, 'common.message.failed'))

  const save = useMutation({
    mutationFn: (values: DocCategoryFormValues) =>
      editing
        ? patchDocCategory(docSpaceId, editing.id, {
            name: values.name,
            parentId: values.parentId,
            sort: values.sort,
          })
        : submitDocCategory(docSpaceId, { name: values.name, parentId: values.parentId, sort: values.sort }),
    onSuccess: () => {
      message.success(t('common.message.saved'))
      setEditingId(null)
      reset({ name: '', parentId: ROOT, sort: 0 })
      invalidate()
    },
    onError,
  })
  const remove = useMutation({
    mutationFn: (categoryId: number) => deleteDocCategoryAction(docSpaceId, categoryId),
    onSuccess: () => {
      message.success(t('common.message.deleted'))
      if (editingId !== null) {
        setEditingId(null)
        reset({ name: '', parentId: ROOT, sort: 0 })
      }
      invalidate()
    },
    // 有子节点或被文档引用 → 42203，toast 服务端文案（§3 doc_category）
    onError,
  })
  const submit = handleSubmit((values) => save.mutate(values))

  // 打开时复位表单（上次会话的编辑态不残留）
  useEffect(() => {
    if (open) {
      setEditingId(null)
      reset({ name: '', parentId: ROOT, sort: 0 })
    }
  }, [open, reset])

  type CategoryManageNode = { key: number; title: React.ReactNode; children: CategoryManageNode[] }
  const treeData: CategoryManageNode[] = (categories.data ?? []).map(function toNode(
    node: DocCategoryNode,
  ): CategoryManageNode {
    return {
      key: node.id,
      title: (
        <Space size={4}>
          <Typography.Text>{node.name}</Typography.Text>
          <Typography.Text type="secondary">#{node.id}</Typography.Text>
          <Button
            size="small"
            type="link"
            aria-label={`doc-category-edit-${node.id}`}
            onClick={() => {
              setEditingId(node.id)
              reset({ name: node.name, parentId: node.parentId, sort: node.sort })
            }}
          >
            {t('common.action.edit')}
          </Button>
          <Button
            size="small"
            type="link"
            aria-label={`doc-category-add-child-${node.id}`}
            onClick={() => {
              setEditingId(null)
              reset({ name: '', parentId: node.id, sort: node.children.length })
            }}
          >
            {t('docCategory.action.addChild')}
          </Button>
          <Popconfirm title={t('docCategory.message.deleteHint')} onConfirm={() => remove.mutate(node.id)}>
            <Button size="small" type="link" danger aria-label={`doc-category-delete-${node.id}`}>
              {t('common.action.delete')}
            </Button>
          </Popconfirm>
        </Space>
      ),
      children: node.children.map(toNode),
    }
  })

  return (
    <Modal
      open={open}
      forceRender
      width={560}
      title={t('docCategory.title.manage')}
      onCancel={onClose}
      footer={
        <Space>
          <Button onClick={onClose}>{t('common.action.close')}</Button>
        </Space>
      }
    >
      <Form layout="vertical">
        {editing ? (
          <Typography.Paragraph>
            {t('docCategory.message.editing', { name: editing.name })}
            <Button
              size="small"
              type="link"
              onClick={() => {
                setEditingId(null)
                reset({ name: '', parentId: ROOT, sort: 0 })
              }}
            >
              {t('docCategory.action.newInstead')}
            </Button>
          </Typography.Paragraph>
        ) : null}
        <TextField
          control={control}
          name="name"
          label={t('docCategory.field.name')}
          maxLength={60}
          aria-label="doc-category-name"
        />
        <SelectField
          control={control}
          name="parentId"
          label={t('docCategory.field.parent')}
          options={[
            { value: ROOT, label: t('doc.message.noParent') },
            ...flat
              .filter((item) => item.id !== editingId)
              .map((item) => ({ value: item.id, label: `${'　'.repeat(item.depth)}${item.name}` })),
          ]}
          aria-label="doc-category-parent"
        />
        <NumberField
          control={control}
          name="sort"
          label={t('common.field.sort')}
          min={0}
          aria-label="doc-category-sort"
        />
        <Button type="primary" loading={save.isPending} onClick={() => void submit()} aria-label="doc-category-submit">
          {editing ? t('common.action.submit') : t('docCategory.action.create')}
        </Button>
      </Form>
      <Typography.Title level={5} className="tw:!mt-4 tw:!mb-0">
        {t('doc.field.category')}
      </Typography.Title>
      {flat.length === 0 ? (
        <Typography.Text type="secondary">{t('docCategory.message.empty')}</Typography.Text>
      ) : (
        <Tree selectable={false} defaultExpandAll treeData={treeData} />
      )}
    </Modal>
  )
}
