import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { createQueryClient } from '@zentao/api-client'
import { AppProvider, ConfigProvider, createTheme } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, test } from 'vitest'
import { db, resetMockData } from '../../../mocks/db'
import ApiDocPage from '../pages/api-doc-page.page'

initI18n()

afterEach(() => {
  cleanup()
})

/**
 * T14：入口页是两条外链，页面上最容易错的就是地址本身（springdoc 的路径在 application.yml 里，
 * 前端拿不到，只能在这边按住）。故断言 href —— 拼错就是死链，而单测是唯一能拦住它的地方。
 */
describe('ApiDocPage（T14 系统接口）', () => {
  test('给出接口文档与 OpenAPI JSON 两条链接，地址与 springdoc 约定一致', async () => {
    resetMockData()
    db.sessionActive = true
    db.currentAccountId = 1
    render(
      <ConfigProvider theme={createTheme()}>
        <AppProvider>
          <QueryClientProvider client={createQueryClient()}>
            <MemoryRouter initialEntries={['/admin/api-docs']}>
              <ApiDocPage />
            </MemoryRouter>
          </QueryClientProvider>
        </AppProvider>
      </ConfigProvider>,
    )
    const reference = screen.getByRole('link', { name: '打开接口文档' })
    expect(reference).toHaveAttribute('href', '/swagger-ui/index.html')
    expect(reference).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('link', { name: '查看 OpenAPI JSON' })).toHaveAttribute('href', '/v3/api-docs')
  })
})
