import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Button, Form, Modal, Space, Switch, Typography, useMessage } from '@zentao/design-system'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { NumberField, TextField } from '../../../shared/form-fields'
import { type LaneView, patchLane, submitLane } from '../api/board.api'
import { WIP_UNLIMITED } from '../model'

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

/** lane §3.5 校验：name 1–90 必填、color #RRGGBB、wipLimit -1=不限 或 0–999。 */
export const laneSchema = z
  .object({
    name: z.string().min(1, 'common.message.required').max(90, 'board.message.nameTooLong'),
    color: z.string(),
    wipLimit: z.number().min(-1).max(999),
    archived: z.boolean(),
    sort: z.number(),
  })
  .refine((values) => values.color === '' || HEX_COLOR.test(values.color), {
    path: ['color'],
    message: 'board.message.colorFormat',
  })

export type LaneFormValues = z.input<typeof laneSchema>

/** 列配置弹窗（T-7 / project §6 F 范式，含 wipLimit/color）：创建走 POST，编辑走 PATCH（无 lockVersion 语义）。 */
export function LaneFormModal({
  boardId,
  lane,
  defaultSort,
  open,
  onClose,
}: {
  boardId: number
  lane?: LaneView | null
  defaultSort: number
  open: boolean
  onClose: () => void
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const editing = lane != null
  const { control, handleSubmit } = useForm<LaneFormValues>({
    resolver: zodResolver(laneSchema),
    defaultValues: {
      name: lane?.name ?? '',
      color: lane?.color ?? '',
      wipLimit: lane?.wipLimit ?? WIP_UNLIMITED,
      archived: lane?.archived ?? false,
      sort: lane?.sort ?? defaultSort,
    },
  })

  const save = useMutation({
    mutationFn: (values: LaneFormValues) => {
      const body = {
        name: values.name,
        color: values.color === '' ? null : values.color,
        wipLimit: values.wipLimit,
        archived: values.archived,
        sort: values.sort,
      }
      return editing ? patchLane(boardId, lane.id, body) : submitLane(boardId, body)
    },
    onSuccess: () => {
      message.success(t('common.message.saved'))
      void queryClient.invalidateQueries({ queryKey: ['getBoard'] })
      onClose()
    },
  })
  const submit = handleSubmit((values) => save.mutate(values))

  return (
    <Modal
      open={open}
      forceRender
      title={editing ? t('board.action.editLane') : t('board.action.createLane')}
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
          label={t('board.field.laneName')}
          maxLength={90}
          aria-label="lane-name"
        />
        <TextField
          control={control}
          name="color"
          label={t('board.field.laneColor')}
          placeholder="#RRGGBB"
          aria-label="lane-color"
        />
        <NumberField
          control={control}
          name="wipLimit"
          label={t('board.field.wipLimit')}
          min={-1}
          max={999}
          aria-label="lane-wip-limit"
        />
        <Typography.Text type="secondary" className="tw:block tw:-mt-3 tw:mb-3 tw:text-xs">
          {t('board.message.wipUnlimited')}
        </Typography.Text>
        <Controller
          control={control}
          name="archived"
          render={({ field }) => (
            <Form.Item label={t('board.field.archived')}>
              <Switch
                checked={field.value}
                aria-label="lane-archived"
                onChange={(checked) => field.onChange(checked)}
              />
            </Form.Item>
          )}
        />
        <NumberField control={control} name="sort" label={t('common.field.sort')} min={0} aria-label="lane-sort" />
        {save.error ? (
          <Typography.Paragraph type="danger">{errorText(save.error, t, 'common.message.failed')}</Typography.Paragraph>
        ) : null}
      </Form>
    </Modal>
  )
}
