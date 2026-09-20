import type { ReactNode } from 'react'
import { Tag } from './ui'

export type StatusTone = 'active' | 'pending' | 'warning' | 'error' | 'closed' | 'neutral'

const TONE_COLOR: Record<StatusTone, string> = {
  active: 'green',
  pending: 'blue',
  warning: 'orange',
  error: 'red',
  closed: 'default',
  neutral: 'default',
}

/** 状态标签：颜色只由 tone 决定，文案走 i18n（调用方传已翻译文本）。 */
export function StatusTag({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return <Tag color={TONE_COLOR[tone]}>{children}</Tag>
}
