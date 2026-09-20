import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Form, Input, Modal, Select, Switch, Typography, useMessage } from '@zentao/design-system'
import { useTranslation } from 'react-i18next'
import {
  fetchAccountOptions,
  fetchBranches,
  fetchBuilds,
  patchRelease,
  type ReleaseView,
  submitRelease,
} from '../api/product.api'
import { buildsOfBranch } from '../model'

export type ReleaseFormValues = {
  name: string
  branchId: number
  buildId: number | null
  releaseDate: string
  publishedAt: string | null
  isMilestone: boolean
  notifyAccounts: string[]
  description: string | null
}

/** 发布创建/编辑共用表单壳（T-10；buildId 选择器按 branchId 联动）。 */
export function ReleaseFormModal({
  productId,
  release,
  open,
  onClose,
  onSaved,
}: {
  productId: number
  release?: ReleaseView | null
  open: boolean
  onClose: () => void
  onSaved?: (() => void) | undefined
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [form] = Form.useForm<ReleaseFormValues>()
  const editing = release != null

  const branches = useQuery({
    queryKey: ['listBranches', productId, 'form'],
    queryFn: () => fetchBranches(productId, { limit: 200 }),
  })
  const builds = useQuery({
    queryKey: ['listBuilds', productId, 'form'],
    queryFn: () => fetchBuilds(productId, { limit: 200 }),
  })
  const accounts = useQuery({ queryKey: ['getDict', 'accounts'], queryFn: fetchAccountOptions })

  const save = useMutation({
    mutationFn: async (values: ReleaseFormValues) =>
      editing
        ? patchRelease(release.id, { ...values, lockVersion: release.lockVersion })
        : submitRelease(productId, values),
    onSuccess: () => {
      message.success(t('common.message.saved'))
      void queryClient.invalidateQueries({ queryKey: ['listReleases'] })
      void queryClient.invalidateQueries({ queryKey: ['getRelease'] })
      onSaved?.()
      onClose()
    },
  })

  const branchOptions = (branches.data?.items ?? []).map((branch) => ({ value: branch.id, label: branch.name }))

  return (
    <Modal
      open={open}
      forceRender
      title={editing ? t('release.action.edit') : t('release.action.create')}
      onCancel={onClose}
      okText={t('common.action.submit')}
      cancelText={t('common.action.cancel')}
      confirmLoading={save.isPending}
      onOk={() => void form.submit()}
    >
      <Form
        form={form}
        key={release?.id ?? 'create'}
        layout="vertical"
        initialValues={{
          name: release?.name ?? '',
          branchId: release?.branchId ?? 0,
          buildId: release?.buildId ?? null,
          releaseDate: release?.releaseDate ?? '',
          publishedAt: release?.publishedAt ?? null,
          isMilestone: release?.isMilestone ?? false,
          notifyAccounts: release?.notifyAccounts ?? [],
          description: release?.description ?? null,
        }}
        onFinish={(values) => save.mutate(values)}
      >
        <Form.Item
          name="name"
          label={t('release.field.name')}
          rules={[{ required: true, message: t('common.message.required') }]}
        >
          <Input aria-label="release-name" maxLength={90} />
        </Form.Item>
        <Form.Item name="branchId" label={t('release.field.branch')}>
          <Select
            aria-label="release-branch"
            options={[{ value: 0, label: t('common.field.none') }, ...branchOptions]}
          />
        </Form.Item>
        <Form.Item
          noStyle
          shouldUpdate={(prev: ReleaseFormValues, next: ReleaseFormValues) => prev.branchId !== next.branchId}
        >
          {({ getFieldValue }) => (
            <Form.Item name="buildId" label={t('release.field.build')}>
              <Select
                allowClear
                aria-label="release-build"
                options={buildsOfBranch(builds.data?.items ?? [], getFieldValue('branchId') ?? 0).map((build) => ({
                  value: build.id,
                  label: build.name,
                }))}
              />
            </Form.Item>
          )}
        </Form.Item>
        <Form.Item
          name="releaseDate"
          label={t('release.field.releaseDate')}
          rules={[{ required: true, message: t('common.message.required') }]}
        >
          <Input aria-label="release-date" placeholder="YYYY-MM-DD" />
        </Form.Item>
        <Form.Item name="publishedAt" label={t('release.field.publishedAt')}>
          <Input aria-label="release-published-at" placeholder="YYYY-MM-DD" />
        </Form.Item>
        <Form.Item name="isMilestone" label={t('release.field.isMilestone')} valuePropName="checked">
          <Switch aria-label="release-milestone" />
        </Form.Item>
        <Form.Item name="notifyAccounts" label={t('release.field.notify')}>
          <Select
            mode="multiple"
            allowClear
            aria-label="release-notify"
            optionFilterProp="label"
            options={(accounts.data ?? []).map((account) => ({
              value: account.account,
              label: `${account.realName}(${account.account})`,
            }))}
          />
        </Form.Item>
        <Form.Item name="description" label={t('release.field.description')}>
          <Input.TextArea aria-label="release-description" rows={4} />
        </Form.Item>
        {save.error ? (
          <Typography.Paragraph type="danger">{errorText(save.error, t, 'common.message.failed')}</Typography.Paragraph>
        ) : null}
      </Form>
    </Modal>
  )
}

/** 发布创建弹窗（T-10）；release 传入时为编辑同一壳。 */
export function ReleaseCreateModal({
  productId,
  release,
  open,
  onClose,
  onSaved,
}: {
  productId: number
  release?: ReleaseView | null
  open: boolean
  onClose: () => void
  onSaved?: (() => void) | undefined
}) {
  return (
    <ReleaseFormModal
      productId={productId}
      release={release ?? null}
      open={open}
      onClose={onClose}
      {...(onSaved ? { onSaved } : {})}
    />
  )
}
