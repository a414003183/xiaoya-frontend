import { HttpResponse, http } from 'msw'
import {
  currentAccount,
  db,
  error,
  FORBIDDEN,
  type MockAccount,
  mockId,
  NOT_FOUND,
  type RoleRow,
  toAccountView,
  toRoleView,
  UNAUTHENTICATED,
} from './db'

const ok = (data: unknown) => HttpResponse.json({ data })
const unauthorized = () => HttpResponse.json(UNAUTHENTICATED, { status: 401 })

function hasPerm(codes: string[]): boolean {
  const account = currentAccount()
  if (!account) {
    return false
  }
  if (account.groupIds.includes(1)) {
    return true
  }
  return db.groups
    .filter((group) => account.groupIds.includes(group.id))
    .flatMap((group) => group.privCodes)
    .some((code) => codes.includes(code))
}

function findAccount(id: number): MockAccount | undefined {
  return db.accounts.find((account) => account.id === id && account.deletedAt === null)
}

/** 组织域 MSW handlers：账号 / 部门树 / 权限组（矩阵、成员、复制）。 */
export const orgHandlers = [
  // ── 账号 ──
  http.get('*/api/v1/accounts', ({ request }) => {
    if (!requireSessionOr401()) {
      return unauthorized()
    }
    if (!hasPerm(['account-view'])) {
      return HttpResponse.json(FORBIDDEN('account-view'), { status: 403 })
    }
    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.toLowerCase()
    const departmentId = url.searchParams.get('filters[departmentId]')
    const status = url.searchParams.get('filters[status]')
    let items = db.accounts.filter((account) => account.deletedAt === null)
    if (status) {
      items = items.filter((account) => account.status === status)
    }
    if (departmentId && departmentId !== '@myDepartment') {
      const prefix = db.departments.find((department) => department.id === Number(departmentId))?.path ?? ''
      const inTree = new Set(
        db.departments.filter((department) => department.path.startsWith(prefix)).map((department) => department.id),
      )
      items = items.filter((account) => account.departmentId != null && inTree.has(account.departmentId))
    }
    if (q) {
      items = items.filter((account) =>
        [account.account, account.realName, account.nickname, account.email]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(q)),
      )
    }
    items = [...items].sort((a, b) => b.id - a.id)
    return ok({ items: items.map(toAccountView), total: items.length })
  }),

  http.post('*/api/v1/accounts', async ({ request }) => {
    if (!requireSessionOr401()) {
      return unauthorized()
    }
    if (!hasPerm(['account-create'])) {
      return HttpResponse.json(FORBIDDEN('account-create'), { status: 403 })
    }
    const body = (await request.json()) as Record<string, unknown> & { account: string }
    if (db.accounts.some((account) => account.account === body.account)) {
      return HttpResponse.json(
        { error: { code: 42201, message: '登录名已存在。', fields: { account: 'duplicate' }, traceId: 'mock' } },
        { status: 422 },
      )
    }
    const account = createMockAccount(body)
    db.accounts.push(account)
    return ok(toAccountView(account))
  }),

  http.post('*/api/v1/accounts/batch', async ({ request }) => {
    if (!requireSessionOr401()) {
      return unauthorized()
    }
    if (!hasPerm(['account-create'])) {
      return HttpResponse.json(FORBIDDEN('account-create'), { status: 403 })
    }
    const body = (await request.json()) as { items: (Record<string, unknown> & { account: string })[] }
    if (body.items.length > 50) {
      return HttpResponse.json(error(42201, '批量上限 50 条。'), { status: 422 })
    }
    const results = body.items.map((item, index) => {
      if (db.accounts.some((account) => account.account === item.account)) {
        return { index, ok: false, id: null, error: 'duplicate' }
      }
      const account = createMockAccount(item)
      db.accounts.push(account)
      return { index, ok: true, id: account.id, error: null }
    })
    return ok({ results })
  }),

  http.get('*/api/v1/accounts/:accountId', ({ params }) => {
    if (!requireSessionOr401()) {
      return unauthorized()
    }
    if (!hasPerm(['account-view'])) {
      return HttpResponse.json(FORBIDDEN('account-view'), { status: 403 })
    }
    const account = findAccount(Number(params.accountId))
    if (!account) {
      return HttpResponse.json(NOT_FOUND, { status: 404 })
    }
    return ok(toAccountView(account))
  }),

  http.patch('*/api/v1/accounts/:accountId', async ({ params, request }) => {
    if (!requireSessionOr401()) {
      return unauthorized()
    }
    if (!hasPerm(['account-edit'])) {
      return HttpResponse.json(FORBIDDEN('account-edit'), { status: 403 })
    }
    const account = findAccount(Number(params.accountId))
    if (!account) {
      return HttpResponse.json(NOT_FOUND, { status: 404 })
    }
    const body = (await request.json()) as Record<string, unknown>
    if ('account' in body) {
      return HttpResponse.json(
        { error: { code: 42201, message: '登录名不可修改。', fields: { account: 'readonly' }, traceId: 'mock' } },
        { status: 422 },
      )
    }
    const editable = [
      'realName',
      'nickname',
      'role',
      'departmentId',
      'email',
      'mobile',
      'phone',
      'gender',
      'birthday',
      'joinedAt',
      'avatarFileId',
    ] as const
    for (const key of editable) {
      if (key in body && body[key] !== null) {
        ;(account as unknown as Record<string, unknown>)[key] = body[key]
      }
    }
    if (Array.isArray(body.groupIds)) {
      account.groupIds = body.groupIds as number[]
    }
    account.updatedAt = new Date().toISOString()
    return ok(toAccountView(account))
  }),

  http.get('*/api/v1/accounts/:accountId/activities', ({ params, request }) => {
    if (!requireSessionOr401()) {
      return unauthorized()
    }
    if (!hasPerm(['account-view'])) {
      return HttpResponse.json(FORBIDDEN('account-view'), { status: 403 })
    }
    const url = new URL(request.url)
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)
    const beforeId = Number(url.searchParams.get('beforeId') ?? Number.MAX_SAFE_INTEGER)
    const items = db.activities
      .filter(
        (activity) =>
          activity.objectType === 'account' && activity.objectId === Number(params.accountId) && activity.id < beforeId,
      )
      .sort((a, b) => b.id - a.id)
      .slice(0, limit)
    return ok({ items, hasMore: items.length === limit })
  }),

  // ── 账号动作端点（org §4 状态机 / §5；A-01 接线补 mock） ──

  http.post('*/api/v1/accounts/:accountId/password', async ({ params, request }) => {
    if (!requireSessionOr401()) {
      return unauthorized()
    }
    // 与后端一致（AccountController.changePassword 无 @RequirePrivilege）：登录即限 @me，无功能码
    const account = findAccount(Number(params.accountId))
    if (!account) {
      return HttpResponse.json(NOT_FOUND, { status: 404 })
    }
    if (account.id !== db.currentAccountId) {
      return HttpResponse.json(error(42203, '只能修改本人的密码。'), { status: 422 })
    }
    const body = (await request.json()) as { oldPassword?: string; newPassword?: string }
    if (body.oldPassword !== account.password) {
      return HttpResponse.json(
        { error: { code: 42201, message: '旧密码不正确。', fields: { oldPassword: 'wrong' }, traceId: 'mock' } },
        { status: 422 },
      )
    }
    if (typeof body.newPassword !== 'string' || body.newPassword.length < 6 || body.newPassword.length > 64) {
      return HttpResponse.json(error(42201, '新密码需为 6–64 位。'), { status: 422 })
    }
    account.password = body.newPassword
    pushActivity(account.id, 'passwordChanged')
    return ok(toAccountView(account))
  }),

  http.post('*/api/v1/accounts/:accountId/reset-password', async ({ params, request }) => {
    if (!requireSessionOr401()) {
      return unauthorized()
    }
    if (!hasPerm(['account-reset-password'])) {
      return HttpResponse.json(FORBIDDEN('account-reset-password'), { status: 403 })
    }
    const account = findAccount(Number(params.accountId))
    if (!account) {
      return HttpResponse.json(NOT_FOUND, { status: 404 })
    }
    const body = (await request.json()) as { newPassword?: string }
    if (typeof body.newPassword !== 'string' || body.newPassword.length < 6 || body.newPassword.length > 64) {
      return HttpResponse.json(error(42201, '新密码需为 6–64 位。'), { status: 422 })
    }
    account.password = body.newPassword
    pushActivity(account.id, 'passwordChanged')
    db.notifications.push({
      id: mockId(),
      recipient: account.account,
      type: 'account-reset-password',
      objectType: 'account',
      objectId: account.id,
      activityId: null,
      title: 'Your password was reset by admin',
      content: null,
      readAt: null,
      createdBy: currentAccount()?.account ?? '',
      createdAt: new Date().toISOString(),
    })
    return ok(toAccountView(account))
  }),

  http.post('*/api/v1/accounts/:accountId/disable', async ({ params, request }) => {
    if (!requireSessionOr401()) {
      return unauthorized()
    }
    if (!hasPerm(['account-disable'])) {
      return HttpResponse.json(FORBIDDEN('account-disable'), { status: 403 })
    }
    const account = findAccount(Number(params.accountId))
    if (!account) {
      return HttpResponse.json(NOT_FOUND, { status: 404 })
    }
    if (account.id === db.currentAccountId || account.account === 'admin') {
      return HttpResponse.json(error(42203, '不可停用本人或内置 admin 账号。'), { status: 422 })
    }
    if (account.status !== 'active') {
      return HttpResponse.json(error(42202, '账号已停用。'), { status: 422 })
    }
    const body = (await request.json().catch(() => ({}))) as { comment?: string | null } | null
    account.status = 'disabled'
    pushActivity(account.id, 'disabled', body?.comment ?? null)
    return ok(toAccountView(account))
  }),

  http.post('*/api/v1/accounts/:accountId/enable', async ({ params, request }) => {
    if (!requireSessionOr401()) {
      return unauthorized()
    }
    if (!hasPerm(['account-enable'])) {
      return HttpResponse.json(FORBIDDEN('account-enable'), { status: 403 })
    }
    const account = findAccount(Number(params.accountId))
    if (!account) {
      return HttpResponse.json(NOT_FOUND, { status: 404 })
    }
    if (account.status !== 'disabled') {
      return HttpResponse.json(error(42202, '账号非停用状态。'), { status: 422 })
    }
    const body = (await request.json().catch(() => ({}))) as { comment?: string | null } | null
    account.status = 'active'
    pushActivity(account.id, 'enabled', body?.comment ?? null)
    return ok(toAccountView(account))
  }),

  http.post('*/api/v1/accounts/:accountId/unlock', ({ params }) => {
    if (!requireSessionOr401()) {
      return unauthorized()
    }
    if (!hasPerm(['account-unlock'])) {
      return HttpResponse.json(FORBIDDEN('account-unlock'), { status: 403 })
    }
    const account = findAccount(Number(params.accountId))
    if (!account) {
      return HttpResponse.json(NOT_FOUND, { status: 404 })
    }
    account.fails = 0
    account.lockedAt = null
    pushActivity(account.id, 'unlocked')
    return ok(toAccountView(account))
  }),

  http.post('*/api/v1/accounts/:accountId/delete', async ({ params, request }) => {
    if (!requireSessionOr401()) {
      return unauthorized()
    }
    if (!hasPerm(['account-delete'])) {
      return HttpResponse.json(FORBIDDEN('account-delete'), { status: 403 })
    }
    const account = findAccount(Number(params.accountId))
    if (!account) {
      return HttpResponse.json(NOT_FOUND, { status: 404 })
    }
    if (account.id === db.currentAccountId || account.account === 'admin') {
      return HttpResponse.json(error(42203, '不可删除本人或内置 admin 账号。'), { status: 422 })
    }
    const body = (await request.json().catch(() => ({}))) as { comment?: string | null } | null
    account.deletedAt = new Date().toISOString()
    pushActivity(account.id, 'deleted', body?.comment ?? null)
    return ok(toAccountView(account))
  }),

  // ── 部门 ──
  http.get('*/api/v1/departments/tree', () => {
    if (!requireSessionOr401()) {
      return unauthorized()
    }
    if (!hasPerm(['department-view'])) {
      return HttpResponse.json(FORBIDDEN('department-view'), { status: 403 })
    }
    return ok({ items: buildTree(null) })
  }),

  // 平铺列表（GET /departments：page/limit/sort + q + filters[parentId]/[grade]，行含 parentName）
  http.get('*/api/v1/departments', ({ request }) => {
    if (!requireSessionOr401()) {
      return unauthorized()
    }
    if (!hasPerm(['department-view'])) {
      return HttpResponse.json(FORBIDDEN('department-view'), { status: 403 })
    }
    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.toLowerCase()
    const parentId = url.searchParams.get('filters[parentId]')
    const grade = url.searchParams.get('filters[grade]')
    let items = [...db.departments]
    if (parentId) {
      const wanted = new Set(parentId.split(',').map(Number))
      items = items.filter((department) => department.parentId !== null && wanted.has(department.parentId))
    }
    if (grade) {
      items = items.filter((department) => String(department.grade) === grade)
    }
    if (q) {
      items = items.filter((department) => department.name.toLowerCase().includes(q))
    }
    items = sortDepartments(items, url.searchParams.get('sort'))
    const names = new Map(db.departments.map((department) => [department.id, department.name]))
    return ok(
      paginate(
        items.map((department) => flatNode(department, names)),
        url,
      ),
    )
  }),

  http.post('*/api/v1/departments', async ({ request }) => {
    if (!requireSessionOr401()) {
      return unauthorized()
    }
    if (!hasPerm(['department-create'])) {
      return HttpResponse.json(FORBIDDEN('department-create'), { status: 403 })
    }
    const body = (await request.json()) as {
      name: string
      parentId?: number | null
      sort?: number
      manager?: string | null
    }
    const parent = body.parentId ? db.departments.find((department) => department.id === body.parentId) : undefined
    if (body.parentId && !parent) {
      return HttpResponse.json(
        { error: { code: 42201, message: '上级部门不存在。', fields: { parentId: 'notFound' }, traceId: 'mock' } },
        { status: 422 },
      )
    }
    const id = mockId()
    db.departments.push({
      id,
      name: body.name,
      parentId: body.parentId ?? null,
      path: `${parent?.path ?? ','}${id},`,
      grade: (parent?.grade ?? 0) + 1,
      sort: body.sort ?? 0,
      manager: body.manager ?? null,
    })
    const created = db.departments.find((department) => department.id === id)
    if (!created) {
      return HttpResponse.json(NOT_FOUND, { status: 404 })
    }
    return ok(nodeOf(created))
  }),

  http.patch('*/api/v1/departments/:departmentId', async ({ params, request }) => {
    if (!requireSessionOr401()) {
      return unauthorized()
    }
    if (!hasPerm(['department-edit'])) {
      return HttpResponse.json(FORBIDDEN('department-edit'), { status: 403 })
    }
    const department = db.departments.find((item) => item.id === Number(params.departmentId))
    if (!department) {
      return HttpResponse.json(NOT_FOUND, { status: 404 })
    }
    const body = (await request.json()) as {
      name?: string | null
      parentId?: number | null
      sort?: number | null
      manager?: string | null
    }
    if (body.name) {
      department.name = body.name
    }
    if (body.parentId !== undefined && body.parentId !== null) {
      const parent = db.departments.find((item) => item.id === body.parentId)
      if (!parent) {
        return HttpResponse.json(error(42201, '上级部门不存在。'), { status: 422 })
      }
      if (parent.path.includes(`,${department.id},`)) {
        return HttpResponse.json(error(42203, '不能移动到自身或后代。'), { status: 422 })
      }
      department.parentId = parent.id
      // 移动后子树 path/grade 级联重算（与后端 UpdateDepartmentHandler 同口径）
      recomputePaths()
    }
    if (body.sort !== undefined && body.sort !== null) {
      department.sort = body.sort
    }
    if (body.manager !== undefined) {
      department.manager = body.manager
    }
    return ok(nodeOf(department))
  }),

  http.put('*/api/v1/departments/tree', async ({ request }) => {
    if (!requireSessionOr401()) {
      return unauthorized()
    }
    if (!hasPerm(['department-edit'])) {
      return HttpResponse.json(FORBIDDEN('department-edit'), { status: 403 })
    }
    const body = (await request.json()) as {
      nodes: { id?: number | null; parentId?: number | null; name: string; sort?: number; manager?: string | null }[]
    }
    for (const node of body.nodes) {
      if (node.id) {
        const department = db.departments.find((item) => item.id === node.id)
        if (department) {
          department.name = node.name
          department.sort = node.sort ?? department.sort
          if (node.parentId !== undefined) {
            department.parentId = node.parentId
          }
          if (node.manager !== undefined) {
            department.manager = node.manager
          }
        }
      } else {
        const parent = node.parentId ? db.departments.find((item) => item.id === node.parentId) : undefined
        const id = mockId()
        db.departments.push({
          id,
          name: node.name,
          parentId: node.parentId ?? null,
          path: `${parent?.path ?? ','}${id},`,
          grade: (parent?.grade ?? 0) + 1,
          sort: node.sort ?? 0,
          manager: node.manager ?? null,
        })
      }
    }
    // path/grade 重算（整树语义）
    recomputePaths()
    return ok({ items: buildTree(null) })
  }),

  http.delete('*/api/v1/departments/:departmentId', ({ params }) => {
    if (!requireSessionOr401()) {
      return unauthorized()
    }
    if (!hasPerm(['department-delete'])) {
      return HttpResponse.json(FORBIDDEN('department-delete'), { status: 403 })
    }
    const id = Number(params.departmentId)
    const department = db.departments.find((item) => item.id === id)
    if (!department) {
      return HttpResponse.json(NOT_FOUND, { status: 404 })
    }
    if (db.departments.some((item) => item.parentId === id)) {
      return HttpResponse.json(error(42203, '存在子部门。'), { status: 422 })
    }
    if (db.accounts.some((account) => account.departmentId === id && account.deletedAt === null)) {
      return HttpResponse.json(error(42203, '部门下存在成员。'), { status: 422 })
    }
    db.departments = db.departments.filter((item) => item.id !== id)
    return ok(null)
  }),

  // ── 权限组 ──
  http.get('*/api/v1/groups', () => {
    if (!requireSessionOr401()) {
      return unauthorized()
    }
    if (!hasPerm(['group-view'])) {
      return HttpResponse.json(FORBIDDEN('group-view'), { status: 403 })
    }
    return ok({ items: db.groups.map(toGroupView), total: db.groups.length })
  }),

  http.post('*/api/v1/groups', async ({ request }) => {
    if (!requireSessionOr401()) {
      return unauthorized()
    }
    if (!hasPerm(['group-create'])) {
      return HttpResponse.json(FORBIDDEN('group-create'), { status: 403 })
    }
    const body = (await request.json()) as { name: string; description?: string | null }
    if (db.groups.some((group) => group.name === body.name)) {
      return HttpResponse.json(
        { error: { code: 42201, message: '组名已存在。', fields: { name: 'duplicate' }, traceId: 'mock' } },
        { status: 422 },
      )
    }
    const group = {
      id: mockId(),
      name: body.name,
      description: body.description ?? null,
      memberCount: 0,
      privilegeCount: 0,
      createdBy: currentAccount()?.account ?? null,
      createdAt: new Date().toISOString(),
      updatedBy: null,
      updatedAt: null,
      lockVersion: 0,
      memberIds: [],
      privCodes: [],
    }
    db.groups.push(group)
    return ok(toGroupView(group))
  }),

  http.get('*/api/v1/groups/:groupId', ({ params }) => {
    if (!requireSessionOr401()) {
      return unauthorized()
    }
    if (!hasPerm(['group-view'])) {
      return HttpResponse.json(FORBIDDEN('group-view'), { status: 403 })
    }
    const group = db.groups.find((item) => item.id === Number(params.groupId))
    if (!group) {
      return HttpResponse.json(NOT_FOUND, { status: 404 })
    }
    return ok(toGroupView(group))
  }),

  http.patch('*/api/v1/groups/:groupId', async ({ params, request }) => {
    if (!requireSessionOr401()) {
      return unauthorized()
    }
    if (!hasPerm(['group-edit'])) {
      return HttpResponse.json(FORBIDDEN('group-edit'), { status: 403 })
    }
    const group = db.groups.find((item) => item.id === Number(params.groupId))
    if (!group) {
      return HttpResponse.json(NOT_FOUND, { status: 404 })
    }
    const body = (await request.json()) as {
      name?: string | null
      description?: string | null
      acl?: Record<string, number[]> | null
      lockVersion?: number
    }
    if (typeof body.lockVersion === 'number' && body.lockVersion !== group.lockVersion) {
      return HttpResponse.json(error(40901, '数据已被他人修改，请刷新后重试。'), { status: 409 })
    }
    if (body.name && body.name !== group.name) {
      if (db.groups.some((item) => item.name === body.name)) {
        return HttpResponse.json(
          { error: { code: 42201, message: '组名已存在。', fields: { name: 'duplicate' }, traceId: 'mock' } },
          { status: 422 },
        )
      }
      group.name = body.name
    }
    if (body.description !== undefined) {
      group.description = body.description
    }
    // A-08 补口：acl 传对象=整体替换（五键 id 数组），null=不修改
    if (body.acl !== undefined && body.acl !== null) {
      group.acl = { ...(group.acl ?? {}), ...body.acl }
    }
    group.lockVersion += 1
    group.updatedAt = new Date().toISOString()
    group.updatedBy = currentAccount()?.account ?? null
    return ok(toGroupView(group))
  }),

  http.delete('*/api/v1/groups/:groupId', ({ params }) => {
    if (!requireSessionOr401()) {
      return unauthorized()
    }
    if (!hasPerm(['group-delete'])) {
      return HttpResponse.json(FORBIDDEN('group-delete'), { status: 403 })
    }
    const id = Number(params.groupId)
    if (id === 1) {
      return HttpResponse.json(error(42203, '内置超管组不可删除。'), { status: 422 })
    }
    const group = db.groups.find((item) => item.id === id)
    if (!group) {
      return HttpResponse.json(NOT_FOUND, { status: 404 })
    }
    db.groups = db.groups.filter((item) => item.id !== id)
    for (const account of db.accounts) {
      account.groupIds = account.groupIds.filter((groupId) => groupId !== id)
    }
    return ok(null)
  }),

  http.post('*/api/v1/groups/:groupId/copy', async ({ params, request }) => {
    if (!requireSessionOr401()) {
      return unauthorized()
    }
    if (!hasPerm(['group-copy'])) {
      return HttpResponse.json(FORBIDDEN('group-copy'), { status: 403 })
    }
    const source = db.groups.find((item) => item.id === Number(params.groupId))
    if (!source) {
      return HttpResponse.json(NOT_FOUND, { status: 404 })
    }
    const body = (await request.json()) as {
      name: string
      description?: string | null
      copyPrivileges: boolean
      copyMembers: boolean
    }
    if (db.groups.some((group) => group.name === body.name)) {
      return HttpResponse.json(
        { error: { code: 42201, message: '组名已存在。', fields: { name: 'duplicate' }, traceId: 'mock' } },
        { status: 422 },
      )
    }
    const group = {
      id: mockId(),
      name: body.name,
      description: body.description ?? null,
      memberCount: body.copyMembers ? source.memberCount : 0,
      privilegeCount: body.copyPrivileges ? source.privilegeCount : 0,
      createdBy: currentAccount()?.account ?? null,
      createdAt: new Date().toISOString(),
      updatedBy: null,
      updatedAt: null,
      lockVersion: 0,
      acl: {},
      memberIds: body.copyMembers ? [...source.memberIds] : [],
      privCodes: body.copyPrivileges ? [...source.privCodes] : [],
    }
    db.groups.push(group)
    return ok(toGroupView(group))
  }),

  http.get('*/api/v1/groups/:groupId/privileges', ({ params }) => {
    if (!requireSessionOr401()) {
      return unauthorized()
    }
    if (!hasPerm(['group-view'])) {
      return HttpResponse.json(FORBIDDEN('group-view'), { status: 403 })
    }
    const group = db.groups.find((item) => item.id === Number(params.groupId))
    if (!group) {
      return HttpResponse.json(NOT_FOUND, { status: 404 })
    }
    return ok({ codes: group.privCodes })
  }),

  http.put('*/api/v1/groups/:groupId/privileges', async ({ params, request }) => {
    if (!requireSessionOr401()) {
      return unauthorized()
    }
    if (!hasPerm(['group-priv-edit'])) {
      return HttpResponse.json(FORBIDDEN('group-priv-edit'), { status: 403 })
    }
    const group = db.groups.find((item) => item.id === Number(params.groupId))
    if (!group) {
      return HttpResponse.json(NOT_FOUND, { status: 404 })
    }
    const body = (await request.json()) as { codes: string[] }
    group.privCodes = [...body.codes]
    group.privilegeCount = body.codes.length
    return ok({ codes: group.privCodes })
  }),

  http.get('*/api/v1/groups/:groupId/members', ({ params }) => {
    if (!requireSessionOr401()) {
      return unauthorized()
    }
    if (!hasPerm(['group-view'])) {
      return HttpResponse.json(FORBIDDEN('group-view'), { status: 403 })
    }
    const group = db.groups.find((item) => item.id === Number(params.groupId))
    if (!group) {
      return HttpResponse.json(NOT_FOUND, { status: 404 })
    }
    const members = db.accounts.filter((account) => group.memberIds.includes(account.id) && account.deletedAt === null)
    return ok({ items: members.map(toAccountView), total: members.length })
  }),

  http.put('*/api/v1/groups/:groupId/members', async ({ params, request }) => {
    if (!requireSessionOr401()) {
      return unauthorized()
    }
    if (!hasPerm(['group-member-edit'])) {
      return HttpResponse.json(FORBIDDEN('group-member-edit'), { status: 403 })
    }
    const group = db.groups.find((item) => item.id === Number(params.groupId))
    if (!group) {
      return HttpResponse.json(NOT_FOUND, { status: 404 })
    }
    const body = (await request.json()) as { accountIds: number[] }
    const unique = [...new Set(body.accountIds)]
    if (unique.some((id) => !findAccount(id))) {
      return HttpResponse.json(error(42201, '存在无效账号。'), { status: 422 })
    }
    group.memberIds = unique
    group.memberCount = unique.length
    for (const account of db.accounts) {
      const inGroup = unique.includes(account.id)
      if (inGroup && !account.groupIds.includes(group.id)) {
        account.groupIds.push(group.id)
      }
      if (!inGroup && account.groupIds.includes(group.id)) {
        account.groupIds = account.groupIds.filter((id) => id !== group.id)
      }
    }
    const members = db.accounts.filter((account) => unique.includes(account.id))
    return ok({ items: members.map(toAccountView), total: members.length })
  }),

  // ── 账号角色字典（GET/POST/PATCH/DELETE /roles；org §3.4，与 RoleController 同码同守卫） ──

  http.get('*/api/v1/roles', () => {
    if (!requireSessionOr401()) {
      return unauthorized()
    }
    if (!hasPerm(['role-view'])) {
      return HttpResponse.json(FORBIDDEN('role-view'), { status: 403 })
    }
    const items = [...db.roles].sort((a, b) => a.sort - b.sort || a.code.localeCompare(b.code)).map(toRoleView)
    return ok({ items, total: items.length })
  }),

  http.post('*/api/v1/roles', async ({ request }) => {
    if (!requireSessionOr401()) {
      return unauthorized()
    }
    if (!hasPerm(['role-manage'])) {
      return HttpResponse.json(FORBIDDEN('role-manage'), { status: 403 })
    }
    const body = (await request.json()) as { code: string; labels?: Record<string, string>; sort?: number | null }
    if (!/^[a-z][a-z0-9-]{1,15}$/.test(body.code ?? '')) {
      return HttpResponse.json(
        { error: { code: 42201, message: '角色码格式不合法。', fields: { code: 'pattern' }, traceId: 'mock' } },
        { status: 422 },
      )
    }
    if (db.roles.some((role) => role.code === body.code)) {
      return HttpResponse.json(
        { error: { code: 42201, message: '角色码已存在。', fields: { code: 'duplicate' }, traceId: 'mock' } },
        { status: 422 },
      )
    }
    const labels = normalizeLabels(body.labels)
    if (Object.keys(labels).length === 0) {
      return HttpResponse.json(
        {
          error: { code: 42201, message: '至少填写一种语言的名称。', fields: { labels: 'required' }, traceId: 'mock' },
        },
        { status: 422 },
      )
    }
    const role: RoleRow = {
      code: body.code,
      labels,
      // 缺省排到末尾（后端 repository.nextSort：末位 + 10）
      sort: body.sort ?? db.roles.reduce((max, item) => Math.max(max, item.sort), 0) + 10,
      builtin: false,
      createdBy: currentAccount()?.account ?? null,
      createdAt: new Date().toISOString(),
      updatedBy: null,
      updatedAt: null,
      lockVersion: 0,
    }
    db.roles.push(role)
    return ok(toRoleView(role))
  }),

  http.patch('*/api/v1/roles/:code', async ({ params, request }) => {
    if (!requireSessionOr401()) {
      return unauthorized()
    }
    if (!hasPerm(['role-manage'])) {
      return HttpResponse.json(FORBIDDEN('role-manage'), { status: 403 })
    }
    const role = db.roles.find((item) => item.code === params.code)
    if (!role) {
      return HttpResponse.json(NOT_FOUND, { status: 404 })
    }
    const body = (await request.json()) as {
      labels?: Record<string, string> | null
      sort?: number | null
      lockVersion?: number
    }
    if (typeof body.lockVersion !== 'number' || body.lockVersion !== role.lockVersion) {
      return HttpResponse.json(error(40901, '数据已被他人修改，请刷新后重试。'), { status: 409 })
    }
    if (body.labels !== undefined && body.labels !== null) {
      const labels = normalizeLabels(body.labels)
      if (Object.keys(labels).length === 0) {
        return HttpResponse.json(error(42201, '至少填写一种语言的名称。'), { status: 422 })
      }
      role.labels = labels
    }
    if (body.sort !== undefined && body.sort !== null) {
      if (body.sort < 0) {
        return HttpResponse.json(error(42201, '排序不得为负。'), { status: 422 })
      }
      role.sort = body.sort
    }
    role.lockVersion += 1
    role.updatedBy = currentAccount()?.account ?? null
    role.updatedAt = new Date().toISOString()
    return ok(toRoleView(role))
  }),

  http.delete('*/api/v1/roles/:code', ({ params }) => {
    if (!requireSessionOr401()) {
      return unauthorized()
    }
    if (!hasPerm(['role-manage'])) {
      return HttpResponse.json(FORBIDDEN('role-manage'), { status: 403 })
    }
    const role = db.roles.find((item) => item.code === params.code)
    if (!role) {
      return HttpResponse.json(NOT_FOUND, { status: 404 })
    }
    if (role.builtin) {
      return HttpResponse.json(error(42203, '内置角色不可删除，可改名或调整排序。'), { status: 422 })
    }
    const inUse = toRoleView(role).accountCount
    if (inUse > 0) {
      return HttpResponse.json(error(42203, `该角色仍有 ${inUse} 个账号在使用，请先调整这些账号的角色。`), {
        status: 422,
      })
    }
    db.roles = db.roles.filter((item) => item.code !== role.code)
    return ok(null)
  }),

  // ── 人员管理（P5 · T-14：无表只读聚合，personnel-view；org 卡 §5 Personnel 节） ──

  http.get('*/api/v1/personnel/members', ({ request }) => {
    if (!requireSessionOr401()) {
      return unauthorized()
    }
    if (!hasPerm(['personnel-view'])) {
      return HttpResponse.json(FORBIDDEN('personnel-view'), { status: 403 })
    }
    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.toLowerCase()
    const only = url.searchParams.get('filters[account]')
    const departmentId = url.searchParams.get('filters[departmentId]')
    // 停用/软删账号不出现（§5 Personnel 节）
    let accounts = db.accounts.filter((account) => account.deletedAt === null && account.status === 'active')
    if (departmentId) {
      const inTree = departmentTreeIds(Number(departmentId))
      accounts = accounts.filter(
        (account) =>
          account.departmentId !== null && account.departmentId !== undefined && inTree.has(account.departmentId),
      )
    }
    if (only) {
      accounts = accounts.filter((account) => account.account === only)
    }
    if (q) {
      accounts = accounts.filter((account) => `${account.account}${account.realName}`.toLowerCase().includes(q))
    }
    const items = accounts.map((account) => ({
      account: account.account,
      realName: account.realName,
      departmentId: account.departmentId ?? null,
      role: account.role ?? null,
      // 在办口径：assignee 且 status ∉ done/closed/cancel
      openTaskCount: db.tasks.filter(
        (task) => task.assignee === account.account && !['done', 'closed', 'cancel'].includes(task.status),
      ).length,
      // 未解决口径：status=active 且 assignee=本人
      unresolvedBugCount: db.bugs.filter((bug) => bug.assignee === account.account && bug.status === 'active').length,
    }))
    return ok(paginate(items, url))
  }),

  http.get('*/api/v1/personnel/workload', ({ request }) => {
    if (!requireSessionOr401()) {
      return unauthorized()
    }
    if (!hasPerm(['personnel-view'])) {
      return HttpResponse.json(FORBIDDEN('personnel-view'), { status: 403 })
    }
    const url = new URL(request.url)
    const range = url.searchParams.get('filters[date]') ?? ''
    const [from, to] = range.split('..')
    // filters[date] 必填区间；缺失或起止倒置 → 40001（org §5）
    if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
      return HttpResponse.json(error(40001, 'filters[date] 需为 YYYY-MM-DD..YYYY-MM-DD 区间。'), { status: 400 })
    }
    const departmentId = url.searchParams.get('filters[departmentId]')
    let accounts = db.accounts.filter((account) => account.deletedAt === null && account.status === 'active')
    if (departmentId) {
      const inTree = departmentTreeIds(Number(departmentId))
      accounts = accounts.filter(
        (account) =>
          account.departmentId !== null && account.departmentId !== undefined && inTree.has(account.departmentId),
      )
    }
    const items = accounts.map((account) => {
      const consumedHours = db.efforts
        .filter((effort) => effort.account === account.account && effort.workDate >= from && effort.workDate <= to)
        .reduce((sum, effort) => sum + effort.consumedHours, 0)
      const finishedTaskCount = db.tasks.filter((task) => {
        const finished = (task.finishedAt ?? '').slice(0, 10)
        return task.assignee === account.account && finished >= from && finished <= to
      }).length
      return {
        account: account.account,
        realName: account.realName,
        departmentId: account.departmentId ?? null,
        consumedHours: Math.round(consumedHours * 100) / 100,
        finishedTaskCount,
      }
    })
    const sort = url.searchParams.get('sort') ?? '-consumedHours'
    const desc = sort.startsWith('-')
    const key = desc ? sort.slice(1) : sort
    const sortable = ['consumedHours', 'finishedTaskCount', 'account']
    const sorted = sortable.includes(key)
      ? [...items].sort((a, b) => {
          const left = a[key as 'consumedHours' | 'finishedTaskCount' | 'account']
          const right = b[key as 'consumedHours' | 'finishedTaskCount' | 'account']
          const compared =
            typeof left === 'number' && typeof right === 'number' ? left - right : String(left) < String(right) ? -1 : 1
          return desc ? -compared : compared
        })
      : items
    return ok(paginate(sorted, url))
  }),
]

function requireSessionOr401(): boolean {
  return currentAccount() !== null
}

/** 账号动作动态流（org §4：created/disabled/enabled/deleted/unlocked/passwordChanged）。 */
function pushActivity(accountId: number, action: string, remark: string | null = null): void {
  db.activities.push({
    id: mockId(),
    objectType: 'account',
    objectId: accountId,
    actor: currentAccount()?.account ?? '',
    action,
    detail: null,
    remark,
    occurredAt: new Date().toISOString(),
  })
}

/** 角色名规整（AccountRole.normalize 同口径）：去空白、丢空值；全空返回空对象（调用方判非法）。 */
function normalizeLabels(labels: Record<string, string> | undefined): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [language, name] of Object.entries(labels ?? {})) {
    const key = language.trim()
    const value = (name ?? '').trim()
    if (key !== '' && key.length <= 16 && value !== '' && value.length <= 60) {
      result[key] = value
    }
  }
  return result
}

/** 部门后代展开（path 前缀匹配，org §7 @myDepartment 同口径）。 */ function departmentTreeIds(
  id: number,
): Set<number> {
  const prefix = db.departments.find((department) => department.id === id)?.path
  if (!prefix) {
    return new Set()
  }
  return new Set(db.departments.filter((department) => department.path.startsWith(prefix)).map((d) => d.id))
}

function paginate<T>(items: T[], url: URL): { items: T[]; total: number } {
  const page = Math.max(Number(url.searchParams.get('page') ?? 1), 1)
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)
  return { items: items.slice((page - 1) * limit, page * limit), total: items.length }
}

function createMockAccount(body: Record<string, unknown> & { account: string }): MockAccount {
  return {
    id: mockId(),
    account: body.account,
    realName: String(body.realName ?? body.account),
    nickname: (body.nickname as string | null) ?? null,
    role: (body.role as MockAccount['role']) ?? null,
    departmentId: (body.departmentId as number | null) ?? null,
    email: (body.email as string | null) ?? null,
    mobile: (body.mobile as string | null) ?? null,
    phone: (body.phone as string | null) ?? null,
    gender: (body.gender as MockAccount['gender']) ?? 'm',
    birthday: (body.birthday as string | null) ?? null,
    joinedAt: (body.joinedAt as string | null) ?? null,
    avatarFileId: (body.avatarFileId as number | null) ?? null,
    status: 'active',
    groupIds: (body.groupIds as number[]) ?? [],
    fails: 0,
    lockedAt: null,
    lastActiveAt: null,
    createdBy: currentAccount()?.account ?? null,
    createdAt: new Date().toISOString(),
    updatedBy: null,
    updatedAt: null,
    deletedAt: null,
    lockVersion: 0,
    password: 'admin123',
  }
}

type MockDepartment = (typeof db.departments)[number]

/** 部门节点/平铺行（GET /departments[/tree] 的 DepartmentNode 形状）。 */
type MockDepartmentNode = {
  id: number
  name: string
  parentId: number | null
  parentName?: string | null
  path: string
  grade: number
  sort: number
  manager: string | null
  children: MockDepartmentNode[]
}

/** 平铺列表行（parentName 服务端一次映射解析；children 恒空，与后端 DepartmentNode.flat 同形）。 */
function flatNode(department: MockDepartment, names: Map<number, string>): MockDepartmentNode {
  return {
    ...nodeOf(department),
    parentName: department.parentId === null ? null : (names.get(department.parentId) ?? null),
    children: [],
  }
}

/** 列表排序（后端 org 卡 §3.2 白名单 id/name/grade/sort；缺省 sort 升序，同值按 id 升序）。 */ function sortDepartments(
  items: MockDepartment[],
  sort: string | null,
): MockDepartment[] {
  const descending = (sort ?? 'sort').startsWith('-')
  const requested = (sort ?? 'sort').replace(/^-/, '')
  const key = ['id', 'name', 'grade', 'sort'].includes(requested)
    ? (requested as 'id' | 'name' | 'grade' | 'sort')
    : 'sort'
  return [...items].sort((a, b) => {
    const left = key === 'name' ? a.name : a[key]
    const right = key === 'name' ? b.name : b[key]
    const compared =
      typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right))
    return compared !== 0 ? (descending ? -compared : compared) : a.id - b.id
  })
}

function nodeOf(department: MockDepartment): MockDepartmentNode {
  return {
    id: department.id,
    name: department.name,
    parentId: department.parentId,
    path: department.path,
    grade: department.grade,
    sort: department.sort,
    manager: department.manager,
    children: buildTree(department.id),
  }
}

function buildTree(parentId: number | null): MockDepartmentNode[] {
  return db.departments
    .filter((department) => department.parentId === parentId)
    .sort((a, b) => a.sort - b.sort || a.id - b.id)
    .map(nodeOf)
}

/** path/grade 重算（服务端维护；新增/移动后级联，与后端 UpdateDepartmentHandler 同口径）。 */
function recomputePaths(): void {
  const byId = new Map(db.departments.map((department) => [department.id, department]))
  const visit = (department: MockDepartment): void => {
    const parent = department.parentId === null ? undefined : byId.get(department.parentId)
    department.path = `${parent?.path ?? ','}${department.id},`
    department.grade = (parent?.grade ?? 0) + 1
    for (const child of db.departments.filter((item) => item.parentId === department.id)) {
      visit(child)
    }
  }
  for (const root of db.departments.filter((department) => department.parentId === null)) {
    visit(root)
  }
}

function toGroupView(group: (typeof db.groups)[number]): unknown {
  const { memberIds: _memberIds, privCodes: _privCodes, ...view } = group
  return view
}
