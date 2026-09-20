import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Button, Form, Modal, Space, Typography, useMessage } from '@zentao/design-system'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { SelectField } from '../../../shared/form-fields'
import {
  type BatchResultItem,
  DOC_QUERY_ROOTS,
  fetchDocCategories,
  fetchDocSpaces,
  fetchSpaceDocs,
  moveDocAction,
  qk,
  submitBatchDocs,
  TREE_LIMIT,
} from '../api/doc.api'
import { docExcerpt } from '../model'

/**
 * 移动弹窗（T-4/T-5 / doc §6：单体 + 批量复用）。
 * 目标库/目录/父章节均须目标库可见（§7 目标库不可见 → 40302 服务端把关，前端只列可见库）；
 * 成环（选自身或后代）由服务端 42201 兜底，选项里先排除被移动文档自身。
 */
export const docMoveSchema = z
  .object({
    docSpaceId: z.number().nullable(),
    categoryId: z.number().nullable(),
    parentId: z.number().nullable(),
  })
  .refine((values) => values.docSpaceId !== null, { path: ['docSpaceId'], message: 'doc.message.targetSpaceRequired' })

export type DocMoveFormValues = z.input<typeof docMoveSchema>

export function DocMoveModal({ docIds, open, onClose }: { docIds: number[]; open: boolean; onClose: () => void }) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { control, handleSubmit, watch } = useForm<DocMoveFormValues>({
    resolver: zodResolver(docMoveSchema),
    defaultValues: { docSpaceId: null, categoryId: null, parentId: null },
  })
  const targetSpaceId = watch('docSpaceId')

  const spaces = useQuery({
    queryKey: qk.doc.spaceList({ limit: TREE_LIMIT, scene: 'move' }),
    queryFn: () => fetchDocSpaces({ limit: TREE_LIMIT }),
    enabled: open,
  })
  const categories = useQuery({
    queryKey: qk.doc.categories(targetSpaceId ?? 0),
    queryFn: () => fetchDocCategories(targetSpaceId ?? 0),
    enabled: open && targetSpaceId !== null,
  })
  const chapters = useQuery({
    queryKey: qk.doc.spaceDocs(targetSpaceId ?? 0, { limit: TREE_LIMIT, scene: 'move' }),
    queryFn: () => fetchSpaceDocs(targetSpaceId ?? 0, { limit: TREE_LIMIT }),
    enabled: open && targetSpaceId !== null,
  })

  const move = useMutation({
    mutationFn: async (values: DocMoveFormValues): Promise<BatchResultItem[]> => {
      const body = { docSpaceId: values.docSpaceId ?? 0, categoryId: values.categoryId, parentId: values.parentId }
      if (docIds.length === 1) {
        await moveDocAction(docIds[0] ?? 0, body)
        return [{ id: docIds[0] ?? 0, ok: true, error: null }]
      }
      return (await submitBatchDocs({ ids: docIds, action: 'move', params: body })).results
    },
    onSuccess: (results) => {
      const failed = results.filter((item) => !item.ok).length
      if (failed === 0) {
        message.success(t('common.message.saved'))
      } else {
        message.warning(t('doc.message.batchPartial', { failed }))
      }
      for (const root of DOC_QUERY_ROOTS) {
        void queryClient.invalidateQueries({ queryKey: [root] })
      }
      onClose()
    },
  })
  const submit = handleSubmit((values) => move.mutate(values))

  return (
    <Modal
      open={open}
      forceRender
      title={t('doc.action.move')}
      onCancel={onClose}
      footer={
        <Space>
          <Button onClick={onClose}>{t('common.action.cancel')}</Button>
          <Button type="primary" loading={move.isPending} onClick={() => void submit()}>
            {t('common.action.submit')}
          </Button>
        </Space>
      }
    >
      <Form layout="vertical">
        <SelectField
          control={control}
          name="docSpaceId"
          label={t('doc.field.docSpace')}
          options={(spaces.data?.items ?? []).map((space) => ({ value: space.id, label: space.name }))}
          aria-label="doc-move-space"
        />
        <SelectField
          control={control}
          name="categoryId"
          label={t('doc.field.category')}
          options={[
            { value: 0, label: t('doc.message.uncategorized') },
            ...(categories.data ?? []).map((item) => ({ value: item.id, label: item.name })),
          ]}
          aria-label="doc-move-category"
        />
        <SelectField
          control={control}
          name="parentId"
          label={t('doc.field.parent')}
          options={[
            { value: 0, label: t('doc.message.noParent') },
            ...(chapters.data?.items ?? [])
              .filter((item) => !docIds.includes(item.id))
              .map((item) => ({ value: item.id, label: docExcerpt(item.title, 40) })),
          ]}
          aria-label="doc-move-parent"
        />
        {move.error ? (
          <Typography.Paragraph type="danger">{errorText(move.error, t, 'common.message.failed')}</Typography.Paragraph>
        ) : null}
      </Form>
    </Modal>
  )
}
