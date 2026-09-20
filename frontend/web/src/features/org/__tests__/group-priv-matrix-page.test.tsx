import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createQueryClient } from '@zentao/api-client'
import { AppProvider, ConfigProvider, createTheme } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { setupServer } from 'msw/node'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { db, resetMockData } from '../../../mocks/db'
import { orgHandlers } from '../../../mocks/org-handlers'
import { platformHandlers } from '../../../mocks/platform-handlers'
import GroupPrivMatrixPage from '../pages/group-priv-matrix-page.page'

initI18n()

const server = setupServer(...orgHandlers, ...platformHandlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  resetMockData()
  db.sessionActive = true
  db.currentAccountId = 1
})
afterEach(() => {
  cleanup()
  server.resetHandlers()
})
afterAll(() => server.close())

function renderMatrix(groupId = 2) {
  return render(
    <ConfigProvider theme={createTheme()}>
      <AppProvider>
        <QueryClientProvider client={createQueryClient()}>
          <MemoryRouter initialEntries={[`/org/groups/${groupId}/privileges`]}>
            <Routes>
              <Route path="/org/groups/:groupId/privileges" element={<GroupPrivMatrixPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </AppProvider>
    </ConfigProvider>,
  )
}

describe('GroupPrivMatrixPage', () => {
  test('按域渲染权限码勾选，勾选差量整体保存', async () => {
    const user = userEvent.setup()
    renderMatrix(2)
    // 组 2 种子含 account-view；目录渲染 department-view 等
    const accountView = await screen.findByLabelText('account-view')
    await waitFor(() => {
      expect((accountView as HTMLInputElement).checked).toBe(true)
    })
    await user.click(screen.getByLabelText('department-edit'))
    await user.click(screen.getByRole('button', { name: /保\s*存\s*矩\s*阵/ }))
    await waitFor(() => {
      const stored = db.groups.find((group) => group.id === 2)?.privCodes ?? []
      expect(stored).toContain('department-edit')
      expect(stored).toContain('account-view')
    })
  })
})
