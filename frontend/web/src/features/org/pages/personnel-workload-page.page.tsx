/** @route /personnel/workload @title personnel.workload.title @perm personnel-view @menu org @order 5 */

import { useQuery } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Alert,
  Card,
  EmptyState,
  filterSelectWidth,
  ListCard,
  PageContainer,
  PageLoading,
  Select,
  type TableColumnsType,
} from '@zentao/design-system'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { dateRangeField, ListFilterForm } from '../../../shared/list-filter'
import { ReportChart, stackedBarOption, todayIso } from '../../workspace'
import { fetchDepartmentTree, fetchPersonnelWorkload, type PersonnelWorkloadView } from '../api/org.api'
import { departmentNames, departmentOptions, monthRange } from '../model'

/**
 * 人员管理 · 工作量统计（T-14 / §6 C 范式：日期区间 + 部门过滤 + 按人堆叠条 + 明细表）。
 * filters[date] 为必填区间（org §5）：缺省当前自然月，后端拒绝（40001）时原样呈现。
 */
export default function PersonnelWorkloadPage() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const fallback = monthRange(todayIso())
  /* 必填区间：URL 无值即用当前自然月（表单按同一兜底预填，不写 URL，重置后回到本月） */
  const dateRange = `${fallback.from}..${fallback.to}`
  const filter = searchParams.get('filters[date]') ?? dateRange
  const departmentId = searchParams.get('departmentId')

  const departments = useQuery({ queryKey: ['getDepartmentTree'], queryFn: fetchDepartmentTree })
  const workload = useQuery({
    queryKey: ['listPersonnelWorkload', filter, departmentId],
    queryFn: () =>
      fetchPersonnelWorkload({
        limit: 200,
        'filters[date]': filter,
        ...(departmentId ? { 'filters[departmentId]': departmentId } : {}),
      }),
  })

  const items = workload.data?.items ?? []
  const option = useMemo(
    () =>
      stackedBarOption(
        items.map((item) => item.realName),
        [{ name: t('personnel.workload.consumedHours'), values: items.map((item) => item.consumedHours) }],
      ),
    [items, t],
  )

  const names = departmentNames(departments.data ?? [])

  const columns: TableColumnsType<PersonnelWorkloadView> = [
    { title: t('personnel.field.account'), dataIndex: 'account' },
    { title: t('personnel.field.realName'), dataIndex: 'realName' },
    {
      title: t('personnel.field.department'),
      dataIndex: 'departmentId',
      render: (value: number | null | undefined) =>
        value === null || value === undefined ? '-' : (names.get(value) ?? `#${value}`),
    },
    { title: t('personnel.workload.consumedHours'), dataIndex: 'consumedHours', width: 140 },
    { title: t('personnel.workload.finishedTaskCount'), dataIndex: 'finishedTaskCount', width: 140 },
  ]

  return (
    <PageContainer>
      <ListFilterForm
        fields={[
          dateRangeField('filters[date]', t('common.filter.dateRange')),
          {
            name: 'departmentId',
            label: t('personnel.field.department'),
            control: (
              <Select
                allowClear
                style={{ width: filterSelectWidth }}
                placeholder={t('personnel.workload.allDepartments')}
                aria-label="personnel-workload-department"
                options={departmentOptions(departments.data ?? []).map((item) => ({
                  value: String(item.value),
                  label: item.label,
                }))}
              />
            ),
          },
        ]}
        /* filters[date] 必填：表单预填当前自然月（不写 URL，重置后回到本月） */
        defaults={{ 'filters[date]': dateRange }}
      />
      {workload.isPending ? (
        <PageLoading />
      ) : workload.error ? (
        // 40001（区间缺失/倒置）等业务错误原样呈现服务端文案
        <Alert type="error" showIcon message={errorText(workload.error, t, 'personnel.workload.loadFailed')} />
      ) : (
        <>
          <Card title={t('personnel.workload.chart')}>
            {items.length === 0 ? (
              <EmptyState description={t('personnel.workload.empty')} />
            ) : (
              <ReportChart option={option} ariaLabel={t('personnel.workload.title')} height={300} />
            )}
          </Card>
          <ListCard
            title={t('personnel.workload.detail')}
            columns={columns}
            columnSettingKey="personnel-workload"
            rowKey="account"
            dataSource={items}
            pagination={false}
          />
        </>
      )}
    </PageContainer>
  )
}
