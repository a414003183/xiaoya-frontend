import { expect, type Page, test } from '@playwright/test'
import { login } from './fixtures'

/**
 * i18n 收口 E2E（06 A4-4）：切 EN 后代表页「界面骨架」不冒中文、无裸 i18n key；切回 ZH 复原。
 *
 * 扫描面只取骨架选择器（菜单/页头标题/表头/分页/空态/表单标签），**不含数据列**：列表里的业务数据
 * 本身可能是中文（后端库中的用户姓名、用户自建对象标题），按 06 §七 决策⑧ 的边界——后端数据不翻译，
 * 只有界面文案走 i18n。所以数据列上的中文不是缺陷，骨架上的才是。
 */
const CHROME_SELECTORS = [
  '.ant-menu',
  'h4.ant-typography',
  '.ant-table-thead',
  '.ant-pagination',
  '.ant-empty-description',
  '.ant-form-item-label',
]

const CJK = /[\u4e00-\u9fff]/
/** 裸 i18n key：以域名为前缀的点分路径（`nav.group.dashboard` 之类），撞上即说明漏翻或漏键。 */
const BARE_KEY =
  /(?:^|[\s>])(?:nav|common|auth|platform|org|groups|group|product|branch|category|plan|release|build|story|project|team|stakeholder|board|stage|task|effort|quality|bug|testCase|suite|library|testRun|report|workspace|todo|my|weeklyReport|dashboard|personnel|docSpace|doc|docVersion|docCategory|file)\.[a-zA-Z][\w.]*/m

/** 代表页（列表 / 看板 / 树形 / 表单 / 详情各形态覆盖）。 */
const PAGES = ['/my', '/products', '/projects', '/org/accounts', '/notifications', '/admin/settings']

async function chromeText(page: Page, pagePath: string): Promise<string> {
  await expect(page.locator('.ant-menu').first(), `${pagePath} 外壳未渲染`).toBeVisible()
  const text = await page.evaluate(
    (selectors) =>
      selectors
        .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
        .map((element) => (element as HTMLElement).innerText)
        .join('\n'),
    CHROME_SELECTORS,
  )
  expect(text.trim().length, `${pagePath} 骨架扫描面为空（选择器失效？）`).toBeGreaterThan(0)
  return text
}

async function switchLanguage(page: Page, label: 'EN' | 'ZH'): Promise<void> {
  await page.locator('.ant-segmented-item-label', { hasText: label }).click()
  await expect(page.locator('.ant-segmented-item-selected', { hasText: label })).toBeVisible()
}

test('切 EN：代表页骨架无中文、无裸 key；切回 ZH 复原', async ({ page }) => {
  await login(page, 'admin', 'admin123')

  // ZH 基线：菜单与页头是中文——证明下面的「无中文」确实是切换的结果，而不是页面本来就空
  await expect(page.locator('.ant-menu').first()).toContainText('工作台')
  expect(await chromeText(page, '/my'), 'zh 基线应含中文').toMatch(CJK)

  await switchLanguage(page, 'EN')
  expect(await page.evaluate(() => localStorage.getItem('zentao.language')), '语言应持久化').toBe('en')

  // antd 组件文案随语言联动（A4-1 的 ConfigProvider locale）：搜不到的产品 → 空态由 antd locale 决定。
  // 这条专防「antd locale 没跟着语言走」——骨架扫描撞不到它（空态不在骨架选择器里、菜单仍是英文）。
  await page.goto('/products?q=__i18n_no_match__')
  await expect(page.locator('.ant-empty-description').first(), 'antd 空态未切英文').toHaveText('No data')

  for (const pagePath of PAGES) {
    await page.goto(pagePath)
    await expect
      .poll(() => chromeText(page, pagePath), { message: `${pagePath} 骨架仍冒中文（antd locale 未联动？）` })
      .not.toMatch(CJK)
    const chrome = await chromeText(page, pagePath)
    expect(chrome, `${pagePath} 骨架出现裸 i18n key`).not.toMatch(BARE_KEY)
    const body = await page.evaluate(() => document.body.innerText)
    expect(body, `${pagePath} 正文出现裸 i18n key`).not.toMatch(BARE_KEY)
  }

  // 切回 ZH：骨架与 antd 文案都恢复中文（后续用例与人工走查不受本次切换影响）
  await switchLanguage(page, 'ZH')
  await expect.poll(() => chromeText(page, '/admin/settings')).toMatch(CJK)
  await page.goto('/products?q=__i18n_no_match__')
  await expect(page.locator('.ant-empty-description').first(), 'antd 空态未切回中文').toHaveText('暂无数据')
  expect(await page.evaluate(() => localStorage.getItem('zentao.language'))).toBe('zh-CN')

  // 刷新后仍是中文（持久化读回）
  await page.goto('/admin/settings')
  await expect(page.locator('.ant-menu').first()).toContainText('工作台')
})
