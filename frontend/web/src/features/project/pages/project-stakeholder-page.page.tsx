/** @route /projects/:projectId/stakeholders @title project.title.stakeholders @perm stakeholder-view @hide @activeMenu /projects */
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Button,
  Form,
  HasPerm,
  ListCard,
  Modal,
  PageContainer,
  PageHeader,
  Popconfirm,
  Switch,
  type TableColumnsType,
  Tag,
  Typography,
  useMessage,
} from '@zentao/design-system'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { z } from 'zod'
import { applyServerFields, errorProps, SelectField, TextField } from '../../../shared/form-fields'
import { metaOptions, useDomainMeta } from '../../../shared/meta-options'
import { useMutationFeedback } from '../../../shared/use-mutation-feedback'
import {
  addProjectStakeholderAction,
  fetchAccountOptions,
  fetchProjectStakeholders,
  qk,
  removeProjectStakeholderAction,
  type StakeholderView,
} from '../api/project.api'

/** 添加干系人守卫（对齐旧 rules）：account 必填（SelectField 清空为 null 时同样落必填文案）；type/source 无校验（单选清空值为 null，服务端回落）。 */
export const stakeholderSchema = z.object({
  account: z.string({ error: 'common.message.required' }).min(1, 'common.message.required'),
  type: z.string().nullable(),
  isKey: z.boolean(),
  source: z.string(),
})

export type StakeholderValues = z.input<typeof stakeholderSchema>

/** 项目干系人（T-5 / project §3.8：添加 + 软删；重复 account → 42201 由后端守卫）。 */
export default function ProjectStakeholderPage() {
  const message = useMessage()
  const feedback = useMutationFeedback()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const projectId = Number(useParams().projectId)
  const { control, handleSubmit, setError, reset } = useForm<StakeholderValues>({
    resolver: zodResolver(stakeholderSchema),
    defaultValues: { account: '', type: 'inside', isKey: false, source: '' },
  })
  const [addOpen, setAddOpen] = useState(false)

  const stakeholders = useQuery({
    queryKey: qk.project.stakeholders(projectId),
    queryFn: () => fetchProjectStakeholders(projectId, { limit: 200 }),
  })
  const accounts = useQuery({ queryKey: ['getDict', 'accounts'], queryFn: fetchAccountOptions })
  // type 选项唯一来源（03 §5）：从 meta 取，前端不留清单。
  const stakeholderMeta = useDomainMeta('stakeholder')

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['listProjectStakeholders'] })
  const add = useMutation({
    mutationFn: (values: StakeholderValues) =>
      addProjectStakeholderAction(projectId, {
        account: values.account,
        type: values.type,
        isKey: values.isKey,
        source: values.source === '' ? null : values.source,
      }),
    onSuccess: () => {
      message.success(t('common.message.saved'))
      setAddOpen(false)
      reset()
      invalidate()
    },
    // 重复 account / 账号不存在：后端只回 42201 + 字段码 → 字段级落点（T70），整体提示沿用表单下方段落
    onError: (error) => applyServerFields(error, setError),
  })
  const submit = handleSubmit((values) => add.mutate(values))
  const remove = useMutation({
    mutationFn: (stakeholderId: number) => removeProjectStakeholderAction(projectId, stakeholderId),
    onSuccess: () => {
      message.success(t('common.message.deleted'))
      invalidate()
    },
    onError: feedback.failed,
  })

  const rows = stakeholders.data?.items ?? []
  const used = new Set(rows.map((row) => row.account))

  const columns: TableColumnsType<StakeholderView> = [
    { title: t('stakeholder.field.id'), dataIndex: 'id', width: 70 },
    { title: t('stakeholder.field.account'), dataIndex: 'account', width: 160 },
    {
      title: t('stakeholder.field.type'),
      dataIndex: 'type',
      width: 110,
      render: (type: string) => t(`stakeholder.type.${type}`),
    },
    {
      title: t('stakeholder.field.isKey'),
      dataIndex: 'isKey',
      width: 110,
      render: (isKey: boolean) => (isKey ? <Tag color="red">{t('stakeholder.field.isKey')}</Tag> : '-'),
    },
    { title: t('stakeholder.field.source'), dataIndex: 'source' },
    { title: t('common.field.createdBy'), dataIndex: 'createdBy', width: 110 },
    {
      title: t('common.action.manage'),
      key: 'actions',
      width: 110,
      render: (_: unknown, record: StakeholderView) => (
        <HasPerm perm="stakeholder-manage">
          <Popconfirm title={t('common.confirm.delete')} onConfirm={() => remove.mutate(record.id)}>
            <Button size="small" danger loading={remove.isPending}>
              {t('common.action.delete')}
            </Button>
          </Popconfirm>
        </HasPerm>
      ),
    },
  ]

  return (
    <PageContainer>
      <PageHeader
        title={t('project.title.stakeholders')}
        backTo={`/projects/${projectId}`}
        extra={
          <HasPerm perm="stakeholder-manage">
            <Button type="primary" onClick={() => setAddOpen(true)}>
              {t('stakeholder.action.add')}
            </Button>
          </HasPerm>
        }
      />
      <ListCard
        columns={columns}
        columnSettingKey="project-stakeholders"
        rowKey="id"
        loading={stakeholders.isPending}
        dataSource={rows}
        pagination={false}
      />
      <Modal
        open={addOpen}
        title={t('stakeholder.action.add')}
        onCancel={() => setAddOpen(false)}
        onOk={() => void submit()}
        confirmLoading={add.isPending}
      >
        <Form layout="vertical">
          <SelectField
            control={control}
            name="account"
            label={t('stakeholder.field.account')}
            options={(accounts.data ?? [])
              .filter((account) => !used.has(account.account))
              .map((account) => ({ value: account.account, label: `${account.realName}(${account.account})` }))}
            aria-label="stakeholder-account"
          />
          <SelectField
            control={control}
            name="type"
            label={t('stakeholder.field.type')}
            options={metaOptions(stakeholderMeta.data, 'type', t)}
            aria-label="stakeholder-type"
          />
          <Controller
            control={control}
            name="isKey"
            render={({ field, fieldState }) => (
              <Form.Item label={t('stakeholder.field.isKey')} {...errorProps(fieldState.error, t)}>
                <Switch
                  checked={field.value}
                  aria-label="stakeholder-is-key"
                  onChange={(checked) => field.onChange(checked)}
                />
              </Form.Item>
            )}
          />
          <TextField
            control={control}
            name="source"
            label={t('stakeholder.field.source')}
            maxLength={30}
            aria-label="stakeholder-source"
          />
        </Form>
        {add.error ? (
          <Typography.Paragraph type="danger">{errorText(add.error, t, 'common.message.failed')}</Typography.Paragraph>
        ) : null}
      </Modal>
    </PageContainer>
  )
}
