/** @route /admin/dicts @title platform.dict.title @perm setting-manage @menu admin/system @order 3 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Button,
  ConfirmAction,
  Drawer,
  EmptyState,
  HasPerm,
  ListCard,
  PageContainer,
  PageLoading,
  Space,
  StatusTag,
  type TableColumnsType,
  Typography,
  useMessage,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { DEFAULT_PAGE_SIZE } from '../../../shared/list-dsl'
import { keywordField, ListFilterForm } from '../../../shared/list-filter'
import { paramNumber, withParam } from '../../../shared/url'
import {
  type DictDataView,
  type DictTypeView,
  deleteDictItemAction,
  deleteDictTypeAction,
  fetchDictItems,
  fetchDictTypes,
  updateDictItemAction,
} from '../api/platform.api'
import { DictItemFormModal, DictTypeFormModal } from '../components/dict-form-modals'

/**
 * 字典管理（T16 P1-4）：DB 字典类型 + 行内「数据项」抽屉。
 *
 * DB 字典只**扩展**代码注册的内置字典（timezones/accounts/…）：`GET /dicts/{code}` 先查内置再落到这里，
 * 故建 code 撞内置字典名会被服务端 422 拒绝——这里的列表也只看得到 DB 那张表。
 */
export default function DictTypeListPage() {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const page = paramNumber(searchParams, 'page', 1)
  const q = searchParams.get('q') ?? ''
  const [editingType, setEditingType] = useState<DictTypeView | null>(null)
  const [creatingType, setCreatingType] = useState(false)
  /** 打开抽屉的类型（非 null 即抽屉开着）。 */
  const [activeType, setActiveType] = useState<DictTypeView | null>(null)
  const [editingItem, setEditingItem] = useState<DictDataView | null>(null)
  const [creatingItem, setCreatingItem] = useState(false)

  /** 只清表单一侧的状态：保存完关弹窗不该把抽屉一起关掉（用户还在看这个字典）。 */
  function resetItemForm(): void {
    setEditingItem(null)
    setCreatingItem(false)
  }

  const types = useQuery({
    queryKey: ['listDictTypes', { page, q }],
    queryFn: () => fetchDictTypes({ page, limit: DEFAULT_PAGE_SIZE, q }),
  })

  const removeType = useMutation({
    mutationFn: (code: string) => deleteDictTypeAction(code),
    onSuccess: () => {
      message.success(t('platform.dict.message.deleted'))
      void queryClient.invalidateQueries({ queryKey: ['listDictTypes'] })
    },
    onError: (error) => message.error(errorText(error, t)),
  })

  const columns: TableColumnsType<DictTypeView> = [
    {
      title: t('platform.dict.field.code'),
      dataIndex: 'code',
      width: 240,
      // 类型 code 就是入口：点它即开数据项抽屉
      render: (code: string, record: DictTypeView) => (
        <Button type="link" size="small" onClick={() => setActiveType(record)}>
          {code}
        </Button>
      ),
    },
    { title: t('platform.dict.field.name'), dataIndex: 'name' },
    {
      title: t('common.field.status'),
      dataIndex: 'status',
      width: 120,
      render: (status: string) => (
        <StatusTag tone={status === 'active' ? 'active' : 'closed'}>{t(`platform.dict.status.${status}`)}</StatusTag>
      ),
    },
    {
      title: t('common.action.manage'),
      key: 'actions',
      width: 200,
      render: (_: unknown, record: DictTypeView) => (
        <Space wrap size={4}>
          <Button type="link" size="small" onClick={() => setActiveType(record)}>
            {t('platform.dict.action.items')}
          </Button>
          <HasPerm perm="setting-manage">
            <Button type="link" size="small" onClick={() => setEditingType(record)}>
              {t('common.action.edit')}
            </Button>
            <ConfirmAction
              title={t('platform.dict.deleteTypeTitle', { code: record.code })}
              description={t('platform.dict.deleteTypeDescription')}
              onConfirm={() => removeType.mutate(record.code)}
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

  if (types.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }
  if (types.error) {
    return (
      <PageContainer>
        <Typography.Text type="secondary">{errorText(types.error, t, 'common.loading')}</Typography.Text>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <ListFilterForm fields={[keywordField(t('platform.dict.field.code'), t('common.action.search'))]} />
      <ListCard<DictTypeView>
        columns={columns}
        columnSettingKey="platform-dict-types"
        actions={
          <HasPerm perm="setting-manage">
            <Button type="primary" onClick={() => setCreatingType(true)}>
              {t('platform.dict.action.createType')}
            </Button>
          </HasPerm>
        }
        rowKey="code"
        dataSource={types.data.items}
        pagination={{
          current: page,
          pageSize: DEFAULT_PAGE_SIZE,
          total: types.data.total,
          onChange: (next) => setSearchParams(withParam(searchParams, 'page', next)),
        }}
        locale={{ emptyText: <EmptyState description={t('platform.dict.empty')} /> }}
      />
      <DictTypeFormModal
        type={editingType}
        open={creatingType || editingType !== null}
        onClose={() => {
          setCreatingType(false)
          setEditingType(null)
        }}
      />
      <DictItemsDrawer
        type={activeType}
        editing={editingItem}
        creating={creatingItem}
        onClose={() => {
          setActiveType(null)
          resetItemForm()
        }}
        onCloseForm={resetItemForm}
        onEdit={setEditingItem}
        onCreate={() => setCreatingItem(true)}
      />
    </PageContainer>
  )
}

type DictItemsDrawerProps = {
  type: DictTypeView | null
  /** 表单状态由宿主持有：关抽屉时一并清掉。 */
  editing: DictDataView | null
  creating: boolean
  /** 关抽屉（连表单状态一起清）。 */
  onClose: () => void
  /** 只关表单：保存/取消后抽屉要留着（用户还在看这个字典）。 */
  onCloseForm: () => void
  onEdit: (item: DictDataView) => void
  onCreate: () => void
}

/** 数据项抽屉（二级列表）：抽屉里再开弹窗编辑单条——`// list-standard: exempt (modal)` 的另一种形态。 */
function DictItemsDrawer({ type, editing, creating, onClose, onCloseForm, onEdit, onCreate }: DictItemsDrawerProps) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const items = useQuery({
    queryKey: ['listDictItems', type?.code],
    enabled: type !== null,
    queryFn: () => fetchDictItems(type?.code ?? '', { limit: DEFAULT_PAGE_SIZE }),
  })

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['listDictItems'] })
    // 读取侧（GET /dicts/{code}）的缓存一起失效：改完字典，下拉要立刻是新值
    void queryClient.invalidateQueries({ queryKey: ['getDict'] })
  }

  const remove = useMutation({
    mutationFn: (id: number) => deleteDictItemAction(id),
    onSuccess: () => {
      message.success(t('platform.dict.message.deleted'))
      invalidate()
    },
    onError: (error) => message.error(errorText(error, t)),
  })

  const toggleStatus = useMutation({
    mutationFn: (item: DictDataView) =>
      updateDictItemAction(item.id, { status: item.status === 'active' ? 'disabled' : 'active' }),
    onSuccess: () => invalidate(),
    onError: (error) => message.error(errorText(error, t)),
  })

  const columns: TableColumnsType<DictDataView> = [
    { title: t('platform.dict.field.itemLabel'), dataIndex: 'itemLabel' },
    { title: t('platform.dict.field.itemValue'), dataIndex: 'itemValue' },
    { title: t('platform.dict.field.sortNo'), dataIndex: 'sortNo', width: 90 },
    {
      title: t('common.field.status'),
      dataIndex: 'status',
      width: 110,
      render: (status: string) => (
        <StatusTag tone={status === 'active' ? 'active' : 'closed'}>{t(`platform.dict.status.${status}`)}</StatusTag>
      ),
    },
    {
      title: t('common.action.manage'),
      key: 'actions',
      width: 180,
      render: (_: unknown, record: DictDataView) => (
        <Space wrap size={4}>
          <Button type="link" size="small" onClick={() => onEdit(record)}>
            {t('common.action.edit')}
          </Button>
          <Button type="link" size="small" onClick={() => toggleStatus.mutate(record)}>
            {record.status === 'active' ? t('platform.dict.action.disable') : t('platform.dict.action.enable')}
          </Button>
          <ConfirmAction
            title={t('platform.dict.deleteItemTitle', { label: record.itemLabel })}
            onConfirm={() => remove.mutate(record.id)}
          >
            <Button type="link" size="small" danger>
              {t('common.action.delete')}
            </Button>
          </ConfirmAction>
        </Space>
      ),
    },
  ]

  return (
    <Drawer
      open={type !== null}
      size={720}
      title={t('platform.dict.itemsTitle', { code: type?.code ?? '' })}
      onClose={onClose}
      destroyOnHidden
    >
      <ListCard<DictDataView>
        columns={columns}
        columnSettingKey="platform-dict-items"
        actions={
          <Button type="primary" onClick={onCreate}>
            {t('platform.dict.action.createItem')}
          </Button>
        }
        rowKey="id"
        loading={items.isPending}
        dataSource={items.data?.items ?? []}
        pagination={false}
        locale={{ emptyText: <EmptyState description={t('platform.dict.itemsEmpty')} /> }}
      />
      {type === null ? null : (
        <DictItemFormModal
          typeCode={type.code}
          item={editing}
          open={creating || editing !== null}
          onClose={onCloseForm}
        />
      )}
    </Drawer>
  )
}
