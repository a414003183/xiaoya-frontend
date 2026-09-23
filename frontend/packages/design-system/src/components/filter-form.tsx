import { Button, Card, Flex, Form } from 'antd'
import { type ReactNode, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { spacing } from '../tokens/spacing'

/** 一个筛选项 = 一个「标签 : 控件」键值对（antd 表单行的天然形态，控件必须能直接被 Form.Item 接管值）。 */
export type FilterField = {
  /** 表单字段名，同时也是 URL 参数名（列表页筛选一律走 URL，见 01 §3.3）。 */
  name: string
  /** 左侧标签文案（i18n 后的字符串）。 */
  label: ReactNode
  /** 受控控件本体（Input/Select/DatePicker…），宽度由页面或 width 令牌给定。 */
  control: ReactNode
  /** 标签后是否带冒号；区间第二格（标签「～」）这类非名词标签设 false。缺省 true。 */
  colon?: boolean
}

/** 表单草稿值：string（文本/日期）或 string[]（日期区间等数组值）；null/空值 = 全部（null 才会把受控控件清空）。 */
export type FilterValues = Record<string, string | string[] | null | undefined>

/**
 * 页面骨架 · 列表筛选区（安灯对照：Ant Design「查询」范式——多个查询条件一次性提交，见 data-list-cn
 * 「查询 vs 筛选」；用户裁决 2026-09-19：筛选区是键值表单 + 查询/重置，不再用页签或即时生效的散控件）。
 *
 * 形态（UI 三项修订 2026-09-20）：**筛选区是独立的一块**（自带卡片底，与表格卡同级同底），
 * 「查询 / 重置」恒定固定在该块**右下角**——条件一行还是五行都一样，不会随换行漂到中间；
 * 功能按钮（新建/批量/导出）不在这里，它们在列表卡里与表格同框（ListCard）。
 *
 * 语义：**草稿态在表单内、提交才生效**——「查询」把草稿交给 onSearch，「重置」清空草稿并回调 onReset；
 * 外部值（URL / 前进后退 / 重置）变化时以 signature 比对回灌草稿，避免无关重渲染吃掉用户正在输入的内容。
 */
export function FilterForm({
  fields,
  values,
  onSearch,
  onReset,
}: {
  fields: FilterField[]
  /** 已生效（URL）的值，用于初始化与外部变化回灌。 */
  values: FilterValues
  /** 「查询」：只在点按钮/回车时触发。 */
  onSearch: (values: FilterValues) => void
  /** 「重置」：调用方负责清掉 URL 参数，草稿由本组件清空。 */
  onReset: () => void
}) {
  const { t } = useTranslation()
  const [form] = Form.useForm() // form-stack-ok：列表筛选标准件（CONVENTIONS §3.2），antd 实例只做草稿回灌，无 rules 校验
  const names = useMemo(() => fields.map((field) => field.name), [fields])
  /* 生效值指纹：本页声明的每个字段都在内（含空值），值变了才回灌草稿——
     否则「无关重渲染」会把用户正在输入的内容冲掉。 */
  const signature = JSON.stringify(names.map((name) => [name, values[name] ?? null]))
  const committed = useMemo<FilterValues>(
    () => Object.fromEntries(JSON.parse(signature) as [string, string | null][]),
    [signature],
  )

  useEffect(() => {
    form.setFieldsValue(committed)
  }, [form, committed])

  const clear = (): void => {
    form.setFieldsValue(Object.fromEntries(names.map((name) => [name, undefined])))
  }

  return (
    <Card>
      <Form form={form} initialValues={values} onFinish={(draft: FilterValues) => onSearch(draft)}>
        {/* 筛选行与动作行同一换行容器：条件排完自动换行，「查询/重置」以 marginInlineStart:auto
            压到**最后一行的右端**——即筛选块的右下角，一行还是五行都不漂（用户裁决 2026-09-20）。 */}
        <Flex wrap gap={spacing.lg} align="center">
          {fields.map((field) => (
            <Form.Item
              key={field.name}
              name={field.name}
              label={field.label}
              colon={field.colon ?? true}
              style={{ marginBottom: 0 }}
            >
              {field.control}
            </Form.Item>
          ))}
          <Flex gap={spacing.sm} style={{ marginInlineStart: 'auto' }}>
            <Button type="primary" htmlType="submit">
              {t('common.action.search')}
            </Button>
            <Button
              onClick={() => {
                clear()
                onReset()
              }}
            >
              {t('common.action.reset')}
            </Button>
          </Flex>
        </Flex>
      </Form>
    </Card>
  )
}
