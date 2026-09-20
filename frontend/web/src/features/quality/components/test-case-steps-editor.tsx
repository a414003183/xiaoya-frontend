import { Button, Input, Space, Table, Typography } from '@zentao/design-system'
import { useTranslation } from 'react-i18next'
import type { StepInput } from '../model'
import { MAX_STEPS, STEP_TEXT_MAX } from '../model'

/**
 * 用例步骤子表（T-5 / quality §3.2）：受控行内编辑，≤100 条、description/expects 逐条 ≤2000 字；
 * 提交方负责 dropEmpty + normalizeSteps 整体随 PATCH 上送（整体替换）。
 */
export function TestCaseStepsEditor({
  value,
  onChange,
}: {
  value: StepInput[]
  onChange: (next: StepInput[]) => void
}) {
  const { t } = useTranslation()

  const update = (index: number, patch: Partial<StepInput>) =>
    onChange(value.map((step, i) => (i === index ? { ...step, ...patch } : step)))

  const add = () => {
    if (value.length >= MAX_STEPS) {
      return
    }
    onChange([...value, { sort: value.length + 1, description: '', expects: null }])
  }

  const remove = (index: number) => onChange(value.filter((_, i) => i !== index))

  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta
    if (target < 0 || target >= value.length) {
      return
    }
    const next = [...value]
    const moved = next[index]
    if (moved === undefined) {
      return
    }
    next.splice(index, 1)
    next.splice(target, 0, moved)
    onChange(next)
  }

  const columns = [
    { title: t('testCase.field.stepSort'), width: 56, render: (_: unknown, __: StepInput, index: number) => index + 1 },
    {
      title: t('testCase.field.stepDescription'),
      dataIndex: 'description',
      render: (text: string, _: StepInput, index: number) => (
        <Input.TextArea
          aria-label={`case-step-description-${index}`}
          autoSize
          maxLength={STEP_TEXT_MAX}
          value={text}
          showCount
          onChange={(event) => update(index, { description: event.target.value })}
        />
      ),
    },
    {
      title: t('testCase.field.stepExpects'),
      dataIndex: 'expects',
      render: (text: string | null, _: StepInput, index: number) => (
        <Input.TextArea
          aria-label={`case-step-expects-${index}`}
          autoSize
          maxLength={STEP_TEXT_MAX}
          value={text ?? ''}
          showCount
          onChange={(event) => update(index, { expects: event.target.value })}
        />
      ),
    },
    {
      title: t('common.action.manage'),
      width: 150,
      render: (_: unknown, __: StepInput, index: number) => (
        <Space>
          <Button size="small" disabled={index === 0} onClick={() => move(index, -1)}>
            {t('testCase.action.stepUp')}
          </Button>
          <Button size="small" disabled={index === value.length - 1} onClick={() => move(index, 1)}>
            {t('testCase.action.stepDown')}
          </Button>
          <Button size="small" danger onClick={() => remove(index)}>
            {t('common.action.delete')}
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Space className="tw:mb-2">
        <Button size="small" disabled={value.length >= MAX_STEPS} onClick={add}>
          {t('testCase.action.addStep')}
        </Button>
        <Typography.Text type="secondary">{`${value.length}/${MAX_STEPS}`}</Typography.Text>
      </Space>
      <Table
        rowKey={(_, index) => String(index)}
        size="small"
        columns={columns}
        dataSource={value}
        pagination={false}
      />
    </div>
  )
}
