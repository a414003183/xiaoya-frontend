import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import type { DocView } from '@zentao/api-client/generated/model/docView'
import { Form, Modal, Typography, useMessage } from '@zentao/design-system'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { NumberField, SelectField, TextField } from '../../../shared/form-fields'
import { formatDateTime } from '../../../shared/format'
import { metaOptions } from '../../../shared/meta-options'
import { fetchAccountOptions } from '../../project'
import {
  DOC_QUERY_ROOTS,
  fetchDocCategories,
  fetchDocMeta,
  fetchGroupOptions,
  fetchSpaceDocs,
  patchDoc,
  qk,
  TREE_LIMIT,
} from '../api/doc.api'
import { DOC_ACLS, docExcerpt, metaFieldLabel } from '../model'

/**
 * 文档基本信息编辑（B-DOC-02/05 / doc §6 F 范式：PATCH /docs/{docId}，不含 content）。
 * keywords/categoryId/parentId/acl（含 editors/readers 白名单 JSON：账号+组）/notifyAccounts/sort；
 * acl=open 时白名单由服务端强制清空（§3.2），前端同口径只传空；乐观锁 lockVersion（§5）。
 */

export const docBasicInfoSchema = z
  .object({
    keywords: z.string().max(255, 'doc.message.titleTooLong'),
    categoryId: z.number(),
    parentId: z.number(),
    acl: z.enum(DOC_ACLS),
    editors: z.array(z.string()),
    editorGroups: z.array(z.number()),
    readers: z.array(z.string()),
    readerGroups: z.array(z.number()),
    notifyAccounts: z.array(z.string()),
    sort: z.number().min(0),
  })
  .refine((values) => values.acl !== 'open' || (values.editors.length === 0 && values.readers.length === 0), {
    path: ['editors'],
    message: 'doc.message.openClearsAcl',
  })

export type DocBasicInfoFormValues = z.input<typeof docBasicInfoSchema>

/** 请求体（§5：清空 keywords 传空串；acl=open 时白名单恒空；parentId 选自身/后代由服务端 42201 兜底）。 */
export function docBasicInfoBody(values: DocBasicInfoFormValues): Record<string, unknown> {
  const open = values.acl === 'open'
  return {
    keywords: values.keywords,
    categoryId: values.categoryId,
    parentId: values.parentId,
    acl: values.acl,
    editors: { accounts: open ? [] : values.editors, groupIds: open ? [] : values.editorGroups },
    readers: { accounts: open ? [] : values.readers, groupIds: open ? [] : values.readerGroups },
    notifyAccounts: values.notifyAccounts,
    sort: values.sort,
  }
}

export function DocBasicInfoModal({ doc, open, onClose }: { doc: DocView; open: boolean; onClose: () => void }) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const meta = useQuery({ queryKey: qk.doc.meta(), queryFn: fetchDocMeta })
  const accounts = useQuery({ queryKey: ['getDict', 'accounts'], queryFn: fetchAccountOptions })
  const groups = useQuery({ queryKey: ['listGroups', 'docBasicInfo'], queryFn: fetchGroupOptions, enabled: open })
  const categories = useQuery({
    queryKey: qk.doc.categories(doc.docSpaceId),
    queryFn: () => fetchDocCategories(doc.docSpaceId),
    enabled: open,
  })
  const chapters = useQuery({
    queryKey: qk.doc.spaceDocs(doc.docSpaceId, { limit: TREE_LIMIT, scene: 'basicInfo' }),
    queryFn: () => fetchSpaceDocs(doc.docSpaceId, { limit: TREE_LIMIT }),
    enabled: open,
  })

  const { control, handleSubmit, watch } = useForm<DocBasicInfoFormValues>({
    resolver: zodResolver(docBasicInfoSchema),
    defaultValues: {
      keywords: doc.keywords ?? '',
      categoryId: doc.categoryId,
      parentId: doc.parentId,
      acl: doc.acl,
      editors: doc.editors.accounts ?? [],
      editorGroups: doc.editors.groupIds ?? [],
      readers: doc.readers.accounts ?? [],
      readerGroups: doc.readers.groupIds ?? [],
      notifyAccounts: doc.notifyAccounts,
      sort: doc.sort,
    },
  })
  const acl = watch('acl')

  const save = useMutation({
    mutationFn: (values: DocBasicInfoFormValues) =>
      patchDoc(doc.id, { ...docBasicInfoBody(values), lockVersion: doc.lockVersion }),
    onSuccess: () => {
      message.success(t('common.message.saved'))
      for (const root of DOC_QUERY_ROOTS) {
        void queryClient.invalidateQueries({ queryKey: [root] })
      }
      onClose()
    },
  })
  const submit = handleSubmit((values) => save.mutate(values))
  const label = (key: string, fallback: string): string => metaFieldLabel(meta.data?.fields, key, fallback, t)
  const accountOptions = (accounts.data ?? []).map((account) => ({
    value: account.account,
    label: `${account.realName}(${account.account})`,
  }))
  const groupOptions = (groups.data ?? []).map((group) => ({ value: group.id, label: group.name }))

  // 父章节候选：排除自身与后代（parentId 链上溯到自身即后代；成环 → 42201 服务端兜底，§4）
  const parentOf = new Map((chapters.data?.items ?? []).map((item) => [item.id, item.parentId]))
  const inSubtreeOfSelf = (id: number): boolean => {
    let current: number | undefined = id
    while (current !== undefined && current !== 0) {
      if (current === doc.id) {
        return true
      }
      current = parentOf.get(current)
    }
    return false
  }
  const chapterOptions = (chapters.data?.items ?? [])
    .filter((item) => !inSubtreeOfSelf(item.id))
    .map((item) => ({ value: item.id, label: docExcerpt(item.title, 40) }))

  return (
    <Modal
      open={open}
      forceRender
      width={560}
      title={t('doc.action.editInfo')}
      onCancel={onClose}
      okText={t('common.action.submit')}
      cancelText={t('common.action.cancel')}
      confirmLoading={save.isPending}
      onOk={() => void submit()}
      okButtonProps={{ 'aria-label': 'doc-basic-info-submit' }}
    >
      <Form layout="vertical">
        <TextField
          control={control}
          name="keywords"
          label={label('keywords', 'doc.field.keywords')}
          maxLength={255}
          aria-label="doc-basic-info-keywords"
        />
        <SelectField
          control={control}
          name="categoryId"
          label={label('categoryId', 'doc.field.category')}
          options={[
            { value: 0, label: t('doc.message.uncategorized') },
            ...(categories.data ?? []).map((item) => ({ value: item.id, label: item.name })),
          ]}
          aria-label="doc-basic-info-category"
        />
        <SelectField
          control={control}
          name="parentId"
          label={label('parentId', 'doc.field.parent')}
          options={[{ value: 0, label: t('doc.message.noParent') }, ...chapterOptions]}
          aria-label="doc-basic-info-parent"
        />
        <SelectField
          control={control}
          name="acl"
          label={label('acl', 'doc.field.acl')}
          options={metaOptions(meta.data, 'acl', t)}
          aria-label="doc-basic-info-acl"
        />
        {acl === 'private' ? (
          <>
            <SelectField
              control={control}
              name="editors"
              label={label('editors', 'doc.field.editors')}
              options={accountOptions}
              multiple
              aria-label="doc-basic-info-editors"
            />
            <SelectField
              control={control}
              name="editorGroups"
              label={t('doc.field.editorsGroup')}
              options={groupOptions}
              multiple
              aria-label="doc-basic-info-editor-groups"
            />
            <SelectField
              control={control}
              name="readers"
              label={label('readers', 'doc.field.readers')}
              options={accountOptions}
              multiple
              aria-label="doc-basic-info-readers"
            />
            <SelectField
              control={control}
              name="readerGroups"
              label={t('doc.field.readersGroup')}
              options={groupOptions}
              multiple
              aria-label="doc-basic-info-reader-groups"
            />
          </>
        ) : null}
        <SelectField
          control={control}
          name="notifyAccounts"
          label={label('notifyAccounts', 'doc.field.notify')}
          options={accountOptions}
          multiple
          aria-label="doc-basic-info-notify"
        />
        <NumberField
          control={control}
          name="sort"
          label={label('sort', 'doc.field.sort')}
          min={0}
          aria-label="doc-basic-info-sort"
        />
        {save.error ? (
          <Typography.Paragraph type="danger">{errorText(save.error, t, 'common.message.failed')}</Typography.Paragraph>
        ) : null}
        <Typography.Text type="secondary">
          {t('common.field.updatedAt')}：{formatDateTime(doc.updatedAt) || '-'}
        </Typography.Text>
      </Form>
    </Modal>
  )
}
