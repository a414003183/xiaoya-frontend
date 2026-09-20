import { expect, type Page, test } from '@playwright/test'
import { apiData, apiLogin, login, suffix } from '../e2e/fixtures'

/**
 * A0-2 视觉基线截图（06-alignment-plan）：20 代表页 × {light, dark} × zh-CN → tmp/shots/baseline/。
 *
 * **定位（08 B2-3）：手动量具，不是门禁**——只截图、不做像素比对，永远通过，故已移出
 * `pnpm test:e2e` 的 testDir（`web/e2e/`），改用 `playwright.visual.config.ts` 独立跑
 * `pnpm test:visual`。二处固定睡眠随之下线（它们只会给"确定性通过"添假象）。
 * 语言维度 en 已具备切换入口（A4-1），LANGUAGES 扩 ['zh-CN','en'] 即补齐 en 基线 40 张。
 */
const SHOTS_DIR = '../../tmp/shots/baseline'
const LANGUAGES = ['zh-CN'] as const

type PageDef = { slug: string; url: (ctx: SeedContext) => string }

type SeedContext = {
  productId: number
  storyId: number
  executionId: number
  bugId: number
  testRunId: number
  docId: number
  groupId: number
}

/** 20 代表页（06 A0-2 卡面清单顺序） */
const PAGES: PageDef[] = [
  { slug: 'login', url: () => '/login' },
  { slug: 'my', url: () => '/my' },
  { slug: 'products', url: () => '/products' },
  { slug: 'product-detail', url: (c) => `/products/${c.productId}` },
  { slug: 'story-list', url: (c) => `/products/${c.productId}/stories` },
  { slug: 'story-detail', url: (c) => `/stories/${c.storyId}` },
  { slug: 'projects', url: () => '/projects' },
  { slug: 'execution-kanban', url: (c) => `/executions/${c.executionId}/kanban` },
  { slug: 'task-list', url: (c) => `/executions/${c.executionId}/tasks` },
  { slug: 'bug-list', url: (c) => `/products/${c.productId}/bugs` },
  { slug: 'bug-detail', url: (c) => `/bugs/${c.bugId}` },
  { slug: 'case-list', url: (c) => `/products/${c.productId}/test-cases` },
  { slug: 'test-run-detail', url: (c) => `/test-runs/${c.testRunId}` },
  { slug: 'doc-spaces', url: () => '/doc/spaces' },
  { slug: 'doc-detail', url: (c) => `/docs/${c.docId}` },
  { slug: 'org-accounts', url: () => '/org/accounts' },
  { slug: 'group-priv-matrix', url: (c) => `/org/groups/${c.groupId}/privileges` },
  { slug: 'notifications', url: () => '/notifications' },
  { slug: 'admin-settings', url: () => '/admin/settings' },
  { slug: 'burn-report', url: (c) => `/executions/${c.executionId}/reports/burn` },
]

async function seed(cookie: string): Promise<SeedContext> {
  const product = await apiData<{ id: number }>(cookie, 'POST', '/products', {
    name: `基线产品-${suffix()}`,
    type: 'branch',
  })
  const story = await apiData<{ id: number }>(cookie, 'POST', `/products/${product.id}/stories`, {
    title: `基线需求-${suffix()}`,
    type: 'story',
    needNotReview: true,
  })
  await apiData(cookie, 'POST', `/stories/${story.id}/submit-review`, {})
  const project = await apiData<{ id: number }>(cookie, 'POST', '/projects', {
    name: `基线项目-${suffix()}`,
    beginDate: '2026-09-01',
    endDate: '2026-12-31',
    acl: 'open',
    productIds: [product.id],
  })
  const execution = await apiData<{ id: number }>(cookie, 'POST', `/projects/${project.id}/executions`, {
    type: 'sprint',
    name: `基线执行-${suffix()}`,
    beginDate: '2026-09-01',
    endDate: '2026-09-30',
  })
  const bug = await apiData<{ id: number }>(cookie, 'POST', `/products/${product.id}/bugs`, {
    title: `基线缺陷-${suffix()}`,
    steps: '基线复现步骤',
  })
  await apiData(cookie, 'POST', `/products/${product.id}/test-cases`, {
    title: `基线用例-${suffix()}`,
    type: 'feature',
  })
  const testRun = await apiData<{ id: number }>(cookie, 'POST', `/products/${product.id}/test-runs`, {
    executionId: execution.id,
    name: `基线测试单-${suffix()}`,
    beginDate: '2026-09-01',
    endDate: '2026-09-30',
  })
  const space = await apiData<{ id: number }>(cookie, 'POST', '/doc-spaces', {
    name: `基线文档库-${suffix()}`,
    type: 'custom',
    acl: 'open',
  })
  const doc = await apiData<{ id: number }>(cookie, 'POST', `/doc-spaces/${space.id}/docs`, {
    title: `基线文档-${suffix()}`,
    content: '# 基线正文\n\n视觉基线用文档',
    status: 'draft',
  })
  const group = await apiData<{ id: number }>(cookie, 'POST', '/groups', { name: `基线组-${suffix()}` })
  return {
    productId: product.id,
    storyId: story.id,
    executionId: execution.id,
    bugId: bug.id,
    testRunId: testRun.id,
    docId: doc.id,
    groupId: group.id,
  }
}

async function shoot(page: Page, url: string, path: string): Promise<void> {
  await page.goto(url)
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path, fullPage: true })
}

test('视觉基线：20 代表页 × {light, dark} × zh-CN', async ({ page }) => {
  test.setTimeout(600_000)
  const cookie = await apiLogin('admin', 'admin123')
  const ctx = await seed(cookie)

  let index = 0
  for (const language of LANGUAGES) {
    // light：登录前先拍登录页，再登录拍 19 个应用页
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    await page.screenshot({
      path: `${SHOTS_DIR}/${String(index++).padStart(2, '0')}-login-light-${language}.png`,
      fullPage: true,
    })
    await login(page, 'admin', 'admin123')
    for (const def of PAGES.slice(1)) {
      await shoot(
        page,
        def.url(ctx),
        `${SHOTS_DIR}/${String(index++).padStart(2, '0')}-${def.slug}-light-${language}.png`,
      )
    }

    // dark：Header 主题三态 Segmented 切「暗色」（06 A1-3），逐页重拍
    // （Segmented 的 radio input 为 sr-only 不可点，点可见 label）
    await page.locator('.ant-segmented-item-label', { hasText: '暗色' }).click()
    await expect(page.locator('.ant-segmented-item-selected', { hasText: '暗色' })).toBeVisible()
    for (const def of PAGES.slice(1)) {
      await shoot(
        page,
        def.url(ctx),
        `${SHOTS_DIR}/${String(index++).padStart(2, '0')}-${def.slug}-dark-${language}.png`,
      )
    }
    // dark 登录页：头像下拉退出（客户端跳转，主题 persist 下刷新也不再失守——06 A1-3 后如实入画）
    await page.getByLabel('账号菜单').click()
    await page.getByText('退出登录').click()
    await expect(page).toHaveURL(/\/login$/)
    await page.screenshot({
      path: `${SHOTS_DIR}/${String(index++).padStart(2, '0')}-login-dark-${language}.png`,
      fullPage: true,
    })
  }
})
