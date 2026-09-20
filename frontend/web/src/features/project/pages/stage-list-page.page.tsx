/** @route /settings/stages @title stage.title.list @perm stage-view @menu admin @order 3 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, errorText } from '@zentao/api-client'
import {
  Button,
  HasPerm,
  Input,
  InputNumber,
  ListCard,
  PageContainer,
  PageHeader,
  Popconfirm,
  Select,
  Space,
  type TableColumnsType,
  Typography,
  useMessage,
} from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { metaOptions, useDomainMeta } from '../../../shared/meta-options'
import { deleteStageAction, fetchStages, patchStage, qk, type StageView, submitStage } from '../../board'

/** 阶段类型字典（T-7 / project §6 L 范式：行内编辑 name/percent/type/sort，percent 累计超 100 → 42201 标红）。 */
type StageDraft = { name: string; percent: number; type: string; sort: number }

/** 服务端 42201 的 fields 值 → i18n key（project §3.2：同 projectModel 累计 ≤100）。 */
const FIELD_ERROR_KEYS: Record<string, string> = {
  'percent-over-total': 'stage.message.percentExceeded',
}

function draftOf(stage: StageView): StageDraft {
  return { name: stage.name, percent: stage.percent, type: stage.type, sort: stage.sort }
}

export default function StageListPage() {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [drafts, setDrafts] = useState<Record<number, StageDraft>>({})
  const [rowErrors, setRowErrors] = useState<Record<number, string | null>>({})
  const [newStage, setNewStage] = useState<StageDraft>({
    name: '',
    percent: 0,
    type: 'dev',
    sort: 0,
  })
  // 类型字典选项唯一来源（03 §5）：从 meta 取，前端不留清单。
  const stageMeta = useDomainMeta('stage')

  const stages = useQuery({
    queryKey: qk.stage.list({ sort: 'sort' }),
    queryFn: () => fetchStages({ limit: 200, sort: 'sort' }),
  })

  const update = useMutation({
    mutationFn: (vars: { stageId: number; draft: StageDraft }) => patchStage(vars.stageId, { ...vars.draft }),
    onSuccess: (_saved, vars) => {
      message.success(t('common.message.saved'))
      setDrafts((current) => {
        const { [vars.stageId]: _removed, ...rest } = current
        return rest
      })
      setRowErrors((current) => ({ ...current, [vars.stageId]: null }))
      void queryClient.invalidateQueries({ queryKey: ['listStages'] })
    },
    onError: (error, vars) => {
      const field = error instanceof ApiError ? error.fields?.percent : undefined
      setRowErrors((current) => ({
        ...current,
        [vars.stageId]: field
          ? t(FIELD_ERROR_KEYS[field] ?? 'stage.message.percentExceeded')
          : t('common.message.failed'),
      }))
    },
  })

  const create = useMutation({
    mutationFn: (draft: StageDraft) => submitStage({ ...draft, projectModel: 'waterfall' }),
    onSuccess: () => {
      message.success(t('common.message.created'))
      setNewStage({ name: '', percent: 0, type: 'dev', sort: 0 })
      void queryClient.invalidateQueries({ queryKey: ['listStages'] })
    },
  })

  const remove = useMutation({
    mutationFn: (stageId: number) => deleteStageAction(stageId),
    onSuccess: () => {
      message.success(t('common.message.deleted'))
      void queryClient.invalidateQueries({ queryKey: ['listStages'] })
    },
  })

  const setDraft = (stage: StageView, patch: Partial<StageDraft>) => {
    setDrafts((current) => ({ ...current, [stage.id]: { ...(current[stage.id] ?? draftOf(stage)), ...patch } }))
  }

  const typeOptions = metaOptions(stageMeta.data, 'type', t)
  const projectModelLabels = metaOptions(stageMeta.data, 'projectModel', t)
    .map((option) => option.label)
    .join(' / ')

  const columns: TableColumnsType<StageView> = [
    { title: t('stage.field.id'), dataIndex: 'id', width: 70 },
    {
      title: t('stage.field.name'),
      key: 'name',
      width: 240,
      render: (_: unknown, stage: StageView) => (
        <Input
          value={(drafts[stage.id] ?? draftOf(stage)).name}
          maxLength={255}
          aria-label={`stage-name-${stage.id}`}
          onChange={(event) => setDraft(stage, { name: event.target.value })}
        />
      ),
    },
    {
      title: t('stage.field.percent'),
      key: 'percent',
      width: 140,
      render: (_: unknown, stage: StageView) => {
        const error = rowErrors[stage.id]
        return (
          <Space direction="vertical" size={0} className="tw:w-full">
            <InputNumber
              value={(drafts[stage.id] ?? draftOf(stage)).percent}
              min={0}
              max={100}
              className="tw:w-full"
              aria-label={`stage-percent-${stage.id}`}
              {...(error ? { status: 'error' as const } : {})}
              onChange={(value) => setDraft(stage, { percent: Number(value ?? 0) })}
            />
            {error ? (
              <Typography.Text type="danger" className="tw:text-xs">
                {error}
              </Typography.Text>
            ) : null}
          </Space>
        )
      },
    },
    {
      title: t('stage.field.type'),
      key: 'type',
      width: 160,
      render: (_: unknown, stage: StageView) => (
        <Select
          value={(drafts[stage.id] ?? draftOf(stage)).type}
          options={typeOptions}
          className="tw:w-full"
          aria-label={`stage-type-${stage.id}`}
          onChange={(value) => setDraft(stage, { type: value })}
        />
      ),
    },
    {
      title: t('stage.field.projectModel'),
      dataIndex: 'projectModel',
      width: 120,
      render: (model: string) => t(`stage.projectModel.${model}`),
    },
    {
      title: t('common.field.sort'),
      key: 'sort',
      width: 110,
      render: (_: unknown, stage: StageView) => (
        <InputNumber
          value={(drafts[stage.id] ?? draftOf(stage)).sort}
          className="tw:w-full"
          aria-label={`stage-sort-${stage.id}`}
          onChange={(value) => setDraft(stage, { sort: Number(value ?? 0) })}
        />
      ),
    },
    {
      title: t('common.action.manage'),
      key: 'actions',
      width: 150,
      render: (_: unknown, stage: StageView) => (
        <HasPerm perm="stage-manage">
          <Space size={0}>
            <Button
              size="small"
              type="link"
              disabled={drafts[stage.id] === undefined}
              aria-label={`stage-save-${stage.id}`}
              onClick={() => update.mutate({ stageId: stage.id, draft: drafts[stage.id] ?? draftOf(stage) })}
            >
              {t('common.action.save')}
            </Button>
            <Popconfirm title={t('stage.message.deleteHint')} onConfirm={() => remove.mutate(stage.id)}>
              <Button size="small" type="link" danger aria-label={`stage-delete-${stage.id}`}>
                {t('common.action.delete')}
              </Button>
            </Popconfirm>
          </Space>
        </HasPerm>
      ),
    },
  ]

  return (
    <PageContainer>
      <PageHeader title={t('stage.title.list')} />
      <ListCard
        columns={columns}
        columnSettingKey="project-stages"
        rowKey="id"
        loading={stages.isPending}
        dataSource={stages.data?.items ?? []}
        pagination={false}
        footer={() => (
          <HasPerm perm="stage-manage">
            <Space wrap>
              <Input
                value={newStage.name}
                placeholder={t('stage.field.name')}
                maxLength={255}
                className="tw:w-[240px]"
                aria-label="stage-new-name"
                onChange={(event) => setNewStage({ ...newStage, name: event.target.value })}
              />
              <InputNumber
                value={newStage.percent}
                min={0}
                max={100}
                aria-label="stage-new-percent"
                onChange={(value) => setNewStage({ ...newStage, percent: Number(value ?? 0) })}
              />
              <Select
                value={newStage.type}
                options={typeOptions}
                aria-label="stage-new-type"
                onChange={(value) => setNewStage({ ...newStage, type: value })}
              />
              <InputNumber
                value={newStage.sort}
                aria-label="stage-new-sort"
                onChange={(value) => setNewStage({ ...newStage, sort: Number(value ?? 0) })}
              />
              <Button
                type="primary"
                loading={create.isPending}
                disabled={newStage.name.trim() === ''}
                aria-label="stage-new-submit"
                onClick={() => create.mutate(newStage)}
              >
                {t('stage.action.create')}
              </Button>
              <Typography.Text type="secondary" className="tw:text-xs">
                {projectModelLabels}
              </Typography.Text>
            </Space>
          </HasPerm>
        )}
      />
      {create.error ? (
        <Typography.Paragraph type="danger">{errorText(create.error, t, 'common.message.failed')}</Typography.Paragraph>
      ) : null}
    </PageContainer>
  )
}
