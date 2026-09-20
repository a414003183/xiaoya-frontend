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
import { type BoardView, patchBoard, submitBoard } from '../api/board.api'

/** board §3.4 校验：name 1–90 必填、acl ∈ open|private|extend（extend=继承空间）、acl=private 需白名单。 */
export const boardSchema = z
  .object({
    name: z.string().min(1, 'common.message.required').max(90, 'board.message.nameTooLong'),
    owner: z.string().nullable(),
    team: z.array(z.string()),
    acl: z.enum(['open', 'private', 'extend']),
    whitelist: z.array(z.string()),
    description: z.string(),
    sort: z.number(),
  })
  .refine((values) => values.acl !== 'private' || values.whitelist.length > 0, {
    path: ['whitelist'],
    message: 'board.message.whitelistRequired',
  })

export type BoardFormValues = z.input<typeof boardSchema>

function valuesOf(board: BoardView | null): BoardFormValues {
  return {
    name: board?.name ?? '',
    owner: board?.owner ?? null,
    team: board?.team ?? [],
    acl: board?.acl ?? 'extend',
    whitelist: board?.whitelist ?? [],
    description: board?.description ?? '',
    sort: board?.sort ?? 0,
  }
}

function bodyOf(values: BoardFormValues): Record<string, unknown> {
  return {
    name: values.name,
    owner: values.owner,
    team: values.team,
    acl: values.acl,
    whitelist: values.acl === 'private' ? values.whitelist : [],
    description: values.description === '' ? null : values.description,
    sort: values.sort,
  }
}

/** 看板创建/编辑共用弹窗（T-7 / project §6 F 范式）：创建走空间下 POST，编辑走 PATCH + lockVersion。 */
export function BoardFormModal({
  spaceId,
  board,
  open,
  onClose,
}: {
  spaceId: number
  board?: BoardView | null
  open: boolean
  onClose: () => void
}) {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const editing = board != null
  const accounts = useQuery({ queryKey: ['getDict', 'accounts'], queryFn: fetchAccountOptions })
  // acl 选项唯一来源（03 §5）：从 meta 取，前端不留清单。
  const boardMeta = useDomainMeta('board')
  const { control, handleSubmit } = useForm<BoardFormValues>({
    resolver: zodResolver(boardSchema),
    defaultValues: valuesOf(board ?? null),
  })

  const save = useMutation({
    mutationFn: (values: BoardFormValues) => {
      const body = bodyOf(values)
      return editing ? patchBoard(board.id, { ...body, lockVersion: board.lockVersion }) : submitBoard(spaceId, body)
    },
    onSuccess: () => {
      message.success(t('common.message.saved'))
      void queryClient.invalidateQueries({ queryKey: ['getBoardSpace'] })
      void queryClient.invalidateQueries({ queryKey: ['getBoard'] })
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
      title={editing ? t('board.action.editBoard') : t('board.action.createBoard')}
      onCancel={onClose}
      okText={t('common.action.submit')}
      cancelText={t('common.action.cancel')}
      confirmLoading={save.isPending}
      onOk={() => void submit()}
    >
      <Form layout="vertical">
        <TextField control={control} name="name" label={t('board.field.name')} maxLength={90} aria-label="board-name" />
        <SelectField
          control={control}
          name="owner"
          label={t('board.field.owner')}
          options={accountOptions}
          aria-label="board-owner"
        />
        <SelectField
          control={control}
          name="team"
          label={t('board.field.team')}
          options={accountOptions}
          multiple
          aria-label="board-team"
        />
        <SelectField
          control={control}
          name="acl"
          label={t('board.field.acl')}
          options={metaOptions(boardMeta.data, 'acl', t)}
          aria-label="board-acl"
        />
        <SelectField
          control={control}
          name="whitelist"
          label={t('board.field.whitelist')}
          options={accountOptions}
          multiple
          aria-label="board-whitelist"
        />
        <NumberField control={control} name="sort" label={t('common.field.sort')} min={0} aria-label="board-sort" />
        <TextAreaField
          control={control}
          name="description"
          label={t('common.field.description')}
          aria-label="board-description"
        />
        {save.error ? (
          <Typography.Paragraph type="danger">{errorText(save.error, t, 'common.message.failed')}</Typography.Paragraph>
        ) : null}
      </Form>
    </Modal>
  )
}
