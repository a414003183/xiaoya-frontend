/** @route /products/batch-edit @title product.title.batchEdit @perm product-edit @hide @activeMenu /products */
// list-standard: exempt (batch-form) — 表即表单（整表可编辑），不接列设置/分页
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Button,
  Card,
  Input,
  InputNumber,
  PageContainer,
  PageHeader,
  PageLoading,
  Select,
  Table,
  Typography,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { metaOptions, useDomainMeta } from '../../../shared/meta-options'
import { paramIds } from '../../../shared/url'
import { type BatchResultItem, fetchProducts, type ProductView, submitBatchProducts } from '../api/product.api'
import { pickChangedFields } from '../model'

type Row = {
  id: number
  name: string
  acl: ProductView['acl']
  sort: number
  lockVersion: number
  result?: string
}

/** 产品批量编辑（product 卡 §6 B 范式：从列表多选进入，仅提交改动字段）。 */
export default function ProductBatchEditPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const ids = paramIds(searchParams)
  const [edits, setEdits] = useState<Record<number, Partial<Row>>>({})
  const [results, setResults] = useState<BatchResultItem[]>([])
  // 行内 acl 选项唯一来源（03 §5）：从 meta 取，前端不留清单。
  const productMeta = useDomainMeta('product')

  const products = useQuery({
    queryKey: ['listProducts', 'batch', ids.join(',')],
    queryFn: () => fetchProducts({ limit: 200, filters: { id: ids.join(',') } }),
    enabled: ids.length > 0,
  })
  const submit = useMutation({
    mutationFn: async (input: { rows?: Row[]; action?: 'close' | 'activate' }) => {
      if (input.action) {
        return submitBatchProducts({ ids, action: input.action })
      }
      const originals = new Map((products.data?.items ?? []).map((item) => [item.id, item]))
      const items = (input.rows ?? [])
        .map((row) => {
          const original = originals.get(row.id)
          if (!original) {
            return null
          }
          const changed = pickChangedFields<ProductView>(original, { ...original, ...row }, ['name', 'acl', 'sort'])
          return Object.keys(changed).length > 0 ? { id: row.id, ...changed } : null
        })
        .filter((item): item is { id: number } & Partial<ProductView> => item !== null)
      if (items.length === 0) {
        return { results: [] as BatchResultItem[] }
      }
      return submitBatchProducts({ ids: items.map((item) => item.id), action: 'edit', params: { items } })
    },
    onSuccess: (data) => {
      setResults(data.results)
      void queryClient.invalidateQueries({ queryKey: ['listProducts'] })
    },
  })

  if (products.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }

  const rows: Row[] = (products.data?.items ?? []).map((product) => {
    const edited = edits[product.id] ?? {}
    return {
      id: product.id,
      name: edited.name ?? product.name,
      acl: edited.acl ?? product.acl,
      sort: edited.sort ?? product.sort,
      lockVersion: product.lockVersion,
    }
  })

  const update = (id: number, patch: Partial<Row>) => setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  const columns = [
    { title: t('product.field.id'), dataIndex: 'id', width: 70 },
    {
      title: t('product.field.name'),
      dataIndex: 'name',
      render: (value: string, row: Row) => (
        <Input
          aria-label={`name-${row.id}`}
          value={value}
          onChange={(event) => update(row.id, { name: event.target.value })}
        />
      ),
    },
    {
      title: t('product.field.acl'),
      dataIndex: 'acl',
      render: (value: string, row: Row) => (
        <Select
          aria-label={`acl-${row.id}`}
          value={value}
          options={metaOptions(productMeta.data, 'acl', t)}
          onChange={(next) => update(row.id, { acl: next as ProductView['acl'] })}
        />
      ),
    },
    {
      title: t('product.field.sort'),
      dataIndex: 'sort',
      width: 110,
      render: (value: number, row: Row) => (
        <InputNumber
          aria-label={`sort-${row.id}`}
          value={value}
          min={0}
          onChange={(next) => update(row.id, { sort: Number(next ?? 0) })}
        />
      ),
    },
    {
      title: t('product.title.batchEdit'),
      render: (_: unknown, row: Row) => {
        const result = results.find((item) => item.id === row.id)
        if (!result) {
          return null
        }
        return result.ok ? (
          <Typography.Text type="success">ok</Typography.Text>
        ) : (
          <Typography.Text type="danger">{result.error ?? 'error'}</Typography.Text>
        )
      },
    },
  ]

  return (
    <PageContainer>
      <PageHeader
        title={t('product.title.batchEdit')}
        backTo="/products"
        extra={
          <>
            <Button loading={submit.isPending} onClick={() => submit.mutate({ action: 'close' })}>
              {t('product.action.close')}
            </Button>
            <Button loading={submit.isPending} onClick={() => submit.mutate({ action: 'activate' })}>
              {t('product.action.activate')}
            </Button>
            <Button type="primary" loading={submit.isPending} onClick={() => submit.mutate({ rows })}>
              {t('common.action.submit')}
            </Button>
          </>
        }
      />
      <Card>
        <Typography.Paragraph type="secondary">{t('product.message.batchHint')}</Typography.Paragraph>
        {submit.error ? (
          <Typography.Paragraph type="danger">
            {errorText(submit.error, t, 'common.message.failed')}
          </Typography.Paragraph>
        ) : null}
        <Table rowKey="id" size="small" columns={columns} dataSource={rows} pagination={false} />
      </Card>
    </PageContainer>
  )
}
