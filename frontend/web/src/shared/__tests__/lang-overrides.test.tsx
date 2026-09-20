import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { createQueryClient } from '@zentao/api-client'
import { initI18n } from '@zentao/i18n'
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { useTranslation } from 'react-i18next'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { db, resetMockData } from '../../mocks/db'
import { platformHandlers } from '../../mocks/platform-handlers'
import { expandOverrides, LangOverrides, overrideLang } from '../lang-overrides'

/**
 * 文案覆盖层运行时合并（platform 卡 §3.12）：flat→nested 展开、覆盖包真进了 i18next、
 * 取数失败静默回落语言包（覆盖层是增强，不该把登录态之外/网络故障变成界面错误）。
 */
const i18n = initI18n()
const server = setupServer(...platformHandlers)

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

function Probe() {
  const { t } = useTranslation()
  return (
    <>
      <LangOverrides />
      <span data-testid="probe">{t('platform.langUpload.title')}</span>
    </>
  )
}

function renderProbe() {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <Probe />
    </QueryClientProvider>,
  )
}

describe('expandOverrides', () => {
  test('全点分键展开成嵌套对象（i18next 资源形状）', () => {
    expect(expandOverrides([{ key: 'platform.langUpload.title', value: '甲' }])).toEqual({
      platform: { langUpload: { title: '甲' } },
    })
  })

  test('同前缀的多个键共用中间层；叶子键不互相覆盖', () => {
    expect(
      expandOverrides([
        { key: 'common.action.submit', value: '提交' },
        { key: 'common.action.cancel', value: '取消' },
        { key: 'common.field.id', value: '编号' },
      ]),
    ).toEqual({ common: { action: { submit: '提交', cancel: '取消' }, field: { id: '编号' } } })
  })

  test('空输入得空对象（无覆盖 = 不触碰语言包）', () => {
    expect(expandOverrides([])).toEqual({})
  })
})

describe('overrideLang', () => {
  test('界面语言码映射到覆盖层语言码', () => {
    expect(overrideLang('zh-CN')).toBe('zh-cn')
    expect(overrideLang('en')).toBe('en')
  })
})

describe('LangOverrides', () => {
  test('取数失败静默回落语言包默认文案（不弹错、不炸渲染）', async () => {
    server.use(
      http.get('*/api/v1/lang-items/overrides', () =>
        HttpResponse.json({ error: { code: 50001, message: '内部错误' } }, { status: 500 }),
      ),
    )
    renderProbe()
    expect(await screen.findByTestId('probe')).toHaveTextContent('多语言上传')
  })

  test('覆盖层合并进当前语言资源包（addResourceBundle 收到展开后的覆盖）并即时生效', async () => {
    const spy = vi.spyOn(i18n, 'addResourceBundle')
    db.langOverrides.set('zh-cn/platform/langUpload/title', '多语言上传（覆盖）')
    renderProbe()

    await waitFor(() => {
      expect(screen.getByTestId('probe')).toHaveTextContent('多语言上传（覆盖）')
    })
    expect(spy).toHaveBeenCalledWith(
      'zh-CN',
      'translation',
      { platform: { langUpload: { title: '多语言上传（覆盖）' } } },
      true,
      true,
    )
    spy.mockRestore()
  })
})
