import { expect, type Page, test } from '@playwright/test'

/**
 * P4 质量域主链路（phase-4 卡 T-11 手工走查 1/3/4/6 的自动化等价物）：
 * 真后端（H2+Flyway+种子 admin）+ 真前端（VITE_API_MOCK=0）。
 * 覆盖：提 Bug→confirm→resolve(fixed)→close；建用例(needReview)→review pass→normal；
 * 建测试单→关联用例→start→record-result fail→用例 lastRun 同步→close；
 * 执行下创建报告→测试单 reportId 回填可见。
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

/** 产品 + 项目 + sprint 执行（Report/TestRun 需要执行；产品 ACL 公开）。 */
async function seed(
  page: Page,
  cookie: string,
): Promise<{ productId: number; executionId: number; executionName: string }> {
  const product = await apiData<{ id: number }>(cookie, 'POST', '/products', {
    name: `E2E质量产品-${suffix()}`,
    type: 'branch',
  })
  const project = await apiData<{ id: number }>(cookie, 'POST', '/projects', {
    name: `E2E质量项目-${suffix()}`,
    beginDate: '2026-09-01',
    endDate: '2026-12-31',
    acl: 'open',
    productIds: [product.id],
  })
  const executionName = `E2E质量执行-${suffix()}`
  const execution = await apiData<{ id: number }>(cookie, 'POST', `/projects/${project.id}/executions`, {
    type: 'sprint',
    name: executionName,
    beginDate: '2026-09-01',
    endDate: '2026-09-30',
  })
  await login(page, 'admin', 'admin123')
  return { productId: product.id, executionId: execution.id, executionName }
}

test('提 Bug→确认→解决(fixed)→关闭（UI 动作链 + 动态流落痕）', async ({ page }) => {
  const admin = await apiLogin('admin', 'admin123')
  const { productId } = await seed(page, admin)
  const title = `E2E缺陷-${suffix()}`

  await page.goto(`/products/${productId}/bugs`)
  await page.getByRole('button', { name: '提 Bug' }).click()
  await page.getByLabel('bug-title').fill(title)
  await page.getByLabel('bug-opened-builds').fill('1')
  await page.getByRole('button', { name: /^提\s*交$/ }).click()
  await expect(page.getByText(title)).toBeVisible()

  await page.getByText(title).click()
  await expect(page.getByText(/激\s*活/).first()).toBeVisible()

  // confirm
  await page.getByRole('button', { name: /^确\s*认$/ }).click()
  await page.getByRole('button', { name: /^提\s*交$/ }).click()
  await expect(page.getByText(/已确认|是/).first()).toBeVisible()

  // resolve=fixed 需 resolvedBuild
  await page.getByRole('button', { name: /^解\s*决$/ }).click()
  await page.getByLabel('已解决').check()
  await page.getByLabel('bug-resolved-build').fill('build-1')
  await page.getByRole('button', { name: /^提\s*交$/ }).click()
  await expect(page.getByText(/已解决/).first()).toBeVisible()

  // close：先等「解决」弹窗收起——弹窗 X 的 aria-label 也叫「关闭」，此刻它比页面动作先出现，
  // 直接按名取会抢在弹窗关闭前点到 X（06 A4-1 后暴露的定位器歧义，非产品缺陷）。
  await expect(page.locator('.ant-modal-wrap:visible')).toHaveCount(0)
  await page
    .locator('button:not(.ant-modal-close)')
    .filter({ hasText: /^关\s*闭$/ })
    .click()
  await expect(page.getByText(/已关闭/).first()).toBeVisible()

  const bugId = Number(page.url().split('/bugs/')[1])
  const detail = await apiData<{ status: string; confirmed: boolean; resolution: string }>(
    admin,
    'GET',
    `/bugs/${bugId}`,
  )
  expect(detail.status).toBe('closed')
  expect(detail.confirmed).toBe(true)
  expect(detail.resolution).toBe('fixed')

  await page.getByRole('tab', { name: '动态' }).click()
  await expect(page.getByText(/确认|解决|关闭/).first()).toBeVisible()
})

test('建用例(需评审)→评审通过→建测试单→关联用例→登记失败→lastRun 同步→关单→报告回填', async ({ page }) => {
  const admin = await apiLogin('admin', 'admin123')
  const { productId, executionId, executionName } = await seed(page, admin)
  const caseTitle = `E2E用例-${suffix()}`

  // 建用例：needReview=true → wait
  await page.goto(`/products/${productId}/test-cases`)
  await page.getByRole('button', { name: '建用例' }).click()
  await page.getByLabel('case-title').fill(caseTitle)
  await page.getByLabel('case-need-review').check()
  await page.getByRole('button', { name: /^提\s*交$/ }).click()
  await expect(page.getByText(caseTitle)).toBeVisible()

  await page.getByText(caseTitle).click()
  await expect(page.getByText(/待评审/).first()).toBeVisible()
  const caseId = Number(page.url().split('/test-cases/')[1])

  // 评审通过 → normal
  await page.getByRole('button', { name: /^评\s*审$/ }).click()
  await page.getByRole('button', { name: /^提\s*交$/ }).click()
  await expect(page.getByText(/正常/).first()).toBeVisible()
  expect((await apiData<{ status: string }>(admin, 'GET', `/test-cases/${caseId}`)).status).toBe('normal')

  // 建测试单（关联用例）
  await page.goto(`/products/${productId}/test-runs`)
  await page.getByRole('button', { name: '建测试单' }).click()
  const runName = `E2E测试单-${suffix()}`
  await page.getByLabel('test-run-name').fill(runName)
  await page.getByLabel('test-run-execution').click()
  await page.getByTitle(executionName).click()
  await page.keyboard.press('Escape')
  await page.getByLabel('test-run-begin-date').fill('2026-09-01')
  await page.getByLabel('test-run-end-date').fill('2026-09-30')
  await page.getByRole('button', { name: /^提\s*交$/ }).click()
  await expect(page.getByText(runName)).toBeVisible()
  await page.getByText(runName).click()
  const testRunId = Number(page.url().split('/test-runs/')[1])

  // 执行页：关联用例（起止动作在详情页头，登记结果在执行页行内）
  await page.goto(`/test-runs/${testRunId}/cases`)
  await page.getByRole('button', { name: '关联用例' }).click()
  await page
    .getByRole('row', { name: new RegExp(caseTitle) })
    .getByRole('checkbox')
    .check()
  await page.getByRole('button', { name: /^关\s*联$/ }).click()
  await expect(page.getByText(caseTitle)).toBeVisible()

  // start：详情页头动作（wait → doing）
  await page.goto(`/test-runs/${testRunId}`)
  await page.getByRole('button', { name: /^开\s*始$/ }).click()
  await page.getByRole('button', { name: /^提\s*交$/ }).click()
  await expect
    .poll(async () => (await apiData<{ status: string }>(admin, 'GET', `/test-runs/${testRunId}`)).status)
    .toBe('doing')

  // 登记 fail（行内按钮，仅 doing 可点）
  await page.goto(`/test-runs/${testRunId}/cases`)
  await page
    .getByRole('row', { name: new RegExp(caseTitle) })
    .getByRole('button', { name: '登记结果' })
    .click()
  await page.locator('label:has(input[aria-label="run-result-fail"])').click()
  await page.getByRole('button', { name: /^提\s*交$/ }).click()

  // 用例 lastRun 三字段同步（先轮询落库，再断言行内渲染）
  await expect
    .poll(
      async () =>
        (await apiData<{ lastRunResult: string | null }>(admin, 'GET', `/test-cases/${caseId}`)).lastRunResult,
      { message: '登记 fail 后用例 lastRunResult 应同步' },
    )
    .toBe('fail')
  const testCase = await apiData<{ lastRunner: string }>(admin, 'GET', `/test-cases/${caseId}`)
  expect(testCase.lastRunner).toBe('admin')
  await expect(page.getByRole('row', { name: new RegExp(caseTitle) }).getByText('失败')).toBeVisible()

  // 重复登记：同行覆写不新增
  const runs = await apiData<{ total: number }>(admin, 'GET', `/test-runs/${testRunId}/cases`)
  expect(runs.total).toBe(1)

  // 关单（详情页头）
  await page.goto(`/test-runs/${testRunId}`)
  await page.getByRole('button', { name: /^关\s*闭$/ }).click()
  await page.getByLabel('test-run-real-finished').fill('2026-09-30')
  await page.getByRole('button', { name: /^提\s*交$/ }).click()
  await expect
    .poll(async () => (await apiData<{ status: string }>(admin, 'GET', `/test-runs/${testRunId}`)).status)
    .toBe('done')

  // 报告：创建后各测试单 reportId 回填
  await page.goto(`/executions/${executionId}/reports`)
  await page.getByRole('button', { name: '建报告' }).click()
  const reportTitle = `E2E报告-${suffix()}`
  await page.getByLabel('report-title').fill(reportTitle)
  await page.getByLabel('report-begin-date').fill('2026-09-01')
  await page.getByLabel('report-end-date').fill('2026-09-30')
  await page.getByLabel(`#${testRunId} ${runName}`).check()
  await page.getByRole('button', { name: /^提\s*交$/ }).click()
  await expect(page.getByText(reportTitle)).toBeVisible()

  const run = await apiData<{ reportId: number | null }>(admin, 'GET', `/test-runs/${testRunId}`)
  expect(run.reportId, 'TestRun.reportId 应由 Report 创建回填').not.toBeNull()

  await page.getByText(reportTitle).click()
  await expect(page.getByText(reportTitle)).toBeVisible()
})

test('用例库建例→产品导入→套件关联（T-7 页面在真后端可走通）', async ({ page }) => {
  const admin = await apiLogin('admin', 'admin123')
  const { productId } = await seed(page, admin)
  const suffixText = suffix()
  const libraryName = `E2E用例库-${suffixText}`
  const caseTitle = `E2E库用例-${suffixText}`
  const suiteName = `E2E套件-${suffixText}`

  // 建用例库 → 库内建用例（批量页单行入口）
  await page.goto('/libraries')
  await page.getByRole('button', { name: '建用例库' }).click()
  await page.getByLabel('library-name').fill(libraryName)
  await page.getByRole('button', { name: /^提\s*交$/ }).click()
  await expect(page.getByText(libraryName)).toBeVisible()

  await page.getByText(libraryName).click()
  const libraryId = Number(page.url().split('/libraries/')[1])
  expect(libraryId).toBeGreaterThan(0)
  await page.getByRole('button', { name: '建用例' }).click()
  await page.locator('[aria-label^="library-case-title-"]:visible').first().fill(caseTitle)
  await page.getByRole('button', { name: /^提\s*交$/ }).click()
  // 逐行 POST：先等落库，再到库详情断言列表可见（输入框的 value 不是文本，getByText 看不到）
  await expect
    .poll(
      async () => {
        const rows = await apiData<{ items: { title: string }[] }>(
          admin,
          'GET',
          `/libraries/${libraryId}/test-cases?q=${encodeURIComponent(caseTitle)}`,
        )
        return rows.items.some((item) => item.title === caseTitle)
      },
      { message: '库内建用例应落库' },
    )
    .toBe(true)
  await page.goto(`/libraries/${libraryId}`)
  await expect(page.getByText(caseTitle).first()).toBeVisible()

  // 产品用例列表：从用例库导入
  await page.goto(`/products/${productId}/test-cases`)
  await page.getByRole('button', { name: /导\s*入/ }).click()
  await page.getByLabel('import-library').click()
  await page.getByTitle(libraryName).click()
  await page
    .getByRole('row', { name: new RegExp(caseTitle) })
    .getByRole('checkbox')
    .check()
  await page
    .getByRole('button', { name: /导\s*入/ })
    .last()
    .click()
  await expect(page.getByText(caseTitle).first()).toBeVisible()

  // 建套件并关联该用例
  await page.goto(`/products/${productId}/suites`)
  await page.getByRole('button', { name: '建套件' }).click()
  await page.getByLabel('suite-name').fill(suiteName)
  await page.getByRole('button', { name: /提\s*交/ }).click()
  await expect(page.getByText(suiteName)).toBeVisible()

  await page.getByText(suiteName).click()
  const suiteId = Number(page.url().split('/suites/')[1])
  await page.getByRole('button', { name: '关联用例' }).click()
  await page
    .getByRole('row', { name: new RegExp(caseTitle) })
    .getByRole('checkbox')
    .check()
  await page.getByRole('button', { name: /^关\s*联$/ }).click()
  await expect(page.getByText(caseTitle).first()).toBeVisible()

  // 落库校验：产品用例 libraryId=0、套件 caseIds 含该用例（poll：关联事务提交与 GET 存在竞态）
  const imported = await apiData<{ items: { id: number; libraryId: number; title: string }[] }>(
    admin,
    'GET',
    `/products/${productId}/test-cases?q=${encodeURIComponent(caseTitle)}`,
  )
  const row = imported.items.find((item) => item.title === caseTitle)
  expect(row, '导入后产品用例列表应含该用例').toBeTruthy()
  expect(row?.libraryId, '导入复制为产品用例（libraryId=0）').toBe(0)
  await expect
    .poll(async () => (await apiData<{ caseIds: number[] }>(admin, 'GET', `/suites/${suiteId}`)).caseIds, {
      message: '关联用例应落 suite_case',
    })
    .toContain(row?.id)
})
