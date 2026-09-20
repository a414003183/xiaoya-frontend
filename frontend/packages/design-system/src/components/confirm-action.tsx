import { Popconfirm } from 'antd'
import type { ReactNode } from 'react'

/**
 * 危险操作确认（06 A3-1 操作列规范）：表格操作列的删除/停用等危险动作统一包本组件
 * （Popconfirm 二次确认），触发器通常是文字链接式按钮（Button type="link" size="small"）。
 */
export function ConfirmAction({
  title,
  description,
  onConfirm,
  children,
}: {
  title: ReactNode
  /** 补充说明（不可逆影响、守卫规则等）；缺省不渲染。 */
  description?: ReactNode
  onConfirm: () => void
  children: ReactNode
}) {
  return (
    <Popconfirm title={title} {...(description === undefined ? {} : { description })} onConfirm={onConfirm}>
      {children}
    </Popconfirm>
  )
}
