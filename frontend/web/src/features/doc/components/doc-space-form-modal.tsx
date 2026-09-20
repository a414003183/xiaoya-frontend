import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import type { DocSpaceView } from '@zentao/api-client/generated/model/docSpaceView'
import { Button, Checkbox, Form, Modal, Space, Typography, useMessage } from '@zentao/design-system'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { NumberField, SelectField, TextAreaField, TextField } from '../../../shared/form-fields'
import { metaOptions } from '../../../shared/meta-options'
import { fetchProducts } from '../../product'
import { fetchAccountOptions, fetchExecutions, fetchProjects } from '../../project'
import { DOC_QUERY_ROOTS, fetchDocSpaceMeta, fetchGroupOptions, patchDocSpace, submitDocSpace } from '../api/doc.api'
import { DOC_SPACE_ACLS, DOC_SPACE_TYPES, metaFieldLabel } from '../model'

/**
 * 库创建/编辑合一弹窗（T-4 / doc §6 F 范式：meta + POST/PATCH /doc-spaces）。
 * §3.1：type 创建后不可改（编辑面不下发 type）；归属列按 type 取一、余者不下发；
 * acl 取值随 type（custom 无 default、mine 恒 private）；acl=private 需白名单（mine 除外，库主本就唯一可见者）。
 */

/** acl 可选面（§3.1；mine 库恒 private）。 */
function aclOptions(type: string): readonly string[] {
  if (type === 'mine') {
    return ['private']
  }
  return type === 'custom' ? ['open', 'private'] : DOC_SPACE_ACLS
}

export const docSpaceSchema = z
  .object({
    name: z.string().trim().min(1, 'common.message.required').max(60, 'docSpace.message.nameTooLong'),
    type: z.enum(DOC_SPACE_TYPES),
    productId: z.number().nullable(),
    projectId: z.number().nullable(),
    executionId: z.number().nullable(),
    acl: z.enum(DOC_SPACE_ACLS),
    whitelist: z.array(z.string()),
    whitelistGroups: z.array(z.number()),
    description: z.string(),
    docSort: z.enum(['id_asc', 'id_desc']),
    isDefault: z.boolean(),
    sort: z.number().min(0),
  })
  .refine((values) => values.type !== 'product' || values.productId !== null, {
    path: ['productId'],
    message: 'docSpace.message.productRequired',
  })
  .refine((values) => values.type !== 'project' || values.projectId !== null, {
    path: ['projectId'],
    message: 'docSpace.message.projectRequired',
  })
  .refine((values) => values.type !== 'execution' || values.executionId !== null, {
    path: ['executionId'],
    message: 'docSpace.message.executionRequired',
  })
  .refine(
    (values) =>
      values.acl !== 'private' || values.type === 'mine' || values.whitelist.length + values.whitelistGroups.length > 0,
    {
      path: ['whitelist'],
      message: 'docSpace.message.whitelistRequired',
    },
  )

export type DocSpaceFormValues = z.input<typeof docSpaceSchema>

function valuesOf(space: DocSpaceView | null): DocSpaceFormValues {
  return {
    name: space?.name ?? '',
    type: space?.type ?? 'custom',
    productId: space?.productId ? space.productId : null,
    projectId: space?.projectId ? space.projectId : null,
    executionId: space?.executionId ? space.executionId : null,
    acl: space?.acl ?? 'open',
    whitelist: space?.whitelist.accounts ?? [],
    whitelistGroups: space?.whitelist.groupIds ?? [],
    description: space?.description ?? '',
    docSort: space?.docSort ?? 'id_asc',
    isDefault: space?.isDefault ?? false,
    sort: space?.sort ?? 0,
  }
}

/** 请求体（§3.1；编辑面不下发 type，归属列只留 type 对应的一列，acl=private 才带白名单）。 */
function bodyOf(values: DocSpaceFormValues, editing: boolean): Record<string, unknown> {
  const acl = aclOptions(values.type).includes(values.acl) ? values.acl : (aclOptions(values.type)[0] ?? 'open')
  return {
    name: values.name,
    ...(editing ? {} : { type: values.type }),
    ...(values.type === 'product' ? { productId: values.productId } : {}),
    ...(values.type === 'project' ? { projectId: values.projectId } : {}),
    ...(values.type === 'execution' ? { executionId: values.executionId } : {}),
    acl,
    // 白名单 = 账号 + 组（§3.1 whitelist JSON；open 落库恒空）
    whitelist: {
      accounts: acl === 'private' ? values.whitelist : [],
      groupIds: acl === 'private' ? values.whitelistGroups : [],
    },
    description: values.description === '' ? null : values.description,
    docSort: values.docSort,
    isDefault: values.isDefault,
    sort: values.sort,
  }
}

export function DocSpaceFormModal({
  space,
  open,
  onClose,
}: {
  space?: DocSpaceView | null
  open: boolean
  onClose: () => void
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const editing = space != null
  const meta = useQuery({ queryKey: ['meta', 'docSpace'], queryFn: fetchDocSpaceMeta })
  const accounts = useQuery({ queryKey: ['getDict', 'accounts'], queryFn: fetchAccountOptions })
  const groups = useQuery({ queryKey: ['listGroups', 'docSpaceForm'], queryFn: fetchGroupOptions })
  const current = space ?? null
  const { control, handleSubmit, watch } = useForm<DocSpaceFormValues>({
    resolver: zodResolver(docSpaceSchema),
    defaultValues: valuesOf(current),
  })
  const type = watch('type')
  const acl = watch('acl')

  const products = useQuery({
    queryKey: ['listProducts', 'docSpaceForm'],
    queryFn: () => fetchProducts({ limit: 200 }),
    enabled: type === 'product',
  })
  const projects = useQuery({
    queryKey: ['listProjects', 'docSpaceForm'],
    queryFn: () => fetchProjects({ limit: 200 }),
    enabled: type === 'project',
  })
  const executions = useQuery({
    queryKey: ['listExecutions', 'docSpaceForm'],
    queryFn: () => fetchExecutions({ limit: 200 }),
    enabled: type === 'execution',
  })

  const save = useMutation({
    mutationFn: (values: DocSpaceFormValues) =>
      editing
        ? patchDocSpace(space.id, { ...bodyOf(values, true), lockVersion: space.lockVersion })
        : submitDocSpace(bodyOf(values, false)),
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

  return (
    <Modal
      open={open}
      forceRender
      width={560}
      title={editing ? t('docSpace.action.edit') : t('docSpace.action.create')}
      onCancel={onClose}
      footer={
        <Space>
          <Button onClick={onClose}>{t('common.action.cancel')}</Button>
          <Button type="primary" loading={save.isPending} onClick={() => void submit()}>
            {t('common.action.submit')}
          </Button>
        </Space>
      }
    >
      <Form layout="vertical">
        <TextField
          control={control}
          name="name"
          label={label('name', 'docSpace.field.name')}
          maxLength={60}
          aria-label="doc-space-name"
        />
        <SelectField
          control={control}
          name="type"
          label={label('type', 'docSpace.field.type')}
          options={metaOptions(meta.data, 'type', t)}
          aria-label="doc-space-type"
        />
        {type === 'product' ? (
          <SelectField
            control={control}
            name="productId"
            label={label('productId', 'docSpace.field.product')}
            options={(products.data?.items ?? []).map((item) => ({ value: item.id, label: item.name }))}
            aria-label="doc-space-product"
          />
        ) : null}
        {type === 'project' ? (
          <SelectField
            control={control}
            name="projectId"
            label={label('projectId', 'docSpace.field.project')}
            options={(projects.data?.items ?? []).map((item) => ({ value: item.id, label: item.name }))}
            aria-label="doc-space-project"
          />
        ) : null}
        {type === 'execution' ? (
          <SelectField
            control={control}
            name="executionId"
            label={label('executionId', 'docSpace.field.execution')}
            options={(executions.data?.items ?? []).map((item) => ({ value: item.id, label: item.name }))}
            aria-label="doc-space-execution"
          />
        ) : null}
        <SelectField
          control={control}
          name="acl"
          label={label('acl', 'docSpace.field.acl')}
          options={metaOptions(meta.data, 'acl', t).filter((option) => aclOptions(type).includes(option.value))}
          aria-label="doc-space-acl"
        />
        {acl === 'private' && type !== 'mine' ? (
          <>
            <SelectField
              control={control}
              name="whitelist"
              label={label('whitelist', 'docSpace.field.whitelist')}
              options={accountOptions}
              multiple
              aria-label="doc-space-whitelist"
            />
            <SelectField
              control={control}
              name="whitelistGroups"
              label={t('docSpace.field.whitelistGroup')}
              options={groupOptions}
              multiple
              aria-label="doc-space-whitelist-groups"
            />
          </>
        ) : null}
        <SelectField
          control={control}
          name="docSort"
          label={label('docSort', 'docSpace.field.docSort')}
          options={metaOptions(meta.data, 'docSort', t)}
          aria-label="doc-space-doc-sort"
        />
        <TextAreaField
          control={control}
          name="description"
          label={label('description', 'docSpace.field.description')}
          aria-label="doc-space-description"
        />
        <NumberField
          control={control}
          name="sort"
          label={label('sort', 'docSpace.field.sort')}
          min={0}
          aria-label="doc-space-sort"
        />
        <Controller
          control={control}
          name="isDefault"
          render={({ field }) => (
            <Form.Item label={label('isDefault', 'docSpace.field.isDefault')}>
              <Checkbox
                aria-label="doc-space-default"
                checked={field.value}
                onChange={(event) => field.onChange(event.target.checked)}
              >
                {t('docSpace.message.defaultHint')}
              </Checkbox>
            </Form.Item>
          )}
        />
        {save.error ? (
          <Typography.Paragraph type="danger">{errorText(save.error, t, 'common.message.failed')}</Typography.Paragraph>
        ) : null}
      </Form>
    </Modal>
  )
}
