import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Button, Form, Input, Modal, Space, Typography, useMessage } from '@zentao/design-system'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { SelectField, TextField } from '../../../shared/form-fields'
import { fetchDepartmentTree, submitAccount } from '../api/org.api'
import { departmentOptions, randomPassword } from '../model'
import { useRoleOptions } from '../role-options'

/** 创建账号弹窗（org §6 F 范式：POST /accounts；字段照 §3.1 写侧必填 + 初始权限组）。 */

export const accountPasswordSchema = z
  .string()
  .min(6, 'org.account.message.passwordLength')
  .max(64, 'org.account.message.passwordLength')

export const accountEmailSchema = z
  .string()
  .trim()
  .max(90, 'org.account.message.emailInvalid')
  .refine((value) => value === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value), 'org.account.message.emailInvalid')

export const accountCreateSchema = z.object({
  account: z
    .string()
    .trim()
    .min(3, 'org.account.message.accountPattern')
    .max(30, 'org.account.message.accountPattern')
    .regex(/^[a-zA-Z0-9._-]+$/, 'org.account.message.accountPattern'),
  password: accountPasswordSchema,
  realName: z.string().trim().min(1, 'common.message.required').max(100, 'common.message.required'),
  departmentId: z.number().nullable(),
  email: accountEmailSchema,
  roleIds: z.array(z.number()),
})

export type AccountCreateValues = z.input<typeof accountCreateSchema>

export function accountCreateBody(values: AccountCreateValues): Record<string, unknown> {
  return {
    account: values.account,
    password: values.password,
    realName: values.realName,
    departmentId: values.departmentId ?? null,
    email: values.email === '' ? null : values.email,
    roleIds: values.roleIds,
  }
}

export function AccountCreateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const roleOptions = useRoleOptions()
  const departments = useQuery({ queryKey: ['getDepartmentTree'], queryFn: fetchDepartmentTree })
  const { control, handleSubmit, reset } = useForm<AccountCreateValues>({
    resolver: zodResolver(accountCreateSchema),
    defaultValues: { account: '', password: '', realName: '', departmentId: null, email: '', roleIds: [] },
  })

  const create = useMutation({
    mutationFn: (values: AccountCreateValues) => submitAccount(accountCreateBody(values)),
    onSuccess: () => {
      message.success(t('common.message.saved'))
      reset()
      void queryClient.invalidateQueries({ queryKey: ['listAccounts'] })
      onClose()
    },
  })

  const submit = handleSubmit((values) => create.mutate(values))

  return (
    <Modal
      open={open}
      forceRender
      title={t('org.account.createTitle')}
      onCancel={onClose}
      okText={t('common.action.submit')}
      cancelText={t('common.action.cancel')}
      confirmLoading={create.isPending}
      onOk={() => void submit()}
    >
      <Form layout="vertical">
        <TextField
          control={control}
          name="account"
          label={t('org.account.field.account')}
          maxLength={30}
          aria-label="account-create-account"
        />
        <Controller
          control={control}
          name="password"
          render={({ field }) => (
            <Form.Item label={t('org.account.field.password')} required>
              <Space.Compact className="tw:w-full">
                <Input {...field} value={field.value ?? ''} maxLength={64} aria-label="account-create-password" />
                <Button aria-label="account-create-password-random" onClick={() => field.onChange(randomPassword())}>
                  {t('org.account.action.randomPassword')}
                </Button>
              </Space.Compact>
            </Form.Item>
          )}
        />
        <TextField
          control={control}
          name="realName"
          label={t('org.account.field.realName')}
          maxLength={100}
          aria-label="account-create-realName"
        />
        <SelectField
          control={control}
          name="roleIds"
          label={t('org.account.field.roles')}
          options={roleOptions}
          multiple
          aria-label="account-create-roles"
        />
        <SelectField
          control={control}
          name="departmentId"
          label={t('org.account.field.department')}
          options={departmentOptions(departments.data ?? [])}
          aria-label="account-create-department"
        />
        <TextField
          control={control}
          name="email"
          label={t('org.account.field.email')}
          maxLength={90}
          aria-label="account-create-email"
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
