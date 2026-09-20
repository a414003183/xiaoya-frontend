import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Form, Input, Modal, Typography, useMessage } from '@zentao/design-system'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { DateField, SelectField, TextField } from '../../../shared/form-fields'
import { type AccountView, fetchDepartmentTree, fetchGroups, patchAccount } from '../api/org.api'
import { accountGenderOptions, departmentOptions } from '../model'
import { useRoleOptions } from '../role-options'
import { accountEmailSchema } from './account-create-modal'

/** 编辑账号弹窗（org §6 F 范式：PATCH /accounts；account 登录名只读，带 lockVersion）。 */

export const accountEditSchema = z.object({
  realName: z.string().trim().min(1, 'common.message.required').max(100, 'common.message.required'),
  nickname: z.string().trim().max(60, 'common.message.required'),
  role: z.string().nullable(),
  departmentId: z.number().nullable(),
  email: accountEmailSchema,
  mobile: z.string().trim().max(20, 'common.message.required'),
  phone: z.string().trim().max(20, 'common.message.required'),
  gender: z.string().nullable(),
  birthday: z.string().trim(),
  joinedAt: z.string().trim(),
  groupIds: z.array(z.number()),
})

export type AccountEditValues = z.input<typeof accountEditSchema>

function valuesOf(account: AccountView): AccountEditValues {
  return {
    realName: account.realName ?? '',
    nickname: account.nickname ?? '',
    role: account.role ?? null,
    departmentId: account.departmentId ?? null,
    email: account.email ?? '',
    mobile: account.mobile ?? '',
    phone: account.phone ?? '',
    gender: account.gender ?? null,
    birthday: account.birthday?.slice(0, 10) ?? '',
    joinedAt: account.joinedAt?.slice(0, 10) ?? '',
    groupIds: account.groupIds,
  }
}

/** 请求体（§3.1：null=不修改；空串下发的可选文本列转 null）。 */
export function accountEditBody(values: AccountEditValues): Record<string, unknown> {
  return {
    realName: values.realName,
    nickname: values.nickname === '' ? null : values.nickname,
    role: values.role ?? null,
    departmentId: values.departmentId ?? null,
    email: values.email === '' ? null : values.email,
    mobile: values.mobile === '' ? null : values.mobile,
    phone: values.phone === '' ? null : values.phone,
    gender: values.gender ?? null,
    birthday: values.birthday === '' ? null : values.birthday,
    joinedAt: values.joinedAt === '' ? null : values.joinedAt,
    groupIds: values.groupIds,
  }
}

export function AccountEditModal({
  account,
  open,
  onClose,
}: {
  account: AccountView | null
  open: boolean
  onClose: () => void
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const roleOptions = useRoleOptions()
  const departments = useQuery({ queryKey: ['getDepartmentTree'], queryFn: fetchDepartmentTree })
  const groups = useQuery({ queryKey: ['listGroups'], queryFn: () => fetchGroups() })
  const { control, handleSubmit, reset } = useForm<AccountEditValues>({
    resolver: zodResolver(accountEditSchema),
    defaultValues: valuesOf(
      account ?? {
        id: 0,
        account: '',
        realName: '',
        gender: 'm',
        groupIds: [],
        status: 'active',
        fails: 0,
        createdAt: '',
        lockVersion: 0,
      },
    ),
  })

  // 行切换/保存后 refetch 时重置表单（defaultValues 只在首挂载生效）
  useEffect(() => {
    if (account) {
      reset(valuesOf(account))
    }
  }, [account, reset])

  const save = useMutation({
    mutationFn: (values: AccountEditValues) =>
      patchAccount(account?.id ?? 0, { ...accountEditBody(values), lockVersion: account?.lockVersion }),
    onSuccess: () => {
      message.success(t('common.message.saved'))
      void queryClient.invalidateQueries({ queryKey: ['listAccounts'] })
      void queryClient.invalidateQueries({ queryKey: ['getAccount'] })
      void queryClient.invalidateQueries({ queryKey: ['getMe'] })
      onClose()
    },
  })

  const submit = handleSubmit((values) => save.mutate(values))

  return (
    <Modal
      open={open}
      forceRender
      title={t('org.account.editTitle')}
      onCancel={onClose}
      okText={t('common.action.submit')}
      cancelText={t('common.action.cancel')}
      confirmLoading={save.isPending}
      onOk={() => void submit()}
    >
      <Form layout="vertical">
        <Form.Item label={t('org.account.field.account')}>
          <Input aria-label="account-edit-account" value={account?.account ?? ''} disabled />
        </Form.Item>
        <TextField
          control={control}
          name="realName"
          label={t('org.account.field.realName')}
          maxLength={100}
          aria-label="account-edit-realName"
        />
        <TextField
          control={control}
          name="nickname"
          label={t('org.account.field.nickname')}
          maxLength={60}
          aria-label="account-edit-nickname"
        />
        <SelectField
          control={control}
          name="role"
          label={t('org.account.field.role')}
          options={roleOptions}
          aria-label="account-edit-role"
        />
        <SelectField
          control={control}
          name="departmentId"
          label={t('org.account.field.department')}
          options={departmentOptions(departments.data ?? [])}
          aria-label="account-edit-department"
        />
        <TextField
          control={control}
          name="email"
          label={t('org.account.field.email')}
          maxLength={90}
          aria-label="account-edit-email"
        />
        <TextField
          control={control}
          name="mobile"
          label={t('org.account.field.mobile')}
          maxLength={20}
          aria-label="account-edit-mobile"
        />
        <TextField
          control={control}
          name="phone"
          label={t('org.account.field.phone')}
          maxLength={20}
          aria-label="account-edit-phone"
        />
        <SelectField
          control={control}
          name="gender"
          label={t('org.account.field.gender')}
          options={accountGenderOptions(t)}
          aria-label="account-edit-gender"
        />
        <DateField
          control={control}
          name="birthday"
          label={t('org.account.field.birthday')}
          aria-label="account-edit-birthday"
        />
        <DateField
          control={control}
          name="joinedAt"
          label={t('org.account.field.joinedAt')}
          aria-label="account-edit-joinedAt"
        />
        <SelectField
          control={control}
          name="groupIds"
          label={t('org.account.field.groups')}
          options={(groups.data?.items ?? []).map((group) => ({ value: group.id, label: group.name }))}
          multiple
          aria-label="account-edit-groups"
        />
        {save.error ? (
          <Typography.Paragraph type="danger">{errorText(save.error, t, 'common.message.failed')}</Typography.Paragraph>
        ) : null}
      </Form>
    </Modal>
  )
}
