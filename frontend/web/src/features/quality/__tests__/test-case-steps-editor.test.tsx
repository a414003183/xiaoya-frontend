import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AppProvider, ConfigProvider, createTheme } from '@zentao/design-system'
import { initI18n } from '@zentao/i18n'
import { useState } from 'react'
import { afterEach, describe, expect, test } from 'vitest'
import { TestCaseStepsEditor } from '../components/test-case-steps-editor'
import type { StepInput } from '../model'

/** 用例步骤子表（T-5 / quality §3.2）：增删行/排序/字数上限。 */
initI18n()

afterEach(() => cleanup())

/** 受控挂载：编辑器 value/onChange 由 React state 承载（与表单内真实用法一致）。 */
function StatefulStepsEditor({ initial }: { initial: StepInput[] }) {
  const [steps, setSteps] = useState(initial)
  return <TestCaseStepsEditor value={steps} onChange={setSteps} />
}

function renderEditor(initial: StepInput[]): void {
  render(
    <ConfigProvider theme={createTheme()}>
      <AppProvider>
        <StatefulStepsEditor initial={initial} />
      </AppProvider>
    </ConfigProvider>,
  )
}

describe('TestCaseStepsEditor', () => {
  test('添加/删除行', () => {
    renderEditor([{ sort: 1, description: '打开登录页', expects: null }])
    expect(screen.getByLabelText('case-step-description-0')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /添加步骤/ }))
    expect(screen.getByLabelText('case-step-description-1')).toBeInTheDocument()
    const deleteButtons = screen.getAllByRole('button', { name: /删\s*除/ })
    fireEvent.click(deleteButtons[1] as HTMLElement) // 删掉新增的空行
    expect(screen.queryByLabelText('case-step-description-1')).not.toBeInTheDocument()
    expect(screen.getByLabelText('case-step-description-0')).toHaveValue('打开登录页')
  })

  test('上移/下移排序（首行禁用上移、末行禁用下移）', () => {
    renderEditor([
      { sort: 1, description: '第一步', expects: null },
      { sort: 2, description: '第二步', expects: null },
    ])
    const upButtons = screen.getAllByRole('button', { name: /上\s*移/ })
    const downButtons = screen.getAllByRole('button', { name: /下\s*移/ })
    const firstUp = upButtons[0] as HTMLElement
    const lastDown = downButtons[1] as HTMLElement
    const secondUp = upButtons[1] as HTMLElement
    expect(firstUp).toBeDisabled()
    expect(lastDown).toBeDisabled()
    expect(secondUp).toBeEnabled()
    fireEvent.click(secondUp)
    expect(screen.getByLabelText('case-step-description-0')).toHaveValue('第二步')
    expect(screen.getByLabelText('case-step-description-1')).toHaveValue('第一步')
    fireEvent.click(screen.getAllByRole('button', { name: /下\s*移/ })[0] as HTMLElement)
    expect(screen.getByLabelText('case-step-description-0')).toHaveValue('第一步')
    expect(screen.getByLabelText('case-step-description-1')).toHaveValue('第二步')
  })

  test('逐条 ≤2000 字：输入框带 maxLength 约束', () => {
    renderEditor([{ sort: 1, description: '', expects: null }])
    const description = screen.getByLabelText('case-step-description-0') as HTMLTextAreaElement
    expect(description.maxLength).toBe(2000)
    const expects = screen.getByLabelText('case-step-expects-0') as HTMLTextAreaElement
    expect(expects.maxLength).toBe(2000)
  })

  test('满 100 行禁用添加', { timeout: 30000 }, () => {
    const rows = Array.from({ length: 100 }, (_, index) => ({
      sort: index + 1,
      description: `步骤${index + 1}`,
      expects: null,
    }))
    renderEditor(rows)
    expect(screen.getByRole('button', { name: /添加步骤/ })).toBeDisabled()
    expect(screen.getByText('100/100')).toBeInTheDocument()
  })
})
