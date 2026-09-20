import { expect, test } from '@playwright/test'
import { apiData, apiLogin, login, suffix } from './fixtures'

/**
 * P6 T-7 全链路 E2E · 关键链路 1–6（phase-6 卡链路断言，缺一不可）：
 * 登录 → 建产品 → 建需求 → 评审（draft→reviewing→active）→ 建项目/执行 →
 * 派任务（创建→assign→start→finish，工时三件套 + effort 落行 + assignee 通知未读 +1）。
 * 每步先经 UI 操作，再用 GET 端点断言服务端状态；数据隔离走 e2e profile 的 zentao_e2e schema。
 */
test('关键链路 1-6：登录→产品→需求→评审→项目/执行→任务闭环（三件套+通知）', async ({ page }) => {
  const admin = await apiLogin('admin', 'admin123')

  // 1. 登录 → 落地 /my 仪表盘（06 A1-4：脚手架首页已删，登录即工作台）
  await login(page, 'admin', 'admin123')
  await expect(page.getByText('布局配置').first()).toBeVisible()
  const me = await apiData<{ account: { account: string } }>(admin, 'GET', '/me')
  expect(me.account.account).toBe('admin')

  // 指派目标账号（API 造数，步骤 6 用）
  const assignee = `e2e_dev_${Date.now() % 1000000}`
  const assigneePassword = 'e2e-dev-123'
  await apiData(admin, 'POST', '/accounts', {
    account: assignee,
    realName: 'E2E执行者',
    password: assigneePassword,
  })
  const assigneeCookie = await apiLogin(assignee, assigneePassword)
  const unreadBefore = (await apiData<{ count: number }>(assigneeCookie, 'GET', '/notifications/unread-count')).count

  // 2. 建产品（UI，product §5 POST /products）
  const productName = `E2E链路产品-${suffix()}`
  await page.goto('/products')
  await page.getByRole('button', { name: '创建产品' }).click()
  await page.getByLabel('product-name').fill(productName)
  await page.getByRole('button', { name: /^提\s*交$/ }).click()
  await expect(page.getByText(productName)).toBeVisible()
  const products = await apiData<{ items: { id: number; name: string }[] }>(admin, 'GET', '/products')
  const product = products.items.find((item) => item.name === productName)
  if (!product) throw new Error(`产品应已落库：${productName}`)

  // 3. 建需求（UI，requirement §5 POST /products/{productId}/stories）
  await page.goto(`/products/${product.id}/stories`)
  await page.getByRole('button', { name: '提需求' }).click()
  const storyTitle = `E2E链路需求-${suffix()}`
  await page.getByLabel('story-title').fill(storyTitle)
  await page.getByRole('button', { name: /^提\s*交$/ }).click()
  await expect(page.getByText(storyTitle)).toBeVisible()
  await page.getByText(storyTitle).click()
  await expect(page.getByText(/草\s*稿/).first()).toBeVisible()
  const storyId = Number(page.url().split('/stories/')[1])

  // 4. 提交评审 → 通过：draft → reviewing → active（requirement §5 submit-review / pass）
  await page.getByRole('button', { name: '提交评审' }).click()
  await page.getByLabel('story-reviewers').click()
  // 并行用例会让账号下拉变长（antd 虚拟列表），先过滤再选，选毕收起避免遮挡提交
  await page.keyboard.type('admin')
  await page.getByTitle('管理员(admin)').click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /^提\s*交$/ }).click()
  await expect(page.getByText(/评审中/).first()).toBeVisible()
  expect((await apiData<{ status: string }>(admin, 'GET', `/stories/${storyId}`)).status).toBe('reviewing')

  await page.getByRole('button', { name: '评审通过' }).click()
  await page.getByRole('button', { name: /^提\s*交$/ }).click()
  await expect(page.getByText(/激\s*活/).first()).toBeVisible()
  expect((await apiData<{ status: string }>(admin, 'GET', `/stories/${storyId}`)).status).toBe('active')

  // 5. 建项目 → 建执行（UI，project §5）
  const projectName = `E2E链路项目-${suffix()}`
  await page.goto('/projects')
  await page.getByRole('button', { name: '新建项目' }).click()
  await page.getByLabel('project-name').fill(projectName)
  await page.getByLabel('project-begin-date').fill('2026-09-01')
  await page.getByLabel('project-end-date').fill('2026-12-31')
  await page.getByLabel('project-products').click()
  // 全量跑累积产品数超过下拉视口（antd 虚拟列表），先按 #id 过滤再选
  await page.keyboard.type(`#${product.id} `)
  await page.getByTitle(`#${product.id} `).first().click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /^提\s*交$/ }).click()
  await expect(page.getByText(projectName)).toBeVisible()
  await page.getByText(projectName).click()
  const projectId = Number(page.url().split('/projects/')[1])

  const executionName = `E2E链路执行-${suffix()}`
  await page.goto(`/projects/${projectId}/executions`)
  await page.getByRole('button', { name: '新建执行' }).click()
  await page.getByLabel('execution-name').fill(executionName)
  await page.getByLabel('execution-begin-date').fill('2026-09-01')
  await page.getByLabel('execution-end-date').fill('2026-09-30')
  await page.getByRole('button', { name: /^提\s*交$/ }).click()
  await expect(page.getByText(executionName)).toBeVisible()
  await page.getByText(executionName).click()
  const executionId = Number(page.url().split('/executions/')[1])
  expect(executionId).toBeGreaterThan(0)

  // 6. 派任务：创建 → assign → start → finish 带本次消耗（task §5）
  await page.goto(`/executions/${executionId}/tasks`)
  await page.getByRole('button', { name: '新建任务' }).click()
  const taskTitle = `E2E链路任务-${suffix()}`
  await page.getByLabel('task-title').fill(taskTitle)
  await page.getByLabel('task-estimate').fill('8')
  await page.getByRole('button', { name: /^提\s*交$/ }).click()
  await expect(page.getByText(taskTitle)).toBeVisible()
  await page.getByText(taskTitle).click()
  const taskId = Number(page.url().split('/tasks/')[1])

  // assign → assignee 收到通知，铃铛未读 +1（platform §4.2 notify 副作用）
  await page.getByRole('button', { name: /指\s*派/ }).click()
  await page.getByLabel('task-assign-assignee').click()
  // 并行用例会让账号下拉变长（antd 虚拟列表），先按账号名过滤保证目标项在 DOM
  await page.keyboard.type(assignee)
  await page.getByTitle(`E2E执行者(${assignee})`).click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /^提\s*交$/ }).click()
  await expect
    .poll(async () => (await apiData<{ count: number }>(assigneeCookie, 'GET', '/notifications/unread-count')).count, {
      message: '指派后 assignee 未读通知应 +1',
    })
    .toBe(unreadBefore + 1)
  expect((await apiData<{ assignee: string }>(admin, 'GET', `/tasks/${taskId}`)).assignee).toBe(assignee)

  // start：本次消耗 2 / 剩余 5
  await page.getByRole('button', { name: /^开\s*始$/ }).click()
  await page.getByLabel('task-start-consumed').fill('2')
  await page.getByLabel('task-start-left').fill('5')
  await page.getByRole('button', { name: /^提\s*交$/ }).click()
  await expect(page.getByText(/进行中/).first()).toBeVisible()

  // 登记工时 1（另一次流水）
  await page.getByRole('button', { name: '登记工时' }).first().click()
  await page.locator('[aria-label="effort-consumed"]:visible').fill('1')
  await page.locator('[aria-label="effort-record"]:visible').click()

  // finish：本次消耗 1 + 剩余归零；重载详情复位常开的登记抽屉
  await page.goto(`/tasks/${taskId}`)
  await page.getByRole('button', { name: /^完\s*成$/ }).click()
  await page.getByLabel('task-finish-consumed').fill('1')
  await page.getByLabel('task-finish-left').fill('0')
  await page.getByRole('button', { name: /^提\s*交$/ }).click()
  await expect(page.getByText(/已完成/).first()).toBeVisible()

  // 工时三件套 + effort 自动落行（task §5 finish 语义；start 2 + 登记 1 + finish 1 = 三条流水）
  const task = await apiData<{
    status: string
    consumedHours: number
    leftHours: number
    estimateHours: number
  }>(admin, 'GET', `/tasks/${taskId}`)
  expect(task.status).toBe('done')
  expect(task.consumedHours).toBe(4)
  expect(task.leftHours).toBe(0)
  expect(task.estimateHours).toBe(8)
  const efforts = await apiData<{ items: { consumedHours: number }[]; total: number }>(
    admin,
    'GET',
    `/tasks/${taskId}/efforts`,
  )
  expect(efforts.total).toBe(3)
  expect(efforts.items.reduce((sum, row) => sum + row.consumedHours, 0)).toBe(4)

  // 动态流落痕
  const activities = await apiData<{ items: { action: string }[] }>(admin, 'GET', `/tasks/${taskId}/activities`)
  const actions = activities.items.map((item) => item.action)
  for (const expected of ['assigned', 'started', 'effortRecorded', 'finished']) {
    expect(actions, `动态流应含 ${expected}`).toContain(expected)
  }
})
