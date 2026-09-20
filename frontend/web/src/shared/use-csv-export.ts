/**
 * 列表 CSV 导出（03 §3 `format=csv` / A-04）：同路径同 filters/q/sort，上限 5000 行；
 * 业务错误（40001 超限 / 409 / …）仍以错误信封返回 → 统一归一 ApiError，由 hook toast。
 */

import { API_BASE, ApiError, errorText } from '@zentao/api-client'
import { useMessage } from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { buildListParams, type ListDsl } from './list-dsl'

/** 导出文件名 `export-<resource>-<yyyymmdd-HHMM>.csv`（now 可注入便于测试）。 */
export function csvFilename(resource: string, now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
  return `export-${resource}-${stamp}.csv`
}

/** 列表页当前过滤 → 导出查询串（filters/q/sort；page/limit 不带——导出恒为 limit=5000 的全量切片）。 */
export function csvQuery(dsl: ListDsl): URLSearchParams {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(buildListParams(dsl))) {
    if (key !== 'page' && key !== 'limit') {
      query.set(key, String(value))
    }
  }
  return query
}

/** 发起导出并触发浏览器 blob 下载；非 2xx 按错误信封抛 ApiError。
 *  `resourcePath` 是**不含基址**的资源路径（由属主域 api 提供，如 `/products`）；
 *  基址与 CSRF 头在此统一注入——早先页面各自手拼 `/api/v1/...` 且漏了 X-Requested-With（08 B1-5）。 */
export async function exportCsv(resourcePath: string, params: URLSearchParams, resource: string): Promise<void> {
  const query = new URLSearchParams({ format: 'csv', limit: '5000' })
  for (const [key, value] of params) {
    if (value !== '') {
      query.set(key, value)
    }
  }
  const response = await fetch(`${API_BASE}${resourcePath}?${query.toString()}`, {
    credentials: 'same-origin',
    // 03 §7：出网一律带该头（服务端据此拒绝跨站表单式请求）；此处绕过 httpFetch，需自行注入
    headers: { 'X-Requested-With': 'fetch' },
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => undefined)) as { error?: unknown } | undefined
    throw ApiError.fromEnvelope(body?.error)
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = csvFilename(resource)
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

/** 页面侧封装：pending 状态 + 成功/失败 toast（ApiError 走服务端文案）。 */
export function useCsvExport(): {
  exporting: boolean
  exportCsv: (resourcePath: string, params: URLSearchParams, resource: string) => Promise<void>
} {
  const message = useMessage()
  const { t } = useTranslation()
  const [exporting, setExporting] = useState(false)
  const run = async (resourcePath: string, params: URLSearchParams, resource: string) => {
    setExporting(true)
    try {
      await exportCsv(resourcePath, params, resource)
      message.success(t('common.message.exported'))
    } catch (error) {
      message.error(errorText(error, t, 'common.message.failed'))
    } finally {
      setExporting(false)
    }
  }
  return { exporting, exportCsv: run }
}
