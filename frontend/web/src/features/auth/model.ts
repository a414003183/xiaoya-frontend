/**
 * 登录后回跳目标的白名单校验（08 B1-4 / 07-P3-42）。
 *
 * `?redirect=` 是**用户可编辑**的（改地址栏即可），直接 `navigate(redirect)` 会把
 * 站外地址/协议相对地址（`//evil.com`）当成回跳目标——典型开放重定向面。
 * 只接受站内绝对路径：`/` 开头、非 `//` 开头、不含反斜杠与空白。
 *
 * 反斜杠与空白必须一起挡：浏览器解析 URL 时会把 `\` 归一为 `/`、把 tab/换行剥掉，
 * 于是 `/\evil.com`、`/<TAB>//evil.com` 在真实浏览器里都等价于 `//evil.com`。
 * 升级路径 = 后端下发允许的回跳前缀；当前前端自证即可（回跳只影响自己的登录页）。
 */
const SAFE_INTERNAL_PATH = /^\/(?!\/)[^\s\\]*$/

/** 取合法回跳目标；不合法（含 null）回落 `fallback`。 */
export function safeRedirect(target: string | null | undefined, fallback = '/my'): string {
  return typeof target === 'string' && SAFE_INTERNAL_PATH.test(target) ? target : fallback
}
