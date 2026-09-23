import { errorText } from '@zentao/api-client'
import { useMessage } from '@zentao/design-system'
import { useTranslation } from 'react-i18next'

/**
 * 变更的统一错误面（T69）：任何 `useMutation` 的失败都要在界面上有回音，
 * 不再出现「点了没反应」（FE-02/FE-03 的病类）。
 *
 * ```ts
 * const feedback = useMutationFeedback()
 * const save = useMutation({
 *   mutationFn,
 *   onSuccess: () => { feedback.done(); invalidate() },
 *   onError: feedback.failed,
 * })
 * ```
 *
 * 文案真源仍是语言包：`errorText` 按错误码映射（06 A4-3，界面文案只认 code），
 * 未知/网络错误回落 `common.message.failed`；成功提示键可覆盖（`common.message.deleted` 等）。
 *
 * 为什么是逐 mutation 接线、而不是 QueryClient 的全局 `MutationCache.onError`：
 * 行内展示错误的表单弹窗（约 90 处，把 `mutation.error` 渲染在字段旁）会因此冒双份提示。
 */
export function useMutationFeedback(): {
  /** `onSuccess` 里调用：成功的统一提示（键可换成 `common.message.created` 等）。 */
  done: (key?: string) => void
  /** `onError` 用：错误码 → 文案。 */
  failed: (error: unknown) => void
} {
  const message = useMessage()
  const { t } = useTranslation()
  return {
    done: (key = 'common.message.saved') => message.success(t(key)),
    failed: (error) => message.error(errorText(error, t, 'common.message.failed')),
  }
}
