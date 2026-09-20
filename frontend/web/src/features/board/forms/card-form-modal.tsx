import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Form, Modal, Typography, useMessage } from '@zentao/design-system'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { DateField, NumberField, SelectField, TextAreaField, TextField } from '../../../shared/form-fields'
import { metaNumberOptions, metaOptions, useDomainMeta } from '../../../shared/meta-options'
import { fetchAccountOptions } from '../../project'
import { type CardView, type LaneView, patchCard, submitCard } from '../api/board.api'

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

/** card §3.6 校验：name 1–255、laneId 属本看板（创建必填）、beginDate ≤ endDate、估算工时 ≥ 0。 */
export const cardSchema = z
  .object({
    laneId: z.number().nullable(),
    name: z.string().min(1, 'common.message.required').max(255, 'board.message.cardNameTooLong'),
    status: z.enum(['doing', 'done']),
    priority: z.number().min(1).max(4),
    assignee: z.string().nullable(),
    beginDate: z.string(),
    endDate: z.string(),
    estimateHours: z.number().nullable(),
    progress: z.number().min(0).max(100),
    color: z.string(),
    description: z.string(),
  })
  .refine((values) => values.beginDate === '' || values.endDate === '' || values.beginDate <= values.endDate, {
    path: ['endDate'],
    message: 'board.message.dateOrder',
  })
  .refine((values) => values.color === '' || HEX_COLOR.test(values.color), {
    path: ['color'],
    message: 'board.message.colorFormat',
  })

export type CardFormValues = z.input<typeof cardSchema>

function valuesOf(card: CardView | null, laneId: number | null, editing: boolean): CardFormValues {
  return {
    laneId: editing ? (card?.laneId ?? null) : laneId,
    name: card?.name ?? '',
    status: card?.status ?? 'doing',
    priority: card?.priority ?? 3,
    assignee: card?.assignee ?? null,
    beginDate: card?.beginDate ?? '',
    endDate: card?.endDate ?? '',
    estimateHours: card?.estimateHours ?? null,
    progress: card?.progress ?? 0,
    color: card?.color ?? '',
    description: card?.description ?? '',
  }
}

/** 卡片创建/编辑共用弹窗（T-7 / project §6 F 范式）：编辑走 PATCH（laneId 归属不在可写白名单，拖拽端点专管）。 */
export function CardFormModal({
  boardId,
  lanes,
  card,
  defaultLaneId,
  open,
  onClose,
}: {
  boardId: number
  lanes: readonly LaneView[]
  card?: CardView | null
  defaultLaneId?: number | null
  open: boolean
  onClose: () => void
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const editing = card != null
  const accounts = useQuery({ queryKey: ['getDict', 'accounts'], queryFn: fetchAccountOptions })
  // 枚举字段选项唯一来源（03 §5）：status/priority 从 meta 取，前端不留清单。
  const cardMeta = useDomainMeta('card')
  const { control, handleSubmit } = useForm<CardFormValues>({
    resolver: zodResolver(cardSchema),
    defaultValues: valuesOf(card ?? null, defaultLaneId ?? lanes[0]?.id ?? null, editing),
  })

  const save = useMutation({
    mutationFn: (values: CardFormValues) => {
      const body = {
        name: values.name,
        status: values.status,
        priority: values.priority,
        assignee: values.assignee,
        beginDate: values.beginDate === '' ? null : values.beginDate,
        endDate: values.endDate === '' ? null : values.endDate,
        estimateHours: values.estimateHours,
        progress: values.progress,
        color: values.color === '' ? null : values.color,
        description: values.description === '' ? null : values.description,
      }
      if (editing) {
        return patchCard(card.id, { ...body, lockVersion: card.lockVersion })
      }
      return submitCard(boardId, { ...body, laneId: values.laneId })
    },
    onSuccess: () => {
      message.success(t('common.message.saved'))
      void queryClient.invalidateQueries({ queryKey: ['getBoard'] })
      void queryClient.invalidateQueries({ queryKey: ['getCard'] })
      onClose()
    },
  })
  const submit = handleSubmit((values) => save.mutate(values))
  const accountOptions = (accounts.data ?? []).map((account) => ({
    value: account.account,
    label: `${account.realName}(${account.account})`,
  }))

  return (
    <Modal
      open={open}
      forceRender
      title={editing ? t('board.action.editCard') : t('board.action.createCard')}
      onCancel={onClose}
      okText={t('common.action.submit')}
      cancelText={t('common.action.cancel')}
      confirmLoading={save.isPending}
      onOk={() => void submit()}
    >
      <Form layout="vertical">
        {editing ? null : (
          <SelectField
            control={control}
            name="laneId"
            label={t('board.field.lane')}
            options={lanes.map((lane) => ({ value: lane.id, label: lane.name }))}
            aria-label="card-lane"
          />
        )}
        <TextField
          control={control}
          name="name"
          label={t('board.field.cardName')}
          maxLength={255}
          aria-label="card-name"
        />
        <SelectField
          control={control}
          name="status"
          label={t('common.field.status')}
          options={metaOptions(cardMeta.data, 'status', t)}
          aria-label="card-status"
        />
        <SelectField
          control={control}
          name="priority"
          label={t('common.field.priority')}
          options={metaNumberOptions(cardMeta.data, 'priority', t)}
          aria-label="card-priority"
        />
        <SelectField
          control={control}
          name="assignee"
          label={t('common.field.assignee')}
          options={accountOptions}
          aria-label="card-assignee"
        />
        <DateField control={control} name="beginDate" label={t('board.field.beginDate')} aria-label="card-begin-date" />
        <DateField control={control} name="endDate" label={t('board.field.endDate')} aria-label="card-end-date" />
        <NumberField
          control={control}
          name="estimateHours"
          label={t('board.field.estimate')}
          min={0}
          aria-label="card-estimate"
        />
        <NumberField
          control={control}
          name="progress"
          label={t('board.field.progress')}
          min={0}
          max={100}
          aria-label="card-progress"
        />
        <TextField
          control={control}
          name="color"
          label={t('board.field.cardColor')}
          placeholder="#RRGGBB"
          aria-label="card-color"
        />
        <TextAreaField
          control={control}
          name="description"
          label={t('common.field.description')}
          aria-label="card-description"
        />
        {save.error ? (
          <Typography.Paragraph type="danger">{errorText(save.error, t, 'common.message.failed')}</Typography.Paragraph>
        ) : null}
      </Form>
    </Modal>
  )
}
