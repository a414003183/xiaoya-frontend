import { expect, test } from '@playwright/test'
import { api, apiData, apiLogin, errorCode, suffix, uploadFile } from './fixtures'

/**
 * T73 安全回归（PA 阶段验收点名，每面 1 条冒烟，真断言）：
 * ① IDOR 遍历——用户 A 下载不到不可见对象的附件（T49 修复的回归看护）；
 * ② 匿名面——曾裸奔的 4 端点（/menus/routes、/dicts/{name}、/meta/{domain}、/departments/tree）全 40101（T50）；
 * ③ 改密踢会话——本人改密后其余会话即刻 40101、当前会话保留（T51）；
 * ④ CSV 注入——导出公式前缀被文本化（T59/SEC-06）。
 * 与 ops-smoke 同形态：HTTP 直连真后端，断言服务端保证（安全面本就不该有 UI 旁路）。
 */
const PNG_1PX = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
  (c) => c.charCodeAt(0),
)

test('安全回归·IDOR：不可见对象的附件下载/内联/列表全 40302，可见方照常可下', async () => {
  const admin = await apiLogin('admin', 'admin123')
  const mark = suffix()
  // 不可见对象：custom 产品（白名单只含 admin）下的需求
  const product = await apiData<{ id: number }>(admin, 'POST', '/products', {
    name: `T73IDOR产品-${mark}`,
    acl: 'custom',
    whitelist: ['admin'],
  })
  const story = await apiData<{ id: number }>(admin, 'POST', `/products/${product.id}/stories`, {
    title: `T73IDOR需求-${mark}`,
  })
  const upload = await uploadFile(admin, `t73-idor-${mark}.png`, PNG_1PX, 'story', story.id)
  expect(upload.status, await upload.clone().text()).toBe(200)
  const fileId = ((await upload.json()) as { data: { id: number } }).data.id

  // 攻击方：普通账号（无产品可见权，更不在白名单）
  const account = `t73idor_${Date.now() % 1000000}`
  await apiData(admin, 'POST', '/accounts', { account, realName: 'T73IDOR', password: 'e2e-idor-123456' })
  const attacker = await apiLogin(account, 'e2e-idor-123456')

  // 遍历面：拿到 fileId/objectId 直接拼 URL 也拿不到。
  // filters[…] 的方括号走 %5B%5D（与 FileApiTest 同口径：裸方括号不会被 @RequestParam 绑定 → 40001 误报）
  for (const path of [
    `/files/${fileId}/download`,
    `/files/${fileId}/raw`,
    `/files?filters%5BobjectType%5D=story&filters%5BobjectId%5D=${story.id}`,
  ]) {
    const response = await api(attacker, 'GET', path)
    expect(response.status, `${path} → ${response.status}`).toBe(403)
    expect(await errorCode(response), path).toBe(40302)
  }
  // 正对照：超管（对象可见）可下载
  expect((await api(admin, 'GET', `/files/${fileId}/download`)).status).toBe(200)
})

test('安全回归·匿名面：4 个曾裸奔端点全部 40101', async () => {
  for (const path of ['/menus/routes', '/dicts/nope', '/meta/product', '/departments/tree']) {
    const response = await api('', 'GET', path)
    expect(response.status, `${path} → ${response.status}`).toBe(401)
    expect(await errorCode(response), path).toBe(40101)
  }
})

test('安全回归·改密踢会话：本人改密后其余会话 40101、当前会话保留', async () => {
  const admin = await apiLogin('admin', 'admin123')
  const account = `t73kick_${Date.now() % 1000000}`
  const created = await apiData<{ id: number }>(admin, 'POST', '/accounts', {
    account,
    realName: 'T73踢会话',
    password: 'e2e-kick-123456',
  })
  const current = await apiLogin(account, 'e2e-kick-123456')
  const stale = await apiLogin(account, 'e2e-kick-123456')

  await apiData(current, 'POST', `/accounts/${created.id}/password`, {
    oldPassword: 'e2e-kick-123456',
    newPassword: 'e2e-kick-654321',
  })
  expect((await api(current, 'GET', '/me')).status).toBe(200) // 当前会话保留（首登改密才走得下去）
  const kicked = await api(stale, 'GET', '/me')
  expect(kicked.status).toBe(401)
  expect(await errorCode(kicked)).toBe(40101)
})

test('安全回归·CSV 注入：公式前缀文本化，导出流里没有裸 = 开头的单元格', async () => {
  const admin = await apiLogin('admin', 'admin123')
  const mark = suffix()
  const formula = `=cmd|' /C calc'!A0-${mark}`
  await apiData(admin, 'POST', '/products', { name: formula })

  const response = await api(admin, 'GET', `/products?format=csv&q=${encodeURIComponent(mark)}`)
  expect(response.status).toBe(200)
  const text = await response.text()
  // 文本化 = 前缀单引号（Excel/Sheets 按文本渲染，不执行公式）
  expect(text).toContain(`'=cmd|' /C calc'!A0-${mark}`)
  // 负向：任何单元格都不许裸 = 开头（公式执行面 = 0）
  const bareFormulaCell = text
    .split(/\r?\n/)
    .flatMap((line) => line.split(','))
    .some((cell) => cell.startsWith('='))
  expect(bareFormulaCell).toBe(false)
})
