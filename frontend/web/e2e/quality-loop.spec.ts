import { expect, test } from '@playwright/test'
import { apiData, apiLogin, login, suffix } from './fixtures'

/**
 * P6 T-7 全链路 E2E · 质量闭环 7–9（phase-6 卡链路断言，缺一不可）：
 * 提 Bug → confirm → resolve；建用例 → 建测试单 → 关联用例 → 登记结果（幂等 upsert + lastRun 同步）；
 * 出报告 → 详情页可见。每步先经 UI 操作，再用 GET 端点断言服务端状态。
 */
test('质量闭环 7-9：Bug 确认解决 → 用例/测试单/登记结果（幂等+lastRun）→ 报告详情可见', async ({ page }) => {
  const admin = await apiLogin('admin', 'admin123')

  // 上游造数（API）：产品 + 项目 + sprint 执行（TestRun/Report 需要执行）
  const product = await apiData<{ id: number }>(admin, 'POST', '/products', {
    name: `E2E质量产品-${suffix()}`,
    type: 'branch',
  })
  const project = await apiData<{ id: number }>(admin, 'POST', '/projects', {
    name: `E2E质量项目-${suffix()}`,
    beginDate: '2026-09-01',
    endDate: '2026-12-31',
    acl: 'open',
    productIds: [product.id],
  })
  const executionName = `E2E质量执行-${suffix()}`
  const execution = await apiData<{ id: number }>(admin, 'POST', `/projects/${project.id}/executions`, {
    type: 'sprint',
    name: executionName,
    beginDate: '2026-09-01',
    endDate: '2026-09-30',
  })
  await login(page, 'admin', 'admin123')

  // 7. 提 Bug → confirm → resolve（quality §5）
  await page.goto(`/products/${product.id}/bugs`)
  await page.getByRole('button', { name: '提 Bug' }).click()
  const bugTitle = `E2E链路缺陷-${suffix()}`
  await page.getByLabel('bug-title').fill(bugTitle)
  await page.getByLabel('bug-opened-builds').fill('1')
  await page.getByRole('button', { name: /^提\s*交$/ }).click()
  await expect(page.getByText(bugTitle)).toBeVisible()
  await page.getByText(bugTitle).click()
  await expect(page.getByText(/激\s*活/).first()).toBeVisible()
  const bugId = Number(page.url().split('/bugs/')[1])

  await page.getByRole('button', { name: /^确\s*认$/ }).click()
  await page.getByRole('button', { name: /^提\s*交$/ }).click()
  await expect
    .poll(async () => (await apiData<{ confirmed: boolean }>(admin, 'GET', `/bugs/${bugId}`)).confirmed, {
      message: 'confirm 后 bug.confirmed 应为 true',
    })
    .toBe(true)

  await page.getByRole('button', { name: /^解\s*决$/ }).click()
  await page.getByLabel('已解决').check()
  await page.getByLabel('bug-resolved-build').fill('build-1')
  await page.getByRole('button', { name: /^提\s*交$/ }).click()
  await expect
    .poll(async () => (await apiData<{ status: string }>(admin, 'GET', `/bugs/${bugId}`)).status, {
      message: 'resolve(fixed) 后 bug 状态应为 resolved',
    })
    .toBe('resolved')

  // 8. 建用例 → 评审 → 建测试单 → 关联用例 → 登记结果（幂等 upsert + 用例 lastRun 同步）
  const caseTitle = `E2E链路用例-${suffix()}`
  await page.goto(`/products/${product.id}/test-cases`)
  await page.getByRole('button', { name: '建用例' }).click()
  await page.getByLabel('case-title').fill(caseTitle)
  await page.getByLabel('case-need-review').check()
  await page.getByRole('button', { name: /^提\s*交$/ }).click()
  await expect(page.getByText(caseTitle)).toBeVisible()
  await page.getByText(caseTitle).click()
  await expect(page.getByText(/待评审/).first()).toBeVisible()
  const caseId = Number(page.url().split('/test-cases/')[1])

  await page.getByRole('button', { name: /^评\s*审$/ }).click()
  await page.getByRole('button', { name: /^提\s*交$/ }).click()
  await expect(page.getByText(/正常/).first()).toBeVisible()

  const runName = `E2E链路测试单-${suffix()}`
  await page.goto(`/products/${product.id}/test-runs`)
  await page.getByRole('button', { name: '建测试单' }).click()
  await page.getByLabel('test-run-name').fill(runName)
  await page.getByLabel('test-run-execution').click()
  await page.keyboard.type(executionName)
  await page.getByTitle(executionName).click()
  await page.keyboard.press('Escape')
  await page.getByLabel('test-run-begin-date').fill('2026-09-01')
  await page.getByLabel('test-run-end-date').fill('2026-09-30')
  await page.getByRole('button', { name: /^提\s*交$/ }).click()
  await expect(page.getByText(runName)).toBeVisible()
  await page.getByText(runName).click()
  const testRunId = Number(page.url().split('/test-runs/')[1])

  await page.goto(`/test-runs/${testRunId}/cases`)
  await page.getByRole('button', { name: '关联用例' }).click()
  await page
    .getByRole('row', { name: new RegExp(caseTitle) })
    .getByRole('checkbox')
    .check()
  await page.getByRole('button', { name: /^关\s*联$/ }).click()
  await expect(page.getByText(caseTitle)).toBeVisible()

  await page.goto(`/test-runs/${testRunId}`)
  await page.getByRole('button', { name: /^开\s*始$/ }).click()
  await page.getByRole('button', { name: /^提\s*交$/ }).click()
  await expect
    .poll(async () => (await apiData<{ status: string }>(admin, 'GET', `/test-runs/${testRunId}`)).status)
    .toBe('doing')

  // 登记 fail → lastRun 同步；重复登记 pass = 幂等覆写不新增行
  await page.goto(`/test-runs/${testRunId}/cases`)
  const record = async (result: 'fail' | 'pass') => {
    await page
      .getByRole('row', { name: new RegExp(caseTitle) })
      .getByRole('button', { name: '登记结果' })
      .click()
    await page.locator(`label:has(input[aria-label="run-result-${result}"])`).click()
    await page.getByRole('button', { name: /^提\s*交$/ }).click()
  }
  await record('fail')
  await expect
    .poll(
      async () =>
        (await apiData<{ lastRunResult: string | null }>(admin, 'GET', `/test-cases/${caseId}`)).lastRunResult,
      { message: '登记 fail 后用例 lastRunResult 应同步' },
    )
    .toBe('fail')
  await record('pass')
  await expect
    .poll(
      async () =>
        (await apiData<{ lastRunResult: string | null }>(admin, 'GET', `/test-cases/${caseId}`)).lastRunResult,
      { message: '重复登记 pass 覆写后 lastRunResult 应同步' },
    )
    .toBe('pass')
  const runs = await apiData<{ total: number }>(admin, 'GET', `/test-runs/${testRunId}/cases`)
  expect(runs.total, '登记结果幂等 upsert：同行覆写不新增').toBe(1)

  // 9. 出报告 → 详情页可见（quality §5 POST /executions/{executionId}/reports）
  await page.goto(`/executions/${execution.id}/reports`)
  await page.getByRole('button', { name: '建报告' }).click()
  const reportTitle = `E2E链路报告-${suffix()}`
  await page.getByLabel('report-title').fill(reportTitle)
  await page.getByLabel('report-begin-date').fill('2026-09-01')
  await page.getByLabel('report-end-date').fill('2026-09-30')
  await page.getByLabel(`#${testRunId} ${runName}`).check()
  await page.getByRole('button', { name: /^提\s*交$/ }).click()
  await expect(page.getByText(reportTitle)).toBeVisible()
  await page.getByText(reportTitle).click()
  await expect(page).toHaveURL(/\/reports\/\d+$/)
  await expect(page.getByText(reportTitle).first()).toBeVisible()
  const reportId = Number(page.url().split('/reports/')[1])
  const report = await apiData<{ id: number; title: string }>(admin, 'GET', `/reports/${reportId}`)
  expect(report.title).toBe(reportTitle)
  expect(
    (await apiData<{ reportId: number | null }>(admin, 'GET', `/test-runs/${testRunId}`)).reportId,
    'Report 创建后测试单 reportId 应回填',
  ).toBe(reportId)
})
