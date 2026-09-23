import type { ReactNode } from 'react'
import { Modal } from './app-modal'
import { EmptyState } from './empty-state'
import { Button, Select, Space, Table, type TableColumnsType, Typography } from './ui'
import { useMessage } from './use-feedback'

/** 关联对象的候选/已关联行：一律数字 id。 */
type LinkPickerRow = { id: number }

type LinkPickerCommon = {
  open: boolean
  title: ReactNode
  width?: number
  forceRender?: boolean
  onCancel: () => void
  /** 候选区上方插槽：plan 族的需求/Bug 页签、test-run 族的筛选行；省略不渲染。 */
  toolbar?: ReactNode
  /** 已译错误文案（站点经 errorText 映射后传入）；空值不渲染。 */
  error?: string | null
}

/** 形态 select（plan 族）：多选下拉 + 体内部「关联」按钮（无底栏）。 */
type LinkPickerSelect<T> = {
  kind: 'select'
  rows: T[]
  labelOf: (row: T) => string
  placeholder: string
  ariaLabel: string
  actionLabel: string
  hint?: ReactNode
  selectedIds: number[]
  onSelectionChange: (ids: number[]) => void
  onAction: () => void
  pending: boolean
}

/** 形态 table（case 族）：候选勾选表 + 底栏确认。 */
type LinkPickerTable<T> = {
  kind: 'table'
  rows: T[]
  columns: TableColumnsType<T>
  loading?: boolean
  emptyLabel: ReactNode
  selectedIds: number[]
  onSelectionChange: (ids: number[]) => void
  confirm: {
    cancelLabel: string
    confirmLabel: string
    onConfirm: () => void
    pending: boolean
    /** 空选点「关联」的口径（三处差异保留原样）：'disable' = 按钮禁用；'warn' = 弹一次提示不提交。 */
    onEmptySelection: 'disable' | 'warn'
    emptyWarnLabel?: ReactNode
  }
}

/** 形态 empty（plan 族 Bug 页签）：只有空态，无底栏。 */
type LinkPickerEmpty = {
  kind: 'empty'
  description: ReactNode
}

/**
 * 关联对象选择器（T72 / AUDIT FE-11 单源）：plan-link / suite-link-case / test-run-link-case 三个关联弹窗
 * （及 build/release 复用的同构壳）的共用标准件。**差异参数化、行为逐处冻结**：
 * · 形态 select = 多选下拉 + 体内「关联」按钮 + 可选「已关联表 + 逐行取消关联」（plan/build/release 族）；
 * · 形态 table = 候选勾选表 + 底栏「取消/关联」（suite/test-run 族），空选口径 disable|warn 按站点原样传；
 * · 形态 empty = 只出空态（plan 族 Bug 页签的现状）。
 * 受控组件：选中态/加载/错误/pending 全由站点（react-query 层）持有，本件只做呈现与事件转发——
 * 成功时关不关窗、清不清选中是站点语义（suite/test-run 关窗、plan 清选中留窗），不许在此吞并。
 */
export type LinkPickerModalProps<T extends LinkPickerRow> = LinkPickerCommon & {
  picker: LinkPickerSelect<T> | LinkPickerTable<T> | LinkPickerEmpty
  /** 已关联区（形态 select 用）：「已关联表 + 逐行取消关联」；省略不渲染。 */
  linked?: {
    rows: T[]
    /** 数据列（不含操作列——操作列由本件补，含取消关联按钮）。 */
    columns: TableColumnsType<T>
    emptyLabel: ReactNode
    manageLabel: string
    unlinkLabel: string
    onUnlink: (id: number) => void
    pending: boolean
  }
}

export function LinkPickerModal<T extends LinkPickerRow>({
  open,
  title,
  width,
  forceRender,
  onCancel,
  toolbar,
  error,
  picker,
  linked,
}: LinkPickerModalProps<T>) {
  const message = useMessage()
  /* 错误行固定落体尾；select 形态在 gap-3 容器内（间距由 gap 出），table 形态自带 tw:mt-3——与三处旧实现同形。 */
  const errorNode = error ? (
    <Typography.Paragraph type="danger" {...(picker.kind === 'table' ? { className: 'tw:mt-3' } : {})}>
      {error}
    </Typography.Paragraph>
  ) : null

  if (picker.kind === 'select') {
    return (
      <Modal open={open} title={title} width={width ?? 720} footer={null} onCancel={onCancel}>
        {toolbar}
        <div className="tw:mt-3 tw:flex tw:flex-col tw:gap-3">
          <Space.Compact className="tw:w-full">
            <Select
              mode="multiple"
              className="tw:w-full"
              aria-label={picker.ariaLabel}
              placeholder={picker.placeholder}
              optionFilterProp="label"
              value={picker.selectedIds}
              onChange={(ids) => picker.onSelectionChange(ids)}
              options={picker.rows.map((row) => ({ value: row.id, label: picker.labelOf(row) }))}
            />
            <Button type="primary" loading={picker.pending} onClick={picker.onAction}>
              {picker.actionLabel}
            </Button>
          </Space.Compact>
          {picker.hint === undefined ? null : <Typography.Text type="secondary">{picker.hint}</Typography.Text>}
          {linked === undefined ? null : linked.rows.length === 0 ? (
            <EmptyState description={linked.emptyLabel} />
          ) : (
            <Table<T>
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={linked.rows}
              columns={[
                ...linked.columns,
                {
                  title: linked.manageLabel,
                  render: (_: unknown, record: T) => (
                    <Button size="small" loading={linked.pending} onClick={() => linked.onUnlink(record.id)}>
                      {linked.unlinkLabel}
                    </Button>
                  ),
                },
              ]}
            />
          )}
          {errorNode}
        </div>
      </Modal>
    )
  }

  if (picker.kind === 'empty') {
    return (
      <Modal
        open={open}
        title={title}
        width={width ?? 720}
        footer={null}
        onCancel={onCancel}
        forceRender={forceRender ?? false}
      >
        {toolbar}
        <div className="tw:mt-3">
          <EmptyState description={picker.description} />
        </div>
        {errorNode}
      </Modal>
    )
  }

  const emptySelection = picker.selectedIds.length === 0
  return (
    <Modal
      open={open}
      title={title}
      width={width ?? 760}
      forceRender={forceRender ?? false}
      onCancel={onCancel}
      footer={
        <Space>
          <Button onClick={onCancel}>{picker.confirm.cancelLabel}</Button>
          <Button
            type="primary"
            loading={picker.confirm.pending}
            disabled={picker.confirm.onEmptySelection === 'disable' && emptySelection}
            onClick={() => {
              if (emptySelection) {
                /* 空选口径按站点原样：warn = 弹一次提示不提交（test-run 族）；disable = 按钮本已禁用，此处只兜底不提交 */
                if (picker.confirm.onEmptySelection === 'warn') {
                  message.warning(picker.confirm.emptyWarnLabel)
                }
                return
              }
              picker.confirm.onConfirm()
            }}
          >
            {picker.confirm.confirmLabel}
          </Button>
        </Space>
      }
    >
      {toolbar}
      {picker.rows.length === 0 ? (
        <EmptyState description={picker.emptyLabel} />
      ) : (
        <Table<T>
          rowKey="id"
          size="small"
          loading={picker.loading ?? false}
          columns={picker.columns}
          dataSource={picker.rows}
          pagination={false}
          rowSelection={{
            selectedRowKeys: picker.selectedIds,
            onChange: (keys) => picker.onSelectionChange(keys.map((key) => Number(key))),
          }}
        />
      )}
      {errorNode}
    </Modal>
  )
}
