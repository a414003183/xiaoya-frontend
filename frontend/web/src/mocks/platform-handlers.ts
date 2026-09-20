import { HttpResponse, http } from 'msw'
import { BOARD_META_BY_DOMAIN } from './board-handlers'
import {
  currentAccount,
  db,
  error,
  FORBIDDEN,
  mockId,
  NOT_FOUND,
  PRIVILEGE_CATALOG,
  privilegesOf,
  UNAUTHENTICATED,
} from './db'
import { DOC_META_BY_DOMAIN } from './doc-handlers'
import {
  ACCOUNT_GENDER_OPTIONS,
  ACCOUNT_STATUS_OPTIONS,
  BUG_BROWSER_DICT_ITEMS,
  BUG_OS_DICT_ITEMS,
  NOTIFICATION_READ_AT_OPTIONS,
  NOTIFICATION_TYPE_OPTIONS,
  TIMEZONE_DICT_ITEMS,
  TODO_TYPE_DICT_ITEMS,
} from './meta-options'
import { PRODUCT_META_BY_DOMAIN } from './product-handlers'
import { PROJECT_META_BY_DOMAIN } from './project-handlers'
import { QUALITY_META_BY_DOMAIN } from './quality-handlers'
import { QUALITY_SUITE_META_BY_DOMAIN } from './quality-suite-handlers'
import { QUALITY_RUN_META_BY_DOMAIN } from './quality-testrun-handlers'
import { STORY_META } from './story-handlers'
import { TASK_META_BY_DOMAIN } from './task-handlers'
import { WORKSPACE_META_BY_DOMAIN } from './workspace-handlers'

const ok = (data: unknown) => HttpResponse.json({ data })
const unauthorized = () => HttpResponse.json(UNAUTHENTICATED, { status: 401 })

/** 语言包 Excel 的 MIME（platform 卡 §3.12；mock 导出用）。 */
const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function requireSession(): boolean {
  return currentAccount() !== null
}

/** 个人级设置键（owner=@me、免 setting-manage 码）：通知偏好与地盘布局（workspace §3.5）。 */
function isPersonalSetting(key: string): boolean {
  return key.startsWith('notify.') || key === 'dashboard.layout'
}

/** 等值或逗号 IN（platform/filters/Filters：含逗号即 IN，与后端同口径）。 */
function matchIn(value: unknown, filter: string | null): boolean {
  if (!filter) {
    return true
  }
  return filter.split(',').some((item) => item === String(value ?? ''))
}

/**
 * 日期区间 `a..b`（含当日；开区间 `a..` / `..b`），裸值退化为等值。
 * 行里存的是 ISO 时间戳、区间两半是 `YYYY-MM-DD`——比较前统一截到日，
 * 否则 `2026-09-03T08:00:00Z > 2026-09-03`，区间上界当天会被整日漏掉。
 */
function matchDayRange(value: unknown, filter: string | null): boolean {
  if (!filter) {
    return true
  }
  const day = String(value ?? '').slice(0, 10)
  if (!filter.includes('..')) {
    return day === filter.slice(0, 10)
  }
  const [from, to] = filter.split('..')
  if (from && day < from) {
    return false
  }
  return !(to && day > to)
}

/** 平台域 MSW handlers：通知/文件/搜索/meta/dicts/settings/lang-items/comments/audit-logs。 */
export const platformHandlers = [
  // ── 通知 ──
  http.get('*/api/v1/notifications', ({ request }) => {
    if (!requireSession()) {
      return unauthorized()
    }
    const account = currentAccount()
    const url = new URL(request.url)
    const readAt = url.searchParams.get('filters[readAt]')
    const type = url.searchParams.get('filters[type]')
    const page = Number(url.searchParams.get('page') ?? 1)
    const limit = Number(url.searchParams.get('limit') ?? 50)
    let items = db.notifications.filter((item) => item.recipient === account?.account)
    if (readAt === '@null') {
      items = items.filter((item) => item.readAt === null)
    } else if (readAt === '@notNull') {
      items = items.filter((item) => item.readAt !== null)
    }
    if (type) {
      items = items.filter((item) => item.type === type)
    }
    items = [...items].sort((a, b) => b.id - a.id)
    const total = items.length
    return ok({ items: items.slice((page - 1) * limit, page * limit), total })
  }),

  http.get('*/api/v1/notifications/unread-count', () => {
    if (!requireSession()) {
      return unauthorized()
    }
    const account = currentAccount()
    const count = db.notifications.filter((item) => item.recipient === account?.account && item.readAt === null).length
    return ok({ count })
  }),

  http.post('*/api/v1/notifications/:notificationId/read', ({ params }) => {
    if (!requireSession()) {
      return unauthorized()
    }
    const account = currentAccount()
    const item = db.notifications.find((row) => row.id === Number(params.notificationId))
    if (!item) {
      return HttpResponse.json(NOT_FOUND, { status: 404 })
    }
    if (item.recipient !== account?.account) {
      return HttpResponse.json(error(40302, '非本人通知。'), { status: 403 })
    }
    item.readAt ??= new Date().toISOString()
    return ok(item)
  }),

  http.get('*/api/v1/notifications/stream', () => {
    if (!requireSession()) {
      return unauthorized()
    }
    const body = 'retry: 5000\n\nevent: ping\n\n'
    return new HttpResponse(body, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }),

  // ── 文件 ──
  http.post('*/api/v1/files', async ({ request }) => {
    if (!requireSession()) {
      return unauthorized()
    }
    const account = currentAccount()
    // 权限码 file-upload 在 mock 中仅超管组拥有；普通账号 40301
    if (!account?.groupIds.includes(1)) {
      return HttpResponse.json(FORBIDDEN('file-upload'), { status: 403 })
    }
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return HttpResponse.json(error(42201, '缺少文件。'), { status: 422 })
    }
    const view = {
      id: mockId(),
      title: file.name,
      extension: file.name.split('.').pop() ?? '',
      size: file.size,
      objectType: String(form.get('objectType') ?? ''),
      objectId: Number(form.get('objectId') ?? 0),
      downloads: 0,
      createdBy: account.account,
      createdAt: new Date().toISOString(),
      deletedAt: null,
    }
    db.files.push(view)
    return ok({ ...view, url: `/files/${view.id}/download` })
  }),

  http.get('*/api/v1/files', ({ request }) => {
    if (!requireSession()) {
      return unauthorized()
    }
    const url = new URL(request.url)
    const objectType = url.searchParams.get('filters[objectType]')
    const objectId = url.searchParams.get('filters[objectId]')
    if (!objectType || !objectId) {
      return HttpResponse.json(error(40001, 'filters[objectType] 与 filters[objectId] 必填。'), { status: 400 })
    }
    const items = db.files.filter(
      (file) => file.deletedAt === null && file.objectType === objectType && file.objectId === Number(objectId),
    )
    return ok({
      items: items.map(({ deletedAt: _deletedAt, ...rest }) => ({ ...rest, url: `/files/${rest.id}/download` })),
      total: items.length,
    })
  }),

  http.get('*/api/v1/files/:fileId/download', ({ params }) => {
    if (!requireSession()) {
      return unauthorized()
    }
    const file = db.files.find((row) => row.id === Number(params.fileId) && row.deletedAt === null)
    if (!file) {
      return HttpResponse.json(NOT_FOUND, { status: 404 })
    }
    file.downloads += 1
    return new HttpResponse('mock-file-content', {
      headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="mock"' },
    })
  }),

  http.delete('*/api/v1/files/:fileId', ({ params }) => {
    if (!requireSession()) {
      return unauthorized()
    }
    const account = currentAccount()
    const file = db.files.find((row) => row.id === Number(params.fileId) && row.deletedAt === null)
    if (!file) {
      return HttpResponse.json(NOT_FOUND, { status: 404 })
    }
    const isSuperAdmin = account?.groupIds.includes(1) ?? false
    if (file.createdBy !== account?.account && !isSuperAdmin) {
      return HttpResponse.json(error(40302, '仅上传人或超管可删除。'), { status: 403 })
    }
    file.deletedAt = new Date().toISOString()
    return ok(null)
  }),

  // ── 搜索 ──
  http.get('*/api/v1/search', ({ request }) => {
    if (!requireSession()) {
      return unauthorized()
    }
    const url = new URL(request.url)
    const q = url.searchParams.get('q')
    if (!q) {
      return HttpResponse.json(error(40001, 'q 必填。'), { status: 400 })
    }
    // P1 无业务域注册 scope：全部返回空集
    return ok({ items: [], total: 0 })
  }),

  // ── meta / dicts ──
  http.get('*/api/v1/meta/:domain', ({ params }) => {
    if (!requireSession()) {
      return unauthorized()
    }
    if (params.domain === 'account') {
      return ok({
        domain: 'account',
        fields: [
          { key: 'account', type: 'text', required: true, maxLength: 30, i18n: 'account.field.account' },
          { key: 'password', type: 'text', required: true, i18n: 'account.field.password' },
          { key: 'realName', type: 'text', required: true, maxLength: 100, i18n: 'account.field.realName' },
          { key: 'role', type: 'select', source: 'roles', i18n: 'account.field.role' },
          { key: 'departmentId', type: 'select', source: 'departments', i18n: 'account.field.department' },
          { key: 'status', type: 'select', i18n: 'org.account.field.status', options: ACCOUNT_STATUS_OPTIONS },
          { key: 'gender', type: 'select', i18n: 'org.account.field.gender', options: ACCOUNT_GENDER_OPTIONS },
          { key: 'groupIds', type: 'multiselect', source: 'groups', multiple: true, i18n: 'account.field.groups' },
        ],
        list: { defaultColumns: ['id', 'account', 'realName', 'status'], defaultSort: '-id' },
        actions: [
          { code: 'account-disable', action: 'disable', i18n: 'account.action.disable', allowedStatus: ['active'] },
          { code: 'account-enable', action: 'enable', i18n: 'account.action.enable', allowedStatus: ['disabled'] },
        ],
        statusVisuals: {
          active: { tone: 'active', i18n: 'account.status.active' },
          disabled: { tone: 'closed', i18n: 'account.status.disabled' },
        },
      })
    }
    if (params.domain === 'notification') {
      return ok({
        domain: 'notification',
        fields: [
          {
            key: 'readAt',
            type: 'select',
            i18n: 'common.field.status',
            options: NOTIFICATION_READ_AT_OPTIONS,
          },
          {
            key: 'type',
            type: 'select',
            i18n: 'platform.notification.field.type',
            options: NOTIFICATION_TYPE_OPTIONS,
          },
        ],
        list: { defaultColumns: ['id', 'title', 'type', 'createdAt'], defaultSort: '-id' },
        actions: [],
        statusVisuals: {},
      })
    }
    if (params.domain === 'department') {
      return ok({
        domain: 'department',
        fields: [{ key: 'name', type: 'text', required: true, maxLength: 60, i18n: 'department.field.name' }],
        list: { defaultColumns: ['id', 'name', 'sort'], defaultSort: 'sort' },
        actions: [],
        statusVisuals: {},
      })
    }
    const domainMeta =
      DOC_META_BY_DOMAIN[params.domain as string] ??
      PRODUCT_META_BY_DOMAIN[params.domain as string] ??
      PROJECT_META_BY_DOMAIN[params.domain as string] ??
      BOARD_META_BY_DOMAIN[params.domain as string] ??
      TASK_META_BY_DOMAIN[params.domain as string] ??
      QUALITY_META_BY_DOMAIN[params.domain as string] ??
      QUALITY_SUITE_META_BY_DOMAIN[params.domain as string] ??
      QUALITY_RUN_META_BY_DOMAIN[params.domain as string] ??
      WORKSPACE_META_BY_DOMAIN[params.domain as string] ??
      (params.domain === 'story' ? STORY_META : undefined)
    if (domainMeta) {
      return ok(domainMeta)
    }
    return HttpResponse.json(NOT_FOUND, { status: 404 })
  }),

  http.get('*/api/v1/dicts/:name', ({ params }) => {
    if (!requireSession()) {
      return unauthorized()
    }
    switch (params.name) {
      case 'accounts':
        return ok({
          name: 'accounts',
          items: db.accounts
            .filter((account) => account.status === 'active' && account.deletedAt === null)
            .map((account) => ({ account: account.account, realName: account.realName })),
        })
      case 'departments':
        return ok({
          name: 'departments',
          items: db.departments.map((department) => ({
            id: department.id,
            name: department.name,
            parentId: department.parentId,
          })),
        })
      case 'timezones':
        return ok({ name: 'timezones', items: TIMEZONE_DICT_ITEMS })
      case 'todoType':
        return ok({ name: 'todoType', items: TODO_TYPE_DICT_ITEMS })
      case 'bug-os':
        return ok({ name: 'bug-os', items: BUG_OS_DICT_ITEMS })
      case 'bug-browser':
        return ok({ name: 'bug-browser', items: BUG_BROWSER_DICT_ITEMS })
      case 'locales':
        return ok({
          name: 'locales',
          items: [
            { value: 'zh-cn', label: '简体中文' },
            { value: 'en', label: 'English' },
          ],
        })
      case 'privileges':
        return ok({ name: 'privileges', items: PRIVILEGE_CATALOG })
      case 'roles':
        // 角色字典（org §3.4）：{code, labels, sort, builtin}——账号 meta 的 role 选项唯一来源
        return ok({
          name: 'roles',
          items: [...db.roles]
            .sort((a, b) => a.sort - b.sort || a.code.localeCompare(b.code))
            .map((role) => ({ code: role.code, labels: role.labels, sort: role.sort, builtin: role.builtin })),
        })
      default:
        return HttpResponse.json(NOT_FOUND, { status: 404 })
    }
  }),

  // ── settings ──
  http.get('*/api/v1/settings', ({ request }) => {
    if (!requireSession()) {
      return unauthorized()
    }
    const account = currentAccount()
    const url = new URL(request.url)
    const keys = (url.searchParams.get('keys') ?? '').split(',').filter(Boolean)
    const settings: Record<string, unknown> = {}
    for (const key of keys) {
      const value = isPersonalSetting(key) ? db.settings.get(`${account?.account}:${key}`) : db.settings.get(key)
      if (value !== undefined) {
        settings[key] = value
      }
    }
    return ok({ settings })
  }),

  http.put('*/api/v1/settings', async ({ request }) => {
    if (!requireSession()) {
      return unauthorized()
    }
    const account = currentAccount()
    const body = (await request.json()) as { settings: Record<string, unknown> }
    const systemKeys = Object.keys(body.settings).filter((key) => !isPersonalSetting(key))
    const isSuperAdmin = account?.groupIds.includes(1) ?? false
    if (systemKeys.length > 0 && !isSuperAdmin) {
      return HttpResponse.json(FORBIDDEN('setting-manage'), { status: 403 })
    }
    for (const [key, value] of Object.entries(body.settings)) {
      if (isPersonalSetting(key)) {
        db.settings.set(`${account?.account}:${key}`, value)
      } else {
        db.settings.set(key, value)
      }
    }
    return ok({ settings: body.settings })
  }),

  // ── lang-items ──
  http.get('*/api/v1/lang-items/:domain/:field', ({ params }) => {
    if (!requireSession()) {
      return unauthorized()
    }
    const items: Record<string, string> = {}
    let overridden = false
    for (const [key, value] of db.langOverrides) {
      const itemKey = key.split('/')[2]
      if (key.startsWith(`${params.domain}/${params.field}/`) && itemKey !== undefined) {
        items[itemKey] = value
        overridden = true
      }
    }
    return ok({ items, overridden })
  }),

  http.put('*/api/v1/lang-items/:domain/:field', async ({ request, params }) => {
    if (!requireSession()) {
      return unauthorized()
    }
    const account = currentAccount()
    if (!account?.groupIds.includes(1)) {
      return HttpResponse.json(FORBIDDEN('lang-manage'), { status: 403 })
    }
    const body = (await request.json()) as { items: Record<string, string> }
    for (const [key, value] of Object.entries(body.items)) {
      db.langOverrides.set(`${params.domain}/${params.field}/${key}`, value)
    }
    return ok({ items: body.items })
  }),

  http.delete('*/api/v1/lang-items/:domain/:field', ({ params }) => {
    if (!requireSession()) {
      return unauthorized()
    }
    const account = currentAccount()
    if (!account?.groupIds.includes(1)) {
      return HttpResponse.json(FORBIDDEN('lang-manage'), { status: 403 })
    }
    for (const key of [...db.langOverrides.keys()]) {
      if (key.startsWith(`${params.domain}/${params.field}/`)) {
        db.langOverrides.delete(key)
      }
    }
    return ok({ items: {} })
  }),

  // ── 多语言上传（platform 卡 §3.12） ──
  /** 覆盖层全量：mock 的 langOverrides 键是 `${lang}/${domain}/${section}/${itemKey}`，这里还原成全点分键。 */
  http.get('*/api/v1/lang-items/overrides', ({ request }) => {
    if (!requireSession()) {
      return unauthorized()
    }
    const lang = new URL(request.url).searchParams.get('lang') ?? 'zh-cn'
    const items: { lang: string; domain: string; section: string; key: string; value: string }[] = []
    for (const [stored, value] of db.langOverrides) {
      const [owner, domain, section, ...rest] = stored.split('/')
      if (owner !== lang || domain === undefined || section === undefined) {
        continue
      }
      const itemKey = rest.join('/')
      const key = section === '_' ? `${domain}.${itemKey}` : `${domain}.${section}.${itemKey}`
      items.push({ lang, domain, section, key, value })
    }
    return ok({ items })
  }),

  /** 语言包导出：mock 里没有真 Excel 生成器，回一个同 MIME 的占位 blob（mock 仅供联调/页面测试）。 */
  http.get('*/api/v1/lang-items/export', () => {
    if (!requireSession()) {
      return unauthorized()
    }
    const account = currentAccount()
    if (!account?.groupIds.includes(1)) {
      return HttpResponse.json(FORBIDDEN('lang-manage'), { status: 403 })
    }
    // 文本体（而非 Blob）：mock 也要能在 jsdom/MSW 下跑（undici 不认 jsdom Blob），浏览器侧等价
    return new HttpResponse('mock-xlsx', {
      headers: {
        'Content-Type': XLSX_CONTENT_TYPE,
        'Content-Disposition': 'attachment; filename="lang-zh-CN.xlsx"',
      },
    })
  }),

  http.post('*/api/v1/lang-imports', async ({ request }) => {
    if (!requireSession()) {
      return unauthorized()
    }
    const account = currentAccount()
    if (!account?.groupIds.includes(1)) {
      return HttpResponse.json(FORBIDDEN('lang-manage'), { status: 403 })
    }
    const form = await request.formData()
    const file = form.get('file')
    const lang = String(form.get('lang') ?? 'zh-cn')
    const fileName = file instanceof File && file.name !== '' ? file.name : 'lang.xlsx'
    // mock 便利：文件名含 bad 即演示校验失败面板（真校验在服务端 LangImportService）
    const failed = fileName.includes('bad')
    const row = {
      id: mockId(),
      lang,
      fileName,
      totalRows: failed ? 2 : 1,
      appliedRows: failed ? 0 : 1,
      failedRows: failed ? 1 : 0,
      status: failed ? ('failed' as const) : ('success' as const),
      message: failed ? '校验失败（mock）' : null,
      createdBy: account.account,
      createdAt: new Date().toISOString(),
    }
    db.langImports.push(row)
    if (failed) {
      return HttpResponse.json(
        { error: { code: 42201, message: '字段校验失败。', fields: { 'row:2': 'unknown-key' } } },
        { status: 422 },
      )
    }
    return ok(row)
  }),

  http.get('*/api/v1/lang-imports', ({ request }) => {
    if (!requireSession()) {
      return unauthorized()
    }
    const account = currentAccount()
    if (!account?.groupIds.includes(1)) {
      return HttpResponse.json(FORBIDDEN('lang-manage'), { status: 403 })
    }
    const url = new URL(request.url)
    const lang = url.searchParams.get('filters[lang]')
    const status = url.searchParams.get('filters[status]')
    const q = url.searchParams.get('q') ?? ''
    const page = Number(url.searchParams.get('page') ?? 1)
    const limit = Number(url.searchParams.get('limit') ?? 20)
    let items = [...db.langImports].sort((a, b) => b.id - a.id)
    if (lang) {
      items = items.filter((item) => item.lang === lang)
    }
    if (status) {
      items = items.filter((item) => item.status === status)
    }
    if (q !== '') {
      items = items.filter((item) => item.fileName.includes(q))
    }
    return ok({ items: items.slice((page - 1) * limit, page * limit), total: items.length })
  }),

  // ── comments ──
  http.post('*/api/v1/comments', async ({ request }) => {
    if (!requireSession()) {
      return unauthorized()
    }
    const account = currentAccount()
    const body = (await request.json()) as { objectType: string; objectId: number; content: string }
    const comment = {
      id: mockId(),
      objectType: body.objectType,
      objectId: body.objectId,
      content: body.content,
      createdBy: account?.account ?? '',
      createdAt: new Date().toISOString(),
    }
    db.comments.push(comment)
    db.activities.push({
      id: mockId(),
      objectType: body.objectType,
      objectId: body.objectId,
      actor: account?.account ?? '',
      action: 'commented',
      detail: null,
      remark: body.content,
      occurredAt: comment.createdAt,
    })
    return ok(comment)
  }),

  http.get('*/api/v1/comments', ({ request }) => {
    if (!requireSession()) {
      return unauthorized()
    }
    const url = new URL(request.url)
    const objectType = url.searchParams.get('objectType')
    const objectId = Number(url.searchParams.get('objectId'))
    const items = db.comments
      .filter((comment) => comment.objectType === objectType && comment.objectId === objectId)
      .sort((a, b) => b.id - a.id)
    return ok({ items, total: items.length })
  }),

  // ── 审计日志（platform 卡 §3.13；只读：本文件不提供任何写 handler） ──
  http.get('*/api/v1/audit-logs', ({ request }) => {
    if (!requireSession()) {
      return unauthorized()
    }
    if (!privilegesOf(currentAccount()).includes('audit-log-view')) {
      return HttpResponse.json(FORBIDDEN('audit-log-view'), { status: 403 })
    }
    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') ?? 1)
    const limit = Number(url.searchParams.get('limit') ?? 20)
    const q = url.searchParams.get('q') ?? ''
    const sort = url.searchParams.get('sort') ?? '-createdAt'
    let items = db.auditLogs
      .filter((row) => matchIn(row.account, url.searchParams.get('filters[account]')))
      .filter((row) => matchIn(row.action, url.searchParams.get('filters[action]')))
      .filter((row) => matchIn(row.objectType, url.searchParams.get('filters[objectType]')))
      .filter((row) => matchIn(row.objectId, url.searchParams.get('filters[objectId]')))
      .filter((row) => matchDayRange(row.createdAt, url.searchParams.get('filters[createdAt]')))
    if (q !== '') {
      items = items.filter((row) => (row.account ?? '').includes(q) || row.action.includes(q))
    }
    // 排序白名单 id/createdAt，缺省 -createdAt（'-' 前缀 = 倒序，与契约同口径）
    const byId = sort.replace(/^-/, '') === 'id'
    items = items.sort(
      (a, b) => (byId ? a.id - b.id : a.createdAt.localeCompare(b.createdAt)) * (sort.startsWith('-') ? -1 : 1),
    )
    return ok({ items: items.slice((page - 1) * limit, page * limit), total: items.length })
  }),
]
