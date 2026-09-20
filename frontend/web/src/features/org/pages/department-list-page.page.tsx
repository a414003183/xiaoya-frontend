/** @route /org/departments @title org.departments.title @perm department-view @menu org @order 2 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Button,
  ConfirmAction,
  HasPerm,
  ListCard,
  PageContainer,
  PageLoading,
  Space,
  type TableColumnsType,
  Typography,
  useMessage,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { DEFAULT_PAGE_SIZE } from '../../../shared/list-dsl'
import { keywordField, ListFilterForm, selectField } from '../../../shared/list-filter'
import { withParam } from '../../../shared/url'
import { type DepartmentNode, deleteDepartmentAction, fetchDepartments, fetchDepartmentTree } from '../api/org.api'
import { DepartmentFormModal } from '../components/department-form-modal'
import { departmentOptions } from '../model'

/**
 * 部门列表（org 卡 §6 L 范式：平铺表格，服务端分页/搜索/筛选/排序）。
 * 行数据全部来自 GET /departments（含服务端解析的 parentName）；单节点增改删走 POST/PATCH/DELETE，
 * 整树端点（GET/PUT /departments/tree）保留供 API 集成，本页不接线。字典式行 → 点名称即打开编辑弹窗。
 */
export default function DepartmentListPage() {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const q = searchParams.get('q') ?? ''
  const parentId = searchParams.get('filters[parentId]') ?? ''
  const grade = searchParams.get('filters[grade]') ?? ''
  const sort = searchParams.get('sort') ?? ''
  const page = Number(searchParams.get('page')) || 1
  const [editing, setEditing] = useState<DepartmentNode | null>(null)
  const [creating, setCreating] = useState<{ parentId: number | null } | null>(null)

  const departments = useQuery({
    queryKey: ['listDepartments', page, sort, q, parentId, grade],
    queryFn: () =>
      fetchDepartments({
        page,
        limit: DEFAULT_PAGE_SIZE,
        ...(sort ? { sort } : {}),
        ...(q ? { q } : {}),
        filters: { parentId: parentId === '' ? undefined : parentId, grade: grade === '' ? undefined : grade },
      }),
  })
  // 上级部门筛选项与弹窗的上级选择器同源（同一棵服务端部门树，前端只做选项渲染）
  const tree = useQuery({ queryKey: ['getDepartmentTree'], queryFn: fetchDepartmentTree })

  const remove = useMutation({
    mutationFn: (departmentId: number) => deleteDepartmentAction(departmentId),
    onSuccess: () => {
      message.success(t('org.department.message.deleted'))
      invalidate()
    },
    // 守卫失败（有子部门/有成员 → 42203）按错误码出文案：后端 message 只作开发兜底
    onError: (error) => message.error(errorText(error, t)),
  })

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ['listDepartments'] })
    void queryClient.invalidateQueries({ queryKey: ['getDepartmentTree'] })
  }

  const columns: TableColumnsType<DepartmentNode> = [
    {
      title: t('org.department.field.name'),
      dataIndex: 'name',
      // 字典式行：点名称 = 打开编辑弹窗（本域无部门详情页）
      render: (name: string, record: DepartmentNode) => (
        <Button type="link" size="small" onClick={() => setEditing(record)}>
          {name}
        </Button>
      ),
    },
    {
      title: t('org.department.field.parent'),
      dataIndex: 'parentName',
      render: (parentName: string | null | undefined) => parentName ?? t('common.field.none'),
    },
    { title: t('org.department.field.grade'), dataIndex: 'grade', width: 90 },
    {
      title: t('org.department.field.manager'),
      dataIndex: 'manager',
      render: (manager: string | null | undefined) => manager ?? t('common.field.none'),
    },
    { title: t('org.department.field.sort'), dataIndex: 'sort', width: 90 },
    {
      title: t('common.action.manage'),
      key: 'actions',
      width: 200,
      render: (_: unknown, record: DepartmentNode) => (
        <Space wrap size={4}>
          <HasPerm perm="department-create">
            <Button type="link" size="small" onClick={() => setCreating({ parentId: record.id })}>
              {t('org.department.action.addChild')}
            </Button>
          </HasPerm>
          <HasPerm perm="department-edit">
            <Button type="link" size="small" onClick={() => setEditing(record)}>
              {t('common.action.edit')}
            </Button>
          </HasPerm>
          <HasPerm perm="department-delete">
            {/* 守卫提示常驻（有子部门/有成员都删不掉），真守卫在服务端（42203 → 错误提示） */}
            <ConfirmAction
              title={t('org.department.deleteTitle', { name: record.name })}
              description={
                <>
                  <div>{t('org.department.guard.children')}</div>
                  <div>{t('org.department.guard.members')}</div>
                </>
              }
              onConfirm={() => remove.mutate(record.id)}
            >
              <Button type="link" size="small" danger>
                {t('common.action.delete')}
              </Button>
            </ConfirmAction>
          </HasPerm>
        </Space>
      ),
    },
  ]

  if (departments.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }
  if (departments.error) {
    return (
      <PageContainer>
        <Typography.Text type="secondary">{errorText(departments.error, t, 'common.loading')}</Typography.Text>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <ListFilterForm
        fields={[
          keywordField(t('org.department.field.name'), t('common.action.search')),
          selectField(
            'filters[parentId]',
            t('org.department.field.parent'),
            departmentOptions(tree.data ?? []).map((option) => ({ value: String(option.value), label: option.label })),
          ),
        ]}
      />
      <ListCard
        columns={columns}
        columnSettingKey="org-departments"
        actions={
          <HasPerm perm="department-create">
            <Button type="primary" onClick={() => setCreating({ parentId: null })}>
              {t('org.department.action.addRoot')}
            </Button>
          </HasPerm>
        }
        rowKey="id"
        dataSource={departments.data?.items ?? []}
        pagination={{
          current: page,
          pageSize: DEFAULT_PAGE_SIZE,
          total: departments.data?.total ?? 0,
          onChange: (next) => setSearchParams(withParam(searchParams, 'page', next)),
        }}
      />
      <DepartmentFormModal
        department={editing}
        parentId={creating?.parentId ?? null}
        open={creating !== null || editing !== null}
        onClose={() => {
          setCreating(null)
          setEditing(null)
        }}
      />
    </PageContainer>
  )
}
