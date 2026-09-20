import type { StatusTone } from '@zentao/design-system'
import type { MetaAction } from '../../shared/meta'

/** requirement 域纯逻辑（01 §3.2 model.ts）：状态/优先级展示映射与动作判定。 */

export const STORY_PRIORITIES = [1, 2, 3, 4] as const

const TONE: Record<string, StatusTone> = {
  draft: 'neutral',
  reviewing: 'pending',
  active: 'active',
  changing: 'warning',
  changed: 'warning',
  closed: 'closed',
}

export function storyTone(status: string): StatusTone {
  return TONE[status] ?? 'neutral'
}

/** 优先级文案 key（requirement §3：priority i18n = common.priority.*）。 */
export function priorityKey(priority: number | undefined): string {
  const value = priority ?? 3
  return `common.priority.${(STORY_PRIORITIES as readonly number[]).includes(value) ? value : 3}`
}

/** close(reason=duplicate) 必填 duplicateOfId（requirement §4 守卫）。 */
export function requiresDuplicate(closedReason: string): boolean {
  return closedReason === 'duplicate'
}

/** 评审弹窗三合一：按 meta 当前状态可选动作决定 submit-review / pass / reject。 */
export type ReviewMode = 'submit-review' | 'pass' | 'reject'

export function reviewModeFor(
  actions: readonly MetaAction[] | undefined,
  status: string | undefined,
): ReviewMode | null {
  const allowed = (actions ?? []).filter(
    (action) =>
      !action.allowedStatus ||
      action.allowedStatus.length === 0 ||
      (status !== undefined && action.allowedStatus.includes(status)),
  )
  const found = allowed.find((action) =>
    (['submit-review', 'pass', 'reject'] as readonly string[]).includes(action.action),
  )
  if (!found) {
    return null
  }
  const mode = found.action
  return mode === 'submit-review' || mode === 'pass' || mode === 'reject' ? mode : null
}

/** 详情页动作按钮 key（story.action.<action>）；meta 未带 i18n 时的回退（02 §4）。 */
export function actionI18nKey(action: string): string {
  return `story.action.${action.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase())}`
}
