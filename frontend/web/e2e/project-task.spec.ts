import { expect, type Page, test } from '@playwright/test'

/**
 * P3 项目-任务闭环（phase-3 卡 T-12 手工走查的自动化等价物）：
 * 真后端（H2+Flyway+种子 admin）+ 真前端（VITE_API_MOCK=0）。
 * 覆盖：建项目（关联产品）→ 建 sprint 执行 → 关联需求 → 建任务并指派 → start → 登记工时 → finish
 * （断言工时三件套与动态流）→ 执行需求看板拖拽断言落列。
 * 数据种子（产品/需求）走测试进程直连 8080（显式 cookie），被测链路走 5173 的 UI 交互。
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

async function api(cookie: string, method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${BASE_API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Cookie: cookie },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

async function apiData<T>(cookie: string, method: string, path: string, body?: unknown): Promise<T> {
  const response = await api(cookie, method, path, body)
  expect(response.status, `${method} ${path} → ${response.status}`).toBe(200)
  return ((await response.json()) as { data: T }).data
}

async function login(page: Page, account: string, password: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('账号').fill(account)
  await page.getByLabel('密码').fill(password)
  await page.getByRole('button', { name: /登\s*录/ }).click()
  await expect(page).toHaveURL(/localhost:5173\/my$/)
}

const suffix = () => `${Date.now()}-${Math.floor(Math.random() * 1000)}`

/** 建项目（关联产品）+ sprint 执行，返回上下文。 */
async function seed(page: Page, cookie: string): Promise<{ productId: number; storyId: number; projectId: number }> {
  const name = `E2E项目-${suffix()}`
  const product = await apiData<{ id: number }>(cookie, 'POST', '/products', {
    name: `E2E产品-${suffix()}`,
    type: 'branch',
  })
  const story = await apiData<{ id: number; status: string }>(cookie, 'POST', `/products/${product.id}/stories`, {
    title: `E2E需求-${suffix()}`,
    type: 'story',
    needNotReview: true, // 提交评审时直达 active（story §4）
  })
  // 新建一律 draft；needNotReview=true 时提交评审直达 active，供后续看板拖拽
  await apiData(cookie, 'POST', `/stories/${story.id}/submit-review`, {})
  await login(page, 'admin', 'admin123')

  // 建项目（UI，含关联产品）
  await page.goto('/projects')
  await page.getByRole('button', { name: '新建项目' }).click()
  await page.getByLabel('project-name').fill(name)
  await page.getByLabel('project-begin-date').fill('2026-09-01')
  await page.getByLabel('project-end-date').fill('2026-12-31')
  await page.getByLabel('project-products').click()
  // 全量跑累积产品数超过下拉视口，antd 虚拟列表未过滤的选项不在 DOM——先按 #id 过滤再选
  await page.keyboard.type(`#${product.id} `)
  await page.getByTitle(`#${product.id} `).first().click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /^提\s*交$/ }).click()
  await expect(page.getByText(name)).toBeVisible() // 项目列表出现
  await page.getByText(name).click()
  const projectId = Number(page.url().split('/projects/')[1])
  expect(projectId).toBeGreaterThan(0)

  return { productId: product.id, storyId: story.id, projectId }
}

/** 在执行列表页建 sprint 执行并返回执行 id。 */
async function createExecution(page: Page, projectId: number): Promise<number> {
  const name = `E2E执行-${suffix()}`
  await page.goto(`/projects/${projectId}/executions`)
  await page.getByRole('button', { name: '新建执行' }).click()
  await page.getByLabel('execution-name').fill(name)
  await page.getByLabel('execution-begin-date').fill('2026-09-01')
  await page.getByLabel('execution-end-date').fill('2026-09-30')
  await page.getByRole('button', { name: /^提\s*交$/ }).click()
  await expect(page.getByText(name)).toBeVisible()
  await page.getByText(name).click()
  return Number(page.url().split('/executions/')[1])
}

test('建项目→建执行→关联需求→建任务→start→登记工时→finish（三件套 + 动态流）', async ({ page }) => {
  const admin = await apiLogin('admin', 'admin123')
  const { projectId, storyId } = await seed(page, admin)
  const executionId = await createExecution(page, projectId)

  // 关联需求（项目 ↔ 需求）
  await page.goto(`/projects/${projectId}/stories`)
  await page.getByLabel('project-story-picker').click()
  await page.getByTitle(new RegExp(`^#${storyId} `)).click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '关联需求' }).click()
  await expect(page.getByRole('cell', { name: /E2E需求-/ })).toBeVisible()

  // 建任务并指派
  await page.goto(`/executions/${executionId}/tasks`)
  await page.getByRole('button', { name: '新建任务' }).click()
  const taskTitle = `E2E任务-${suffix()}`
  await page.getByLabel('task-title').fill(taskTitle)
  await page.getByLabel('task-estimate').fill('8')
  await page.getByRole('button', { name: /^提\s*交$/ }).click()
  await expect(page.getByText(taskTitle)).toBeVisible()
  await page.getByText(taskTitle).click()
  const taskId = Number(page.url().split('/tasks/')[1])

  // start：登记本次消耗与剩余
  await page.getByRole('button', { name: /^开\s*始$/ }).click()
  await page.getByLabel('task-start-consumed').fill('2')
  await page.getByLabel('task-start-left').fill('5')
  await page.getByRole('button', { name: /^提\s*交$/ }).click()
  await expect(page.getByText(/进行中/).first()).toBeVisible()
  let task = await apiData<{ consumedHours: number; leftHours: number; status: string }>(
    admin,
    'GET',
    `/tasks/${taskId}`,
  )
  expect(task.status).toBe('doing')
  expect(task.consumedHours).toBe(2)
  expect(task.leftHours).toBe(5)

  // 登记工时（另一次流水）；任务详情页挂了两处登记入口，故按钮/表单都限定可见抽屉
  await page.getByRole('button', { name: '登记工时' }).first().click()
  await page.locator('[aria-label="effort-consumed"]:visible').fill('1')
  await page.locator('[aria-label="effort-record"]:visible').click()
  await expect
    .poll(async () => (await apiData<{ consumedHours: number }>(admin, 'GET', `/tasks/${taskId}`)).consumedHours)
    .toBe(3)
  task = await apiData(admin, 'GET', `/tasks/${taskId}`)
  expect(task.consumedHours).toBe(3)
  expect(task.leftHours).toBe(5)

  // finish：本次消耗 + 剩余归零（登记抽屉设计为常开，重载任务详情复位后再走动作）
  await page.goto(`/tasks/${taskId}`)
  await page.getByRole('button', { name: /^完\s*成$/ }).click()
  await page.getByLabel('task-finish-consumed').fill('1')
  await page.getByLabel('task-finish-left').fill('0')
  await page.getByRole('button', { name: /^提\s*交$/ }).click()
  await expect(page.getByText(/已完成/).first()).toBeVisible()
  task = await apiData(admin, 'GET', `/tasks/${taskId}`)
  expect(task.status).toBe('done')
  expect(task.consumedHours).toBe(4) // 2（start）+ 1（工时）+ 1（finish）
  expect(task.leftHours).toBe(0)

  // 动态流：started/effortRecorded/finished 落痕
  const activities = await apiData<{ items: { action: string }[] }>(admin, 'GET', `/tasks/${taskId}/activities`)
  const actions = activities.items.map((item) => item.action)
  expect(actions).toContain('started')
  expect(actions).toContain('effortRecorded')
  expect(actions).toContain('finished')

  // 任务详情页动态页签可见
  await page.getByRole('tab', { name: '动态' }).click()
  await expect(page.getByText(/开始|登记工时|完成/).first()).toBeVisible()
})

test('执行需求看板：拖拽卡片到目标列，落列并委托需求状态动作', async ({ page }) => {
  const admin = await apiLogin('admin', 'admin123')
  const { projectId, storyId } = await seed(page, admin)
  const executionId = await createExecution(page, projectId)
  await apiData(admin, 'POST', `/projects/${projectId}/stories`, { storyIds: [storyId] })

  await page.goto(`/executions/${executionId}/kanban`)

  // 卡片初始在「激活」列
  const card = page.getByText(/^E2E需求-/).first()
  await expect(card).toBeVisible()
  const targetTitle = page.getByText('变更中').last()
  await expect(targetTitle).toBeVisible()

  const from = await card.boundingBox()
  const to = await targetTitle.boundingBox()
  if (!from || !to) {
    throw new Error('拖拽源/目标未渲染：无法取得卡片与目标列的包围盒')
  }
  // 卡片 → 目标列头部：dnd-kit PointerSensor（activationConstraint 5px），需要中间位移
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2 + 20, from.y + from.height / 2 + 20, { steps: 5 })
  await page.mouse.move(to.x + to.width / 2, to.y + 80, { steps: 15 })
  await page.mouse.move(to.x + to.width / 2, to.y + 120, { steps: 5 })
  await page.mouse.up()

  // 落列：服务端 story 状态变为 changing，卡片出现在「变更中」列
  await expect
    .poll(async () => (await apiData<{ status: string }>(admin, 'GET', `/stories/${storyId}`)).status, {
      message: '拖拽后需求状态应变为 changing',
    })
    .toBe('changing')
  const changingColumn = page
    .locator('.ant-card')
    .filter({ has: page.locator('.ant-card-head', { hasText: '变更中' }) })
  await expect(changingColumn.getByText(/^E2E需求-/)).toBeVisible()
  const activeColumn = page.locator('.ant-card').filter({ has: page.locator('.ant-card-head', { hasText: '激活' }) })
  await expect(activeColumn.getByText(/^E2E需求-/)).toHaveCount(0)
})
