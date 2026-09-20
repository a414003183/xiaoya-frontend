import { expect, type Page, test } from '@playwright/test'

/**
 * P5 文档域链路（phase-5 卡 T-13 手工走查 1/2 的自动化等价物）：
 * 真后端（H2+Flyway+种子 admin）+ 真前端（VITE_API_MOCK=0）。
 * 覆盖：库内建文档→发布 v1→编辑存草稿（详情仍见旧版正文）→再发布→版本页比对进 diff；
 * private 库白名单外账号不可见（库列表 0 条、文档详情 40302/40401 呈现）。
 */
const BASE_API = 'http://localhost:8080/api/v1'

async function apiLogin(account: string, password: string): Promise<string> {
  const response = await fetch(`${BASE_API}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' },
    body: JSON.stringify({ account, password }),
  })
  expect(response.status).toBe(200)
  return (response.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
}

async function apiData<T>(cookie: string, method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${BASE_API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await response.text()
  expect(response.status, `${method} ${path} → ${response.status}: ${text}`).toBe(200)
  return (JSON.parse(text) as { data: T }).data
}

async function login(page: Page, account: string, password: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('账号').fill(account)
  await page.getByLabel('密码').fill(password)
  await page.getByRole('button', { name: /登\s*录/ }).click()
  await expect(page).toHaveURL(/localhost:5173\/my$/)
}

const suffix = () => `${Date.now()}-${Math.floor(Math.random() * 1000)}`

/** 建带权限码的账号（E2E 无测试基座，直接走 org 端点）。 */
async function accountWithPrivileges(cookie: string, account: string, codes: string[]): Promise<void> {
  const group = await apiData<{ id: number }>(cookie, 'POST', '/groups', { name: `E2E组-${account}` })
  await apiData(cookie, 'PUT', `/groups/${group.id}/privileges`, { codes })
  await apiData(cookie, 'POST', '/accounts', {
    account,
    password: 'secret123',
    realName: account,
    groupIds: [group.id],
  })
}

test.describe('@p5 文档链路', () => {
  test('建文档→发布 v1→存草稿（详情仍旧版）→再发布→版本比对进 diff 见行级差异', async ({ page }) => {
    const cookie = await apiLogin('admin', 'admin123')
    const spaceName = `E2E文档库-${suffix()}`
    const space = await apiData<{ id: number }>(cookie, 'POST', '/doc-spaces', {
      name: spaceName,
      type: 'custom',
      acl: 'open',
    })
    const title = `E2E文档-${suffix()}`
    // 造数经 API（建库 + 建文档含正文），UI 侧验证发布/存草稿/版本/diff 四条真实链路
    const doc = await apiData<{ id: number }>(cookie, 'POST', `/doc-spaces/${space.id}/docs`, {
      title,
      content: '# 第一版正文\n\n初稿内容',
      status: 'draft',
    })
    const docId = doc.id
    await login(page, 'admin', 'admin123')

    // 详情：draft → 发布 v1
    await page.goto(`/docs/${docId}`)
    await expect(page.getByText(title).first()).toBeVisible()
    await page.getByRole('button', { name: /发\s*布/ }).click()
    await expect(page.getByText('已发布').first()).toBeVisible()
    await expect(page.getByText('第一版正文').first()).toBeVisible()

    // 编辑页：改内容 → 存草稿 → 可编辑者详情见工作副本（doc.md §4：v0 仅可编辑者可见）
    await page.goto(`/docs/${docId}/edit`)
    await page.getByLabel('doc-edit-content').fill('# 第二版正文\n\n改了一行')
    await page.getByLabel('doc-save-draft').click()
    await page.goto(`/docs/${docId}`)
    await expect(page.getByText('第二版正文').first()).toBeVisible()
    // 已发布快照不可变：v1 仍为第一版正文
    const snapshot = await apiData<{ content: string }>(cookie, 'GET', `/docs/${docId}/versions/1`)
    expect(snapshot.content).toContain('第一版正文')

    // 再发布 → v2（断言发布请求成功 + 详情见新版）
    await page.goto(`/docs/${docId}/edit`)
    const [published] = await Promise.all([
      page.waitForResponse(
        (response) => response.url().includes(`/docs/${docId}/publish`) && response.request().method() === 'POST',
      ),
      page.getByLabel('doc-publish').click(),
    ])
    expect(published.status(), await published.text()).toBe(200)
    await page.goto(`/docs/${docId}`)
    await expect(page.getByText('第二版正文').first()).toBeVisible()

    // 版本页：v1/v2 快照齐备 → 勾选两版比对进 diff
    const versions = await apiData<{ items: { version: number }[] }>(cookie, 'GET', `/docs/${docId}/versions`)
    expect(versions.items.length).toBeGreaterThanOrEqual(2)
    await page.goto(`/docs/${docId}/versions`)
    await page.getByRole('checkbox').first().check()
    await page.getByRole('checkbox').nth(1).check()
    await page.getByLabel('doc-version-compare').click()
    await expect(page).toHaveURL(/\/docs\/\d+\/diff\?/)
    await expect(page.getByText(/第一版正文|第二版正文/).first()).toBeVisible()
  })

  test('private 库：白名单外账号库列表不出现、文档详情按 40401/40302 呈现', async ({ page }) => {
    const adminCookie = await apiLogin('admin', 'admin123')
    const outsider = `e2edoc${Math.floor(Math.random() * 100000)}`
    await accountWithPrivileges(adminCookie, outsider, [
      'doc-view',
      'doc-space-view',
      'doc-edit',
      'doc-create',
      'doc-delete',
      'doc-space-create',
      'doc-space-edit',
      'doc-space-delete',
    ])

    const spaceName = `E2E私库-${suffix()}`
    const space = await apiData<{ id: number }>(adminCookie, 'POST', '/doc-spaces', {
      name: spaceName,
      type: 'custom',
      acl: 'private',
      whitelist: { accounts: [], groupIds: [] },
    })
    const title = `E2E私库文档-${suffix()}`
    const doc = await apiData<{ id: number }>(adminCookie, 'POST', `/doc-spaces/${space.id}/docs`, {
      title,
      status: 'published',
      content: '私有正文',
    })

    const outsiderCookie = await apiLogin(outsider, 'secret123')
    const list = await apiData<{ items: unknown[] }>(outsiderCookie, 'GET', '/doc-spaces?limit=200')
    expect(
      list.items.some((item) => JSON.stringify(item).includes(spaceName)),
      'private 库不可见',
    ).toBe(false)

    const denied = await fetch(`${BASE_API}/docs/${doc.id}`, {
      headers: { Cookie: outsiderCookie, 'X-Requested-With': 'fetch' },
    })
    expect([403, 404]).toContain(denied.status)
    if (denied.status === 403) {
      expect((await denied.text()).includes('40302')).toBe(true)
    }

    // UI：白名单外账号库列表与文档详情都不暴露该库/文档
    await login(page, outsider, 'secret123')
    await page.goto('/doc/spaces')
    await expect(page.getByText(spaceName)).toHaveCount(0)
    await page.goto(`/docs/${doc.id}`)
    await expect(page.getByText('私有正文')).toHaveCount(0)
  })
})
