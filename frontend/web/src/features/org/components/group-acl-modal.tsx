import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Form, Modal, Select, Typography, useMessage } from '@zentao/design-system'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchProducts } from '../../product'
import { fetchExecutions, fetchPrograms, fetchProjects } from '../../project'
import { type GroupAcl, type GroupView, updateGroup } from '../api/org.api'

/** 组数据权限弹窗（A-08 / org §3.3 acl：四类对象 id 多选追加可见集，整体替换经 PATCH /groups；views 不展示）。 */

type AclKey = 'products' | 'programs' | 'projects' | 'executions'

type OptionSource = { id: number; name: string }

function aclValuesOf(acl: GroupAcl | undefined): Record<AclKey, number[]> {
  return {
    products: acl?.products ?? [],
    programs: acl?.programs ?? [],
    projects: acl?.projects ?? [],
    executions: acl?.executions ?? [],
  }
}

export function GroupAclModal({
  group,
  open,
  onClose,
}: {
  group: GroupView | null
  open: boolean
  onClose: () => void
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [values, setValues] = useState<Record<AclKey, number[]>>(aclValuesOf(group?.acl))

  // 打开/切换组时回到服务端当前值
  useEffect(() => {
    if (open) {
      setValues(aclValuesOf(group?.acl))
    }
  }, [open, group])

  const save = useMutation({
    mutationFn: () =>
      updateGroup(group?.id ?? 0, {
        acl: { ...(group?.acl ?? {}), ...values },
        lockVersion: group?.lockVersion,
      }),
    onSuccess: () => {
      message.success(t('common.message.saved'))
      void queryClient.invalidateQueries({ queryKey: ['listGroups'] })
      void queryClient.invalidateQueries({ queryKey: ['getGroup'] })
      onClose()
    },
  })

  return (
    <Modal
      open={open}
      forceRender
      title={t('org.group.acl.title', { name: group?.name ?? '' })}
      onCancel={onClose}
      okText={t('common.action.submit')}
      cancelText={t('common.action.cancel')}
      confirmLoading={save.isPending}
      onOk={() => void save.mutateAsync()}
    >
      <Form layout="vertical">
        <Typography.Paragraph type="secondary">{t('org.group.acl.hint')}</Typography.Paragraph>
        <AclObjectSelect
          label={t('org.group.acl.products')}
          ariaLabel="group-acl-products"
          queryRoot="listProducts"
          fetcher={(dsl) => fetchProducts(dsl)}
          value={values.products}
          onChange={(ids) => setValues((prev) => ({ ...prev, products: ids }))}
        />
        <AclObjectSelect
          label={t('org.group.acl.programs')}
          ariaLabel="group-acl-programs"
          queryRoot="listPrograms"
          fetcher={(dsl) => fetchPrograms(dsl)}
          value={values.programs}
          onChange={(ids) => setValues((prev) => ({ ...prev, programs: ids }))}
        />
        <AclObjectSelect
          label={t('org.group.acl.projects')}
          ariaLabel="group-acl-projects"
          queryRoot="listProjects"
          fetcher={(dsl) => fetchProjects(dsl)}
          value={values.projects}
          onChange={(ids) => setValues((prev) => ({ ...prev, projects: ids }))}
        />
        <AclObjectSelect
          label={t('org.group.acl.executions')}
          ariaLabel="group-acl-executions"
          queryRoot="listExecutions"
          fetcher={(dsl) => fetchExecutions(dsl)}
          value={values.executions}
          onChange={(ids) => setValues((prev) => ({ ...prev, executions: ids }))}
        />
        {save.error ? (
          <Typography.Paragraph type="danger">{errorText(save.error, t, 'common.message.failed')}</Typography.Paragraph>
        ) : null}
      </Form>
    </Modal>
  )
}

/** 单类对象多选：list 端点远程搜索（q），已选项标签经缓存保名。 */
function AclObjectSelect({
  label,
  ariaLabel,
  queryRoot,
  fetcher,
  value,
  onChange,
}: {
  label: string
  ariaLabel: string
  queryRoot: string
  fetcher: (dsl: { q?: string; limit: number }) => Promise<{ items: OptionSource[] }>
  value: number[]
  onChange: (ids: number[]) => void
}) {
  const [keyword, setKeyword] = useState('')
  /** id → name 缓存：搜索翻页不丢已选标签 */
  const labelCache = useRef(new Map<number, string>())
  const list = useQuery({
    queryKey: [queryRoot, 'groupAcl', keyword],
    queryFn: () => fetcher({ limit: 50, ...(keyword === '' ? {} : { q: keyword }) }),
  })
  for (const item of list.data?.items ?? []) {
    labelCache.current.set(item.id, item.name)
  }
  const options = [...labelCache.current.entries()].map(([id, name]) => ({ value: id, label: name }))

  return (
    <Form.Item label={label}>
      <Select
        mode="multiple"
        value={value}
        options={options}
        loading={list.isPending}
        showSearch
        optionFilterProp="label"
        onSearch={setKeyword}
        onChange={(ids: number[]) => onChange(ids)}
        aria-label={ariaLabel}
        placeholder={label}
        className="tw:w-full"
      />
    </Form.Item>
  )
}
