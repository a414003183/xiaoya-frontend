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

/** 扁平键 → 参数行视图（T15；value 出 JSON 文本，与后端同形）。 */
function toSettingEntry(key: string, value: unknown): { key: string; domain: string; itemKey: string; value: string } {
  const dot = key.indexOf('.')
  return { key, domain: key.slice(0, dot), itemKey: key.slice(dot + 1), value: JSON.stringify(value) }
}

/** 参数写入口的校验（键格式/键重复留给调用点，这里管形状与 JSON）：返回违规说明，null = 通过。 */
function settingEntryViolation(key: string, jsonText: string | undefined): string | null {
  const dot = key.indexOf('.')
  if (dot <= 0 || dot === key.length - 1) {
    return '键格式非法。'
  }
  if (jsonText === undefined || jsonText === '') {
    return '缺少参数值。'
  }
  try {
    JSON.parse(jsonText)
  } catch {
    return '参数值必须是合法 JSON。'
  }
  return null
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

/** 内置字典名（T16：DB 类型不得撞；与后端 DictRegistry 的注册名同集）。 */
const BUILTIN_DICT_NAMES = ['accounts', 'departments', 'timezones', 'locales', 'privileges', 'bug-os', 'bug-browser']
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
    if (!account?.roleIds.includes(1)) {
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
    const isSuperAdmin = account?.roleIds.includes(1) ?? false
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
          { key: 'roleId', type: 'select', source: 'roles', i18n: 'account.field.roles' },
          { key: 'departmentId', type: 'select', source: 'departments', i18n: 'account.field.department' },
          { key: 'status', type: 'select', i18n: 'org.account.field.status', options: ACCOUNT_STATUS_OPTIONS },
          { key: 'gender', type: 'select', i18n: 'org.account.field.gender', options: ACCOUNT_GENDER_OPTIONS },
          { key: 'roleIds', type: 'multiselect', source: 'roles', multiple: true, i18n: 'account.field.roles' },
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
        // 角色字典（T23）：{value: 角色 id, label: 角色名}——账号表单与筛选的选项唯一来源
        return ok({
          name: 'roles',
          items: [...db.roles]
            .sort((a, b) => a.sort - b.sort || a.id - b.id)
            .map((role) => ({ value: role.id, label: role.name, code: role.code, sort: role.sort })),
        })
      default: {
        // DB 字典回落（T16）：与后端 DictRegistry 同口径——内置字典优先，没注册过的名去 dict_data 找
        const type = db.dictTypes.find((row) => row.code === String(params.name) && row.status === 'active')
        if (!type) {
          return HttpResponse.json(NOT_FOUND, { status: 404 })
        }
        return ok({
          name: type.code,
          items: db.dictData
            .filter((row) => row.typeCode === type.code && row.status === 'active')
            .sort((a, b) => a.sortNo - b.sortNo)
            .map((row) => ({ value: row.itemValue, label: row.itemLabel })),
        })
      }
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
    const isSuperAdmin = account?.roleIds.includes(1) ?? false
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
    if (!account?.roleIds.includes(1)) {
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
    if (!account?.roleIds.includes(1)) {
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
    if (!account?.roleIds.includes(1)) {
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
      // T04：分类/结果/批次三个新过滤面
      .filter((row) => matchIn(row.category, url.searchParams.get('filters[category]')))
      .filter((row) => matchIn(row.result, url.searchParams.get('filters[result]')))
      .filter((row) => matchIn(row.batchId, url.searchParams.get('filters[batchId]')))
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

  // ── 服务监控（T17 P1-5：原始字节数，百分比在页面算） ──
  http.get('*/api/v1/monitor/server', () => {
    if (!requireSession()) {
      return unauthorized()
    }
    if (!privilegesOf(currentAccount()).includes('monitor-view')) {
      return HttpResponse.json(FORBIDDEN('monitor-view'), { status: 403 })
    }
    const gib = 1024 ** 3
    return ok({
      cpuCores: 8,
      cpuLoad: 0.42,
      memoryTotalBytes: 16 * gib,
      memoryUsedBytes: 8 * gib,
      diskTotalBytes: 512 * gib,
      diskUsedBytes: 128 * gib,
      diskPath: '/srv/zentao',
      jvmHeapUsedBytes: 512 * 1024 ** 2,
      jvmHeapMaxBytes: 4 * gib,
      uptimeSeconds: 90061,
      sampledAt: '2026-09-21T06:00:00Z',
    })
  }),

  // ── 字典管理（T16 P1-4：DB 字典只扩展内置字典；内置名不在这里） ──
  http.get('*/api/v1/dict-types', ({ request }) => {
    if (!requireSession()) {
      return unauthorized()
    }
    if (!privilegesOf(currentAccount()).includes('setting-manage')) {
      return HttpResponse.json(FORBIDDEN('setting-manage'), { status: 403 })
    }
    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') ?? 1)
    const limit = Number(url.searchParams.get('limit') ?? 20)
    const q = url.searchParams.get('q') ?? ''
    let items = db.dictTypes.filter((row) => matchIn(row.status, url.searchParams.get('filters[status]')))
    if (q !== '') {
      items = items.filter((row) => row.code.includes(q) || row.name.includes(q))
    }
    items = [...items].sort((a, b) => a.code.localeCompare(b.code))
    return ok({ items: items.slice((page - 1) * limit, page * limit), total: items.length })
  }),

  http.post('*/api/v1/dict-types', async ({ request }) => {
    if (!requireSession()) {
      return unauthorized()
    }
    if (!privilegesOf(currentAccount()).includes('setting-manage')) {
      return HttpResponse.json(FORBIDDEN('setting-manage'), { status: 403 })
    }
    const body = (await request.json()) as { code?: string; name?: string }
    const code = (body.code ?? '').trim()
    if (!/^[a-z][a-z0-9-]*$/.test(code) || (body.name ?? '').trim() === '') {
      return HttpResponse.json(error(42201, '字典名格式非法。'), { status: 422 })
    }
    // 内置字典名（handler 的 switch 里那批）+ 已有 DB 类型都不许撞
    if (BUILTIN_DICT_NAMES.includes(code) || db.dictTypes.some((row) => row.code === code)) {
      return HttpResponse.json(error(42201, '字典名重复。'), { status: 422 })
    }
    const row = { code, name: (body.name ?? '').trim(), status: 'active' }
    db.dictTypes.push(row)
    return ok(row)
  }),

  http.patch('*/api/v1/dict-types/:code', async ({ request, params }) => {
    if (!requireSession()) {
      return unauthorized()
    }
    if (!privilegesOf(currentAccount()).includes('setting-manage')) {
      return HttpResponse.json(FORBIDDEN('setting-manage'), { status: 403 })
    }
    const row = db.dictTypes.find((type) => type.code === String(params.code))
    if (!row) {
      return HttpResponse.json(NOT_FOUND, { status: 404 })
    }
    const body = (await request.json()) as { name?: string; status?: string }
    if (body.name !== undefined) {
      row.name = body.name
    }
    if (body.status !== undefined) {
      row.status = body.status
    }
    return ok(row)
  }),

  http.delete('*/api/v1/dict-types/:code', ({ params }) => {
    if (!requireSession()) {
      return unauthorized()
    }
    if (!privilegesOf(currentAccount()).includes('setting-manage')) {
      return HttpResponse.json(FORBIDDEN('setting-manage'), { status: 403 })
    }
    const code = String(params.code)
    const index = db.dictTypes.findIndex((type) => type.code === code)
    if (index < 0) {
      return HttpResponse.json(NOT_FOUND, { status: 404 })
    }
    db.dictTypes.splice(index, 1)
    // 级联：类型没了，数据项就是孤儿
    db.dictData = db.dictData.filter((item) => item.typeCode !== code)
    return ok(null)
  }),

  http.get('*/api/v1/dict-types/:code/items', ({ request, params }) => {
    if (!requireSession()) {
      return unauthorized()
    }
    if (!privilegesOf(currentAccount()).includes('setting-manage')) {
      return HttpResponse.json(FORBIDDEN('setting-manage'), { status: 403 })
    }
    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') ?? 1)
    const limit = Number(url.searchParams.get('limit') ?? 20)
    let items = db.dictData
      .filter((row) => row.typeCode === String(params.code))
      .filter((row) => matchIn(row.status, url.searchParams.get('filters[status]')))
      .sort((a, b) => a.sortNo - b.sortNo)
    const total = items.length
    items = items.slice((page - 1) * limit, page * limit)
    return ok({ items, total })
  }),

  http.post('*/api/v1/dict-types/:code/items', async ({ request, params }) => {
    if (!requireSession()) {
      return unauthorized()
    }
    if (!privilegesOf(currentAccount()).includes('setting-manage')) {
      return HttpResponse.json(FORBIDDEN('setting-manage'), { status: 403 })
    }
    const code = String(params.code)
    if (!db.dictTypes.some((type) => type.code === code)) {
      return HttpResponse.json(NOT_FOUND, { status: 404 })
    }
    const body = (await request.json()) as { itemLabel?: string; itemValue?: string; sortNo?: number }
    const value = (body.itemValue ?? '').trim()
    if ((body.itemLabel ?? '').trim() === '' || value === '') {
      return HttpResponse.json(error(42201, '标签与值都要填。'), { status: 422 })
    }
    if (db.dictData.some((item) => item.typeCode === code && item.itemValue === value)) {
      return HttpResponse.json(error(42201, '同类下值重复。'), { status: 422 })
    }
    const row = {
      id: mockId(),
      typeCode: code,
      itemLabel: (body.itemLabel ?? '').trim(),
      itemValue: value,
      sortNo: body.sortNo ?? 0,
      status: 'active',
    }
    db.dictData.push(row)
    return ok(row)
  }),

  http.patch('*/api/v1/dict-items/:id', async ({ request, params }) => {
    if (!requireSession()) {
      return unauthorized()
    }
    if (!privilegesOf(currentAccount()).includes('setting-manage')) {
      return HttpResponse.json(FORBIDDEN('setting-manage'), { status: 403 })
    }
    const row = db.dictData.find((item) => item.id === Number(params.id))
    if (!row) {
      return HttpResponse.json(NOT_FOUND, { status: 404 })
    }
    const body = (await request.json()) as {
      itemLabel?: string
      itemValue?: string
      sortNo?: number
      status?: string
    }
    if (
      body.itemValue !== undefined &&
      db.dictData.some(
        (item) => item.typeCode === row.typeCode && item.itemValue === body.itemValue && item.id !== row.id,
      )
    ) {
      return HttpResponse.json(error(42201, '同类下值重复。'), { status: 422 })
    }
    if (body.itemLabel !== undefined) {
      row.itemLabel = body.itemLabel
    }
    if (body.itemValue !== undefined) {
      row.itemValue = body.itemValue
    }
    if (body.sortNo !== undefined) {
      row.sortNo = body.sortNo
    }
    if (body.status !== undefined) {
      row.status = body.status
    }
    return ok(row)
  }),

  http.delete('*/api/v1/dict-items/:id', ({ params }) => {
    if (!requireSession()) {
      return unauthorized()
    }
    if (!privilegesOf(currentAccount()).includes('setting-manage')) {
      return HttpResponse.json(FORBIDDEN('setting-manage'), { status: 403 })
    }
    const index = db.dictData.findIndex((item) => item.id === Number(params.id))
    if (index < 0) {
      return HttpResponse.json(NOT_FOUND, { status: 404 })
    }
    db.dictData.splice(index, 1)
    return ok(null)
  }),

  // ── 参数管理（T15 P1-3：setting 表系统行；带 `<账号>:` 前缀的是个人偏好，不进这个面） ──
  http.get('*/api/v1/setting-entries', ({ request }) => {
    if (!requireSession()) {
      return unauthorized()
    }
    if (!privilegesOf(currentAccount()).includes('setting-manage')) {
      return HttpResponse.json(FORBIDDEN('setting-manage'), { status: 403 })
    }
    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') ?? 1)
    const limit = Number(url.searchParams.get('limit') ?? 20)
    const q = url.searchParams.get('q') ?? ''
    let items = [...db.settings.entries()]
      .filter(([key]) => !key.includes(':'))
      .map(([key, value]) => toSettingEntry(key, value))
      .filter((entry) => matchIn(entry.domain, url.searchParams.get('filters[domain]')))
    if (q !== '') {
      items = items.filter((entry) => entry.key.includes(q))
    }
    items = items.sort((a, b) => a.key.localeCompare(b.key))
    return ok({ items: items.slice((page - 1) * limit, page * limit), total: items.length })
  }),

  http.post('*/api/v1/setting-entries', async ({ request }) => {
    if (!requireSession()) {
      return unauthorized()
    }
    if (!privilegesOf(currentAccount()).includes('setting-manage')) {
      return HttpResponse.json(FORBIDDEN('setting-manage'), { status: 403 })
    }
    const body = (await request.json()) as { key?: string; value?: string }
    const key = (body.key ?? '').trim()
    const violation = settingEntryViolation(key, body.value)
    if (violation) {
      return HttpResponse.json(error(42201, violation), { status: 422 })
    }
    if (db.settings.has(key)) {
      return HttpResponse.json(error(42201, '键重复。'), { status: 422 })
    }
    const parsed = JSON.parse(body.value as string)
    db.settings.set(key, parsed)
    return ok(toSettingEntry(key, parsed))
  }),

  http.patch('*/api/v1/setting-entries/:key', async ({ request, params }) => {
    if (!requireSession()) {
      return unauthorized()
    }
    if (!privilegesOf(currentAccount()).includes('setting-manage')) {
      return HttpResponse.json(FORBIDDEN('setting-manage'), { status: 403 })
    }
    const key = String(params.key)
    const body = (await request.json()) as { value?: string }
    const violation = settingEntryViolation(key, body.value)
    if (violation) {
      return HttpResponse.json(error(42201, violation), { status: 422 })
    }
    if (!db.settings.has(key)) {
      return HttpResponse.json(NOT_FOUND, { status: 404 })
    }
    const parsed = JSON.parse(body.value as string)
    db.settings.set(key, parsed)
    return ok(toSettingEntry(key, parsed))
  }),

  http.delete('*/api/v1/setting-entries/:key', ({ params }) => {
    if (!requireSession()) {
      return unauthorized()
    }
    if (!privilegesOf(currentAccount()).includes('setting-manage')) {
      return HttpResponse.json(FORBIDDEN('setting-manage'), { status: 403 })
    }
    const key = String(params.key)
    if (!db.settings.has(key)) {
      return HttpResponse.json(NOT_FOUND, { status: 404 })
    }
    db.settings.delete(key)
    return ok(null)
  }),

  // ── 在线用户（T13 P1-1：行 = session 表现存行，强退 = 删行） ──
  http.get('*/api/v1/online-users', ({ request }) => {
    if (!requireSession()) {
      return unauthorized()
    }
    if (!privilegesOf(currentAccount()).includes('online-user-view')) {
      return HttpResponse.json(FORBIDDEN('online-user-view'), { status: 403 })
    }
    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') ?? 1)
    const limit = Number(url.searchParams.get('limit') ?? 20)
    const sort = url.searchParams.get('sort') ?? '-lastSeenAt'
    // current 按登录账号现算：种子里的 current 会随登录身份变化而失真
    const items = db.onlineUsers
      .filter((row) => matchIn(row.account, url.searchParams.get('filters[account]')))
      .map((row) => ({ ...row, current: row.account === currentAccount()?.account }))
      .sort((a, b) => (a.lastSeenAt ?? '').localeCompare(b.lastSeenAt ?? '') * (sort.startsWith('-') ? -1 : 1))
    return ok({ items: items.slice((page - 1) * limit, page * limit), total: items.length })
  }),

  http.delete('*/api/v1/online-users/:sessionId', ({ params }) => {
    if (!requireSession()) {
      return unauthorized()
    }
    if (!privilegesOf(currentAccount()).includes('online-user-kick')) {
      return HttpResponse.json(FORBIDDEN('online-user-kick'), { status: 403 })
    }
    // 幂等：行已消失也算成功（与后端同口径）
    const index = db.onlineUsers.findIndex((row) => row.id === params.sessionId)
    if (index >= 0) {
      db.onlineUsers.splice(index, 1)
    }
    return ok(null)
  }),
]
