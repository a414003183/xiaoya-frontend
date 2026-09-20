import { useMutation, useQuery } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Button, Input, InputNumber, Select, Space, Table, Typography, useMessage } from '@zentao/design-system'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  fetchAccountOptions,
  type MemberResultItem,
  type TeamMemberInput,
  type TeamMemberView,
} from '../api/project.api'
import { type MemberRow, membersDiff } from '../model'

const EMPTY_ROW: MemberRow = { account: '', role: null, joinDate: '', days: 0, hours: 0, sort: 0 }

function rowsOf(members: readonly TeamMemberView[]): MemberRow[] {
  return members.map((member) => ({
    account: member.account,
    role: member.role ?? null,
    joinDate: member.joinDate,
    days: member.days,
    hours: member.hours,
    sort: member.sort,
  }))
}

/**
 * 团队成员表（project §3.7 / §6 B 范式）：整表可编辑，保存 = 全量提交整表（后端 diff 增删改，逐项结果）。
 * 项目/执行两个对象共用本组件，提交端点由调用页注入；行校验在前端（days ≥ 0、hours 0–24、account 唯一）。
 */
export function MemberTable({
  members,
  loading,
  onSubmit,
  onSaved,
}: {
  members: readonly TeamMemberView[]
  loading?: boolean
  onSubmit: (members: TeamMemberInput[]) => Promise<MemberResultItem[]>
  onSaved: () => void
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const [rows, setRows] = useState<MemberRow[]>(() => rowsOf(members))
  const accounts = useQuery({ queryKey: ['getDict', 'accounts'], queryFn: fetchAccountOptions })

  useEffect(() => {
    setRows(rowsOf(members))
  }, [members])

  const diff = membersDiff(members, rows)
  const duplicate = rows.length !== new Set(rows.map((row) => row.account)).size
  const invalid = rows.some((row) => row.account === '' || row.days < 0 || row.hours < 0 || row.hours > 24)
  const changed = diff.added.length + diff.removed.length + diff.updated.length > 0

  const save = useMutation({
    mutationFn: () => onSubmit(diff.members),
    onSuccess: (results) => {
      const failed = results.filter((item) => !item.ok)
      if (failed.length === 0) {
        message.success(t('common.message.saved'))
      } else {
        message.warning(
          t('team.message.partialFailed', {
            failed: failed.map((item) => `${item.account}(${item.error ?? ''})`).join('、'),
          }),
        )
      }
      onSaved()
    },
  })

  const patch = (account: string, changes: Partial<MemberRow>) => {
    setRows((prev) => prev.map((row) => (row.account === account ? { ...row, ...changes } : row)))
  }

  return (
    <Space direction="vertical" className="tw:w-full">
      <Space wrap>
        <Typography.Text type="secondary">
          {t('team.message.diffHint', {
            added: diff.added.length,
            updated: diff.updated.length,
            removed: diff.removed.length,
          })}
        </Typography.Text>
        <Button
          onClick={() => setRows((prev) => [...prev, { ...EMPTY_ROW, sort: prev.length }])}
          disabled={rows.some((row) => row.account === '') || rows.length >= (accounts.data ?? []).length}
        >
          {t('team.action.addRow')}
        </Button>
        <Button
          type="primary"
          loading={save.isPending}
          disabled={!changed || duplicate || invalid}
          onClick={() => save.mutate()}
        >
          {t('common.action.save')}
        </Button>
      </Space>
      {duplicate ? <Typography.Text type="danger">{t('team.message.duplicateAccount')}</Typography.Text> : null}
      <Table
        rowKey="account"
        size="small"
        loading={loading ?? false}
        pagination={false}
        dataSource={rows}
        locale={{ emptyText: t('common.empty') }}
        columns={[
          {
            title: t('team.field.account'),
            dataIndex: 'account',
            render: (account: string, row: MemberRow) => (
              <Select
                showSearch
                optionFilterProp="label"
                className="tw:w-[160px]"
                aria-label={`team-account-${row.sort}`}
                value={account === '' ? undefined : account}
                options={(accounts.data ?? [])
                  .filter(
                    (option) => option.account === account || !rows.some((item) => item.account === option.account),
                  )
                  .map((option) => ({ value: option.account, label: `${option.realName}(${option.account})` }))}
                onChange={(value) => {
                  const next = value ?? ''
                  setRows((prev) => prev.map((item) => (item.account === account ? { ...item, account: next } : item)))
                }}
              />
            ),
          },
          {
            title: t('team.field.role'),
            dataIndex: 'role',
            render: (role: string | null, row: MemberRow) => (
              <Input
                aria-label={`team-role-${row.sort}`}
                maxLength={30}
                value={role ?? ''}
                onChange={(event) =>
                  patch(row.account, { role: event.target.value === '' ? null : event.target.value })
                }
              />
            ),
          },
          {
            title: t('team.field.joinDate'),
            dataIndex: 'joinDate',
            render: (joinDate: string, row: MemberRow) => (
              <Input
                aria-label={`team-join-date-${row.sort}`}
                placeholder="YYYY-MM-DD"
                value={joinDate}
                onChange={(event) => patch(row.account, { joinDate: event.target.value })}
              />
            ),
          },
          {
            title: t('team.field.days'),
            dataIndex: 'days',
            width: 100,
            render: (days: number, row: MemberRow) => (
              <InputNumber
                min={0}
                aria-label={`team-days-${row.sort}`}
                value={days}
                onChange={(value) => patch(row.account, { days: Number(value ?? 0) })}
              />
            ),
          },
          {
            title: t('team.field.hours'),
            dataIndex: 'hours',
            width: 100,
            render: (hours: number, row: MemberRow) => (
              <InputNumber
                min={0}
                max={24}
                step={0.5}
                aria-label={`team-hours-${row.sort}`}
                value={hours}
                onChange={(value) => patch(row.account, { hours: Number(value ?? 0) })}
              />
            ),
          },
          {
            title: t('common.field.sort'),
            dataIndex: 'sort',
            width: 90,
            render: (sort: number, row: MemberRow) => (
              <InputNumber
                min={0}
                aria-label={`team-sort-${row.sort}`}
                value={sort}
                onChange={(value) => patch(row.account, { sort: Number(value ?? 0) })}
              />
            ),
          },
          {
            title: t('common.action.manage'),
            render: (_: unknown, row: MemberRow) => (
              <Button
                size="small"
                danger
                aria-label={`team-remove-${row.sort}`}
                onClick={() => setRows((prev) => prev.filter((item) => item.account !== row.account))}
              >
                {t('common.action.delete')}
              </Button>
            ),
          },
        ]}
      />
      {save.error ? (
        <Typography.Paragraph type="danger">{errorText(save.error, t, 'common.message.failed')}</Typography.Paragraph>
      ) : null}
    </Space>
  )
}
