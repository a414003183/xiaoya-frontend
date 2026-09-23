/** @route /org/accounts/batch @title org.accounts.batchTitle @perm account-create @hide @activeMenu /org/accounts */
// list-standard: exempt (batch-form) — 表即表单（整表可编辑），不接列设置/分页
import { useMutation } from '@tanstack/react-query'
import { batchCreateAccounts } from '@zentao/api-client/generated'
import { Button, Card, Input, PageContainer, PageHeader, Table, Typography, useMessage } from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutationFeedback } from '../../../shared/use-mutation-feedback'
import { randomPassword } from '../model'

type Row = { key: number; account: string; realName: string; email: string; password: string; result?: string }

/** 批量创建账号（org 卡 §6：整表可编辑，部分成功逐项展示；B-WKS-03：密码逐行填写 6–64，无统一弱口令）。 */
export default function AccountBatchCreatePage() {
  const message = useMessage()
  const { t } = useTranslation()
  const feedback = useMutationFeedback()
  const [rows, setRows] = useState<Row[]>([
    { key: 1, account: '', realName: '', email: '', password: '' },
    { key: 2, account: '', realName: '', email: '', password: '' },
    { key: 3, account: '', realName: '', email: '', password: '' },
  ])
  const submit = useMutation({
    mutationFn: async () => {
      const items = rows
        .filter((row) => row.account.trim().length > 0)
        .map((row) => ({
          account: row.account,
          password: row.password,
          realName: row.realName,
          email: row.email || null,
        }))
      const response = await batchCreateAccounts({ items })
      return (response.data as { results: { index: number; ok: boolean; id?: number | null; error?: string | null }[] })
        .results
    },
    onSuccess: (results) => {
      setRows((prev) =>
        prev.map((row, index) => {
          const result = results.find((item: { index: number; ok: boolean }) => item.index === index && item.ok)
          return result?.id !== undefined && result.id !== null ? { ...row, result: `#${result.id}` } : row
        }),
      )
    },
    onError: feedback.failed,
  })

  const patchRow = (key: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)))

  const submitAll = () => {
    // 密码口径同 §3.1：6–64；填了账号的行密码必填（B-WKS-03：无统一弱口令）
    const invalid = rows.some(
      (row) => row.account.trim().length > 0 && (row.password.length < 6 || row.password.length > 64),
    )
    if (invalid) {
      message.warning(t('org.accounts.batchPasswordRequired'))
      return
    }
    submit.mutate()
  }

  const columns = [
    {
      title: t('org.account.field.account'),
      dataIndex: 'account',
      render: (value: string, row: Row) => (
        <Input
          aria-label={`account-${row.key}`}
          value={value}
          onChange={(event) => patchRow(row.key, { account: event.target.value })}
        />
      ),
    },
    {
      title: t('org.account.field.password'),
      dataIndex: 'password',
      render: (value: string, row: Row) => (
        <Input
          aria-label={`password-${row.key}`}
          value={value}
          maxLength={64}
          placeholder="6-64"
          onChange={(event) => patchRow(row.key, { password: event.target.value })}
        />
      ),
    },
    {
      title: t('org.account.field.realName'),
      dataIndex: 'realName',
      render: (value: string, row: Row) => (
        <Input
          aria-label={`realName-${row.key}`}
          value={value}
          onChange={(event) => patchRow(row.key, { realName: event.target.value })}
        />
      ),
    },
    {
      title: t('org.account.field.email'),
      dataIndex: 'email',
      render: (value: string, row: Row) => (
        <Input
          aria-label={`email-${row.key}`}
          value={value}
          onChange={(event) => patchRow(row.key, { email: event.target.value })}
        />
      ),
    },
    {
      title: t('org.accounts.batchResult'),
      render: (_: unknown, row: Row) => (row.result ? <Typography.Text>{row.result}</Typography.Text> : null),
    },
  ]

  return (
    <PageContainer>
      <PageHeader
        title={t('org.accounts.batchTitle')}
        backTo="/org/accounts"
        extra={
          <>
            <Button
              onClick={() =>
                setRows((prev) =>
                  prev.map((row) => (row.password === '' ? { ...row, password: randomPassword() } : row)),
                )
              }
            >
              {t('org.accounts.batchRandomPassword')}
            </Button>
            <Button type="primary" loading={submit.isPending} onClick={submitAll}>
              {t('org.accounts.batchSubmit')}
            </Button>
          </>
        }
      />
      <Card>
        <Table rowKey="key" size="small" columns={columns} dataSource={rows} pagination={false} />
        <Typography.Paragraph type="secondary" className="tw:mt-3">
          {t('org.accounts.batchHint')}
        </Typography.Paragraph>
      </Card>
    </PageContainer>
  )
}
