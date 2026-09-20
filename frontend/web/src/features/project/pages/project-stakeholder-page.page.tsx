/** @route /projects/:projectId/stakeholders @title project.title.stakeholders @perm stakeholder-view @hide @activeMenu /projects */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Button,
  Form,
  HasPerm,
  Input,
  ListCard,
  Modal,
  PageContainer,
  PageHeader,
  Popconfirm,
  Select,
  Switch,
  type TableColumnsType,
  Tag,
  Typography,
  useMessage,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { metaOptions, useDomainMeta } from '../../../shared/meta-options'
import {
  addProjectStakeholderAction,
  fetchAccountOptions,
  fetchProjectStakeholders,
  qk,
  removeProjectStakeholderAction,
  type StakeholderView,
} from '../api/project.api'

/** 项目干系人（T-5 / project §3.8：添加 + 软删；重复 account → 42201 由后端守卫）。 */
export default function ProjectStakeholderPage() {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const projectId = Number(useParams().projectId)
  const [form] = Form.useForm<{ account: string; type: string; isKey: boolean; source: string }>()
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
    mutationFn: (values: { account: string; type: string; isKey: boolean; source: string }) =>
      addProjectStakeholderAction(projectId, {
        account: values.account,
        type: values.type,
        isKey: values.isKey,
        source: values.source === '' ? null : values.source,
      }),
    onSuccess: () => {
      message.success(t('common.message.saved'))
      setAddOpen(false)
      form.resetFields()
      invalidate()
    },
  })
  const remove = useMutation({
    mutationFn: (stakeholderId: number) => removeProjectStakeholderAction(projectId, stakeholderId),
    onSuccess: () => {
      message.success(t('common.message.deleted'))
      invalidate()
    },
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
        onOk={() => void form.submit()}
        confirmLoading={add.isPending}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ type: 'inside', isKey: false, source: '' }}
          onFinish={(values) => add.mutate(values)}
        >
          <Form.Item
            name="account"
            label={t('stakeholder.field.account')}
            rules={[{ required: true, message: t('common.message.required') }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              aria-label="stakeholder-account"
              options={(accounts.data ?? [])
                .filter((account) => !used.has(account.account))
                .map((account) => ({ value: account.account, label: `${account.realName}(${account.account})` }))}
            />
          </Form.Item>
          <Form.Item name="type" label={t('stakeholder.field.type')}>
            <Select aria-label="stakeholder-type" options={metaOptions(stakeholderMeta.data, 'type', t)} />
          </Form.Item>
          <Form.Item name="isKey" label={t('stakeholder.field.isKey')} valuePropName="checked">
            <Switch aria-label="stakeholder-is-key" />
          </Form.Item>
          <Form.Item name="source" label={t('stakeholder.field.source')}>
            <Input aria-label="stakeholder-source" maxLength={30} />
          </Form.Item>
        </Form>
        {add.error ? (
          <Typography.Paragraph type="danger">{errorText(add.error, t, 'common.message.failed')}</Typography.Paragraph>
        ) : null}
      </Modal>
    </PageContainer>
  )
}
