import { useQuery } from '@tanstack/react-query'
import { InputNumber, Select } from '@zentao/design-system'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { searchObjects } from '../api/workspace.api'
import { todoObjectScope } from '../model'

/**
 * 关联对象选择器（workspace §6 todo-create-modal）：type≠custom 时供 objectId 取值。
 * 有 search scope 的类型（task/bug/story/epic/requirement）走全局搜索选对象；testRun 未注册 scope → 退化为 id 输入。
 * 已绑定的对象用 currentTitle 兜底显示，避免搜索未命中时选值消失。
 */
export function TodoObjectPicker({
  type,
  value,
  currentTitle,
  onChange,
}: {
  type: string
  value: number | null
  currentTitle?: string | null | undefined
  onChange: (value: number | null) => void
}) {
  const { t } = useTranslation()
  const [keyword, setKeyword] = useState('')
  const scope = todoObjectScope(type)
  const search = useQuery({
    queryKey: ['globalSearch', keyword, scope, 'todoObjectPicker'],
    queryFn: () => searchObjects(keyword, scope),
    enabled: scope !== null && keyword.trim().length > 0,
  })

  if (scope === null) {
    return (
      <InputNumber
        aria-label="todo-object-id"
        className="tw:w-full"
        min={1}
        {...(value === null ? {} : { value })}
        placeholder={t('todo.message.objectIdPlaceholder')}
        onChange={(next) => onChange(next === null || next === undefined ? null : Number(next))}
      />
    )
  }

  const options = (search.data ?? []).map((item) => ({
    value: item.objectId,
    label: `#${item.objectId} ${item.title}`,
  }))
  if (value !== null && !options.some((option) => option.value === value)) {
    options.unshift({ value, label: currentTitle ? `#${value} ${currentTitle}` : `#${value}` })
  }
  return (
    <Select
      aria-label="todo-object"
      allowClear
      showSearch
      filterOption={false}
      className="tw:w-full"
      value={value ?? undefined}
      placeholder={t('todo.message.objectPlaceholder')}
      notFoundContent={keyword.trim().length === 0 ? t('todo.message.objectSearchHint') : t('common.empty')}
      onSearch={setKeyword}
      onChange={(next) => onChange(next === undefined || next === null ? null : Number(next))}
      options={options}
    />
  )
}
