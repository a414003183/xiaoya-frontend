import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Button, Flex, Form, Input, Modal, Space, Typography, useMessage } from '@zentao/design-system'
import { SUPPORTED_LANGUAGES } from '@zentao/i18n'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { NumberField } from '../../../shared/form-fields'
import { patchRole, type RoleView, submitRole } from '../api/org.api'
import { ROLES_QUERY_KEY } from '../role-options'

/**
 * 角色字典创建/编辑合一弹窗（org §6 F 范式：POST/PATCH /roles；编辑带 lockVersion）。
 * code 创建后不可改（账号 role 列存它）→ 编辑态只读；名称按语言逐项填写，至少一项非空。
 */

/** 角色码规则（org §3.4：小写字母开头，字母/数字/连字符，2–16 位；创建后不可改）。 */
const roleCodePattern = /^[a-z][a-z0-9-]*$/

export const roleFormSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'org.role.codeHint')
    .max(16, 'org.role.codeHint')
    .regex(roleCodePattern, 'org.role.codeHint'),
  labels: z.record(z.string(), z.string()),
  sort: z.number().int().min(0).nullable(),
})

export type RoleFormValues = z.input<typeof roleFormSchema>

/** 表单 → 请求体：空语言项剔除（labels 只留非空值，服务端同样规整）。 */
export function roleLabelsBody(labels: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(labels)
      .map(([lang, name]) => [lang, name.trim()])
      .filter(([, name]) => name !== ''),
  )
}

export function roleFormBody(values: RoleFormValues): {
  code: string
  labels: Record<string, string>
  sort: number | null
} {
  return { code: values.code, labels: roleLabelsBody(values.labels ?? {}), sort: values.sort ?? null }
}

function valuesOf(role: RoleView | null | undefined): RoleFormValues {
  return { code: role?.code ?? '', labels: { ...(role?.labels ?? {}) }, sort: role?.sort ?? null }
}

export function RoleFormModal({ role, open, onClose }: { role?: RoleView | null; open: boolean; onClose: () => void }) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const editing = role != null
  const { control, handleSubmit, reset, setError } = useForm<RoleFormValues>({
    resolver: zodResolver(roleFormSchema),
    defaultValues: valuesOf(role),
  })

  // 创建/编辑共用一实例：切换 role（或关闭回到创建）时重置
  useEffect(() => {
    reset(valuesOf(role))
  }, [role, reset])

  const save = useMutation({
    mutationFn: (values: RoleFormValues) => {
      const body = roleFormBody(values)
      return editing
        ? patchRole(role.code, { labels: body.labels, sort: body.sort, lockVersion: role.lockVersion })
        : submitRole({ code: body.code, labels: body.labels, sort: body.sort })
    },
    onSuccess: () => {
      message.success(t(editing ? 'org.role.message.updated' : 'org.role.message.created'))
      void queryClient.invalidateQueries({ queryKey: [ROLES_QUERY_KEY] })
      onClose()
    },
  })

  // labels 至少一个非空语言名（服务端同码校验 42201 fields.labels）
  const submit = handleSubmit((values) => {
    if (Object.keys(roleLabelsBody(values.labels ?? {})).length === 0) {
      setError('labels', { message: 'common.message.required' })
      return
    }
    save.mutate(values)
  })

  return (
    <Modal
      open={open}
      forceRender
      title={editing ? t('org.role.action.edit') : t('org.role.action.create')}
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
        <Controller
          control={control}
          name="code"
          render={({ field, fieldState }) => (
            <Form.Item
              label={t('org.role.field.code')}
              required={!editing}
              {...(fieldState.error ? { validateStatus: 'error' as const, help: t('org.role.codeHint') } : {})}
            >
              <Input
                {...field}
                value={field.value ?? ''}
                maxLength={16}
                disabled={editing}
                aria-label="role-form-code"
              />
            </Form.Item>
          )}
        />
        <Controller
          control={control}
          name="labels"
          render={({ field, fieldState }) => (
            <Form.Item
              label={t('org.role.field.name')}
              required
              {...(fieldState.error
                ? { validateStatus: 'error' as const, help: t(fieldState.error.message ?? 'common.message.required') }
                : {})}
            >
              <Flex vertical gap={8}>
                {SUPPORTED_LANGUAGES.map((language) => (
                  <Input
                    key={language}
                    addonBefore={language}
                    value={field.value?.[language] ?? ''}
                    maxLength={60}
                    aria-label={`role-form-label-${language}`}
                    onChange={(event) => field.onChange({ ...(field.value ?? {}), [language]: event.target.value })}
                  />
                ))}
                <Typography.Text type="secondary">{t('org.role.labelsHint')}</Typography.Text>
              </Flex>
            </Form.Item>
          )}
        />
        <NumberField
          control={control}
          name="sort"
          label={t('org.role.field.sort')}
          min={0}
          aria-label="role-form-sort"
        />
        {save.error ? (
          <Typography.Paragraph type="danger">{errorText(save.error, t, 'common.message.failed')}</Typography.Paragraph>
        ) : null}
      </Form>
    </Modal>
  )
}
