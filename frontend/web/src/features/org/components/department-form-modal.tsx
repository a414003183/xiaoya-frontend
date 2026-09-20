import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Button, Form, Modal, Space, Typography, useMessage } from '@zentao/design-system'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { NumberField, SelectField, TextField } from '../../../shared/form-fields'
import {
  type DepartmentNode,
  fetchAccounts,
  fetchDepartmentTree,
  submitDepartment,
  updateDepartment,
} from '../api/org.api'
import { departmentOptions } from '../model'

/**
 * 部门创建/编辑合一弹窗（org §5 F 范式：POST/PATCH /departments；编辑带 lockVersion）。
 * 新建：上级部门留空即根部门；编辑：PATCH 的 null = 不修改（03 §1），故清空上级/负责人不生效（弹窗内注明）。
 */

export const departmentFormSchema = z.object({
  name: z.string().trim().min(1, 'common.message.required').max(60, 'common.message.required'),
  parentId: z.number().nullable(),
  manager: z.string().nullable(),
  sort: z.number().int().min(0).nullable(),
})

export type DepartmentFormValues = z.input<typeof departmentFormSchema>

/** 表单 → 请求体（name 去空白；上级/负责人/排序空值即 null）。 */
export function departmentFormBody(values: DepartmentFormValues): {
  name: string
  parentId: number | null
  sort: number | null
  manager: string | null
} {
  return {
    name: values.name.trim(),
    parentId: values.parentId ?? null,
    sort: values.sort ?? null,
    manager: values.manager ?? null,
  }
}

function valuesOf(department: DepartmentNode | null, parentId: number | null): DepartmentFormValues {
  return {
    name: department?.name ?? '',
    parentId: department ? (department.parentId ?? null) : parentId,
    manager: department?.manager ?? null,
    sort: department?.sort ?? null,
  }
}

export function DepartmentFormModal({
  department,
  parentId = null,
  open,
  onClose,
}: {
  /** 编辑对象；null = 新建。 */
  department?: DepartmentNode | null
  /** 新建时的上级部门（行内「新增子部门」预填；根部门传 null）。 */
  parentId?: number | null
  open: boolean
  onClose: () => void
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const editing = department != null
  const { control, handleSubmit, reset } = useForm<DepartmentFormValues>({
    resolver: zodResolver(departmentFormSchema),
    defaultValues: valuesOf(department ?? null, parentId),
  })

  // 创建/编辑共用一实例：切换对象（或关闭回到创建）时重置
  useEffect(() => {
    reset(valuesOf(department ?? null, parentId))
  }, [department, parentId, reset])

  const departments = useQuery({ queryKey: ['getDepartmentTree'], queryFn: fetchDepartmentTree })
  const accounts = useQuery({
    queryKey: ['listAccounts', 'department-manager'],
    queryFn: () => fetchAccounts({ limit: 200 }),
  })
  const accountOptions = (accounts.data?.items ?? []).map((account) => ({
    value: account.account,
    label: `${account.realName}(${account.account})`,
  }))

  const save = useMutation({
    mutationFn: (values: DepartmentFormValues) => {
      const body = departmentFormBody(values)
      // 编辑不带 lockVersion：DepartmentNode 视图不含该字段（列表行拿不到），服务端缺省即跳过乐观锁校验
      return department ? updateDepartment(department.id, body) : submitDepartment(body)
    },
    onSuccess: () => {
      message.success(t(editing ? 'org.department.message.updated' : 'org.department.message.created'))
      void queryClient.invalidateQueries({ queryKey: ['listDepartments'] })
      void queryClient.invalidateQueries({ queryKey: ['getDepartmentTree'] })
      onClose()
    },
  })
  const submit = handleSubmit((values) => save.mutate(values))

  return (
    <Modal
      open={open}
      forceRender
      title={
        editing
          ? t('org.department.action.edit')
          : t(parentId === null ? 'org.department.action.addRoot' : 'org.department.action.addChild')
      }
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
          label={t('org.department.field.name')}
          maxLength={60}
          aria-label="department-form-name"
        />
        <SelectField
          control={control}
          name="parentId"
          label={t('org.department.field.parent')}
          options={departmentOptions(departments.data ?? [])}
          aria-label="department-form-parent"
        />
        <SelectField
          control={control}
          name="manager"
          label={t('org.department.field.manager')}
          options={accountOptions}
          aria-label="department-form-manager"
        />
        <NumberField
          control={control}
          name="sort"
          label={t('org.department.field.sort')}
          min={0}
          aria-label="department-form-sort"
        />
        {/* 编辑态：PATCH 的 null = 不修改（03 §1），清空上级/负责人不会改动——常驻说明防误以为已清空 */}
        {editing ? <Typography.Text type="secondary">{t('org.department.editHint')}</Typography.Text> : null}
        {save.error ? (
          <Typography.Paragraph type="danger">{errorText(save.error, t, 'common.message.failed')}</Typography.Paragraph>
        ) : null}
      </Form>
    </Modal>
  )
}
