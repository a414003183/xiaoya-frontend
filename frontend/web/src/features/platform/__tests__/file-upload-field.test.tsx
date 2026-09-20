import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createQueryClient } from '@zentao/api-client'
import { AppProvider, ConfigProvider, createTheme } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { FileUploadField } from '../components/file-upload-field'

initI18n()

/**
 * 说明：vitest 5 + jsdom 30 的 Request/FormData 兼容层无法序列化 jsdom File（_buffer 缺失），
 * multipart 无法走 MSW 真请求；此处 mock 生成 API 层，验证组件接线（选择→上传→列表→删除）。
 */
/** 内存文件列表：listFiles 返回它，upload 追加，delete 移除。 */
let store: { id: number; title: string }[] = []

const uploadFileMock = vi.fn(async (body: { file: File; objectType?: string; objectId?: number }) => {
  const view = {
    id: 42,
    title: body.file.name,
    url: '/api/v1/files/42/download',
    extension: 'txt',
    size: 5,
    objectType: body.objectType ?? '',
    objectId: body.objectId ?? 0,
    downloads: 0,
    createdBy: 'admin',
    createdAt: '2026-09-18T00:00:00Z',
  }
  store.push({ id: 42, title: body.file.name })
  return { data: view, status: 200 as const }
})
const deleteFileMock = vi.fn(async (fileId: number) => {
  store = store.filter((item) => item.id !== fileId)
  return { data: null, status: 200 as const }
})
const listFilesMock = vi.fn(async (_params?: unknown) => ({
  data: { items: [...store], total: store.length },
  status: 200 as const,
}))

vi.mock('@zentao/api-client/generated', () => ({
  uploadFile: (...args: Parameters<typeof uploadFileMock>) => uploadFileMock(...args),
  deleteFile: (fileId: number) => deleteFileMock(fileId),
  listFiles: (params?: unknown) => listFilesMock(params),
}))

beforeEach(() => {
  store = []
  uploadFileMock.mockClear()
  deleteFileMock.mockClear()
  listFilesMock.mockClear()
})

function renderField() {
  return render(
    <ConfigProvider theme={createTheme()}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <FileUploadField objectType="story" objectId={9} />
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

describe('FileUploadField', () => {
  test('选择文件后调用上传接口并出现在文件列表', async () => {
    const user = userEvent.setup()
    renderField()
    const input = await screen.findByLabelText('选择文件')
    await user.upload(input, new File(['hello'], '需求说明.txt', { type: 'text/plain' }))
    await waitFor(() => {
      expect(uploadFileMock).toHaveBeenCalled()
    })
    expect(await screen.findByText('需求说明.txt')).toBeInTheDocument()
  })

  test('删除按钮调用删除接口', async () => {
    const user = userEvent.setup()
    renderField()
    const input = await screen.findByLabelText('选择文件')
    await user.upload(input, new File(['x'], '临时.txt', { type: 'text/plain' }))
    await user.click(await screen.findByRole('button', { name: '删除' }))
    await waitFor(() => {
      expect(deleteFileMock).toHaveBeenCalledWith(42)
    })
  })
})
