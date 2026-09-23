import { ok } from '@zentao/api-client'
import {
  batchCreateAccounts,
  changeAccountPassword,
  copyRole as copyRoleRequest,
  createAccount,
  createDepartment,
  createRole,
  deleteAccount,
  deleteDepartment,
  deleteRole as deleteRoleRequest,
  disableAccount,
  enableAccount,
  getAccount,
  getDepartmentTree,
  getRole,
  getRoleMembers,
  getRolePrivileges,
  listAccountActivities,
  listAccounts,
  listDepartments,
  listGrantableMenus,
  listPersonnelMembers,
  listPersonnelWorkload,
  listRoles,
  resetAccountPassword,
  saveRoleMembers as saveRoleMembersRequest,
  saveRolePrivileges as saveRolePrivilegesRequest,
  unlockAccount,
  updateAccount,
  updateDepartment as updateDepartmentRequest,
  updateRole as updateRoleRequest,
} from '@zentao/api-client/generated'
import type { AccountView } from '@zentao/api-client/generated/model/accountView'
import type { ActivityView } from '@zentao/api-client/generated/model/activityView'
import type { CommentView } from '@zentao/api-client/generated/model/commentView'
import type { DepartmentNode } from '@zentao/api-client/generated/model/departmentNode'
import type { ListAccountsParams } from '@zentao/api-client/generated/model/listAccountsParams'
import type { ListDepartmentsParams } from '@zentao/api-client/generated/model/listDepartmentsParams'
import type { ListPersonnelMembersParams } from '@zentao/api-client/generated/model/listPersonnelMembersParams'
import type { ListPersonnelWorkloadParams } from '@zentao/api-client/generated/model/listPersonnelWorkloadParams'
import type { MenuTree } from '@zentao/api-client/generated/model/menuTree'
import type { PersonnelMemberView } from '@zentao/api-client/generated/model/personnelMemberView'
import type { PersonnelWorkloadView } from '@zentao/api-client/generated/model/personnelWorkloadView'
import type { RoleAcl } from '@zentao/api-client/generated/model/roleAcl'
import type { RoleView } from '@zentao/api-client/generated/model/roleView'
import { buildListParams, type ListDsl } from '../../../shared/list-dsl'

/** org 域数据入口（01 §3.2：域内唯一数据入口）。 */

export type {
  AccountView,
  ActivityView,
  CommentView,
  DepartmentNode,
  PersonnelMemberView,
  PersonnelWorkloadView,
  RoleAcl,
  RoleView,
}

export async function fetchAccounts(params?: ListAccountsParams): Promise<{ items: AccountView[]; total: number }> {
  return ok(await listAccounts(params)).data
}

export async function fetchAccount(accountId: number): Promise<AccountView> {
  return ok(await getAccount(accountId)).data
}

export async function submitAccount(body: Record<string, unknown>): Promise<AccountView> {
  return ok(await createAccount(body as never)).data
}

export type BatchResultItem = { index: number; ok: boolean; id?: number | null; error?: string | null }

export async function submitBatchAccounts(items: Record<string, unknown>[]): Promise<{ results: BatchResultItem[] }> {
  const data = ok(await batchCreateAccounts({ items: items as never })).data
  return { results: data.results }
}

export async function patchAccount(accountId: number, body: Record<string, unknown>): Promise<AccountView> {
  return ok(await updateAccount(accountId, body as never)).data
}

export const disableAccountAction = disableAccount
export const enableAccountAction = enableAccount
export const unlockAccountAction = unlockAccount
export const deleteAccountAction = deleteAccount
export const resetPasswordAction = resetAccountPassword
export const changePasswordAction = changeAccountPassword

/** 本人改密（org §5 password：accountId 必须 = 当前账号，旧密码服务端校验）。 */
export async function submitPasswordChange(
  accountId: number,
  oldPassword: string,
  newPassword: string,
): Promise<AccountView> {
  return ok(await changeAccountPassword(accountId, { oldPassword, newPassword })).data
}

/** 管理员重置密码（org §5 reset-password，免旧密码）。 */
export async function submitPasswordReset(accountId: number, newPassword: string): Promise<AccountView> {
  return ok(await resetAccountPassword(accountId, { newPassword })).data
}

/** 软删账号（DELETE /accounts/{id}；守卫 ≠ 本人/内置 admin）。 */
export async function submitAccountDelete(accountId: number): Promise<AccountView> {
  return ok(await deleteAccount(accountId)).data
}

export async function fetchDepartmentTree(): Promise<DepartmentNode[]> {
  return ok(await getDepartmentTree()).data.items
}

// ── 部门（org §5：平铺列表 + 单节点增改删；整树端点保留供 API 集成，前端不接线） ──

/** 部门平铺列表（GET /departments：page/limit/sort + q + filters[parentId]/[grade]，服务端分页；行含 parentName）。 */
export async function fetchDepartments(
  dsl: ListDsl<ListDepartmentsParams> = {},
): Promise<{ items: DepartmentNode[]; total: number }> {
  return ok(await listDepartments(buildListParams<ListDepartmentsParams>(dsl))).data
}

/** 新建部门（POST /departments：parentId 缺省 null = 根部门；sort 空值即不下发，服务端取 0）。 */
export async function submitDepartment(body: {
  name: string
  parentId?: number | null
  sort?: number | null
  manager?: string | null
}): Promise<DepartmentNode> {
  return ok(
    await createDepartment({
      name: body.name,
      parentId: body.parentId ?? null,
      ...(body.sort === null || body.sort === undefined ? {} : { sort: body.sort }),
      manager: body.manager ?? null,
    }),
  ).data
}

/**
 * 重命名/移动/改负责人/改排序（PATCH /departments/{id}：字段 null = 不修改，故移动到根部门无法表达）。
 * lockVersion 缺省不传：DepartmentNode 视图不含该字段，服务端缺省即跳过乐观锁校验。
 */
export async function updateDepartment(
  departmentId: number,
  body: { name?: string | null; parentId?: number | null; sort?: number | null; manager?: string | null },
): Promise<DepartmentNode> {
  return ok(await updateDepartmentRequest(departmentId, body)).data
}

/** 真实删除（DELETE /departments/{id}：有子部门或有成员 → 42203）。 */
export async function deleteDepartmentAction(departmentId: number): Promise<null> {
  return ok(await deleteDepartment(departmentId)).data
}

export async function fetchAccountActivities(
  accountId: number,
  params?: { limit?: number; beforeId?: number },
): Promise<{ items: ActivityView[]; hasMore: boolean }> {
  return ok(await listAccountActivities(accountId, params)).data
}

/** 角色列表（GET /roles：全量返回，按 sort 升序；角色是配置级小列表，不服务端分页）。 */
export async function fetchRoles(): Promise<{ items: RoleView[]; total: number }> {
  return ok(await listRoles()).data
}

export async function fetchRole(roleId: number): Promise<RoleView> {
  return ok(await getRole(roleId)).data
}

export async function fetchRoleMembers(roleId: number): Promise<{ items: AccountView[]; total: number }> {
  return ok(await getRoleMembers(roleId)).data
}

export async function fetchRolePrivileges(roleId: number): Promise<{ codes: string[] }> {
  return ok(await getRolePrivileges(roleId)).data
}

export async function saveRolePrivileges(roleId: number, codes: string[]): Promise<{ codes: string[] }> {
  return ok(await saveRolePrivilegesRequest(roleId, { codes })).data
}

export async function saveRoleMembers(
  roleId: number,
  accountIds: number[],
): Promise<{ items: AccountView[]; total: number }> {
  return ok(await saveRoleMembersRequest(roleId, { accountIds })).data
}

/** 角色授权页的可勾选菜单树（T22）：与菜单管理同一棵树（含按钮节点），读码 role-priv-edit。 */
export async function fetchGrantableMenus(): Promise<MenuTree> {
  return ok(await listGrantableMenus()).data
}

/** 新建角色（name 必填且唯一；code 可选、给了要合法且唯一）。 */
export async function submitRole(body: {
  name: string
  code?: string | null
  description?: string | null
}): Promise<RoleView> {
  return ok(
    await createRole({
      name: body.name,
      ...(body.code === undefined || body.code === null || body.code === '' ? {} : { code: body.code }),
      ...(body.description === undefined || body.description === null ? {} : { description: body.description }),
    }),
  ).data
}

/** 改名/改描述/改排序/数据权限 acl（PATCH /roles/{id}：null = 不修改；lockVersion 必带）。 */
export async function updateRole(roleId: number, body: Record<string, unknown>): Promise<RoleView> {
  return ok(await updateRoleRequest(roleId, body as never)).data
}

/** 复制角色（copyPrivileges/copyMembers 各自生效，源角色不变）。 */
export async function copyRole(
  roleId: number,
  body: { name: string; description?: string | null; copyPrivileges: boolean; copyMembers: boolean },
): Promise<RoleView> {
  return ok(await copyRoleRequest(roleId, body)).data
}

/** 删除角色（内置角色 42203；超管角色 42203）。 */
export async function deleteRole(roleId: number): Promise<null> {
  return ok(await deleteRoleRequest(roleId)).data
}

// ── 人员管理（org 卡 §5 Personnel 节：无表只读聚合，跨域计数由后端 TaskApi/BugApi 供给） ──

export async function fetchPersonnelMembers(
  params?: ListPersonnelMembersParams,
): Promise<{ items: PersonnelMemberView[]; total: number }> {
  return ok(await listPersonnelMembers(params)).data
}

/** filters[date]=a..b 为必填区间（缺失/倒置 → 40001，由调用方按 ApiError 呈现）。 */
export async function fetchPersonnelWorkload(
  params: ListPersonnelWorkloadParams,
): Promise<{ items: PersonnelWorkloadView[]; total: number }> {
  return ok(await listPersonnelWorkload(params)).data
}
