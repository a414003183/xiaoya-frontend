import { ok } from '@zentao/api-client'
import {
  activateExecution,
  activateProgram,
  activateProject,
  addProjectStakeholder,
  closeExecution,
  closeProgram,
  closeProject,
  createExecution,
  createProgram,
  createProject,
  delayExecution,
  delayProgram,
  delayProject,
  deleteExecution,
  deleteProgram,
  deleteProject,
  getDict,
  getExecution,
  getProgram,
  getProject,
  getProjectWhitelist,
  linkProjectStories,
  listExecutionActivities,
  listExecutionMembers,
  listExecutionStories,
  listExecutions,
  listProgramProducts,
  listProgramProjects,
  listPrograms,
  listProjectActivities,
  listProjectExecutions,
  listProjectMembers,
  listProjectProducts,
  listProjectStakeholders,
  listProjectStories,
  listProjects,
  listSubPrograms,
  removeProjectStakeholder,
  replaceProjectProducts,
  replaceProjectWhitelist,
  resumeExecution,
  resumeProgram,
  resumeProject,
  startExecution,
  startProgram,
  startProject,
  submitExecutionMembers,
  submitProjectMembers,
  suspendExecution,
  suspendProgram,
  suspendProject,
  unlinkProjectStory,
  updateExecution,
  updateProgram,
  updateProject,
} from '@zentao/api-client/generated'
import type { ActivityView } from '@zentao/api-client/generated/model/activityView'
import type { ListExecutionMembersParams } from '@zentao/api-client/generated/model/listExecutionMembersParams'
import type { ListExecutionStoriesParams } from '@zentao/api-client/generated/model/listExecutionStoriesParams'
import type { ListExecutionsParams } from '@zentao/api-client/generated/model/listExecutionsParams'
import type { ListProgramProductsParams } from '@zentao/api-client/generated/model/listProgramProductsParams'
import type { ListProgramProjectsParams } from '@zentao/api-client/generated/model/listProgramProjectsParams'
import type { ListProgramsParams } from '@zentao/api-client/generated/model/listProgramsParams'
import type { ListProjectExecutionsParams } from '@zentao/api-client/generated/model/listProjectExecutionsParams'
import type { ListProjectMembersParams } from '@zentao/api-client/generated/model/listProjectMembersParams'
import type { ListProjectProductsParams } from '@zentao/api-client/generated/model/listProjectProductsParams'
import type { ListProjectStakeholdersParams } from '@zentao/api-client/generated/model/listProjectStakeholdersParams'
import type { ListProjectStoriesParams } from '@zentao/api-client/generated/model/listProjectStoriesParams'
import type { ListProjectsParams } from '@zentao/api-client/generated/model/listProjectsParams'
import type { ListSubProgramsParams } from '@zentao/api-client/generated/model/listSubProgramsParams'
import type { ProductView } from '@zentao/api-client/generated/model/productView'
import type { ProjectView } from '@zentao/api-client/generated/model/projectView'
import type { StakeholderView } from '@zentao/api-client/generated/model/stakeholderView'
import type { StoryView } from '@zentao/api-client/generated/model/storyView'
import type { TeamMemberInput } from '@zentao/api-client/generated/model/teamMemberInput'
import type { TeamMemberView } from '@zentao/api-client/generated/model/teamMemberView'
import { buildListParams, type ListDsl } from '../../../shared/list-dsl'
import { type DomainMeta, fetchMeta } from '../../../shared/meta'

/** project 域数据入口（01 §3.2：域内唯一数据入口，orval 封装 + qk 工厂）。 */

export type { ActivityView, ProductView, ProjectView, StakeholderView, StoryView, TeamMemberInput, TeamMemberView }

export type ActivityPage = { items: ActivityView[]; hasMore: boolean }
export type ListResult<T> = { items: T[]; total: number }
export type AccountOption = { account: string; realName: string }
/** 三型（program/project/execution）共用一表，页面与动作壳按 kind 复用一个入口。 */
export type ProjectKind = 'program' | 'project' | 'execution'
export type ProjectAction = 'start' | 'suspend' | 'resume' | 'delay' | 'close' | 'activate'
export const PROJECT_ACTIONS: readonly ProjectAction[] = ['start', 'suspend', 'resume', 'delay', 'close', 'activate']
export type LinkResultItem = { id: number; ok: boolean; error?: string | null }
export type MemberResultItem = { account: string; ok: boolean; error?: string | null }

// ── 项目集 ──

export async function fetchPrograms(dsl: ListDsl<ListProgramsParams> = {}): Promise<ListResult<ProjectView>> {
  return ok(await listPrograms(buildListParams<ListProgramsParams>(dsl))).data
}

export async function fetchProgram(programId: number): Promise<ProjectView> {
  return ok(await getProgram(programId)).data
}

export async function submitProgram(body: Record<string, unknown>): Promise<ProjectView> {
  return ok(await createProgram(body as never)).data
}

export async function patchProgram(programId: number, body: Record<string, unknown>): Promise<ProjectView> {
  return ok(await updateProgram(programId, body as never)).data
}

export async function fetchSubPrograms(
  programId: number,
  dsl: ListDsl<ListSubProgramsParams> = {},
): Promise<ListResult<ProjectView>> {
  return ok(await listSubPrograms(programId, buildListParams<ListSubProgramsParams>(dsl))).data
}

export async function fetchProgramProjects(
  programId: number,
  dsl: ListDsl<ListProgramProjectsParams> = {},
): Promise<ListResult<ProjectView>> {
  return ok(await listProgramProjects(programId, buildListParams<ListProgramProjectsParams>(dsl))).data
}

export async function fetchProgramProducts(
  programId: number,
  dsl: ListDsl<ListProgramProductsParams> = {},
): Promise<ListResult<ProductView>> {
  return ok(await listProgramProducts(programId, buildListParams<ListProgramProductsParams>(dsl))).data
}

/** 软删项目集（守卫：存在未删子项目集/子项目 → 42203）。 */
export async function deleteProgramAction(programId: number): Promise<null> {
  return ok(await deleteProgram(programId)).data
}

export const fetchProgramMeta = (): Promise<DomainMeta> => fetchMeta('program')

// ── 项目 ──

export async function fetchProjects(dsl: ListDsl<ListProjectsParams> = {}): Promise<ListResult<ProjectView>> {
  return ok(await listProjects(buildListParams<ListProjectsParams>(dsl))).data
}

export async function fetchProject(projectId: number): Promise<ProjectView> {
  return ok(await getProject(projectId)).data
}

export async function submitProject(body: Record<string, unknown>): Promise<ProjectView> {
  return ok(await createProject(body as never)).data
}

export async function patchProject(projectId: number, body: Record<string, unknown>): Promise<ProjectView> {
  return ok(await updateProject(projectId, body as never)).data
}

/** 软删项目（守卫：存在未删执行或未删关联需求 → 42203）。 */
export async function deleteProjectAction(projectId: number): Promise<null> {
  return ok(await deleteProject(projectId)).data
}

export async function fetchProjectProducts(
  projectId: number,
  dsl: ListDsl<ListProjectProductsParams> = {},
): Promise<ListResult<ProductView>> {
  return ok(await listProjectProducts(projectId, buildListParams<ListProjectProductsParams>(dsl))).data
}

export async function replaceProjectProductsAction(projectId: number, productIds: number[]): Promise<number[]> {
  return ok(await replaceProjectProducts(projectId, { productIds })).data.productIds
}

export async function fetchProjectExecutions(
  projectId: number,
  dsl: ListDsl<ListProjectExecutionsParams> = {},
): Promise<ListResult<ProjectView>> {
  return ok(await listProjectExecutions(projectId, buildListParams<ListProjectExecutionsParams>(dsl))).data
}

export async function submitExecution(projectId: number, body: Record<string, unknown>): Promise<ProjectView> {
  return ok(await createExecution(projectId, body as never)).data
}

export async function fetchProjectStories(
  projectId: number,
  dsl: ListDsl<ListProjectStoriesParams> = {},
): Promise<ListResult<StoryView>> {
  return ok(await listProjectStories(projectId, buildListParams<ListProjectStoriesParams>(dsl))).data
}

export async function linkProjectStoriesAction(projectId: number, storyIds: number[]): Promise<LinkResultItem[]> {
  return ok(await linkProjectStories(projectId, { storyIds })).data.results.map((item) => ({
    id: item.id,
    ok: item.ok,
    error: item.error ?? null,
  }))
}

/** 解除项目-需求关联（B-PRJ-06：删 project_story 行，幂等，不影响需求本身）。 */
export async function unlinkProjectStoryAction(projectId: number, storyId: number): Promise<null> {
  return ok(await unlinkProjectStory(projectId, storyId)).data
}

export async function fetchProjectMembers(
  projectId: number,
  dsl: ListDsl<ListProjectMembersParams> = {},
): Promise<ListResult<TeamMemberView>> {
  return ok(await listProjectMembers(projectId, buildListParams<ListProjectMembersParams>(dsl))).data
}

export async function submitProjectMembersAction(
  projectId: number,
  members: TeamMemberInput[],
): Promise<MemberResultItem[]> {
  return ok(await submitProjectMembers(projectId, { members } as never)).data.results.map(toMemberResult)
}

export async function fetchProjectStakeholders(
  projectId: number,
  dsl: ListDsl<ListProjectStakeholdersParams> = {},
): Promise<ListResult<StakeholderView>> {
  return ok(await listProjectStakeholders(projectId, buildListParams<ListProjectStakeholdersParams>(dsl))).data
}

export async function addProjectStakeholderAction(
  projectId: number,
  body: Record<string, unknown>,
): Promise<StakeholderView> {
  return ok(await addProjectStakeholder(projectId, body as never)).data
}

export async function removeProjectStakeholderAction(projectId: number, stakeholderId: number): Promise<null> {
  return ok(await removeProjectStakeholder(projectId, stakeholderId)).data
}

export async function fetchProjectWhitelist(projectId: number): Promise<string[]> {
  return ok(await getProjectWhitelist(projectId)).data.accounts
}

export async function replaceProjectWhitelistAction(projectId: number, accounts: string[]): Promise<string[]> {
  return ok(await replaceProjectWhitelist(projectId, { accounts })).data.accounts
}

export async function fetchProjectActivities(projectId: number, beforeId?: number): Promise<ActivityPage> {
  const params = beforeId === undefined ? { limit: 50 } : { limit: 50, beforeId }
  return ok(await listProjectActivities(projectId, params)).data
}

export const fetchProjectMeta = (): Promise<DomainMeta> => fetchMeta('project')

// ── 执行 ──

export async function fetchExecutions(dsl: ListDsl<ListExecutionsParams> = {}): Promise<ListResult<ProjectView>> {
  return ok(await listExecutions(buildListParams<ListExecutionsParams>(dsl))).data
}

export async function fetchExecution(executionId: number): Promise<ProjectView> {
  return ok(await getExecution(executionId)).data
}

export async function patchExecution(executionId: number, body: Record<string, unknown>): Promise<ProjectView> {
  return ok(await updateExecution(executionId, body as never)).data
}

/** 软删执行（守卫：存在未删任务 → 42203）。 */
export async function deleteExecutionAction(executionId: number): Promise<null> {
  return ok(await deleteExecution(executionId)).data
}

export async function fetchExecutionMembers(
  executionId: number,
  dsl: ListDsl<ListExecutionMembersParams> = {},
): Promise<ListResult<TeamMemberView>> {
  return ok(await listExecutionMembers(executionId, buildListParams<ListExecutionMembersParams>(dsl))).data
}

/** 执行维度关联需求（§5：project_story 反查；task 表单的需求选择器经域出口消费）。 */
export async function fetchExecutionStories(
  executionId: number,
  dsl: ListDsl<ListExecutionStoriesParams> = {},
): Promise<ListResult<StoryView>> {
  return ok(await listExecutionStories(executionId, buildListParams<ListExecutionStoriesParams>(dsl))).data
}

/** 执行动态流（B-PRJ-07：游标倒序，ActivityTimeline 注入）。 */
export async function fetchExecutionActivities(executionId: number, beforeId?: number): Promise<ActivityPage> {
  const params = beforeId === undefined ? { limit: 50 } : { limit: 50, beforeId }
  return ok(await listExecutionActivities(executionId, params)).data
}

export async function submitExecutionMembersAction(
  executionId: number,
  members: TeamMemberInput[],
): Promise<MemberResultItem[]> {
  return ok(await submitExecutionMembers(executionId, { members } as never)).data.results.map(toMemberResult)
}

export const fetchExecutionMeta = (): Promise<DomainMeta> => fetchMeta('execution')

// ── 六动作合一（§4：program/project/execution 三型同构，页面与动作弹窗共用一个入口） ──

export async function runProjectAction(
  kind: ProjectKind,
  id: number,
  action: ProjectAction,
  body: Record<string, unknown>,
): Promise<ProjectView> {
  const request = body as never
  if (kind === 'program') {
    switch (action) {
      case 'start':
        return ok(await startProgram(id, request)).data
      case 'suspend':
        return ok(await suspendProgram(id, request)).data
      case 'resume':
        return ok(await resumeProgram(id, request)).data
      case 'delay':
        return ok(await delayProgram(id, request)).data
      case 'close':
        return ok(await closeProgram(id, request)).data
      case 'activate':
        return ok(await activateProgram(id, request)).data
    }
  }
  if (kind === 'project') {
    switch (action) {
      case 'start':
        return ok(await startProject(id, request)).data
      case 'suspend':
        return ok(await suspendProject(id, request)).data
      case 'resume':
        return ok(await resumeProject(id, request)).data
      case 'delay':
        return ok(await delayProject(id, request)).data
      case 'close':
        return ok(await closeProject(id, request)).data
      case 'activate':
        return ok(await activateProject(id, request)).data
    }
  }
  switch (action) {
    case 'start':
      return ok(await startExecution(id, request)).data
    case 'suspend':
      return ok(await suspendExecution(id, request)).data
    case 'resume':
      return ok(await resumeExecution(id, request)).data
    case 'delay':
      return ok(await delayExecution(id, request)).data
    case 'close':
      return ok(await closeExecution(id, request)).data
    case 'activate':
      return ok(await activateExecution(id, request)).data
  }
}

/** 三型刷新（动作/编辑/关联后统一失效，页面不各写一份）。 */
export const PROJECT_QUERY_ROOTS = [
  'listPrograms',
  'getProgram',
  'listSubPrograms',
  'listProgramProjects',
  'listProjects',
  'getProject',
  'listProjectExecutions',
  'listExecutions',
  'getExecution',
] as const

// ── 字典（账号选择器：pm/po/qd/rd/whitelist/成员/干系人） ──

export async function fetchAccountOptions(): Promise<AccountOption[]> {
  const data = ok(await getDict('accounts')).data
  return data.items.map((item) => ({
    account: String(item.account ?? ''),
    realName: String(item.realName ?? item.account ?? ''),
  }))
}

function toMemberResult(item: { account: string; ok: boolean; error?: string | null }): MemberResultItem {
  return { account: item.account, ok: item.ok, error: item.error ?? null }
}

// ── query key 工厂（02 §4） ──

export const qk = {
  program: {
    list: (params: unknown) => ['listPrograms', params] as const,
    detail: (programId: number) => ['getProgram', programId] as const,
    subPrograms: (programId: number) => ['listSubPrograms', programId] as const,
    projects: (programId: number) => ['listProgramProjects', programId] as const,
    products: (programId: number) => ['listProgramProducts', programId] as const,
    meta: () => ['meta', 'program'] as const,
  },
  project: {
    list: (params: unknown) => ['listProjects', params] as const,
    detail: (projectId: number) => ['getProject', projectId] as const,
    products: (projectId: number) => ['listProjectProducts', projectId] as const,
    stories: (projectId: number) => ['listProjectStories', projectId] as const,
    executions: (projectId: number) => ['listProjectExecutions', projectId] as const,
    members: (projectId: number) => ['listProjectMembers', projectId] as const,
    stakeholders: (projectId: number) => ['listProjectStakeholders', projectId] as const,
    whitelist: (projectId: number) => ['getProjectWhitelist', projectId] as const,
    activities: (projectId: number) => ['listProjectActivities', projectId] as const,
    meta: () => ['meta', 'project'] as const,
  },
  execution: {
    list: (params: unknown) => ['listExecutions', params] as const,
    detail: (executionId: number) => ['getExecution', executionId] as const,
    members: (executionId: number) => ['listExecutionMembers', executionId] as const,
    stories: (executionId: number) => ['listExecutionStories', executionId] as const,
    activities: (executionId: number) => ['listExecutionActivities', executionId] as const,
    meta: () => ['meta', 'execution'] as const,
  },
} as const
