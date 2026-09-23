import { httpFetch, SESSION_EXPIRED_EVENT } from '@zentao/api-client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

/**
 * T69 / FE-03 回归：**FormData 也过会话守卫**。
 *
 * `httpFetch` 的 FormData 分支不走 middleware 链（jsdom/部分运行时的 FormData 兼容层无法被
 * `new Request` 二次序列化），此前的注释声称「超时/401 守卫保持等价」——超时确实手挂了，
 * 401 却没有：上传/删除失败时会话过期不广播，用户停在页面上继续点。本用例钉住两件事：
 * 两条分支的 401 语义一致，且登录页上的 401 仍不广播（错误密码也是 401）。
 */
const UNAUTHORIZED = () =>
  new Response(JSON.stringify({ error: { code: 40101, message: '', traceId: 'test' } }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  })

let fired = 0
const onExpired = (): void => {
  fired += 1
}

beforeEach(() => {
  fired = 0
  window.history.replaceState({}, '', '/my')
  window.addEventListener(SESSION_EXPIRED_EVENT, onExpired)
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(UNAUTHORIZED())),
  )
})

afterEach(() => {
  window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired)
  vi.unstubAllGlobals()
})

describe('httpFetch 的会话失效广播', () => {
  test('JSON 请求 401：广播会话失效', async () => {
    await expect(httpFetch('/api/v1/accounts')).rejects.toMatchObject({ code: 40101 })
    expect(fired).toBe(1)
  })

  test('FormData 请求 401：同样广播（修复点）', async () => {
    const body = new FormData()
    body.append('file', new File(['x'], 'a.txt', { type: 'text/plain' }))

    await expect(httpFetch('/api/v1/files', { method: 'POST', body })).rejects.toMatchObject({ code: 40101 })
    expect(fired).toBe(1)
  })

  test('登录页上的 401 不广播（错误密码也是 401，不该再跳登录页）', async () => {
    window.history.replaceState({}, '', '/login')
    const body = new FormData()
    body.append('file', new File(['x'], 'a.txt', { type: 'text/plain' }))

    await expect(httpFetch('/api/v1/files', { method: 'POST', body })).rejects.toMatchObject({ code: 40101 })
    expect(fired).toBe(0)
  })
})
