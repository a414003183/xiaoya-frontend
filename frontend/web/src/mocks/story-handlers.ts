import type { StoryView } from '@zentao/api-client/generated/model/storyView'
import type { StoryViewClosedReason } from '@zentao/api-client/generated/model/storyViewClosedReason'
import { HttpResponse, http } from 'msw'
import { currentAccount, db, error, FORBIDDEN, mockId, NOT_FOUND, privilegesOf, UNAUTHENTICATED } from './db'
import {
  PRIORITY_OPTIONS,
  STORY_CLOSE_REASON_OPTIONS,
  STORY_SOURCE_OPTIONS,
  STORY_STAGE_OPTIONS,
  STORY_STATUS_OPTIONS,
  STORY_TYPE_OPTIONS,
} from './meta-options'
import { hidden, notify, record, visibleProduct } from './product-handlers'

const ok = (data: unknown) => HttpResponse.json({ data })
const unauthorized = () => HttpResponse.json(UNAUTHENTICATED, { status: 401 })
const forbidden = (perm: string) => HttpResponse.json(FORBIDDEN(perm), { status: 403 })
const validation = (message: string, fields?: Record<string, string>) =>
  HttpResponse.json(
    { error: { code: 42201, message, traceId: 'mock', ...(fields ? { fields } : {}) } },
    { status: 422 },
  )
const stateConflict = (message: string) => HttpResponse.json(error(42202, message), { status: 422 })
const conditionNotMet = (message: string) => HttpResponse.json(error(42203, message), { status: 422 })
const lockConflict = () => HttpResponse.json(error(40901, '数据已被他人修改，请刷新后重试。'), { status: 409 })
const notFound = () => HttpResponse.json(NOT_FOUND, { status: 404 })

const S = {
  view: 'story-view',
  create: 'story-create',
  edit: 'story-edit',
  submitReview: 'story-submit-review',
  pass: 'story-pass',
  close: 'story-close',
  activate: 'story-activate',
  assign: 'story-assign',
  delete: 'story-delete',
}

function hasPerm(codes: string[]): boolean {
  const account = currentAccount()
  if (!account) {
    return false
  }
  if (account.roleIds.includes(1)) {
    return true
  }
  const owned = privilegesOf(account)
  return codes.some((code) => owned.includes(code))
}

/** 需求可见性 = 所属产品可见性（requirement §7）。 */
function findStory(storyId: number): StoryView | undefined {
  const story = db.stories.find((item) => item.id === storyId)
  if (!story) {
    return undefined
  }
  return visibleProduct(story.productId) ? story : undefined
}

function matchIn(value: unknown, filter: string | null): boolean {
  if (!filter) {
    return true
  }
  return filter.split(',').some((item) => item === String(value ?? ''))
}

function matchValue(value: unknown, filter: string | null): boolean {
  if (!filter) {
    return true
  }
  if (filter === '@null') {
    return value === null || value === undefined
  }
  if (filter === '@notNull') {
    return value !== null && value !== undefined
  }
  return String(value ?? '') === filter
}

function paginate<T>(items: T[], url: URL): { items: T[]; total: number } {
  const page = Math.max(Number(url.searchParams.get('page') ?? 1), 1)
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)
  return { items: items.slice((page - 1) * limit, page * limit), total: items.length }
}

export const STORY_META = {
  domain: 'story',
  fields: [
    { key: 'title', type: 'text', required: true, maxLength: 255, i18n: 'story.field.title' },
    { key: 'type', type: 'select', i18n: 'story.field.type', options: STORY_TYPE_OPTIONS },
    { key: 'priority', type: 'select', required: true, i18n: 'common.priority', options: PRIORITY_OPTIONS },
    { key: 'source', type: 'select', i18n: 'story.field.source', options: STORY_SOURCE_OPTIONS },
    { key: 'status', type: 'select', i18n: 'story.field.status', options: STORY_STATUS_OPTIONS },
    { key: 'stage', type: 'select', i18n: 'story.field.stage', options: STORY_STAGE_OPTIONS },
    { key: 'closedReason', type: 'select', i18n: 'story.field.closedReason', options: STORY_CLOSE_REASON_OPTIONS },
    { key: 'categoryId', type: 'select', i18n: 'story.field.category' },
    { key: 'planId', type: 'select', i18n: 'story.field.plan' },
    { key: 'estimateHours', type: 'number', i18n: 'story.field.estimate' },
    { key: 'assignee', type: 'select', source: 'accounts', i18n: 'story.field.assignee' },
    { key: 'reviewers', type: 'multiselect', source: 'accounts', i18n: 'story.field.reviewers' },
    { key: 'needNotReview', type: 'bool', i18n: 'story.field.needNotReview' },
    { key: 'notifyAccounts', type: 'multiselect', source: 'accounts', i18n: 'story.field.notify' },
    { key: 'linkedStoryIds', type: 'multiselect', i18n: 'story.field.linked' },
  ],
  list: { defaultColumns: ['id', 'title', 'status', 'priority'], defaultSort: '-id' },
  actions: [
    {
      code: 'story-submit-review',
      action: 'submit-review',
      i18n: 'story.action.submitReview',
      allowedStatus: ['draft', 'changed'],
    },
    { code: 'story-pass', action: 'pass', i18n: 'story.action.pass', allowedStatus: ['reviewing'] },
    { code: 'story-pass', action: 'reject', i18n: 'story.action.reject', allowedStatus: ['reviewing'] },
    { code: 'story-change', action: 'change', i18n: 'story.action.change', allowedStatus: ['active'] },
    { code: 'story-change', action: 'change-done', i18n: 'story.action.changeDone', allowedStatus: ['changing'] },
    { code: 'story-close', action: 'close', i18n: 'story.action.close', allowedStatus: ['active', 'changed'] },
    { code: 'story-activate', action: 'activate', i18n: 'story.action.activate', allowedStatus: ['closed'] },
    {
      code: 'story-assign',
      action: 'assign',
      i18n: 'story.action.assign',
      allowedStatus: ['draft', 'reviewing', 'active', 'changing', 'changed'],
    },
    {
      code: 'story-edit',
      action: 'edit',
      i18n: 'common.action.edit',
      allowedStatus: ['draft', 'reviewing', 'active', 'changing', 'changed'],
    },
  ],
  statusVisuals: {
    draft: { tone: 'neutral', i18n: 'story.status.draft' },
    reviewing: { tone: 'pending', i18n: 'story.status.reviewing' },
    active: { tone: 'active', i18n: 'story.status.active' },
    changing: { tone: 'warning', i18n: 'story.status.changing' },
    changed: { tone: 'warning', i18n: 'story.status.changed' },
    closed: { tone: 'closed', i18n: 'story.status.closed' },
  },
}

function createStory(productId: number, body: Record<string, unknown>): StoryView {
  const story: StoryView = {
    id: mockId(),
    productId,
    branchId: Number(body.branchId ?? 0),
    categoryId: Number(body.categoryId ?? 0),
    planId: body.planId === undefined || body.planId === null ? null : Number(body.planId),
    parentId: body.parentId === undefined || body.parentId === null ? null : Number(body.parentId),
    title: String(body.title ?? ''),
    keywords: (body.keywords as string | null) ?? null,
    type: (body.type as StoryView['type']) ?? 'story',
    status: 'draft',
    priority: Number(body.priority ?? 3),
    estimateHours: body.estimateHours === undefined || body.estimateHours === null ? null : Number(body.estimateHours),
    source: (body.source as StoryView['source']) ?? 'manual',
    description: (body.description as string | null) ?? null,
    stage: 'wait',
    assignee: (body.assignee as string | null) ?? null,
    assignedAt: null,
    reviewers: (body.reviewers as string[] | undefined) ?? [],
    needNotReview: Boolean(body.needNotReview ?? false),
    notifyAccounts: (body.notifyAccounts as string[] | undefined) ?? [],
    linkedStoryIds: (body.linkedStoryIds as number[] | undefined) ?? [],
    duplicateOfId: null,
    version: 1,
    createdBy: currentAccount()?.account ?? 'system',
    createdAt: new Date().toISOString(),
    updatedBy: null,
    updatedAt: null,
    closedBy: null,
    closedAt: null,
    closedReason: null,
    lockVersion: 0,
  }
  db.stories.push(story)
  record('story', story.id, 'created')
  return story
}

function validateStoryBody(body: Record<string, unknown>): string | null {
  const priority = Number(body.priority ?? 3)
  if (priority < 1 || priority > 4) {
    return 'priority 取值 1–4。'
  }
  const estimate = body.estimateHours
  if (estimate !== undefined && estimate !== null && Number(estimate) > 999.99) {
    return '预计工时不得超过 999.99。'
  }
  const reviewers = (body.reviewers as string[] | undefined) ?? []
  if (reviewers.length > 20) {
    return '评审人最多 20 人。'
  }
  return null
}

export const storyHandlers = [
  http.get('*/api/v1/products/:productId/stories', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([S.view])) {
      return forbidden(S.view)
    }
    const product = visibleProduct(Number(params.productId))
    if (!product) {
      return hidden()
    }
    const url = new URL(request.url)
    const q = url.searchParams.get('q')?.toLowerCase()
    let items = db.stories.filter(
      (story) =>
        story.productId === product.id &&
        matchIn(story.status, url.searchParams.get('filters[status]')) &&
        matchIn(story.type, url.searchParams.get('filters[type]')) &&
        matchIn(story.priority, url.searchParams.get('filters[priority]')) &&
        matchIn(story.source, url.searchParams.get('filters[source]')) &&
        matchIn(story.stage, url.searchParams.get('filters[stage]')) &&
        matchIn(story.id, url.searchParams.get('filters[id]')) &&
        matchValue(story.assignee, url.searchParams.get('filters[assignee]')) &&
        matchValue(story.planId, url.searchParams.get('filters[planId]')) &&
        matchValue(story.categoryId, url.searchParams.get('filters[categoryId]')) &&
        matchValue(story.closedReason, url.searchParams.get('filters[closedReason]')),
    )
    if (q) {
      items = items.filter((story) => `${story.title}${story.keywords ?? ''}`.toLowerCase().includes(q))
    }
    return ok(paginate(items, url))
  }),

  http.post('*/api/v1/products/:productId/stories', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([S.create])) {
      return forbidden(S.create)
    }
    const product = visibleProduct(Number(params.productId))
    if (!product) {
      return hidden()
    }
    const body = (await request.json()) as Record<string, unknown>
    const invalid = validateStoryBody(body)
    if (invalid) {
      return validation(invalid)
    }
    return ok(createStory(product.id, body))
  }),

  http.post('*/api/v1/products/:productId/stories/batch', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([S.create])) {
      return forbidden(S.create)
    }
    const product = visibleProduct(Number(params.productId))
    if (!product) {
      return hidden()
    }
    const body = (await request.json()) as { items: Record<string, unknown>[] }
    if (body.items.length > 50) {
      return validation('批量创建上限 50 条。')
    }
    const results = body.items.map((item, index) => {
      const title = String(item.title ?? '').trim()
      if (title.length === 0) {
        return { index, ok: false, id: null, error: 'title required' }
      }
      const invalid = validateStoryBody(item)
      if (invalid) {
        return { index, ok: false, id: null, error: invalid }
      }
      const story = createStory(product.id, { ...item, title })
      return { index, ok: true, id: story.id, error: null }
    })
    return ok({ results })
  }),

  http.post('*/api/v1/stories/batch', async ({ request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    const body = (await request.json()) as { ids: number[]; action: string; params?: Record<string, unknown> }
    const perm =
      body.action === 'close'
        ? S.close
        : body.action === 'activate'
          ? S.activate
          : body.action === 'assign'
            ? S.assign
            : S.edit
    if (!hasPerm([perm])) {
      return forbidden(perm)
    }
    const items = (body.params?.items as { id: number; title?: string; priority?: number }[] | undefined) ?? []
    const results = body.ids.map((id) => {
      const story = findStory(id)
      if (!story) {
        return { id, ok: false, error: '40301' }
      }
      if (body.action === 'close') {
        const reason = body.params?.closedReason
        if (
          reason !== 'done' &&
          reason !== 'duplicate' &&
          reason !== 'rejected' &&
          reason !== 'willnotfix' &&
          reason !== 'postponed'
        ) {
          return { id, ok: false, error: '42201' }
        }
        if (story.status !== 'active' && story.status !== 'changed') {
          return { id, ok: false, error: '42202' }
        }
        story.status = 'closed'
        story.closedReason = String(reason) as StoryViewClosedReason
        story.closedAt = new Date().toISOString()
        record('story', id, 'closed')
      } else if (body.action === 'activate') {
        if (story.status !== 'closed') {
          return { id, ok: false, error: '42202' }
        }
        story.status = 'active'
        story.closedReason = null
        story.closedAt = null
        record('story', id, 'activated')
      } else if (body.action === 'assign') {
        const assignee = body.params?.assignee
        if (typeof assignee !== 'string' || assignee.length === 0) {
          return { id, ok: false, error: '42201' }
        }
        story.assignee = assignee
        story.assignedAt = new Date().toISOString()
        record('story', id, 'assigned')
        notify(assignee, 'task-assigned', 'story', id, story.title)
      } else {
        const patch = items.find((item) => item.id === id)
        if (patch) {
          if (patch.title !== undefined) {
            story.title = patch.title
          }
          if (patch.priority !== undefined) {
            story.priority = patch.priority
          }
          story.updatedAt = new Date().toISOString()
          record('story', id, 'edited')
        }
      }
      story.lockVersion += 1
      return { id, ok: true, error: null }
    })
    return ok({ results })
  }),

  http.get('*/api/v1/stories/:storyId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([S.view])) {
      return forbidden(S.view)
    }
    const story = db.stories.find((item) => item.id === Number(params.storyId))
    if (!story) {
      return notFound()
    }
    if (!visibleProduct(story.productId)) {
      return hidden()
    }
    return ok(story)
  }),

  http.patch('*/api/v1/stories/:storyId', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([S.edit])) {
      return forbidden(S.edit)
    }
    const story = findStory(Number(params.storyId))
    if (!story) {
      return notFound()
    }
    const body = (await request.json()) as Record<string, unknown>
    if (body.lockVersion !== undefined && body.lockVersion !== story.lockVersion) {
      return lockConflict()
    }
    const invalid = validateStoryBody({ ...body, priority: body.priority ?? story.priority })
    if (invalid) {
      return validation(invalid)
    }
    for (const key of [
      'title',
      'keywords',
      'priority',
      'estimateHours',
      'categoryId',
      'planId',
      'description',
      'notifyAccounts',
      'linkedStoryIds',
    ]) {
      if (key in body) {
        ;(story as unknown as Record<string, unknown>)[key] = body[key]
      }
    }
    story.lockVersion += 1
    story.updatedAt = new Date().toISOString()
    record('story', story.id, 'edited')
    return ok(story)
  }),

  // 软删需求（§5 DELETE）：存在未删任务引用 storyId → 42203；被未删子需求 parentId 引用 → 42203。
  http.delete('*/api/v1/stories/:storyId', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([S.delete])) {
      return forbidden(S.delete)
    }
    const story = findStory(Number(params.storyId))
    if (!story) {
      return notFound()
    }
    if (db.tasks.some((item) => item.storyId === story.id)) {
      return conditionNotMet('需求下存在未删除的任务，不能删除。')
    }
    if (db.stories.some((item) => item.parentId === story.id)) {
      return conditionNotMet('存在未删除的子需求，不能删除。')
    }
    db.stories = db.stories.filter((item) => item.id !== story.id)
    record('story', story.id, 'deleted')
    return ok(null)
  }),

  http.post('*/api/v1/stories/:storyId/submit-review', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([S.submitReview])) {
      return forbidden(S.submitReview)
    }
    const story = findStory(Number(params.storyId))
    if (!story) {
      return notFound()
    }
    if (story.status !== 'draft' && story.status !== 'changed') {
      return stateConflict('仅草稿/已变更状态可提交评审。')
    }
    const body = (await request.json().catch(() => ({}))) as { reviewers?: string[] | null; comment?: string | null }
    if (body.reviewers && body.reviewers.length > 0) {
      story.reviewers = body.reviewers
    }
    if (story.needNotReview) {
      story.status = 'active'
      record('story', story.id, 'activated', body.comment ?? null)
    } else {
      if ((story.reviewers ?? []).length === 0) {
        return validation('提交评审时评审人不能为空。', { reviewers: 'required' })
      }
      story.status = 'reviewing'
      record('story', story.id, 'submitted', body.comment ?? null)
      for (const reviewer of story.reviewers ?? []) {
        notify(reviewer, 'story-created', 'story', story.id, story.title)
      }
    }
    story.lockVersion += 1
    return ok(story)
  }),

  http.post('*/api/v1/stories/:storyId/pass', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([S.pass])) {
      return forbidden(S.pass)
    }
    const story = findStory(Number(params.storyId))
    if (!story) {
      return notFound()
    }
    if (story.status !== 'reviewing') {
      return stateConflict('仅评审中状态可通过。')
    }
    const body = (await request.json().catch(() => ({}))) as { comment?: string | null }
    story.status = 'active'
    story.lockVersion += 1
    record('story', story.id, 'passed', body.comment ?? null)
    if (story.createdBy) {
      notify(story.createdBy, 'story-changed', 'story', story.id, story.title)
    }
    return ok(story)
  }),

  http.post('*/api/v1/stories/:storyId/reject', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([S.pass])) {
      return forbidden(S.pass)
    }
    const story = findStory(Number(params.storyId))
    if (!story) {
      return notFound()
    }
    if (story.status !== 'reviewing') {
      return stateConflict('仅评审中状态可拒绝。')
    }
    const body = (await request.json().catch(() => ({}))) as { comment?: string }
    if (!body.comment || body.comment.trim().length === 0) {
      return validation('评审拒绝必须填写备注。', { comment: 'required' })
    }
    story.status = 'draft'
    story.lockVersion += 1
    record('story', story.id, 'rejected', body.comment)
    if (story.createdBy) {
      notify(story.createdBy, 'story-changed', 'story', story.id, story.title)
    }
    return ok(story)
  }),

  http.post('*/api/v1/stories/:storyId/change', ({ params }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['story-change'])) {
      return forbidden('story-change')
    }
    const story = findStory(Number(params.storyId))
    if (!story) {
      return notFound()
    }
    if (story.status !== 'active') {
      return stateConflict('仅激活状态可发起变更。')
    }
    story.status = 'changing'
    story.lockVersion += 1
    record('story', story.id, 'changed')
    return ok(story)
  }),

  http.post('*/api/v1/stories/:storyId/change-done', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm(['story-change'])) {
      return forbidden('story-change')
    }
    const story = findStory(Number(params.storyId))
    if (!story) {
      return notFound()
    }
    if (story.status !== 'changing') {
      return stateConflict('仅变更中状态可完成变更。')
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const changed = body.title !== undefined && body.title !== story.title
    const specChanged = body.description !== undefined && body.description !== story.description
    if (!changed && !specChanged) {
      return validation('变更完成要求名称或描述有实际修改。')
    }
    for (const key of [
      'title',
      'keywords',
      'priority',
      'estimateHours',
      'categoryId',
      'planId',
      'description',
      'notifyAccounts',
      'linkedStoryIds',
    ]) {
      if (key in body) {
        ;(story as unknown as Record<string, unknown>)[key] = body[key]
      }
    }
    story.status = 'changed'
    story.lockVersion += 1
    story.updatedAt = new Date().toISOString()
    record('story', story.id, 'changeDone')
    return ok(story)
  }),

  http.post('*/api/v1/stories/:storyId/close', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([S.close])) {
      return forbidden(S.close)
    }
    const story = findStory(Number(params.storyId))
    if (!story) {
      return notFound()
    }
    if (story.status !== 'active' && story.status !== 'changed') {
      return stateConflict('仅激活/已变更状态可关闭。')
    }
    const body = (await request.json().catch(() => ({}))) as {
      closedReason?: string
      duplicateOfId?: number | null
      comment?: string | null
    }
    const allowed = ['done', 'duplicate', 'rejected', 'willnotfix', 'postponed']
    if (!body.closedReason || !allowed.includes(body.closedReason)) {
      return validation('closedReason 必填。', { closedReason: 'required' })
    }
    if (body.closedReason === 'duplicate' && (body.duplicateOfId === null || body.duplicateOfId === undefined)) {
      return validation('关闭原因为重复时必须选择重复需求。', { duplicateOfId: 'required' })
    }
    story.status = 'closed'
    story.closedReason = body.closedReason as StoryViewClosedReason
    story.duplicateOfId = body.duplicateOfId ?? null
    story.closedBy = currentAccount()?.account ?? null
    story.closedAt = new Date().toISOString()
    story.lockVersion += 1
    record('story', story.id, 'closed', body.comment ?? null)
    return ok(story)
  }),

  http.post('*/api/v1/stories/:storyId/activate', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([S.activate])) {
      return forbidden(S.activate)
    }
    const story = findStory(Number(params.storyId))
    if (!story) {
      return notFound()
    }
    if (story.status !== 'closed') {
      return stateConflict('仅已关闭状态可激活。')
    }
    const body = (await request.json().catch(() => ({}))) as { comment?: string | null }
    story.status = 'active'
    story.closedReason = null
    story.closedAt = null
    story.closedBy = null
    story.lockVersion += 1
    record('story', story.id, 'activated', body.comment ?? null)
    return ok(story)
  }),

  http.post('*/api/v1/stories/:storyId/assign', async ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([S.assign])) {
      return forbidden(S.assign)
    }
    const story = findStory(Number(params.storyId))
    if (!story) {
      return notFound()
    }
    if (story.status === 'closed') {
      return stateConflict('已关闭的需求不可指派。')
    }
    const body = (await request.json().catch(() => ({}))) as { assignee?: string; comment?: string | null }
    if (!body.assignee) {
      return validation('assignee 必填。', { assignee: 'required' })
    }
    story.assignee = body.assignee
    story.assignedAt = new Date().toISOString()
    story.lockVersion += 1
    record('story', story.id, 'assigned', body.comment ?? null)
    notify(body.assignee, 'task-assigned', 'story', story.id, story.title)
    return ok(story)
  }),

  http.get('*/api/v1/stories/:storyId/activities', ({ params, request }) => {
    if (!currentAccount()) {
      return unauthorized()
    }
    if (!hasPerm([S.view])) {
      return forbidden(S.view)
    }
    const story = findStory(Number(params.storyId))
    if (!story) {
      return notFound()
    }
    const url = new URL(request.url)
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)
    const beforeId = Number(url.searchParams.get('beforeId') ?? Number.MAX_SAFE_INTEGER)
    const items = db.activities
      .filter((activity) => activity.objectType === 'story' && activity.objectId === story.id && activity.id < beforeId)
      .sort((a, b) => b.id - a.id)
      .slice(0, limit)
    return ok({ items, hasMore: items.length === limit })
  }),
]
