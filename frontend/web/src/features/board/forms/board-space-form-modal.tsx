import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import { Form, Modal, Typography, useMessage } from '@zentao/design-system'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { NumberField, SelectField, TextAreaField, TextField } from '../../../shared/form-fields'
import { metaOptions, useDomainMeta } from '../../../shared/meta-options'
import { fetchAccountOptions } from '../../project'
import { type BoardSpaceView, patchBoardSpace, submitBoardSpace } from '../api/board.api'

/** board §3.3 校验：name 1–90 必填、type 枚举、acl=private 需白名单。 */
export const boardSpaceSchema = z
  .object({
    name: z.string().min(1, 'common.message.required').max(90, 'board.message.nameTooLong'),
    type: z.enum(['cooperation', 'public', 'private']),
    owner: z.string().nullable(),
    team: z.array(z.string()),
    acl: z.enum(['open', 'private']),
    whitelist: z.array(z.string()),
    description: z.string(),
    sort: z.number(),
  })
  .refine((values) => values.acl !== 'private' || values.whitelist.length > 0, {
    path: ['whitelist'],
    message: 'board.message.whitelistRequired',
  })

export type BoardSpaceFormValues = z.input<typeof boardSpaceSchema>

function valuesOf(space: BoardSpaceView | null): BoardSpaceFormValues {
  return {
    name: space?.name ?? '',
    type: space?.type ?? 'cooperation',
    owner: space?.owner ?? null,
    team: space?.team ?? [],
    acl: space?.acl ?? 'open',
    whitelist: space?.whitelist ?? [],
    description: space?.description ?? '',
    sort: space?.sort ?? 0,
  }
}

function bodyOf(values: BoardSpaceFormValues): Record<string, unknown> {
  return {
    name: values.name,
    type: values.type,
    owner: values.owner,
    team: values.team,
    acl: values.acl,
    whitelist: values.acl === 'private' ? values.whitelist : [],
    description: values.description === '' ? null : values.description,
    sort: values.sort,
  }
}

/** 看板空间创建/编辑共用弹窗（T-7 / project §6 F 范式：meta + POST/PATCH）。 */
export function BoardSpaceFormModal({
  space,
  open,
  onClose,
}: {
  space?: BoardSpaceView | null
  open: boolean
  onClose: () => void
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const editing = space != null
  const accounts = useQuery({ queryKey: ['getDict', 'accounts'], queryFn: fetchAccountOptions })
  // 枚举字段选项唯一来源（03 §5）：type/acl 从 meta 取，前端不留清单。
  const spaceMeta = useDomainMeta('board_space')
  const { control, handleSubmit } = useForm<BoardSpaceFormValues>({
    resolver: zodResolver(boardSpaceSchema),
    defaultValues: valuesOf(space ?? null),
  })

  const save = useMutation({
    mutationFn: (values: BoardSpaceFormValues) => {
      const body = bodyOf(values)
      return editing ? patchBoardSpace(space.id, { ...body, lockVersion: space.lockVersion }) : submitBoardSpace(body)
    },
    onSuccess: () => {
      message.success(t('common.message.saved'))
      void queryClient.invalidateQueries({ queryKey: ['listBoardSpaces'] })
      void queryClient.invalidateQueries({ queryKey: ['getBoardSpace'] })
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
      title={editing ? t('board.action.editSpace') : t('board.action.createSpace')}
      onCancel={onClose}
      okText={t('common.action.submit')}
      cancelText={t('common.action.cancel')}
      confirmLoading={save.isPending}
      onOk={() => void submit()}
    >
      <Form layout="vertical">
        <TextField
          control={control}
          name="name"
          label={t('board.field.name')}
          maxLength={90}
          aria-label="board-space-name"
        />
        <SelectField
          control={control}
          name="type"
          label={t('board.field.type')}
          options={metaOptions(spaceMeta.data, 'type', t)}
          aria-label="board-space-type"
        />
        <SelectField
          control={control}
          name="owner"
          label={t('board.field.owner')}
          options={accountOptions}
          aria-label="board-space-owner"
        />
        <SelectField
          control={control}
          name="team"
          label={t('board.field.team')}
          options={accountOptions}
          multiple
          aria-label="board-space-team"
        />
        <SelectField
          control={control}
          name="acl"
          label={t('board.field.acl')}
          options={metaOptions(spaceMeta.data, 'acl', t)}
          aria-label="board-space-acl"
        />
        <SelectField
          control={control}
          name="whitelist"
          label={t('board.field.whitelist')}
          options={accountOptions}
          multiple
          aria-label="board-space-whitelist"
        />
        <NumberField
          control={control}
          name="sort"
          label={t('common.field.sort')}
          min={0}
          aria-label="board-space-sort"
        />
        <TextAreaField
          control={control}
          name="description"
          label={t('common.field.description')}
          aria-label="board-space-description"
        />
        {save.error ? (
          <Typography.Paragraph type="danger">{errorText(save.error, t, 'common.message.failed')}</Typography.Paragraph>
        ) : null}
      </Form>
    </Modal>
  )
}
