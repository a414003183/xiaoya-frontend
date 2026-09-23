import { useQueryClient } from '@tanstack/react-query'
import { API_BASE, ApiError, ok } from '@zentao/api-client'
import {
  createComment,
  createDictItem,
  createDictType,
  createLangImport,
  createMenu,
  createSettingEntry,
  deleteDictItem,
  deleteDictType,
  deleteMenu,
  deleteSettingEntry,
  getDict,
  getDownloadFileUrl,
  getExportLangItemsUrl,
  getNotificationUnreadCount,
  getServerMetrics,
  getSettings,
  kickOnlineUser,
  listAccountActivities,
  listAuditLogs,
  listComments,
  listDictItems,
  listDictTypes,
  listLangImports,
  listMenuPageRegistry,
  listMenuRoutes,
  listMenus,
  listMyMenus,
  listNotifications,
  listOnlineUsers,
  listSettingEntries,
  markNotificationRead,
  putSettings,
  updateDictItem,
  updateDictType,
  updateMenu,
  updateSettingEntry,
} from '@zentao/api-client/generated'
import type { ActivityView } from '@zentao/api-client/generated/model/activityView'
import type { AuditLogView } from '@zentao/api-client/generated/model/auditLogView'
import type { CommentView } from '@zentao/api-client/generated/model/commentView'
import type { DictDataView } from '@zentao/api-client/generated/model/dictDataView'
import type { DictTypeView } from '@zentao/api-client/generated/model/dictTypeView'
import type { LangImportView } from '@zentao/api-client/generated/model/langImportView'
import type { ListAuditLogsParams } from '@zentao/api-client/generated/model/listAuditLogsParams'
import type { ListDictItemsParams } from '@zentao/api-client/generated/model/listDictItemsParams'
import type { ListDictTypesParams } from '@zentao/api-client/generated/model/listDictTypesParams'
import type { ListLangImportsParams } from '@zentao/api-client/generated/model/listLangImportsParams'
import type { ListOnlineUsersParams } from '@zentao/api-client/generated/model/listOnlineUsersParams'
import type { ListSettingEntriesParams } from '@zentao/api-client/generated/model/listSettingEntriesParams'
import type { MenuNode } from '@zentao/api-client/generated/model/menuNode'
import type { MenuRequest } from '@zentao/api-client/generated/model/menuRequest'
import type { MenuTree } from '@zentao/api-client/generated/model/menuTree'
import type { MenuUpdateRequest } from '@zentao/api-client/generated/model/menuUpdateRequest'
import type { NotificationView } from '@zentao/api-client/generated/model/notificationView'
import type { OnlineUserView } from '@zentao/api-client/generated/model/onlineUserView'
import type { PageRegistry } from '@zentao/api-client/generated/model/pageRegistry'
import type { RouteTable } from '@zentao/api-client/generated/model/routeTable'
import type { ServerMetricsView } from '@zentao/api-client/generated/model/serverMetricsView'
import type { SettingEntryView } from '@zentao/api-client/generated/model/settingEntryView'
import { buildListParams, type ListDsl } from '../../../shared/list-dsl'

/** platform 域数据入口（01 §3.2：域内唯一数据入口，类型 + orval 封装）。 */

export type {
  ActivityView,
  AuditLogView,
  CommentView,
  DictDataView,
  DictTypeView,
  NotificationView,
  OnlineUserView,
  ServerMetricsView,
  SettingEntryView,
}

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

// ── 字典 ──

// ── 多语言上传（platform 卡 §3.12） ──

/** 上传记录列表（DSL 见 03 §3；缺省 -createdAt）。 */
export async function fetchLangImports(
  dsl: ListDsl<ListLangImportsParams> = {},
): Promise<{ items: LangImportView[]; total: number }> {
  return ok(await listLangImports(buildListParams<ListLangImportsParams>(dsl))).data
}

/** 上传语言包 Excel（multipart 只收 file：单文件全语言，语言由列头决定；校验失败 42201，fields 为 `row:<n>`/`file` → 原因码）。 */
export async function uploadLangImport(file: File): Promise<LangImportView> {
  return ok(await createLangImport({ file })).data
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

/** 权限码选项（菜单管理的 perm 字段数据源）：label 是 i18n 键 `priv.<code>`，调用点用 t() 渲染。 */
export async function fetchPrivilegeOptions(): Promise<{ value: string; label: string }[]> {
  const data = ok(await getDict('privileges')).data
  return data.items
    .map((item) => ({ value: String(item.code ?? ''), label: String(item.i18n ?? item.code ?? '') }))
    .filter((item) => item.value !== '')
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

// ── 审计日志（platform 卡 §3.13：操作日志 / 登录日志共用，只读） ──

/**
 * 审计流水（只读；行由写请求的审计横切追加，无写端点 → 页面也没有任何行内动作）。
 * filters 值域：account/action/objectType/objectId 等值或逗号 IN，createdAt 为 `a..b` 区间。
 */
export async function fetchAuditLogs(
  dsl: ListDsl<ListAuditLogsParams> = {},
): Promise<{ items: AuditLogView[]; total: number }> {
  return ok(await listAuditLogs(buildListParams<ListAuditLogsParams>(dsl))).data
}

// ── 在线用户（T13 P1-1：session 表现存行 = 在线集，强退即删行） ──

/**
 * 在线会话列表。行 id 是 token 的摘要（不是 cookie 值），强退端点收的就是它。
 * filters 值域只有 account（等值或逗号 IN）——行数天然等于在线会话数，不值得更多条件。
 */
export async function fetchOnlineUsers(
  dsl: ListDsl<ListOnlineUsersParams> = {},
): Promise<{ items: OnlineUserView[]; total: number }> {
  return ok(await listOnlineUsers(buildListParams<ListOnlineUsersParams>(dsl))).data
}

/** 强退（幂等：对方刚登出/已过期也算成功）。成功后该 cookie 的下一次请求 40101。 */
export async function kickOnlineUserAction(sessionId: string): Promise<null> {
  return ok(await kickOnlineUser(sessionId)).data
}

// ── 参数管理（T15 P1-3：setting 表系统行；个人偏好行不进这个面） ──

/**
 * 系统参数列表。作用域恒为 owner=system（服务端注入），filters 只有 domain（等值或逗号 IN）。
 * value 是 JSON 文本原样（字符串带引号），页面按文本编辑、按文本提交。
 */
export async function fetchSettingEntries(
  dsl: ListDsl<ListSettingEntriesParams> = {},
): Promise<{ items: SettingEntryView[]; total: number }> {
  return ok(await listSettingEntries(buildListParams<ListSettingEntriesParams>(dsl))).data
}

/** 新建系统参数（键重复/格式非法/值非 JSON → 42201）。 */
export async function createSettingEntryAction(body: { key: string; value: string }): Promise<SettingEntryView> {
  return ok(await createSettingEntry(body)).data
}

/** 改某个系统参数的值（键不可改；行不存在 → 40401）。 */
export async function updateSettingEntryAction(key: string, body: { value: string }): Promise<SettingEntryView> {
  return ok(await updateSettingEntry(key, body)).data
}

/** 删系统参数（行不存在 → 40401：页面上的行已过期，该提示而不是假装成功）。 */
export async function deleteSettingEntryAction(key: string): Promise<null> {
  return ok(await deleteSettingEntry(key)).data
}

// ── 服务监控（T17 P1-5：单机负载快照，不直暴露 actuator） ──

/** 负载快照（原始字节数；百分比在页面算，-1 = 该指标不可用）。 */
export async function fetchServerMetrics(): Promise<ServerMetricsView> {
  return ok(await getServerMetrics()).data
}

// ── 字典管理（T16 P1-4：DB 字典只扩展代码注册的内置字典） ──

/** 字典类型列表（dict_type 表；内置字典不在这里）。 */
export async function fetchDictTypes(
  dsl: ListDsl<ListDictTypesParams> = {},
): Promise<{ items: DictTypeView[]; total: number }> {
  return ok(await listDictTypes(buildListParams<ListDictTypesParams>(dsl))).data
}

/** 某类型的数据项（作用域恒为 type code，按 sortNo 升序）。 */
export async function fetchDictItems(
  typeCode: string,
  dsl: ListDsl<ListDictItemsParams> = {},
): Promise<{ items: DictDataView[]; total: number }> {
  return ok(await listDictItems(typeCode, buildListParams<ListDictItemsParams>(dsl))).data
}

export async function createDictTypeAction(body: { code: string; name: string }): Promise<DictTypeView> {
  return ok(await createDictType(body)).data
}

export async function updateDictTypeAction(
  code: string,
  body: { name?: string; status?: 'active' | 'disabled' },
): Promise<DictTypeView> {
  return ok(await updateDictType(code, body)).data
}

/** 删类型：级联删其数据项（页面确认框里写明）。 */
export async function deleteDictTypeAction(code: string): Promise<null> {
  return ok(await deleteDictType(code)).data
}

export async function createDictItemAction(
  typeCode: string,
  body: { itemLabel: string; itemValue: string; sortNo?: number },
): Promise<DictDataView> {
  return ok(await createDictItem(typeCode, body)).data
}

export async function updateDictItemAction(
  id: number,
  body: { itemLabel?: string; itemValue?: string; sortNo?: number; status?: 'active' | 'disabled' },
): Promise<DictDataView> {
  return ok(await updateDictItem(id, body)).data
}

export async function deleteDictItemAction(id: number): Promise<null> {
  return ok(await deleteDictItem(id)).data
}

// ── 菜单管理（T19 P2-1 / T03 纯 DB 化）──

/** 管理视图：`menu` 表整棵树（**不按权限过滤**，端点要 menu-manage）。 */
export async function fetchMenuTree(): Promise<MenuTree> {
  return ok(await listMenus()).data
}

/** 前端路由表（T26）：全部页面（含隐藏页）的 path/component/perm；动态路由的数据源。 */
export async function fetchMenuRoutes(): Promise<RouteTable> {
  return ok(await listMenuRoutes()).data
}

/** 页面注册表（T03）：path → component 的代码侧清单；菜单表单按 path 自动匹配组件。 */
export async function fetchMenuPageRegistry(): Promise<PageRegistry> {
  return ok(await listMenuPageRegistry()).data
}

/** 侧栏视图：当前账号可见菜单（登录即可访问；服务端按状态与权限码过滤后下发）。 */
export async function fetchMyMenus(): Promise<MenuTree> {
  return ok(await listMyMenus()).data
}

export async function createMenuAction(body: MenuRequest): Promise<MenuNode> {
  return ok(await createMenu(body)).data
}

/** 改菜单行：身份是 nodeKey（页面 key 含 `/`、按钮 key 含 `#`，只能走查询参数）。 */
export async function updateMenuAction(nodeKey: string, body: MenuUpdateRequest): Promise<MenuNode> {
  return ok(await updateMenu(body, { nodeKey })).data
}

export async function deleteMenuAction(nodeKey: string): Promise<null> {
  return ok(await deleteMenu({ nodeKey })).data
}

// ── query key 约定 ──

export const MENU_TREE_KEY = ['listMenus'] as const
/** 侧栏菜单树（app-shell 数据源）：登录后取一次，改菜单后由管理页失效重取。 */
export const MY_MENUS_KEY = ['listMyMenus'] as const

/** 路由表（动态路由用一份缓存）。 */
export const MENU_ROUTES_KEY = ['listMenuRoutes'] as const
/** 页面注册表（菜单表单的「页面」选择器；只在弹窗打开时取）。 */
export const MENU_PAGE_REGISTRY_KEY = ['listMenuPageRegistry'] as const
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
