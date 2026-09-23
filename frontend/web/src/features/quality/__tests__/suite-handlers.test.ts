import { ApiError } from '@zentao/api-client'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { db, grantRolePrivileges, resetMockData } from '../../../mocks/db'
import { handlers } from '../../../mocks/handlers'
import {
  fetchLibraries,
  fetchLibrary,
  fetchLibraryCases,
  fetchSuite,
  fetchSuites,
  fetchTestCases,
  importCasesFromLibrary,
  linkSuiteCasesAction,
  patchLibrary,
  patchSuite,
  submitLibrary,
  submitLibraryCase,
  submitSuite,
} from '../api/quality.api'

/**
 * Suite/Library handler 契约测试（T-7）：同表双端点面、private 行级、link 幂等、库用例隔离、
 * import-from-library 复制语义必须与 quality §3.3/§7/§8 一致。
 */
const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  resetMockData()
  db.sessionActive = true
  db.currentAccountId = 1 // admin：超管组，全权限
})
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

async function expectApiError(promise: Promise<unknown>, code: number): Promise<void> {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  )
  expect(error).toBeInstanceOf(ApiError)
  expect((error as ApiError).code).toBe(code)
}

/** dev1 只读组：补功能码后仅剩数据权限差异（product 1 为 public 产品）。 */
function grantDev1(codes: string[]): void {
  db.currentAccountId = 2
  grantRolePrivileges(2, codes)
}

describe('套件行级规则（quality §7/§8）', () => {
  test('private 套件：非创建者列表 0 条、详情 40302；public 产品内全员可见', async () => {
    const privateSuite = await submitSuite(1, { name: '私有套件', type: 'private' })
    const publicSuite = await submitSuite(1, { name: '公开套件', type: 'public' })
    expect((await fetchSuites(1, {})).total).toBe(2)

    grantDev1(['suite-view'])
    const visible = await fetchSuites(1, {})
    expect(visible.total).toBe(1)
    expect(visible.items[0]?.id).toBe(publicSuite.id)
    await expectApiError(fetchSuite(privateSuite.id), 40302)
    expect((await fetchSuite(publicSuite.id)).id).toBe(publicSuite.id)
  })

  test('link-cases 幂等：重复关联不新增行、不报错（UNIQUE(suite_id, case_id)）', async () => {
    const suite = await submitSuite(1, { name: '公开套件' })

    const linked = await linkSuiteCasesAction(suite.id, [1, 2, 1])
    expect(linked.caseIds).toEqual([1, 2])
    expect(linked.caseCount).toBe(2)
    const version = linked.lockVersion

    const added = await linkSuiteCasesAction(suite.id, [2, 3])
    expect(added.caseIds).toEqual([1, 2, 3])
    expect(added.caseCount).toBe(3)
    expect(added.lockVersion).toBe(version + 1)

    const repeat = await linkSuiteCasesAction(suite.id, [1, 2, 3])
    expect(repeat.caseIds).toEqual([1, 2, 3])
    expect(repeat.caseCount).toBe(3)
    expect(repeat.lockVersion).toBe(version + 1) // 纯重复关联：无新增行、不推进版本
  })
})

describe('同表双端点面（quality §3.3）', () => {
  test('/suites 面排除 type=library；/libraries 写入强制 type=library、productId=0', async () => {
    const suite = await submitSuite(1, { name: '套件' })
    const library = await submitLibrary({ name: '用例库', description: '公共用例' })
    expect(library.type).toBe('library')
    expect(library.productId).toBe(0)
    const row = db.suites.find((item) => item.id === library.id)
    expect(row?.type).toBe('library')
    expect(row?.productId).toBe(0)

    const suites = await fetchSuites(1, {})
    expect(suites.items.map((item) => item.id)).toEqual([suite.id])
    expect(suites.items.some((item) => item.type === 'library')).toBe(false)
    expect((await fetchLibraries({})).items.map((item) => item.id)).toEqual([library.id])

    // 面互斥：库不经 /suites 读写（§3.3「library 仅经 /libraries 读写」）
    await expectApiError(fetchSuite(library.id), 40401)
    await expectApiError(fetchLibrary(suite.id), 40401)
  })

  test('库用例不出现在产品用例列表；/libraries 读面无产品 ACL（§7/§8）', async () => {
    const library = await submitLibrary({ name: '用例库' })
    const libraryCase = await submitLibraryCase(library.id, { title: '库内用例' })
    expect(libraryCase.productId).toBe(0)
    expect(libraryCase.libraryId).toBe(library.id)

    const productCases = await fetchTestCases(1, { limit: 200 })
    expect(productCases.items.some((item) => item.id === libraryCase.id)).toBe(false)
    expect((await fetchLibraryCases(library.id, {})).total).toBe(1)

    grantDev1(['library-view'])
    expect((await fetchLibraries({})).total).toBe(1)
    expect((await fetchLibraryCases(library.id, {})).total).toBe(1)
  })

  test('import-from-library：复制为产品用例（libraryId=0、steps 一并复制），返回 importedCount', async () => {
    const library = await submitLibrary({ name: '用例库' })
    const source = await submitLibraryCase(library.id, {
      title: '库内用例',
      priority: 2,
      type: 'interface',
      steps: [{ sort: 1, description: '打开页面', expects: '页面可见' }],
    })
    const before = (await fetchTestCases(1, { limit: 200 })).total

    const result = await importCasesFromLibrary(1, { libraryId: library.id, caseIds: [source.id] })
    expect(result.importedCount).toBe(1)

    const after = await fetchTestCases(1, { limit: 200 })
    expect(after.total).toBe(before + 1)
    const copy = after.items.find((item) => item.id !== source.id && item.title === '库内用例')
    expect(copy?.libraryId).toBe(0)
    expect(copy?.productId).toBe(1)
    expect(copy?.priority).toBe(2)
    expect(copy?.steps).toEqual(source.steps)
    // 源用例仍在库内（导入 = 复制，不是搬迁）
    expect((await fetchLibraryCases(library.id, {})).total).toBe(1)
  })
})

describe('乐观锁与权限码（quality §8）', () => {
  test('PATCH lockVersion 不符 → 40901；库写/套件写权限码缺失 → 40301', async () => {
    const library = await submitLibrary({ name: '用例库' })
    await expectApiError(patchLibrary(library.id, { name: '改名', lockVersion: library.lockVersion + 1 }), 40901)
    expect((await patchLibrary(library.id, { name: '改名', lockVersion: library.lockVersion })).name).toBe('改名')

    const suite = await submitSuite(1, { name: '套件' })
    await expectApiError(patchSuite(suite.id, { name: '改名', lockVersion: 99 }), 40901)

    db.currentAccountId = 3 // guest：无任何权限码
    await expectApiError(fetchLibraries({}), 40301)
    await expectApiError(submitLibrary({ name: '越权建库' }), 40301)

    grantDev1(['suite-view']) // 只有读码：写与关联仍被拦
    await expectApiError(submitSuite(1, { name: '越权建套件' }), 40301)
    await expectApiError(linkSuiteCasesAction(suite.id, [1]), 40301)
  })
})
