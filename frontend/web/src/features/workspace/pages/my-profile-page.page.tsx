/** @route /my/profile @title my.profile.title @perm account-view @hide @activeMenu /my */
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Button,
  Card,
  Form,
  HasPerm,
  PageContainer,
  PageLoading,
  spacing,
  Typography,
  useMessage,
} from '@zentao/design-system'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { DateField, SelectField, TextField } from '../../../shared/form-fields'
import { AccountPasswordModal, useRoleLabels } from '../../org'
import { FileUploadField } from '../../platform'
import { type AccountView, fetchMe, fetchMyDepartmentOptions, patchMyAccount } from '../api/workspace.api'

const profileSchema = z.object({
  realName: z.string().trim().min(1, 'common.message.required').max(100, 'common.message.required'),
  nickname: z.string().trim().max(60, 'common.message.required'),
  departmentId: z.number().nullable(),
  email: z
    .string()
    .trim()
    .max(90, 'org.account.message.emailInvalid')
    .refine((value) => value === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value), 'org.account.message.emailInvalid'),
  mobile: z.string().trim().max(20, 'common.message.required'),
  phone: z.string().trim().max(20, 'common.message.required'),
  gender: z.string().nullable(),
  birthday: z.string().trim(),
  joinedAt: z.string().trim(),
})

type ProfileValues = z.input<typeof profileSchema>

function valuesOf(account: AccountView): ProfileValues {
  const dateOf = (value: string | null | undefined): string => (value ? value.slice(0, 10) : '')
  return {
    realName: account.realName ?? '',
    nickname: account.nickname ?? '',
    departmentId: account.departmentId ?? null,
    email: account.email ?? '',
    mobile: account.mobile ?? '',
    phone: account.phone ?? '',
    gender: account.gender ?? null,
    birthday: dateOf(account.birthday),
    joinedAt: dateOf(account.joinedAt),
  }
}

/** 个人资料页（B-WKS-03：PATCH /accounts/{me} 需 account-edit 码否则只读；改密复用 org 弹窗；头像经 FileUploadField）。 */
export default function MyProfilePagePage() {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const me = useQuery({ queryKey: ['getMe'], queryFn: fetchMe })
  const departments = useQuery({ queryKey: ['getDepartmentTree'], queryFn: fetchMyDepartmentOptions })
  const [passwordOpen, setPasswordOpen] = useState(false)

  const account = me.data?.account ?? null
  const canEdit = me.data?.privileges.includes('account-edit') ?? false
  const roleLabelsOf = useRoleLabels()

  const { control, handleSubmit, reset } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: valuesOf(EMPTY_ACCOUNT),
  })

  // /me 到载后回填（保存成功 refetch 也会走这里刷新 lockVersion 基线）
  useEffect(() => {
    if (account) {
      reset(valuesOf(account))
    }
  }, [account, reset])

  const save = useMutation({
    mutationFn: (values: ProfileValues) =>
      patchMyAccount(account?.id ?? 0, {
        realName: values.realName,
        nickname: values.nickname === '' ? null : values.nickname,
        departmentId: values.departmentId ?? null,
        email: values.email === '' ? null : values.email,
        mobile: values.mobile === '' ? null : values.mobile,
        phone: values.phone === '' ? null : values.phone,
        gender: values.gender ?? null,
        birthday: values.birthday === '' ? null : values.birthday,
        joinedAt: values.joinedAt === '' ? null : values.joinedAt,
        lockVersion: account?.lockVersion,
      }),
    onSuccess: () => {
      message.success(t('common.message.saved'))
      void queryClient.invalidateQueries({ queryKey: ['getMe'] })
    },
  })

  const uploadAvatar = useMutation({
    mutationFn: (fileId: number) =>
      patchMyAccount(account?.id ?? 0, { avatarFileId: fileId, lockVersion: account?.lockVersion }),
    onSuccess: () => {
      message.success(t('common.message.saved'))
      void queryClient.invalidateQueries({ queryKey: ['getMe'] })
    },
  })

  if (me.isPending) {
    return (
      <PageContainer variant="narrow">
        <PageLoading />
      </PageContainer>
    )
  }
  if (!account) {
    return (
      <PageContainer variant="narrow">
        <Card>
          <Typography.Text type="secondary">{t('common.message.failed')}</Typography.Text>
        </Card>
      </PageContainer>
    )
  }

  const submit = handleSubmit((values) => save.mutate(values))

  return (
    <PageContainer variant="narrow">
      {/* 表单页无筛选条件：动作条右对齐（改密次右、保存最右） */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: spacing.md }}>
        <Button onClick={() => setPasswordOpen(true)}>{t('org.account.action.password')}</Button>
        {canEdit ? (
          <Button type="primary" loading={save.isPending} onClick={() => void submit()}>
            {t('common.action.save')}
          </Button>
        ) : null}
      </div>
      <Card>
        {!canEdit ? <Typography.Paragraph type="secondary">{t('my.profile.readonlyHint')}</Typography.Paragraph> : null}
        <Form layout="vertical" disabled={!canEdit}>
          <Form.Item label={t('my.profile.avatar')}>
            {/* T02：头像走 platform 上传口，同码 file-upload（FileController POST /files） */}
            <HasPerm perm="file-upload">
              <FileUploadField
                objectType="account"
                objectId={account.id ?? 0}
                onChange={(fileId) => {
                  if (fileId !== undefined) {
                    uploadAvatar.mutate(fileId)
                  }
                }}
              />
            </HasPerm>
            {uploadAvatar.error ? (
              <Typography.Text type="danger">
                {errorText(uploadAvatar.error, t, 'common.message.failed')}
              </Typography.Text>
            ) : null}
          </Form.Item>
          <TextField
            control={control}
            name="realName"
            label={t('org.account.field.realName')}
            maxLength={100}
            aria-label="my-profile-realName"
          />
          <TextField
            control={control}
            name="nickname"
            label={t('org.account.field.nickname')}
            maxLength={60}
            aria-label="my-profile-nickname"
          />
          <TextField
            control={control}
            name="email"
            label={t('org.account.field.email')}
            maxLength={90}
            aria-label="my-profile-email"
          />
          <TextField
            control={control}
            name="mobile"
            label={t('org.account.field.mobile')}
            maxLength={20}
            aria-label="my-profile-mobile"
          />
          <TextField
            control={control}
            name="phone"
            label={t('org.account.field.phone')}
            maxLength={20}
            aria-label="my-profile-phone"
          />
          <DateField
            control={control}
            name="birthday"
            label={t('org.account.field.birthday')}
            aria-label="my-profile-birthday"
          />
          <DateField
            control={control}
            name="joinedAt"
            label={t('org.account.field.joinedAt')}
            aria-label="my-profile-joinedAt"
          />
          {/* 角色 = 权限（T23 统一实体）：本人的角色不可自改（那是提权），只读展示，指派走账号编辑 */}
          <Form.Item label={t('org.account.field.roles')}>
            <Typography.Text aria-label="my-profile-roles">{roleLabelsOf(account?.roleIds)}</Typography.Text>
          </Form.Item>
          <SelectField
            control={control}
            name="departmentId"
            label={t('org.account.field.department')}
            options={departments.data ?? []}
            aria-label="my-profile-department"
          />
          <SelectField
            control={control}
            name="gender"
            label={t('org.account.field.gender')}
            options={[
              { value: 'm', label: t('org.account.gender.m') },
              { value: 'f', label: t('org.account.gender.f') },
            ]}
            aria-label="my-profile-gender"
          />
          {save.error ? (
            <Typography.Paragraph type="danger">
              {errorText(save.error, t, 'common.message.failed')}
            </Typography.Paragraph>
          ) : null}
        </Form>
      </Card>
      <AccountPasswordModal accountId={account.id} open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </PageContainer>
  )
}

const EMPTY_ACCOUNT: AccountView = {
  id: 0,
  account: '',
  realName: '',
  gender: 'm',
  status: 'active',
  roleIds: [],
  fails: 0,
  createdAt: '',
  lockVersion: 0,
}
