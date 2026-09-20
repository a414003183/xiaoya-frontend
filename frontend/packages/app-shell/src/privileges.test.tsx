// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { createQueryClient } from '@zentao/api-client'
import { HasPerm, usePrivileges } from '@zentao/design-system'
import { afterEach, expect, test, vi } from 'vitest'
import { PrivilegesProvider } from './privileges'

function stubMe(privileges: string[]): void {
  const response = () =>
    new Response(
      JSON.stringify({
        data: {
          account: {
            id: 2,
            account: 'dev1',
            realName: '开发一号',
            gender: 'm',
            status: 'active',
            groupIds: [],
            fails: 0,
            createdAt: '2026-01-01T00:00:00Z',
            lockVersion: 0,
          },
          privileges,
          dictionaries: {},
        },
      }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(response())),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function Probe() {
  const privileges = usePrivileges()
  return (
    <>
      <HasPerm perm="account-view">
        <span>visible-account-view</span>
      </HasPerm>
      <span data-testid="count">{privileges.length}</span>
    </>
  )
}

test('PrivilegesProvider 注入 /me privileges，HasPerm 按 code 显隐', async () => {
  stubMe(['account-view', 'department-view'])
  render(
    <QueryClientProvider client={createQueryClient()}>
      <PrivilegesProvider>
        <Probe />
      </PrivilegesProvider>
    </QueryClientProvider>,
  )
  expect(await screen.findByText('visible-account-view')).toBeInTheDocument()
  expect(screen.getByTestId('count')).toHaveTextContent('2')
})

test('无对应权限码时 HasPerm 渲染 fallback', async () => {
  stubMe([])
  render(
    <QueryClientProvider client={createQueryClient()}>
      <PrivilegesProvider>
        <HasPerm perm="account-view" fallback={<span>fallback-shown</span>}>
          <span>should-not-render</span>
        </HasPerm>
      </PrivilegesProvider>
    </QueryClientProvider>,
  )
  expect(await screen.findByText('fallback-shown')).toBeInTheDocument()
  expect(screen.queryByText('should-not-render')).not.toBeInTheDocument()
})
