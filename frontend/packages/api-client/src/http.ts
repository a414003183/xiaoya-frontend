/**
 * fetch 封装（01 §3 api-client）：中间件链 timeout/dedupe/sessionGuard，
 * 自动注入 X-Requested-With: fetch（03 §7 CSRF 防线），按 03 §2 拆错误信封归一 ApiError。
 * orval 生成的 hooks 经 httpFetch 出网（orval.config.ts override.mutator）。
 */

export class ApiError extends Error {
  readonly code: number
  readonly fields: Record<string, string> | undefined
  readonly traceId: string | undefined

  constructor(code: number, message: string, fields?: Record<string, string>, traceId?: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.fields = fields
    this.traceId = traceId
  }

  static fromEnvelope(error: unknown): ApiError {
    if (typeof error === 'object' && error !== null && 'code' in error) {
      const e = error as { code: number; message?: string; fields?: Record<string, string>; traceId?: string }
      // message 仅开发兜底：界面文案一律由 errorText 按 code 映射（06 A4-3）
      return new ApiError(e.code, e.message ?? '', e.fields, e.traceId)
    }
    return new ApiError(50001, '')
  }
}

export const SESSION_EXPIRED_EVENT = 'zentao:session-expired'

/**
 * API 基址（08 B1-5）：手写出网（CSV 导出 / SSE / 文件下载 / 少量直连）的唯一来源。
 * 另两处同值：`contract/openapi.yaml` 的 `servers[0].url` 与 `orval.config.ts` 的 `baseUrl`
 * （生成物由后者烘进路径）。业务代码禁止再手拼 `/api/v1/...`——跨域引用外的 URL 知识
 * 一律收敛到属主域的 `.api.ts`。
 */
export const API_BASE = '/api/v1'

/**
 * 生成的响应类型是 各状态码变体 的联合（含错误分支）；运行时错误信封已在 parseEnvelope 抛 ApiError，
 * ok() 把类型收窄到 200 变体，`.data` 即载荷。
 */
export type OkOf<R> = Extract<R, { status: 200 }>

export function ok<R extends { status: number }>(response: R): OkOf<R> {
  return response as OkOf<R>
}

type Next = (request: Request) => Promise<Response>
type Middleware = (request: Request, next: Next) => Promise<Response>

const DEFAULT_TIMEOUT_MS = 30_000

function timeout(request: Request, next: Next): Promise<Response> {
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(DEFAULT_TIMEOUT_MS)])
  return next(new Request(request, { signal }))
}

const inflightGets = new Map<string, Promise<Response>>()

function dedupe(request: Request, next: Next): Promise<Response> {
  if (request.method !== 'GET' || request.signal.aborted) {
    return next(request)
  }
  const key = `${request.method} ${request.url}`
  const existing = inflightGets.get(key)
  if (existing) {
    return existing.then((response) => response.clone())
  }
  const promise = next(request).finally(() => inflightGets.delete(key))
  inflightGets.set(key, promise)
  return promise
}

/**
 * 401 广播会话失效（登录页自身排除：错误密码也返回 401，不应踢回登录页）。
 * 独立成函数是因为 FormData 分支不走 middleware 链，但必须保持同一个 401 语义（FE-03）。
 */
function guardSession(response: Response): Response {
  if (response.status === 401 && typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
  }
  return response
}

function sessionGuard(request: Request, next: Next): Promise<Response> {
  return next(request).then(guardSession)
}

const MIDDLEWARE: ReadonlyArray<Middleware> = [sessionGuard, dedupe, timeout]

function compose(request: Request): Promise<Response> {
  const terminal: Next = (req) => fetch(req)
  let next: Next = terminal
  for (const middleware of [...MIDDLEWARE].reverse()) {
    const inner = next
    next = (req) => middleware(req, inner)
  }
  return next(request)
}

function unwrapEnvelope(body: unknown): unknown {
  if (typeof body === 'object' && body !== null && 'data' in body) {
    return (body as { data: unknown }).data
  }
  return body
}

/**
 * orval mutator：所有生成的 hooks 统一经此出网。
 * 约定返回 { data: 载荷, status, headers }——data 已拆掉 {data:…} 信封（03 §2），
 * 错误信封在此抛 ApiError，永不进入调用方。
 */
async function parseResponse<R>(response: Response): Promise<R> {
  const body: unknown = await response.json().catch(() => undefined)
  if (typeof body === 'object' && body !== null && 'error' in body) {
    throw ApiError.fromEnvelope((body as { error: unknown }).error)
  }
  return { data: unwrapEnvelope(body), status: response.status, headers: response.headers } as R
}

export async function httpFetch<R>(url: string, init?: RequestInit): Promise<R> {
  const headers = new Headers(init?.headers)
  headers.set('X-Requested-With', 'fetch')
  const isFormData = init?.body instanceof FormData
  if (isFormData) {
    // boundary 由 fetch 生成，禁止手设 Content-Type
    headers.delete('Content-Type')
  } else if (init?.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  // jsdom/undici 的 fetch 不解析相对 URL；浏览器内按 origin 展开（路径不变，vite proxy 照常工作）
  const resolvedUrl =
    typeof window !== 'undefined' && !url.startsWith('http') ? new URL(url, window.location.origin).toString() : url
  if (isFormData) {
    // FormData 直连：绕过 Request 再包装（部分运行时/测试环境的 FormData 兼容层无法二次序列化），
    // 故不走 compose()。middleware 语义在此显式保持等价：timeout 手动挂（同 DEFAULT_TIMEOUT_MS）、
    // 401 走 guardSession（**曾经漏掉**，上传失败时不会广播会话过期）、dedupe 只作用于 GET 不适用。
    const requestSignal = init?.signal ?? null
    const response = await fetch(resolvedUrl, {
      ...init,
      headers,
      signal:
        requestSignal !== null
          ? AbortSignal.any([requestSignal, AbortSignal.timeout(DEFAULT_TIMEOUT_MS)])
          : AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    })
    return parseResponse<R>(guardSession(response))
  }
  const request = new Request(resolvedUrl, { ...init, headers })
  const response = await compose(request)
  return parseResponse<R>(response)
}
