import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LangSwitch } from '@zentao/app-shell'
import { Table } from '@zentao/design-system'
import { initI18n, loadLanguage } from '@zentao/i18n'
import { useTranslation } from 'react-i18next'
import { afterEach, describe, expect, test } from 'vitest'
import { AppProviders } from '../providers/app-providers'

initI18n()

/** 探针：antd Table 空态文案（走 ConfigProvider locale）+ 一条 i18n 键文案（走语言包）。 */
function Probe() {
  const { t } = useTranslation()
  return (
    <div>
      <Table rowKey="id" columns={[{ title: 'id', dataIndex: 'id' }]} dataSource={[]} pagination={false} />
      <span data-testid="i18n-probe">{t('nav.group.dashboard')}</span>
    </div>
  )
}

function Harness() {
  return (
    <AppProviders>
      <LangSwitch />
      <Probe />
    </AppProviders>
  )
}

afterEach(async () => {
  await loadLanguage('zh-CN')
  localStorage.removeItem('zentao.language')
  cleanup()
})

describe('A4-1 语言切换全链路', () => {
  test('初始 zh：antd 空态与 i18n 文案均为中文', () => {
    render(<Harness />)
    expect(screen.getAllByText('暂无数据').length).toBeGreaterThan(0)
    expect(screen.getByTestId('i18n-probe').textContent).toBe('工作台')
  })

  test('切 EN：ConfigProvider locale 与语言包同步翻转并持久化', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.hover(screen.getByRole('button', { name: '语言' }))
    await user.click(await screen.findByRole('menuitem', { name: 'EN' }))
    await waitFor(() => {
      expect(screen.getAllByText('No data').length).toBeGreaterThan(0)
    })
    expect(screen.getByTestId('i18n-probe').textContent).toBe('Workspace')
    expect(localStorage.getItem('zentao.language')).toBe('en')
  })

  test('切回 ZH：恢复中文且持久化键更新', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.hover(screen.getByRole('button', { name: '语言' }))
    await user.click(await screen.findByRole('menuitem', { name: 'EN' }))
    await waitFor(() => {
      expect(screen.getAllByText('No data').length).toBeGreaterThan(0)
    })
    // 悬停态下下拉保持展开，菜单项直接派发点击（userEvent 会卡在关闭动画的 pointer-events:none 上）
    fireEvent.click(screen.getByRole('menuitem', { name: 'ZH' }))
    await waitFor(() => {
      expect(screen.getAllByText('暂无数据').length).toBeGreaterThan(0)
    })
    expect(localStorage.getItem('zentao.language')).toBe('zh-CN')
  })
})
