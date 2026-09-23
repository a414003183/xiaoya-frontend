import { expect, test } from '@playwright/test'
import { api, apiData, apiLogin, errorCode, suffix, uploadFile } from './fixtures'

/**
 * T73/OPS-12 运营面冒烟（每面 1 条，真断言）：文件上传下载、SSE 实时通知、登录限流锁定、
 * 首登强制改密、CSV 导出、数据权限行过滤。
 *
 * 形态说明（T73 取舍）：六条都走 fixtures 的 HTTP 直连（真后端 + 真 MySQL，Playwright 只当运行器），
 * 断言全部落**服务端保证**（下载字节/事件送达/限流生效/行过滤/mustChangePassword 翻转）——
 * 这些面的 UI 入口已有既有 UI 规格覆盖大半，运营面的回归点在服务端语义；
 * ponytail 上限：不点真实上传控件（上传 UI 由既有文档/宿主页规格与 ui-acceptance 量具盯）。
 */
const PNG_1PX = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
)

test('运营面·文件上传下载：真 PNG 落库，下载原样返回且恒 attachment', async () => {
  const admin = await apiLogin('admin', 'admin123')
  const upload = await uploadFile(admin, `t73-${suffix()}.png`, PNG_1PX)
  expect(upload.status, await upload.clone().text()).toBe(200)
  const file = (await upload.json()) as { data: { id: number } }

  const download = await api(admin, 'GET', `/files/${file.data.id}/download`)
  expect(download.status).toBe(200)
  expect(download.headers.get('content-disposition') ?? '').toContain('attachment')
  expect(Array.from(new Uint8Array(await download.arrayBuffer()))).toEqual(Array.from(PNG_1PX))
})

test('运营面·SSE 实时通知：指派任务后 assignee 的流上出现 notification.created', async () => {
  const admin = await apiLogin('admin', 'admin123')
  const assignee = `t73sse_${Date.now() % 1000000}`
  const created = await api(admin, 'POST', '/accounts', {
    account: assignee,
    realName: 'T73SSE',
    password: 'e2e-sse-123456',
  })
  expect(created.status).toBe(200)
  const cookie = await apiLogin(assignee, 'e2e-sse-123456')

  // 订阅自己的 SSE 流（首帧 retry:5000 + 心跳 ping；这里只认 notification.created）
  const controller = new AbortController()
  const stream = await fetch(`${process.env.E2E_API_BASE ?? 'http://localhost:8080/api/v1'}/notifications/stream`, {
    headers: { Cookie: cookie, Accept: 'text/event-stream' },
    signal: controller.signal,
  })
  expect(stream.status).toBe(200)
  const body = stream.body
  if (!body) throw new Error('SSE 流没有响应体')
  let streamText = ''
  const sawEvent = (async () => {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) return streamText
      streamText += decoder.decode(value, { stream: true })
      // Spring SseEmitter 的事件行是 `event:<name>`（无空格）；容忍两种 SSE 拼法
      if (/event:\s*notification\.created/.test(streamText)) return streamText
    }
  })()

  // 造一条真通知：产品 → 项目 → 执行 → 任务 → 指派（platform §4.2 notify 副作用）
  const product = await apiData<{ id: number }>(admin, 'POST', '/products', { name: `T73SSE产品-${suffix()}` })
  const project = await apiData<{ id: number }>(admin, 'POST', '/projects', {
    name: `T73SSE项目-${suffix()}`,
    model: 'scrum',
    beginDate: '2026-01-01',
    endDate: '2026-12-31',
    acl: 'open',
    productIds: [product.id],
  })
  const execution = await apiData<{ id: number }>(admin, 'POST', `/projects/${project.id}/executions`, {
    type: 'sprint',
    name: `T73SSE执行-${suffix()}`,
    beginDate: '2026-01-01',
    endDate: '2026-03-31',
    acl: 'open',
  })
  const task = await apiData<{ id: number }>(admin, 'POST', `/executions/${execution.id}/tasks`, {
    title: `T73SSE任务-${suffix()}`,
  })
  await apiData(admin, 'POST', `/tasks/${task.id}/assign`, { assignee })

  const text = await Promise.race([
    sawEvent,
    new Promise<string>((_resolve, reject) =>
      setTimeout(
        () => reject(new Error(`10s 内 SSE 流未收到 notification.created；流内容摘录：${streamText.slice(0, 300)}`)),
        10_000,
      ),
    ),
  ])
  controller.abort()
  expect(text).toMatch(/event:\s*notification\.created/)
  // 落库侧同证：未读 +1（与既有 critical-path 的通知断言同口径）
  const unread = await apiData<{ count: number }>(cookie, 'GET', '/notifications/unread-count')
  expect(unread.count).toBe(1)
})

test('运营面·登录限流锁定：10 次失败后第 11 次即使口令正确也 42901', async () => {
  const admin = await apiLogin('admin', 'admin123')
  const account = `t73lock_${Date.now() % 1000000}`
  const password = 'e2e-lock-123456'
  await apiData(admin, 'POST', '/accounts', { account, realName: 'T73限流', password })

  for (let attempt = 1; attempt <= 10; attempt++) {
    const response = await api('', 'POST', '/session', { account, password: 'wrong-password' })
    expect(response.status, `第 ${attempt} 次错口令应 401`).toBe(401)
  }
  // LoginHandler：限流判定在鉴权**之前**，窗满连正确口令也不放行（暴力破解面被顶住）
  const blocked = await api('', 'POST', '/session', { account, password })
  expect(blocked.status).toBe(429)
  expect(await errorCode(blocked)).toBe(42901)
})

test('运营面·首登强制改密：管理员重置后 mustChangePassword=true，本人改密后转 false', async () => {
  const admin = await apiLogin('admin', 'admin123')
  const account = `t73pwd_${Date.now() % 1000000}`
  const created = await apiData<{ id: number }>(admin, 'POST', '/accounts', {
    account,
    realName: 'T73改密',
    password: 'e2e-old-123456',
  })
  await apiData(admin, 'POST', `/accounts/${created.id}/reset-password`, { newPassword: 'e2e-temp-123456' })

  const cookie = await apiLogin(account, 'e2e-temp-123456')
  const me = await apiData<{ account: { mustChangePassword: boolean } }>(cookie, 'GET', '/me')
  expect(me.account.mustChangePassword).toBe(true)

  await apiData(cookie, 'POST', `/accounts/${created.id}/password`, {
    oldPassword: 'e2e-temp-123456',
    newPassword: 'e2e-final-123456',
  })
  const after = await apiData<{ account: { mustChangePassword: boolean } }>(cookie, 'GET', '/me')
  expect(after.account.mustChangePassword).toBe(false)
})

test('运营面·CSV 导出：?format=csv 返回 text/csv 且含新建行', async () => {
  const admin = await apiLogin('admin', 'admin123')
  const name = `T73CSV产品-${suffix()}`
  await apiData(admin, 'POST', '/products', { name })

  const response = await api(admin, 'GET', `/products?format=csv&q=${encodeURIComponent(name)}`)
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type') ?? '').toContain('text/csv')
  const text = await response.text()
  expect(text).toContain(name)
  expect(text.split(/\r?\n/).length).toBeGreaterThan(1) // 表头 + 数据行
})

test('运营面·数据权限行过滤：custom 白名单产品被行级过滤，公开产品照常可见', async () => {
  const admin = await apiLogin('admin', 'admin123')
  const mark = suffix()
  await apiData(admin, 'POST', '/products', { name: `T73公开产品-${mark}`, acl: 'public' })
  const hidden = await apiData<{ id: number }>(admin, 'POST', '/products', {
    name: `T73私有产品-${mark}`,
    acl: 'custom',
    whitelist: ['admin'],
  })

  // 只带 product-view 的普通账号（非超管）
  const role = await apiData<{ id: number }>(admin, 'POST', '/roles', { name: `T73行过滤-${mark}` })
  await apiData(admin, 'PUT', `/roles/${role.id}/privileges`, { codes: ['product-view'] })
  const account = `t73row_${Date.now() % 1000000}`
  await apiData(admin, 'POST', '/accounts', {
    account,
    realName: 'T73行过滤',
    password: 'e2e-row-123456',
    roleIds: [role.id],
  })
  const user = await apiLogin(account, 'e2e-row-123456')

  const list = await apiData<{ items: { id: number; name: string }[] }>(user, 'GET', `/products?q=${mark}&limit=100`)
  expect(list.items.some((item) => item.name === `T73公开产品-${mark}`)).toBe(true)
  expect(list.items.some((item) => item.id === hidden.id)).toBe(false) // 数据权限：行被过滤而非遮罩

  const adminList = await apiData<{ items: { id: number }[] }>(admin, 'GET', `/products?q=${mark}&limit=100`)
  expect(adminList.items.some((item) => item.id === hidden.id)).toBe(true) // 正对照：白名单成员可见
})
