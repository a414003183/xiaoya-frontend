import { useQueryClient } from '@tanstack/react-query'
import { API_BASE, ApiError, ok } from '@zentao/api-client'
import {
  createComment,
  createLangImport,
  deleteLangItems,
  getDict,
  getDownloadFileUrl,
  getExportLangItemsUrl,
  getLangItems,
  getNotificationUnreadCount,
  getSettings,
  listAccountActivities,
  listComments,
  listLangImports,
  listNotifications,
  markNotificationRead,
  putLangItems,
  putSettings,
} from '@zentao/api-client/generated'
import type { ActivityView } from '@zentao/api-client/generated/model/activityView'
import type { CommentView } from '@zentao/api-client/generated/model/commentView'
import type { LangImportView } from '@zentao/api-client/generated/model/langImportView'
import type { ListLangImportsParams } from '@zentao/api-client/generated/model/listLangImportsParams'
import type { NotificationView } from '@zentao/api-client/generated/model/notificationView'
import { buildListParams, type ListDsl } from '../../../shared/list-dsl'

/** platform 域数据入口（01 §3.2：域内唯一数据入口，类型 + orval 封装）。 */

export type { ActivityView, CommentView, NotificationView }

// ── 评论 / 动态流 ──

export type ActivityItem = ActivityView

export type ActivityPage = {
  items: ActivityItem[]
  hasMore: boolean
}

export async function fetchComments(params: {
  objectType: string
  objectId: number
  page?: number
  limit?: number
}): Promise<{ items: CommentView[]; total: number }> {
  return ok(await listComments(params)).data
}

export async function submitComment(body: {
  objectType: string
  objectId: number
  content: string
}): Promise<CommentView> {
  return ok(await createComment(body)).data
}

/** 游标取一页动态（platform §5 末段协议：倒序、beforeId、{items, hasMore}）。 */
export async function fetchActivities(
  accountId: number,
  params: { limit?: number; beforeId?: number },
): Promise<ActivityPage> {
  return ok(await listAccountActivities(accountId, params)).data
}

// ── 通知 ──

// 个人通知开关目录不再是前端常量：值域来自 meta/notification 的 type 选项（03 §5，NotificationMetaRegistrar）。

// ── 手写出网的 URL（08 B1-5：URL 由属主域持有，页面不手拼） ──

/** 通知 SSE 流（EventSource 不能自定义头，故走 cookie 会话；platform 卡 §3.1）。 */
export const NOTIFICATION_STREAM_URL = `${API_BASE}/notifications/stream`

/** 附件下载地址（走契约生成的 URL 构造器，与 orval 同源）。 */
export const fileDownloadUrl = (fileId: number): string => getDownloadFileUrl(fileId)

export async function fetchNotifications(params?: {
  page?: number
  limit?: number
  'filters[readAt]'?: string
}): Promise<{ items: NotificationView[]; total: number }> {
  return ok(await listNotifications(params)).data
}

export async function fetchUnreadCount(): Promise<number> {
  return ok(await getNotificationUnreadCount()).data.count
}

export async function markRead(notificationId: number): Promise<NotificationView> {
  return ok(await markNotificationRead(notificationId)).data
}

export async function fetchSettings(keys: string[]): Promise<Record<string, unknown>> {
  return ok(await getSettings({ keys: keys.join(',') })).data.settings
}

export async function saveSettings(settings: Record<string, unknown>): Promise<Record<string, unknown>> {
  return ok(await putSettings({ settings })).data.settings
}

// ── 文案覆盖 / 字典 ──

export type LangItemValues = { items: Record<string, string>; overridden?: boolean }

/** 文案覆盖读取（platform 卡 §3.8；lang 缺省 zh-cn）。 */
export async function fetchLangItems(lang: string, domain: string, field: string): Promise<LangItemValues> {
  return ok(await getLangItems(domain, field, { lang })).data
}

// PUT/DELETE 的 lang 查询参 2026-09-20 已补进契约（C-16 X-01/X-02 回收），故走生成函数，不再手拼 URL。
export async function saveLangItems(
  lang: string,
  domain: string,
  field: string,
  items: Record<string, string>,
): Promise<LangItemValues> {
  return ok(await putLangItems(domain, field, { items }, lang === '' ? undefined : { lang })).data
}

export async function restoreLangItems(lang: string, domain: string, field: string): Promise<LangItemValues> {
  return ok(await deleteLangItems(domain, field, lang === '' ? undefined : { lang })).data
}

// ── 多语言上传（platform 卡 §3.12） ──

/** 上传记录列表（DSL 见 03 §3；缺省 -createdAt）。 */
export async function fetchLangImports(
  dsl: ListDsl<ListLangImportsParams> = {},
): Promise<{ items: LangImportView[]; total: number }> {
  return ok(await listLangImports(buildListParams<ListLangImportsParams>(dsl))).data
}

/** 上传语言包 Excel（multipart；校验失败由服务端抛 42201，fields 为 `row:<n>`/`file` → 原因码）。 */
export async function uploadLangImport(file: File, lang: string): Promise<LangImportView> {
  return ok(await createLangImport({ file, lang })).data
}

/**
 * 导出语言包 Excel 并触发浏览器 blob 下载（口径同 shared/use-csv-export 的 exportCsv，MIME/文件名换成 xlsx）。
 * 走生成函数的 URL + 手写 fetch：生成函数经 httpFetch 的 JSON 拆包拿不到二进制（已登记的 X-01 形态）。
 */
export async function downloadLangPack(): Promise<void> {
  const response = await fetch(getExportLangItemsUrl(), {
    credentials: 'same-origin',
    // 03 §7：出网一律带该头（服务端据此拒绝跨站表单式请求）；此处绕过 httpFetch，需自行注入
    headers: { 'X-Requested-With': 'fetch' },
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as { error?: unknown } | undefined
    throw ApiError.fromEnvelope(body?.error)
  }
  const url = URL.createObjectURL(await response.blob())
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'lang-zh-CN.xlsx'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

/** 权限码目录按域去重（lang-item 页左侧域树数据源；GET /dicts/privileges，B-PLT-12）。 */
export async function fetchPrivilegeDomains(): Promise<string[]> {
  const data = ok(await getDict('privileges')).data
  const domains = new Set<string>()
  for (const item of data.items) {
    if (typeof item.domain === 'string' && item.domain !== '') {
      domains.add(item.domain)
    }
  }
  return [...domains].sort()
}

/** 时区选项（GET /dicts/timezones；系统设置页数据源，值域与译文都在后端）。 */
export async function fetchTimezoneOptions(): Promise<{ value: string; label: string }[]> {
  return fetchDictPairs('timezones')
}

/** 语言选项（GET /dicts/locales；lang-item 页语言切换数据源）。 */
export async function fetchLocaleOptions(): Promise<{ value: string; label: string }[]> {
  return fetchDictPairs('locales')
}

/** `{value,label}` 形字典项 → 选项（label 后端已给译文；空值项丢弃）。 */
async function fetchDictPairs(name: string): Promise<{ value: string; label: string }[]> {
  const data = ok(await getDict(name)).data
  return data.items
    .map((item) => ({ value: String(item.value ?? ''), label: String(item.label ?? item.value ?? '') }))
    .filter((item) => item.value !== '')
}

// ── query key 约定 ──

export const UNREAD_COUNT_KEY = ['getNotificationUnreadCount'] as const
export const NOTIFICATION_LIST_KEY = ['listNotifications'] as const

/** SSE 推送到达时失效通知相关缓存。 */
export function useInvalidateNotifications(): () => void {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: UNREAD_COUNT_KEY })
    void queryClient.invalidateQueries({ queryKey: NOTIFICATION_LIST_KEY })
  }
}
