import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Form, Modal, Typography, useMessage } from '@zentao/design-system'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { SelectField, TextAreaField, TextField } from '../../../shared/form-fields'
import { metaOptions } from '../../../shared/meta-options'
import { fetchAccountOptions } from '../../project'
import {
  DOC_QUERY_ROOTS,
  fetchDocCategories,
  fetchDocMeta,
  fetchSpaceDocs,
  qk,
  submitDoc,
  TREE_LIMIT,
} from '../api/doc.api'
import { DOC_ACLS, docExcerpt, metaFieldLabel } from '../model'

/**
 * 文档创建弹窗（T-4 / doc §6 F 范式：meta + POST /doc-spaces/{docSpaceId}/docs）。
 * §3.2：status 固定 draft（正文留到编辑页，发布走 publish 动作）；acl=open 时 editors/readers 由服务端清空。
 */

export const docCreateSchema = z
  .object({
    title: z.string().trim().min(1, 'common.message.required').max(255, 'doc.message.titleTooLong'),
    categoryId: z.number().nullable(),
    parentId: z.number().nullable(),
    keywords: z.string(),
    acl: z.enum(DOC_ACLS),
    editors: z.array(z.string()),
    readers: z.array(z.string()),
    notifyAccounts: z.array(z.string()),
    content: z.string(),
  })
  .refine((values) => values.acl !== 'open' || (values.editors.length === 0 && values.readers.length === 0), {
    path: ['editors'],
    message: 'doc.message.openClearsAcl',
  })

export type DocCreateFormValues = z.input<typeof docCreateSchema>

/** 请求体（§3.2/§5）：open 时白名单恒空；目录/章节 0 = 未分类/顶层。 */
export function docCreateBody(values: DocCreateFormValues): Record<string, unknown> {
  const open = values.acl === 'open'
  return {
    title: values.title,
    type: 'markdown',
    status: 'draft',
    categoryId: values.categoryId ?? 0,
    parentId: values.parentId ?? 0,
    keywords: values.keywords === '' ? null : values.keywords,
    acl: values.acl,
    editors: { accounts: open ? [] : values.editors, groupIds: [] },
    readers: { accounts: open ? [] : values.readers, groupIds: [] },
    notifyAccounts: values.notifyAccounts,
    content: values.content === '' ? null : values.content,
  }
}

export function DocCreateModal({
  docSpaceId,
  defaultCategoryId = 0,
  defaultParentId = 0,
  open,
  onClose,
  onCreated,
}: {
  docSpaceId: number
  defaultCategoryId?: number
  defaultParentId?: number
  open: boolean
  onClose: () => void
  onCreated?: (docId: number) => void
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const meta = useQuery({ queryKey: qk.doc.meta(), queryFn: fetchDocMeta })
  const accounts = useQuery({ queryKey: ['getDict', 'accounts'], queryFn: fetchAccountOptions })
  const categories = useQuery({
    queryKey: qk.doc.categories(docSpaceId),
    queryFn: () => fetchDocCategories(docSpaceId),
    enabled: open,
  })
  const chapters = useQuery({
    queryKey: qk.doc.spaceDocs(docSpaceId, { limit: TREE_LIMIT, scene: 'create' }),
    queryFn: () => fetchSpaceDocs(docSpaceId, { limit: TREE_LIMIT }),
    enabled: open,
  })
  const { control, handleSubmit, watch, reset } = useForm<DocCreateFormValues>({
    resolver: zodResolver(docCreateSchema),
    defaultValues: {
      title: '',
      categoryId: defaultCategoryId === 0 ? null : defaultCategoryId,
      parentId: defaultParentId === 0 ? null : defaultParentId,
      keywords: '',
      acl: 'open',
      editors: [],
      readers: [],
      notifyAccounts: [],
      content: '',
    },
  })
  const acl = watch('acl')

  const create = useMutation({
    mutationFn: (values: DocCreateFormValues) => submitDoc(docSpaceId, docCreateBody(values)),
    onSuccess: (doc) => {
      message.success(t('common.message.created'))
      for (const root of DOC_QUERY_ROOTS) {
        void queryClient.invalidateQueries({ queryKey: [root] })
      }
      reset()
      onClose()
      onCreated?.(doc.id)
    },
  })
  const submit = handleSubmit((values) => create.mutate(values))
  const label = (key: string, fallback: string): string => metaFieldLabel(meta.data?.fields, key, fallback, t)
  const accountOptions = (accounts.data ?? []).map((account) => ({
    value: account.account,
    label: `${account.realName}(${account.account})`,
  }))

  return (
    <Modal
      open={open}
      forceRender
      width={560}
      title={t('doc.action.create')}
      onCancel={onClose}
      okText={t('common.action.submit')}
      cancelText={t('common.action.cancel')}
      confirmLoading={create.isPending}
      onOk={() => void submit()}
    >
      <Form layout="vertical">
        <TextField
          control={control}
          name="title"
          label={label('title', 'doc.field.title')}
          maxLength={255}
          aria-label="doc-create-title"
        />
        <SelectField
          control={control}
          name="categoryId"
          label={label('categoryId', 'doc.field.category')}
          options={[
            { value: 0, label: t('doc.message.uncategorized') },
            ...(categories.data ?? []).map((item) => ({ value: item.id, label: item.name })),
          ]}
          aria-label="doc-create-category"
        />
        <SelectField
          control={control}
          name="parentId"
          label={label('parentId', 'doc.field.parent')}
          options={[
            { value: 0, label: t('doc.message.noParent') },
            ...(chapters.data?.items ?? []).map((item) => ({
              value: item.id,
              label: docExcerpt(item.title, 40),
            })),
          ]}
          aria-label="doc-create-parent"
        />
        <TextField
          control={control}
          name="keywords"
          label={label('keywords', 'doc.field.keywords')}
          maxLength={255}
          aria-label="doc-create-keywords"
        />
        <SelectField
          control={control}
          name="acl"
          label={label('acl', 'doc.field.acl')}
          options={metaOptions(meta.data, 'acl', t)}
          aria-label="doc-create-acl"
        />
        {acl === 'private' ? (
          <>
            <SelectField
              control={control}
              name="editors"
              label={label('editors', 'doc.field.editors')}
              options={accountOptions}
              multiple
              aria-label="doc-create-editors"
            />
            <SelectField
              control={control}
              name="readers"
              label={label('readers', 'doc.field.readers')}
              options={accountOptions}
              multiple
              aria-label="doc-create-readers"
            />
          </>
        ) : null}
        <SelectField
          control={control}
          name="notifyAccounts"
          label={label('notifyAccounts', 'doc.field.notify')}
          options={accountOptions}
          multiple
          aria-label="doc-create-notify"
        />
        <TextAreaField
          control={control}
          name="content"
          label={label('content', 'doc.field.content')}
          aria-label="doc-create-content"
        />
        {create.error ? (
          <Typography.Paragraph type="danger">
            {errorText(create.error, t, 'common.message.failed')}
          </Typography.Paragraph>
        ) : null}
      </Form>
    </Modal>
  )
}
