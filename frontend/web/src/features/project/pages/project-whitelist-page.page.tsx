/** @route /projects/:projectId/whitelist @title project.title.whitelist @perm project-view @hide @activeMenu /projects */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorText } from '@zentao/api-client'
import {
  Button,
  Card,
  HasPerm,
  PageContainer,
  PageHeader,
  Select,
  Space,
  Typography,
  useMessage,
} from '@zentao/design-system'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import {
  fetchAccountOptions,
  fetchProject,
  fetchProjectWhitelist,
  qk,
  replaceProjectWhitelistAction,
} from '../api/project.api'

/** 项目白名单（T-5 / project §3.1：账号多选，保存 = 全量替换 acl_entry；acl≠private 时仅存档不生效）。 */
export default function ProjectWhitelistPage() {
  const message = useMessage()
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const projectId = Number(useParams().projectId)
  const [accounts, setAccounts] = useState<string[]>([])

  const whitelist = useQuery({
    queryKey: qk.project.whitelist(projectId),
    queryFn: () => fetchProjectWhitelist(projectId),
  })
  const project = useQuery({ queryKey: qk.project.detail(projectId), queryFn: () => fetchProject(projectId) })
  const options = useQuery({ queryKey: ['getDict', 'accounts'], queryFn: fetchAccountOptions })

  useEffect(() => {
    if (whitelist.data) {
      setAccounts(whitelist.data)
    }
  }, [whitelist.data])

  const save = useMutation({
    mutationFn: () => replaceProjectWhitelistAction(projectId, accounts),
    onSuccess: (saved) => {
      message.success(t('common.message.saved'))
      setAccounts(saved)
      void queryClient.invalidateQueries({ queryKey: ['getProjectWhitelist'] })
      void queryClient.invalidateQueries({ queryKey: ['getProject'] })
    },
  })

  return (
    <PageContainer variant="narrow">
      <PageHeader
        title={t('project.title.whitelist')}
        backTo={`/projects/${projectId}`}
        extra={
          <HasPerm perm="project-whitelist">
            <Button type="primary" loading={save.isPending} onClick={() => save.mutate()}>
              {t('common.action.save')}
            </Button>
          </HasPerm>
        }
      />
      <Card>
        <Space direction="vertical" className="tw:w-full">
          <Typography.Text type="secondary">
            {project.data?.acl === 'private'
              ? t('project.message.whitelistActive')
              : t('project.message.whitelistIdle')}
          </Typography.Text>
          <Select
            mode="multiple"
            allowClear
            showSearch
            optionFilterProp="label"
            className="tw:w-full"
            aria-label="project-whitelist-accounts"
            placeholder={t('project.field.whitelist')}
            loading={whitelist.isPending}
            value={accounts}
            options={(options.data ?? []).map((account) => ({
              value: account.account,
              label: `${account.realName}(${account.account})`,
            }))}
            onChange={(value) => setAccounts(value)}
          />
          {save.error ? (
            <Typography.Paragraph type="danger">
              {errorText(save.error, t, 'common.message.failed')}
            </Typography.Paragraph>
          ) : null}
        </Space>
      </Card>
    </PageContainer>
  )
}
