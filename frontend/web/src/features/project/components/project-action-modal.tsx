import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Button, Form, hasPerm, Modal, Space, Typography, useMessage, usePrivileges } from '@zentao/design-system'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { DateField, TextAreaField } from '../../../shared/form-fields'
import { actionsFor, type MetaAction } from '../../../shared/meta'
import {
  PROJECT_ACTIONS,
  PROJECT_QUERY_ROOTS,
  type ProjectAction,
  type ProjectKind,
  type ProjectView,
  runProjectAction,
} from '../api/project.api'

/** 动作弹窗表单值（日期一律 '' = 未填，缺省日期由后端补当天）。 */
export type ActionFormValues = {
  realBeganDate: string
  realEndDate: string
  beginDate: string
  endDate: string
  comment: string
}

const BASE_FORM: ActionFormValues = {
  realBeganDate: '',
  realEndDate: '',
  beginDate: '',
  endDate: '',
  comment: '',
}

const baseSchema = z.object({
  realBeganDate: z.string(),
  realEndDate: z.string(),
  beginDate: z.string(),
  endDate: z.string(),
  comment: z.string(),
})

/** 各动作守卫（project §4）：activate 必填 beginDate/endDate 且 beginDate ≤ endDate（否则 42203），其余动作只收备注。 */
export function actionSchema(action: ProjectAction) {
  if (action !== 'activate') {
    return baseSchema
  }
  return baseSchema
    .refine((values) => values.beginDate !== '', { path: ['beginDate'], message: 'common.message.required' })
    .refine((values) => values.endDate !== '', { path: ['endDate'], message: 'common.message.required' })
    .refine((values) => values.beginDate === '' || values.endDate === '' || values.beginDate <= values.endDate, {
      path: ['endDate'],
      message: 'project.message.dateOrder',
    })
}

/** 动作请求体（project §5：start 收 realBeganDate、close 收 realEndDate、activate 收日期区间，其余仅 comment）。 */
export function actionBody(action: ProjectAction, values: ActionFormValues): Record<string, unknown> {
  const comment = values.comment === '' ? null : values.comment
  switch (action) {
    case 'start':
      return { realBeganDate: values.realBeganDate === '' ? null : values.realBeganDate, comment }
    case 'close':
      return { realEndDate: values.realEndDate === '' ? null : values.realEndDate, comment }
    case 'activate':
      return { beginDate: values.beginDate, endDate: values.endDate, comment }
    default:
      return { comment }
  }
}

function ActionForm({
  action,
  loading,
  error,
  defaults,
  onCancel,
  onSubmit,
}: {
  action: ProjectAction
  loading: boolean
  error: unknown
  defaults: ActionFormValues
  onCancel: () => void
  onSubmit: (values: ActionFormValues) => void
}) {
  const { t } = useTranslation()
  const { control, handleSubmit } = useForm<ActionFormValues>({
    resolver: zodResolver(actionSchema(action)),
    defaultValues: defaults,
  })

  return (
    <Form layout="vertical" onFinish={handleSubmit(onSubmit)}>
      {action === 'start' ? (
        <DateField
          control={control}
          name="realBeganDate"
          label={t('project.field.realBeganDate')}
          aria-label="project-action-real-began-date"
        />
      ) : null}
      {action === 'close' ? (
        <DateField
          control={control}
          name="realEndDate"
          label={t('project.field.realEndDate')}
          aria-label="project-action-real-end-date"
        />
      ) : null}
      {action === 'activate' ? (
        <>
          <DateField
            control={control}
            name="beginDate"
            label={t('project.field.beginDate')}
            aria-label="project-action-begin-date"
          />
          <DateField
            control={control}
            name="endDate"
            label={t('project.field.endDate')}
            aria-label="project-action-end-date"
          />
        </>
      ) : null}
      <TextAreaField
        control={control}
        name="comment"
        label={t('common.field.comment')}
        aria-label="project-action-comment"
      />
      {error ? (
        <Typography.Paragraph type="danger">{errorText(error, t, 'common.message.failed')}</Typography.Paragraph>
      ) : null}
      <Space className="tw:mt-3">
        <Button onClick={onCancel}>{t('common.action.cancel')}</Button>
        <Button type="primary" htmlType="submit" loading={loading}>
          {t('common.action.submit')}
        </Button>
      </Space>
    </Form>
  )
}

/**
 * 三型六动作弹窗（project 卡 §6 F 范式）：按钮由 meta.actions[].allowedStatus + 当前账号权限码派生，
 * program/project/execution 共用同一壳；动作成功后由调用页 onDone 刷新（三型查询根统一失效）。
 */
export function ProjectActionModal({
  objectType,
  target,
  actions,
  onDone,
}: {
  objectType: ProjectKind
  target: ProjectView | null
  actions?: readonly MetaAction[] | undefined
  onDone: () => void
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const privileges = usePrivileges()
  const [current, setCurrent] = useState<ProjectAction | null>(null)

  const visible = actionsFor(actions, target?.status)
    .filter((action) => (PROJECT_ACTIONS as readonly string[]).includes(action.action))
    .filter((action) => !action.code || hasPerm(privileges, action.code))

  const submit = useMutation({
    mutationFn: (values: ActionFormValues) => {
      if (current === null || target === null) {
        throw new Error('project action modal: no target')
      }
      return runProjectAction(objectType, target.id, current, actionBody(current, values))
    },
    onSuccess: (_result, _values) => {
      message.success(t('common.message.saved'))
      for (const root of PROJECT_QUERY_ROOTS) {
        void queryClient.invalidateQueries({ queryKey: [root] })
      }
      setCurrent(null)
      onDone()
    },
  })

  const defaults: ActionFormValues = {
    ...BASE_FORM,
    beginDate: target?.beginDate ?? '',
    endDate: target?.endDate ?? '',
  }

  return (
    <>
      {visible.map((action) => (
        <Button
          key={action.action}
          type={action.action === 'start' || action.action === 'activate' ? 'primary' : 'default'}
          onClick={() => setCurrent(action.action as ProjectAction)}
        >
          {action.i18n ? t(action.i18n) : t(`project.action.${action.action}`)}
        </Button>
      ))}
      <Modal
        open={current !== null}
        footer={null}
        title={current ? t(`project.action.${current}`) : ''}
        onCancel={() => setCurrent(null)}
      >
        {current ? (
          <ActionForm
            key={current}
            action={current}
            loading={submit.isPending}
            error={submit.error}
            defaults={defaults}
            onCancel={() => setCurrent(null)}
            onSubmit={(values) => submit.mutate(values)}
          />
        ) : null}
      </Modal>
    </>
  )
}
