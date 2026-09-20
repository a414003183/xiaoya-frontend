/** @route /projects/:projectId/members @title project.title.members @perm project-view @hide @activeMenu /projects */
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Card, PageContainer, PageHeader } from '@zentao/design-system'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { fetchProjectMembers, qk, submitProjectMembersAction } from '../api/project.api'
import { MemberTable } from '../components/member-table'

/** 项目团队成员（T-5 / project §6 B 范式：整表可编辑，保存 = 全量提交，逐项结果提示）。 */
export default function ProjectMemberPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const projectId = Number(useParams().projectId)

  const members = useQuery({
    queryKey: qk.project.members(projectId),
    queryFn: () => fetchProjectMembers(projectId, { limit: 200 }),
  })

  return (
    <PageContainer>
      <PageHeader title={t('project.title.members')} backTo={`/projects/${projectId}`} />
      <Card>
        <MemberTable
          members={members.data?.items ?? []}
          loading={members.isPending}
          onSubmit={(rows) => submitProjectMembersAction(projectId, rows)}
          onSaved={() => void queryClient.invalidateQueries({ queryKey: ['listProjectMembers'] })}
        />
      </Card>
    </PageContainer>
  )
}
