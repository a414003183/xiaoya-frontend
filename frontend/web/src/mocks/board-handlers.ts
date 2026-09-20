import type { BoardSpaceView } from '@zentao/api-client/generated/model/boardSpaceView'
import type { BoardView } from '@zentao/api-client/generated/model/boardView'
import type { CardView } from '@zentao/api-client/generated/model/cardView'
import type { LaneView } from '@zentao/api-client/generated/model/laneView'
import type { StageView } from '@zentao/api-client/generated/model/stageView'
import type { StoryView } from '@zentao/api-client/generated/model/storyView'
import { HttpResponse, http } from 'msw'
import { currentAccount, db, error, FORBIDDEN, mockId, NOT_FOUND, privilegesOf, UNAUTHENTICATED } from './db'
import {
  BOARD_ACL_OPTIONS,
  BOARD_SPACE_ACL_OPTIONS,
  BOARD_SPACE_STATUS_OPTIONS,
  BOARD_SPACE_TYPE_OPTIONS,
  CARD_STATUS_OPTIONS,
  PRIORITY_OPTIONS,
} from './meta-options'
import { canSeeProject } from './project-handlers'

const ok = (data: unknown) => HttpResponse.json({ data })
const unauthorized = () => HttpResponse.json(UNAUTHENTICATED, { status: 401 })
const forbidden = (perm: string) => HttpResponse.json(FORBIDDEN(perm), { status: 403 })
const validation = (message: string, fields?: Record<string, string>) =>
  HttpResponse.json(
    { error: { code: 42201, message, traceId: 'mock', ...(fields ? { fields } : {}) } },
    { status: 422 },
  )
const stateConflict = (message: string) => HttpResponse.json(error(42202, message), { status: 422 })
const referenced = (message: string) => HttpResponse.json(error(42203, message), { status: 422 })
const lockConflict = () => HttpResponse.json(error(40901, '数据已被他人修改，请刷新后重试。'), { status: 409 })
const notFound = () => HttpResponse.json(NOT_FOUND, { status: 404 })
const hidden = () => HttpResponse.json(error(40302, '无权访问该看板。'), { status: 403 })

/**
 * board 域 MSW handlers（T-7）：阶段字典 + 看板空间/看板/列/卡片 + 执行需求看板；
 * 路径与载荷形状同 contract/openapi.yaml（project §5 stages / board-spaces / boards / kanban 族）。
 */

const B = {
  view: 'board-view',
  spaceCreate: 'board-space-create',
  spaceEdit: 'board-space-edit',
  spaceClose: 'board-space-close',
  create: 'board-create',
  edit: 'board-edit',
  close: 'board-close',
  cardCreate: 'board-card-create',
  cardEdit: 'board-card-edit',
  stageView: 'stage-view',
  stageManage: 'stage-manage',
}

const CARD_STATUSES = ['doing', 'done'] as const

function hasPerm(codes: string[]): boolean {
  const account = currentAccount()
  if (!account) {
    return false
  }
  if (account.groupIds.includes(1)) {
    return true
  }
  const owned = privilegesOf(account)
  return codes.some((code) => owned.includes(code))
}

function defined<T>(value: T | undefined): value is T {
  return value !== undefined
}

function paginate<T>(items: T[], url: URL): { items: T[]; total: number } {
  const page = Math.max(Number(url.searchParams.get('page') ?? 1), 1)
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)
  return { items: items.slice((page - 1) * limit, page * limit), total: items.length }
}

function matchIn(value: unknown, filter: string | null): boolean {
  if (!filter) {
    return true
  }
  return filter.split(',').some((item) => item === String(value ?? ''))
}

// ── 数据权限（project §7：空间 open 全员 / private 仅 owner+team+白名单；board acl=extend 继承空间） ──

function canSeeSpace(space: BoardSpaceView): boolean {
  const account = currentAccount()
  if (!account) {
    return false
  }
  if (account.groupIds.includes(1) || space.acl === 'open') {
    return true
  }
  const me = account.account
  return space.owner === me || (space.team ?? []).includes(me) || space.whitelist.includes(me)
}

function canSeeBoard(board: BoardView): boolean {
  const account = currentAccount()
  if (!account) {
    return false
  }
  if (account.groupIds.includes(1) || board.acl === 'open') {
    return true
  }
  const me = account.account
  const space = db.boardSpaces.find((item) => item.id === board.spaceId)
  if (board.acl === 'extend') {
    // extend = 空间可见即可见（§7）
    return space !== undefined && canSeeSpace(space)
  }
  return board.owner === me || (board.team ?? []).includes(me) || board.whitelist.includes(me) || space?.owner === me
}

function fillBoard(board: BoardView): BoardView {
  return {
    ...board,
    lanes: db.boardLanes.filter((lane) => lane.boardId === board.id).sort((a, b) => a.sort - b.sort || a.id - b.id),
    cards: db.boardCards.filter((card) => card.boardId === board.id).sort((a, b) => a.sort - b.sort || a.id - b.id),
  }
}

function guardBoard(boardId: number): { item: BoardView } | { denied: Response } {
  const item = db.boards.find((board) => board.id === boardId)
  if (!item) {
    return { denied: notFound() }
  }
  if (!canSeeBoard(item)) {
    return { denied: hidden() }
  }
  return { item }
}

function guardSpace(boardSpaceId: number): { item: BoardSpaceView } | { denied: Response } {
  const item = db.boardSpaces.find((space) => space.id === boardSpaceId)
  if (!item) {
    return { denied: notFound() }
  }
  if (!canSeeSpace(item)) {
    return { denied: hidden() }
  }
  return { item }
}

function lockVersionOf(body: Record<string, unknown>, current: number): boolean {
  return body.lockVersion === undefined || body.lockVersion === current
}

function stampEdited(view: { updatedBy?: string | null; updatedAt?: string | null; lockVersion: number }): void {
  view.updatedBy = currentAccount()?.account ?? null
  view.updatedAt = new Date().toISOString()
  view.lockVersion += 1
}

// ── 阶段字典（§3.2：同 projectModel 下 percent 累计 ≤100 → 42201 field=percent） ──

function percentTotal(projectModel: string, excludeId = 0): number {
  return db.stages
    .filter((stage) => stage.projectModel === projectModel && stage.id !== excludeId)
    .reduce((sum, stage) => sum + stage.percent, 0)
}

/** fields 值是与页面约定的错误码（页面据此把对应输入标红）。 */
function percentError(projectModel: string, percent: number, excludeId = 0): Response | null {
  if (percentTotal(projectModel, excludeId) + percent > 100) {
    return validation('同项目流程下阶段占比累计不能超过 100%。', { percent: 'percent-over-total' })
  }
  return null
}

export const STAGE_META = {
  domain: 'stage',
  fields: [
    { key: 'name', type: 'text', required: true, maxLength: 255, i18n: 'stage.field.name' },
    { key: 'percent', type: 'number', required: true, i18n: 'stage.field.percent' },
    { key: 'type', type: 'select', required: true, i18n: 'stage.field.type' },
    { key: 'projectModel', type: 'select', required: true, i18n: 'stage.field.projectModel' },
    { key: 'sort', type: 'number', i18n: 'common.field.sort' },
  ],
  list: { defaultColumns: ['id', 'name', 'percent', 'type'], defaultSort: 'sort' },
  actions: [],
  statusVisuals: {},
}

export const BOARD_SPACE_META = {
  domain: 'board_space',
  fields: [
    { key: 'name', type: 'text', required: true, maxLength: 90, i18n: 'board.field.name' },
    { key: 'type', type: 'select', required: true, i18n: 'board.spaceType', options: BOARD_SPACE_TYPE_OPTIONS },
    { key: 'status', type: 'select', i18n: 'common.field.status', options: BOARD_SPACE_STATUS_OPTIONS },
    { key: 'owner', type: 'select', source: 'accounts', i18n: 'board.field.owner' },
    { key: 'team', type: 'multiselect', source: 'accounts', i18n: 'board.field.team' },
    { key: 'acl', type: 'select', required: true, i18n: 'board.acl', options: BOARD_SPACE_ACL_OPTIONS },
    { key: 'whitelist', type: 'multiselect', source: 'accounts', i18n: 'board.field.whitelist' },
    { key: 'sort', type: 'number', i18n: 'common.field.sort' },
  ],
  list: { defaultColumns: ['id', 'name', 'type', 'status'], defaultSort: 'sort' },
  actions: [
    { code: 'board-space-close', action: 'close', i18n: 'board.action.closeSpace', allowedStatus: ['active'] },
    { code: 'board-space-close', action: 'activate', i18n: 'board.action.activateSpace', allowedStatus: ['closed'] },
  ],
  statusVisuals: {
    active: { tone: 'active', i18n: 'board.status.active' },
    closed: { tone: 'closed', i18n: 'board.status.closed' },
  },
}

export const BOARD_META = {
  domain: 'board',
  fields: [
    { key: 'name', type: 'text', required: true, maxLength: 90, i18n: 'board.field.name' },
    { key: 'owner', type: 'select', source: 'accounts', i18n: 'board.field.owner' },
    { key: 'team', type: 'multiselect', source: 'accounts', i18n: 'board.field.team' },
    { key: 'acl', type: 'select', required: true, i18n: 'board.acl', options: BOARD_ACL_OPTIONS },
    { key: 'whitelist', type: 'multiselect', source: 'accounts', i18n: 'board.field.whitelist' },
    { key: 'sort', type: 'number', i18n: 'common.field.sort' },
  ],
  list: { defaultColumns: ['id', 'name', 'status', 'owner'], defaultSort: 'sort' },
  actions: [
    { code: 'board-close', action: 'close', i18n: 'board.action.closeBoard', allowedStatus: ['active'] },
    { code: 'board-close', action: 'activate', i18n: 'board.action.activateBoard', allowedStatus: ['closed'] },
  ],
  statusVisuals: {
    active: { tone: 'active', i18n: 'board.status.active' },
    closed: { tone: 'closed', i18n: 'board.status.closed' },
  },
}

export const CARD_META = {
  domain: 'card',
  fields: [
    { key: 'laneId', type: 'select', required: true, i18n: 'board.field.lane', source: 'lanes' },
    { key: 'name', type: 'text', required: true, maxLength: 255, i18n: 'board.field.cardName' },
    { key: 'status', type: 'select', i18n: 'common.field.status', options: CARD_STATUS_OPTIONS },
    { key: 'priority', type: 'select', i18n: 'common.priority', options: PRIORITY_OPTIONS },
    { key: 'assignee', type: 'select', source: 'accounts', i18n: 'board.field.assignee' },
    { key: 'beginDate', type: 'date', i18n: 'board.field.beginDate' },
    { key: 'endDate', type: 'date', i18n: 'board.field.endDate' },
    { key: 'estimateHours', type: 'number', i18n: 'board.field.estimate' },
    { key: 'progress', type: 'number', i18n: 'board.field.progress' },
    { key: 'description', type: 'text', i18n: 'board.field.description' },
  ],
  list: { defaultColumns: ['id', 'laneId', 'name', 'status', 'priority'], defaultSort: 'sort' },
  actions: [],
  statusVisuals: {
    doing: { tone: 'active', i18n: 'board.cardStatus.doing' },
    done: { tone: 'closed', i18n: 'board.cardStatus.done' },
  },
}

export const BOARD_META_BY_DOMAIN: Record<string, unknown> = {
  board_space: BOARD_SPACE_META,
  board: BOARD_META,
  card: CARD_META,
  stage: STAGE_META,
}

// ── 执行需求看板（§5.1：列 key = story 状态；拖拽委托 story 状态机，非法映射 42202 透传） ──

/** 列 key → 可派动作（from → to，与 requirement §4 状态机同源）。 */
const KANBAN_MOVES: { column: string; action: string; from: string[] }[] = [
  { column: 'draft', action: 'reject', from: ['reviewing'] },
  { column: 'reviewing', action: 'submit-review', from: ['draft', 'changed'] },
  { column: 'active', action: 'pass', from: ['reviewing'] },
  { column: 'active', action: 'activate', from: ['closed'] },
  { column: 'changing', action: 'change', from: ['active'] },
  { column: 'changed', action: 'change-done', from: ['changing'] },
  { column: 'closed', action: 'close', from: ['active', 'changed'] },
]

/** 拖拽请求体缺字段的守卫（与 requirement 动作守卫同口径）：close/reject/change-done 需额外入参，看板拖拽带不了 → 42201。 */
const KANBAN_FIELD_GUARDS: Record<string, string> = {
  reject: '评审拒绝必须填写备注：看板拖拽不携带，请到需求详情操作。',
  'change-done': '变更完成需填写变更内容：看板拖拽不携带，请到需求详情操作。',
  close: '关闭需求必须填写关闭原因：看板拖拽不携带，请到需求详情操作。',
}

function kanbanStories(executionId: number): StoryView[] {
  const execution = db.projects.find((item) => item.id === executionId)
  if (!execution) {
    return []
  }
  const projectIds = [execution.id, execution.parentId]
  return db.projectStories
    .filter((link) => projectIds.includes(link.projectId))
    .sort((a, b) => a.sort - b.sort)
    .map((link) => db.stories.find((story) => story.id === link.storyId))
    .filter(defined)
}

export const boardHandlers = [
  // ── 阶段字典 ──
  http.get('*/api/v1/stages', ({ request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([B.stageView])) {
      return forbidden(B.stageView)
    }
    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.toLowerCase()
    let items = db.stages.filter(
      (stage) =>
        matchIn(stage.type, url.searchParams.get('filters[type]')) &&
        matchIn(stage.projectModel, url.searchParams.get('filters[projectModel]')),
    )
    if (q) {
      items = items.filter((stage) => stage.name.toLowerCase().includes(q))
    }
    items = [...items].sort((a, b) => a.sort - b.sort || a.id - b.id)
    return ok(paginate(items, url))
  }),

  http.post('*/api/v1/stages', async ({ request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([B.stageManage])) {
      return forbidden(B.stageManage)
    }
    const body = (await request.json()) as Record<string, unknown>
    const name = String(body.name ?? '').trim()
    if (name === '') {
      return validation('阶段名称必填。', { name: 'required' })
    }
    const percent = Number(body.percent ?? 0)
    const projectModel = String(body.projectModel ?? 'waterfall')
    const denied = percentError(projectModel, percent)
    if (denied) {
      return denied
    }
    const stage: StageView = {
      id: mockId(),
      name,
      percent,
      type: (body.type as StageView['type']) ?? 'other',
      projectModel: 'waterfall',
      sort: Number(body.sort ?? db.stages.length),
      createdBy: currentAccount()?.account ?? 'system',
      createdAt: new Date().toISOString(),
    }
    db.stages.push(stage)
    return ok(stage)
  }),

  http.patch('*/api/v1/stages/:stageId', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([B.stageManage])) {
      return forbidden(B.stageManage)
    }
    const stage = db.stages.find((item) => item.id === Number(params.stageId))
    if (!stage) {
      return notFound()
    }
    const body = (await request.json()) as Record<string, unknown>
    if (typeof body.name === 'string' && body.name.trim() === '') {
      return validation('阶段名称必填。', { name: 'required' })
    }
    if (body.percent !== undefined && body.percent !== null) {
      const denied = percentError(stage.projectModel, Number(body.percent), stage.id)
      if (denied) {
        return denied
      }
    }
    for (const key of ['name', 'percent', 'type', 'sort'] as const) {
      if (body[key] !== undefined && body[key] !== null) {
        ;(stage as unknown as Record<string, unknown>)[key] = body[key]
      }
    }
    stage.updatedBy = currentAccount()?.account ?? null
    stage.updatedAt = new Date().toISOString()
    return ok(stage)
  }),

  http.delete('*/api/v1/stages/:stageId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([B.stageManage])) {
      return forbidden(B.stageManage)
    }
    const stage = db.stages.find((item) => item.id === Number(params.stageId))
    if (!stage) {
      return notFound()
    }
    db.stages = db.stages.filter((item) => item.id !== stage.id)
    return ok(null)
  }),

  // ── 看板空间 ──
  http.get('*/api/v1/board-spaces', ({ request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([B.view])) {
      return forbidden(B.view)
    }
    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.toLowerCase()
    const ownerFilter = url.searchParams.get('filters[owner]')
    const me = currentAccount()?.account ?? ''
    let items = db.boardSpaces.filter(
      (space) =>
        canSeeSpace(space) &&
        matchIn(space.type, url.searchParams.get('filters[type]')) &&
        matchIn(space.status, url.searchParams.get('filters[status]')) &&
        matchIn(space.acl, url.searchParams.get('filters[acl]')) &&
        matchIn(space.id, url.searchParams.get('filters[id]')) &&
        (ownerFilter === null || space.owner === (ownerFilter === '@me' ? me : ownerFilter)),
    )
    if (q) {
      items = items.filter((space) => space.name.toLowerCase().includes(q))
    }
    items = [...items].sort((a, b) => a.sort - b.sort || a.id - b.id)
    return ok(paginate(items, url))
  }),

  http.post('*/api/v1/board-spaces', async ({ request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([B.spaceCreate])) {
      return forbidden(B.spaceCreate)
    }
    const body = (await request.json()) as Record<string, unknown>
    const name = String(body.name ?? '').trim()
    if (name === '') {
      return validation('空间名称必填。', { name: 'required' })
    }
    const acl = String(body.acl ?? 'open')
    const whitelist = (body.whitelist as string[] | undefined) ?? []
    if (acl === 'private' && whitelist.length === 0) {
      return validation('私有空间必须选择白名单成员。', { whitelist: 'required' })
    }
    const space: BoardSpaceView = {
      id: mockId(),
      name,
      type: (body.type as BoardSpaceView['type']) ?? 'cooperation',
      owner: String(body.owner ?? currentAccount()?.account ?? ''),
      team: (body.team as string[] | undefined) ?? [],
      description: (body.description as string | null) ?? null,
      acl: acl as BoardSpaceView['acl'],
      whitelist,
      status: 'active',
      sort: Number(body.sort ?? db.boardSpaces.length),
      createdBy: currentAccount()?.account ?? 'system',
      createdAt: new Date().toISOString(),
      boards: [],
      lockVersion: 0,
    }
    db.boardSpaces.push(space)
    return ok(space)
  }),

  http.get('*/api/v1/board-spaces/:boardSpaceId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([B.view])) {
      return forbidden(B.view)
    }
    const guard = guardSpace(Number(params.boardSpaceId))
    if ('denied' in guard) {
      return guard.denied
    }
    const boards = db.boards
      .filter((board) => board.spaceId === guard.item.id && canSeeBoard(board))
      .sort((a, b) => a.sort - b.sort || a.id - b.id)
    return ok({ ...guard.item, boards })
  }),

  http.patch('*/api/v1/board-spaces/:boardSpaceId', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([B.spaceEdit])) {
      return forbidden(B.spaceEdit)
    }
    const guard = guardSpace(Number(params.boardSpaceId))
    if ('denied' in guard) {
      return guard.denied
    }
    const body = (await request.json()) as Record<string, unknown>
    if (!lockVersionOf(body, guard.item.lockVersion)) {
      return lockConflict()
    }
    for (const key of ['name', 'type', 'owner', 'team', 'acl', 'whitelist', 'description', 'sort'] as const) {
      if (body[key] !== undefined) {
        ;(guard.item as unknown as Record<string, unknown>)[key] = body[key]
      }
    }
    stampEdited(guard.item)
    return ok({ ...guard.item, boards: [] })
  }),

  ...(['close', 'activate'] as const).map((action) =>
    http.post(`*/api/v1/board-spaces/:boardSpaceId/${action}`, ({ params }) => {
      if (!currentAccount()) {
        return unauthorized()
      }
      if (!hasPerm([B.spaceClose])) {
        return forbidden(B.spaceClose)
      }
      const guard = guardSpace(Number(params.boardSpaceId))
      if ('denied' in guard) {
        return guard.denied
      }
      const target = action === 'close' ? 'closed' : 'active'
      if (guard.item.status === target) {
        return stateConflict(`当前状态 ${guard.item.status} 不允许执行 ${action}。`)
      }
      guard.item.status = target
      stampEdited(guard.item)
      return ok({ ...guard.item, boards: [] })
    }),
  ),

  http.delete('*/api/v1/board-spaces/:boardSpaceId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([B.spaceEdit])) {
      return forbidden(B.spaceEdit)
    }
    const guard = guardSpace(Number(params.boardSpaceId))
    if ('denied' in guard) {
      return guard.denied
    }
    // §3.3 delete 守卫：空间内仍有看板 → 42203
    if (db.boards.some((board) => board.spaceId === guard.item.id)) {
      return referenced('空间内仍有看板，不能删除。')
    }
    db.boardSpaces = db.boardSpaces.filter((item) => item.id !== guard.item.id)
    return ok(null)
  }),

  // ── 看板 ──
  http.post('*/api/v1/board-spaces/:boardSpaceId/boards', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([B.create])) {
      return forbidden(B.create)
    }
    const guard = guardSpace(Number(params.boardSpaceId))
    if ('denied' in guard) {
      return guard.denied
    }
    const body = (await request.json()) as Record<string, unknown>
    const name = String(body.name ?? '').trim()
    if (name === '') {
      return validation('看板名称必填。', { name: 'required' })
    }
    const board: BoardView = {
      id: mockId(),
      spaceId: guard.item.id,
      name,
      owner: String(body.owner ?? currentAccount()?.account ?? ''),
      team: (body.team as string[] | undefined) ?? [],
      description: (body.description as string | null) ?? null,
      acl: (body.acl as BoardView['acl']) ?? 'extend',
      whitelist: (body.whitelist as string[] | undefined) ?? [],
      status: 'active',
      sort: Number(body.sort ?? db.boards.length),
      createdBy: currentAccount()?.account ?? 'system',
      createdAt: new Date().toISOString(),
      lanes: [],
      cards: [],
      lockVersion: 0,
    }
    db.boards.push(board)
    return ok(board)
  }),

  http.get('*/api/v1/boards/:boardId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([B.view])) {
      return forbidden(B.view)
    }
    const guard = guardBoard(Number(params.boardId))
    if ('denied' in guard) {
      return guard.denied
    }
    return ok(fillBoard(guard.item))
  }),

  http.patch('*/api/v1/boards/:boardId', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([B.edit])) {
      return forbidden(B.edit)
    }
    const guard = guardBoard(Number(params.boardId))
    if ('denied' in guard) {
      return guard.denied
    }
    const body = (await request.json()) as Record<string, unknown>
    if (!lockVersionOf(body, guard.item.lockVersion)) {
      return lockConflict()
    }
    for (const key of ['name', 'owner', 'team', 'acl', 'whitelist', 'description', 'sort'] as const) {
      if (body[key] !== undefined) {
        ;(guard.item as unknown as Record<string, unknown>)[key] = body[key]
      }
    }
    stampEdited(guard.item)
    return ok(fillBoard(guard.item))
  }),

  ...(['close', 'activate'] as const).map((action) =>
    http.post(`*/api/v1/boards/:boardId/${action}`, ({ params }) => {
      if (!currentAccount()) {
        return unauthorized()
      }
      if (!hasPerm([B.close])) {
        return forbidden(B.close)
      }
      const guard = guardBoard(Number(params.boardId))
      if ('denied' in guard) {
        return guard.denied
      }
      const target = action === 'close' ? 'closed' : 'active'
      if (guard.item.status === target) {
        return stateConflict(`当前状态 ${guard.item.status} 不允许执行 ${action}。`)
      }
      guard.item.status = target
      stampEdited(guard.item)
      return ok(fillBoard(guard.item))
    }),
  ),

  http.delete('*/api/v1/boards/:boardId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([B.edit])) {
      return forbidden(B.edit)
    }
    const guard = guardBoard(Number(params.boardId))
    if ('denied' in guard) {
      return guard.denied
    }
    // §3.4 delete 守卫：看板内仍有卡片 → 42203（含已归档卡片）
    if (db.boardCards.some((card) => card.boardId === guard.item.id)) {
      return referenced('看板内仍有卡片，不能删除。')
    }
    db.boards = db.boards.filter((item) => item.id !== guard.item.id)
    db.boardLanes = db.boardLanes.filter((lane) => lane.boardId !== guard.item.id)
    return ok(null)
  }),

  // ── 看板列 ──
  http.post('*/api/v1/boards/:boardId/lanes', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([B.edit])) {
      return forbidden(B.edit)
    }
    const guard = guardBoard(Number(params.boardId))
    if ('denied' in guard) {
      return guard.denied
    }
    const body = (await request.json()) as Record<string, unknown>
    const name = String(body.name ?? '').trim()
    if (name === '') {
      return validation('列名称必填。', { name: 'required' })
    }
    const lane: LaneView = {
      id: mockId(),
      boardId: guard.item.id,
      name,
      color: (body.color as string | null) ?? null,
      wipLimit: Number(body.wipLimit ?? -1),
      archived: Boolean(body.archived ?? false),
      sort: Number(body.sort ?? db.boardLanes.filter((item) => item.boardId === guard.item.id).length),
    }
    db.boardLanes.push(lane)
    return ok(lane)
  }),

  http.patch('*/api/v1/boards/:boardId/lanes/:laneId', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([B.edit])) {
      return forbidden(B.edit)
    }
    const lane = db.boardLanes.find(
      (item) => item.id === Number(params.laneId) && item.boardId === Number(params.boardId),
    )
    if (!lane) {
      return notFound()
    }
    const body = (await request.json()) as Record<string, unknown>
    if (typeof body.name === 'string' && body.name.trim() === '') {
      return validation('列名称必填。', { name: 'required' })
    }
    for (const key of ['name', 'color', 'wipLimit', 'archived', 'sort'] as const) {
      if (body[key] !== undefined) {
        ;(lane as unknown as Record<string, unknown>)[key] = body[key]
      }
    }
    return ok(lane)
  }),

  http.delete('*/api/v1/boards/:boardId/lanes/:laneId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([B.edit])) {
      return forbidden(B.edit)
    }
    const lane = db.boardLanes.find(
      (item) => item.id === Number(params.laneId) && item.boardId === Number(params.boardId),
    )
    if (!lane) {
      return notFound()
    }
    if (db.boardCards.some((card) => card.laneId === lane.id)) {
      return referenced('列内仍有卡片，不能删除。')
    }
    db.boardLanes = db.boardLanes.filter((item) => item.id !== lane.id)
    return ok(null)
  }),

  // ── 卡片 ──
  http.get('*/api/v1/boards/:boardId/cards', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([B.view])) {
      return forbidden(B.view)
    }
    const guard = guardBoard(Number(params.boardId))
    if ('denied' in guard) {
      return guard.denied
    }
    const url = new URL(request.url)
    const items = db.boardCards
      .filter(
        (card) =>
          card.boardId === guard.item.id &&
          matchIn(card.laneId, url.searchParams.get('filters[laneId]')) &&
          matchIn(card.status, url.searchParams.get('filters[status]')) &&
          matchIn(card.archived, url.searchParams.get('filters[archived]')),
      )
      .sort((a, b) => a.sort - b.sort || a.id - b.id)
    return ok(paginate(items, url))
  }),

  http.post('*/api/v1/boards/:boardId/cards', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([B.cardCreate])) {
      return forbidden(B.cardCreate)
    }
    const guard = guardBoard(Number(params.boardId))
    if ('denied' in guard) {
      return guard.denied
    }
    const body = (await request.json()) as Record<string, unknown>
    const laneId = Number(body.laneId ?? 0)
    const lane = db.boardLanes.find((item) => item.id === laneId && item.boardId === guard.item.id)
    if (!lane) {
      return validation('所属列不在本看板内。', { laneId: 'invalid' })
    }
    const name = String(body.name ?? '').trim()
    if (name === '') {
      return validation('卡片名称必填。', { name: 'required' })
    }
    if (String(body.beginDate ?? '') > String(body.endDate ?? '')) {
      return referenced('开始日期不能晚于结束日期。')
    }
    const card: CardView = {
      id: mockId(),
      boardId: guard.item.id,
      laneId,
      name,
      description: (body.description as string | null) ?? null,
      status: (body.status as CardView['status']) ?? 'doing',
      priority: Number(body.priority ?? 3),
      assignee: (body.assignee as string | null) ?? null,
      beginDate: (body.beginDate as string | null) ?? null,
      endDate: (body.endDate as string | null) ?? null,
      estimateHours:
        body.estimateHours === undefined || body.estimateHours === null ? null : Number(body.estimateHours),
      progress: Number(body.progress ?? 0),
      color: (body.color as string | null) ?? null,
      archived: false,
      sort:
        body.sort === undefined || body.sort === null
          ? db.boardCards.filter((item) => item.laneId === laneId).length
          : Number(body.sort),
      createdBy: currentAccount()?.account ?? 'system',
      createdAt: new Date().toISOString(),
      lockVersion: 0,
    }
    db.boardCards.push(card)
    return ok(card)
  }),

  http.get('*/api/v1/cards/:cardId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([B.view])) {
      return forbidden(B.view)
    }
    const card = db.boardCards.find((item) => item.id === Number(params.cardId))
    if (!card) {
      return notFound()
    }
    const guard = guardBoard(card.boardId)
    if ('denied' in guard) {
      return guard.denied
    }
    return ok(card)
  }),

  http.patch('*/api/v1/cards/:cardId', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([B.cardEdit])) {
      return forbidden(B.cardEdit)
    }
    const card = db.boardCards.find((item) => item.id === Number(params.cardId))
    if (!card) {
      return notFound()
    }
    const guard = guardBoard(card.boardId)
    if ('denied' in guard) {
      return guard.denied
    }
    const body = (await request.json()) as Record<string, unknown>
    if (!lockVersionOf(body, card.lockVersion)) {
      return lockConflict()
    }
    if (body.status !== undefined && !(CARD_STATUSES as readonly string[]).includes(String(body.status))) {
      return validation('卡片状态只能是 doing|done。', { status: 'invalid' })
    }
    if (String(body.beginDate ?? card.beginDate ?? '') > String(body.endDate ?? card.endDate ?? '')) {
      return referenced('开始日期不能晚于结束日期。')
    }
    for (const key of [
      'name',
      'description',
      'priority',
      'assignee',
      'beginDate',
      'endDate',
      'estimateHours',
      'progress',
      'color',
      'status',
    ] as const) {
      if (body[key] !== undefined) {
        ;(card as unknown as Record<string, unknown>)[key] = body[key]
      }
    }
    stampEdited(card)
    return ok(card)
  }),

  http.post('*/api/v1/cards/:cardId/move', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([B.cardEdit])) {
      return forbidden(B.cardEdit)
    }
    const card = db.boardCards.find((item) => item.id === Number(params.cardId))
    if (!card) {
      return notFound()
    }
    const guard = guardBoard(card.boardId)
    if ('denied' in guard) {
      return guard.denied
    }
    const body = (await request.json()) as { laneId?: number; sort?: number }
    const lane = db.boardLanes.find((item) => item.id === Number(body.laneId) && item.boardId === card.boardId)
    if (!lane) {
      return validation('目标列不在本看板内。', { laneId: 'invalid' })
    }
    // WIP 守卫（§3.5）：目标列已有卡数 + 本卡 > wipLimit → 42203
    const occupants = db.boardCards.filter((item) => item.laneId === lane.id && item.id !== card.id && !item.archived)
    if (lane.wipLimit >= 0 && occupants.length + 1 > lane.wipLimit) {
      return referenced('目标列 WIP 超限，卡片未移动。')
    }
    card.laneId = lane.id
    card.sort = Number(body.sort ?? occupants.length)
    stampEdited(card)
    return ok(card)
  }),

  http.post('*/api/v1/cards/:cardId/archive', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([B.cardEdit])) {
      return forbidden(B.cardEdit)
    }
    const card = db.boardCards.find((item) => item.id === Number(params.cardId))
    if (!card) {
      return notFound()
    }
    const guard = guardBoard(card.boardId)
    if ('denied' in guard) {
      return guard.denied
    }
    card.archived = true
    stampEdited(card)
    return ok(card)
  }),

  // 取消归档（B-PRJ-13）：archived=false，卡片重新上面板；未归档卡片 → 42202
  http.post('*/api/v1/cards/:cardId/unarchive', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([B.cardEdit])) {
      return forbidden(B.cardEdit)
    }
    const card = db.boardCards.find((item) => item.id === Number(params.cardId))
    if (!card) {
      return notFound()
    }
    const guard = guardBoard(card.boardId)
    if ('denied' in guard) {
      return guard.denied
    }
    if (!card.archived) {
      return stateConflict('卡片未归档，无需取消归档。')
    }
    card.archived = false
    stampEdited(card)
    return ok(card)
  }),

  http.delete('*/api/v1/cards/:cardId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([B.cardEdit])) {
      return forbidden(B.cardEdit)
    }
    const card = db.boardCards.find((item) => item.id === Number(params.cardId))
    if (!card) {
      return notFound()
    }
    const guard = guardBoard(card.boardId)
    if ('denied' in guard) {
      return guard.denied
    }
    db.boardCards = db.boardCards.filter((item) => item.id !== card.id)
    return ok(null)
  }),

  // ── 执行需求看板 ──
  http.get('*/api/v1/executions/:executionId/kanban', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['execution-view'])) {
      return forbidden('execution-view')
    }
    const execution = db.projects.find((item) => item.id === Number(params.executionId))
    if (!execution || !canSeeProject(execution)) {
      return execution ? hidden() : notFound()
    }
    const stories = kanbanStories(execution.id)
    // 列 key = story 状态全集，空列保留（project §5.1）
    const lanes = ['draft', 'reviewing', 'active', 'changing', 'changed', 'closed'].map((key) => ({
      key,
      items: stories.filter((story) => story.status === key),
    }))
    return ok({ lanes })
  }),

  http.post('*/api/v1/executions/:executionId/kanban/cards/:cardId/move', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['execution-edit'])) {
      return forbidden('execution-edit')
    }
    const execution = db.projects.find((item) => item.id === Number(params.executionId))
    if (!execution) {
      return notFound()
    }
    if (!canSeeProject(execution)) {
      return hidden()
    }
    const storyId = Number(params.cardId)
    const visible = kanbanStories(execution.id).some((story) => story.id === storyId)
    if (!visible) {
      return notFound()
    }
    const body = (await request.json()) as { column?: string; comment?: string | null }
    const column = String(body.column ?? '')
    const story = db.stories.find((item) => item.id === storyId)
    if (!story) {
      return notFound()
    }
    if (story.status === column) {
      return ok(story)
    }
    const transition = KANBAN_MOVES.find((item) => item.column === column && item.from.includes(story.status))
    if (!transition) {
      return stateConflict(`需求当前状态 ${story.status} 不能迁移到 ${column}。`)
    }
    const guard = KANBAN_FIELD_GUARDS[transition.action]
    if (guard) {
      return validation(guard)
    }
    story.status = transition.column as StoryView['status']
    story.lockVersion += 1
    story.updatedAt = new Date().toISOString()
    return ok(story)
  }),
]
