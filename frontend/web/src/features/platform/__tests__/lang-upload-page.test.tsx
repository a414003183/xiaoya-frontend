import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, createQueryClient } from '@zentao/api-client'
import { AppProvider, ConfigProvider, createTheme } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { MemoryRouter } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { db, resetMockData } from '../../../mocks/db'
import { platformHandlers } from '../../../mocks/platform-handlers'
import LangUploadPage from '../pages/lang-upload-page.page'

/**
 * 多语言上传页（platform 卡 §3.12；T21 收敛为**一页**：记录列表 + 上传按钮，无页签、无在线改文案）：
 * 导出下载、Excel 上传（回执/失败明细在结果弹窗）、上传记录列表与筛选、上传后覆盖层缓存失效。
 *
 * 上传那一支只 mock 生成的 `createLangImport`（断言「传了哪些字段 + 结果怎么渲染」）：
 * vitest 5 + jsdom 30 的 FormData 兼容层无法序列化 jsdom File（`_buffer` 缺失），multipart 出不了网，
 * mock 不到 MSW —— 同 platform/__tests__/file-upload-field.test.tsx 的既有结论；其余端点走真 MSW 请求。
 */
initI18n()

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

const createLangImportMock = vi.fn()
vi.mock('@zentao/api-client/generated', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@zentao/api-client/generated')>()),
  createLangImport: (body: unknown) => createLangImportMock(body),
}))

const server = setupServer(...platformHandlers)

beforeAll(() => {
  Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:mock'), configurable: true })
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
  server.listen({ onUnhandledRequest: 'error' })
})
beforeEach(() => {
  resetMockData()
  createLangImportMock.mockReset()
  db.sessionActive = true
  db.currentAccountId = 1 // admin：超管组，全权限码
})
afterEach(() => {
  cleanup()
  server.resetHandlers()
})
afterAll(() => server.close())

function renderPage(entry = '/admin/lang-upload', client = createQueryClient()) {
  return render(
    <ConfigProvider theme={createTheme()}>
      <AppProvider>
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={[entry]}>
            <LangUploadPage />
          </MemoryRouter>
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

/** 上传入口是 antd Upload 的隐藏 input（accept 限定 Excel）。 */
function fileInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="file"]')
  if (!(input instanceof HTMLInputElement)) {
    throw new Error('未找到上传控件')
  }
  return input
}

describe('LangUploadPage · 上传', () => {
  test('下载语言包按钮打到 /lang-items/export 并落 xlsx 文件', async () => {
    const user = userEvent.setup()
    const calls = vi.fn()
    server.use(
      http.get('*/api/v1/lang-items/export', ({ request }) => {
        calls(request.url)
        return new HttpResponse('mock-xlsx', {
          headers: { 'Content-Type': XLSX, 'Content-Disposition': 'attachment; filename="lang-zh-CN.xlsx"' },
        })
      }),
    )
    renderPage()
    await user.click(await screen.findByRole('button', { name: /下载语言包/ }))
    await waitFor(() => {
      expect(calls).toHaveBeenCalledTimes(1)
    })
    expect(String(calls.mock.calls[0]?.[0])).toContain('/api/v1/lang-items/export')
  })

  test('选择 Excel 后发上传（只传 file）并渲染成功计数', async () => {
    const user = userEvent.setup()
    createLangImportMock.mockResolvedValue({
      data: {
        id: 7,
        lang: 'all',
        fileName: 'lang-ok.xlsx',
        totalRows: 3,
        appliedRows: 3,
        failedRows: 0,
        status: 'success',
        createdBy: 'admin',
        createdAt: '2026-09-20T10:00:00+08:00',
        message: null,
      },
      status: 200,
    })
    const { container } = renderPage()
    await user.upload(fileInput(container), new File(['key,zh-cn,en'], 'lang-ok.xlsx', { type: XLSX }))

    await waitFor(() => {
      expect(createLangImportMock).toHaveBeenCalledTimes(1)
    })
    // T05 单文件全语言：multipart 只收 file（语言由列头决定，表单不再声明）
    const body = createLangImportMock.mock.calls[0]?.[0] as { file: File; lang?: string }
    expect(body.lang).toBeUndefined()
    expect(body.file.name).toBe('lang-ok.xlsx')
    // 上传后记录列表失效重取（页面展示最新一条上传记录）
    expect(await screen.findByText(/上传成功/)).toHaveTextContent('共 3 行、成功 3 行')
  })

  test('页面无语言选择器；记录列表把 lang=all 渲染成「全语言」', async () => {
    db.langImports.push({
      id: 31,
      lang: 'all',
      fileName: 'lang-all.xlsx',
      totalRows: 1,
      appliedRows: 1,
      failedRows: 0,
      status: 'success',
      message: null,
      createdBy: 'admin',
      createdAt: '2026-09-20T12:00:00+08:00',
    })
    renderPage()

    expect(await screen.findByText('lang-all.xlsx')).toBeInTheDocument()
    expect(screen.getByText('全语言')).toBeInTheDocument()
    // 上传语言选择器随 ADR-005 删除（筛选条里的「语言」下拉仍在下一条用例里看护）
    expect(screen.queryByRole('combobox', { name: '上传语言' })).not.toBeInTheDocument()
  })

  test('校验失败（42201 fields）渲染行号 + 按码映射的原因', async () => {
    const user = userEvent.setup()
    createLangImportMock.mockRejectedValue(
      new ApiError(42201, '字段校验失败。', { 'row:2': 'unknown-key', 'row:5': 'value-too-long' }),
    )
    const { container } = renderPage()
    await user.upload(fileInput(container), new File(['x'], 'lang-bad.xlsx', { type: XLSX }))

    expect(await screen.findByText('键不在语言包目录内')).toBeInTheDocument()
    expect(screen.getByText('文案超过 2000 字')).toBeInTheDocument()
    // 行号原样呈现（2 / 5 是 Excel 行号），失败摘要按错误码映射（不透后端中文明文）
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('提交内容未通过校验，请检查表单。')).toBeInTheDocument()
  })
})

describe('LangUploadPage · 单页形态（T21）', () => {
  test('无页签：记录列表即页面本体，上传三件套挂在列表卡工具栏，编辑器入口已删', async () => {
    db.langImports.push({
      id: 21,
      lang: 'zh-cn',
      fileName: 'lang-page.xlsx',
      totalRows: 1,
      appliedRows: 1,
      failedRows: 0,
      status: 'success',
      message: null,
      createdBy: 'admin',
      createdAt: '2026-09-20T11:00:00+08:00',
    })
    renderPage()
    expect(await screen.findByText('lang-page.xlsx')).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /下载语言包/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /选择 Excel 文件/ })).toBeInTheDocument()
    // 在线逐键改文案的入口（原「文案覆盖」编辑器）已随 T21 删除
    expect(screen.queryByRole('button', { name: /添加键/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('新键名')).not.toBeInTheDocument()
  })

  test('上传成功后失效覆盖层查询（一上传即生效：前端运行时合并会重取）', async () => {
    const client = createQueryClient()
    client.setQueryData(['listLangOverrides', 'zh-cn'], [])
    createLangImportMock.mockResolvedValue({
      data: {
        id: 8,
        lang: 'zh-cn',
        fileName: 'lang-ok.xlsx',
        totalRows: 1,
        appliedRows: 1,
        failedRows: 0,
        status: 'success',
        createdBy: 'admin',
        createdAt: '2026-09-20T10:00:00+08:00',
        message: null,
      },
      status: 200,
    })
    const { container } = renderPage('/admin/lang-upload', client)
    await userEvent.setup().upload(fileInput(container), new File(['k'], 'lang-ok.xlsx', { type: XLSX }))
    await waitFor(() => {
      expect(client.getQueryState(['listLangOverrides', 'zh-cn'])?.isInvalidated).toBe(true)
    })
  })
})

describe('LangUploadPage · 上传记录', () => {
  test('列表按 URL 筛选下发（filters[status]/q）并只渲染命中行', async () => {
    db.langImports.push(
      {
        id: 11,
        lang: 'zh-cn',
        fileName: 'lang-a.xlsx',
        totalRows: 2,
        appliedRows: 2,
        failedRows: 0,
        status: 'success',
        message: null,
        createdBy: 'admin',
        createdAt: '2026-09-20T09:00:00+08:00',
      },
      {
        id: 12,
        lang: 'en',
        fileName: 'lang-b.xlsx',
        totalRows: 3,
        appliedRows: 0,
        failedRows: 1,
        status: 'failed',
        message: '格式校验失败',
        createdBy: 'admin',
        createdAt: '2026-09-20T10:00:00+08:00',
      },
    )
    const urls: URL[] = []
    server.use(
      http.get('*/api/v1/lang-imports', ({ request }) => {
        const url = new URL(request.url)
        urls.push(url)
        const status = url.searchParams.get('filters[status]')
        const q = url.searchParams.get('q') ?? ''
        const items = db.langImports.filter(
          (row) => (status === null || row.status === status) && row.fileName.includes(q),
        )
        return HttpResponse.json({ data: { items, total: items.length } })
      }),
    )

    // 筛选状态在 URL（01 §3.3）：页面从 URL 取值并随请求下发（表单→URL 一步由共用的 ListFilterForm 承担）
    // T21 起记录列表就是页面本体（无页签）：直接按 URL 筛选渲染
    renderPage('/admin/lang-upload?filters[status]=failed&q=lang-')

    expect(await screen.findByText('lang-b.xlsx')).toBeInTheDocument()
    expect(screen.queryByText('lang-a.xlsx')).not.toBeInTheDocument()
    expect(urls.at(-1)?.searchParams.get('filters[status]')).toBe('failed')
    expect(urls.at(-1)?.searchParams.get('q')).toBe('lang-')
    // 筛选条（状态/语言下拉 + 关键词）与记录列表同屏
    expect(screen.getByRole('combobox', { name: '状态' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '语言' })).toBeInTheDocument()
    expect(screen.getByText('格式校验失败')).toBeInTheDocument()
  })
})
