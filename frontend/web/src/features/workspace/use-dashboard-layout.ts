import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutationFeedback } from '../../shared/use-mutation-feedback'
import { fetchSettings, qk, saveSettings } from './api/workspace.api'
import {
  DASHBOARD_LAYOUT_KEY,
  type DashboardLayoutItem,
  defaultDashboardLayout,
  isDashboardLayout,
  parseDashboardLayout,
} from './model'

const SETTINGS_KEYS = DASHBOARD_LAYOUT_KEY

export type DashboardLayoutState = {
  layout: DashboardLayoutItem[]
  /** 首次读取中（页面显示骨架）。 */
  isPending: boolean
  /** 提交新布局：本地立即生效，随后写个人级 setting；写失败保留本地结果并提示（T69 统一错误面）。 */
  commit: (next: DashboardLayoutItem[]) => void
}

/**
 * 地盘布局读写（T-15 / §3.5）：个人级 setting（owner=@me、key=dashboard.layout），
 * 读取失败 → 缺省布局；值损坏 → 缺省布局并静默覆写（写失败提示用户、本地结果保留，下次读取再试）。
 */
export function useDashboardLayout(): DashboardLayoutState {
  const queryClient = useQueryClient()
  const feedback = useMutationFeedback()
  const [local, setLocal] = useState<DashboardLayoutItem[] | null>(null)

  const query = useQuery({
    queryKey: qk.workspace.settings(SETTINGS_KEYS),
    queryFn: () => fetchSettings([SETTINGS_KEYS]),
    retry: false,
  })

  const mutation = useMutation({
    mutationFn: (next: DashboardLayoutItem[]) => saveSettings({ [DASHBOARD_LAYOUT_KEY]: next }),
    onSuccess: (_data, next) => {
      queryClient.setQueryData(qk.workspace.settings(SETTINGS_KEYS), { [DASHBOARD_LAYOUT_KEY]: next })
    },
    onError: feedback.failed,
  })
  const { mutate } = mutation

  const stored = query.data?.[DASHBOARD_LAYOUT_KEY]
  const corrupted = stored !== undefined && !isDashboardLayout(stored)
  const layout = useMemo(
    () => local ?? (stored === undefined ? defaultDashboardLayout() : parseDashboardLayout(stored)),
    [local, stored],
  )

  const overwritten = useRef(false)
  useEffect(() => {
    if (!corrupted || overwritten.current) {
      return
    }
    overwritten.current = true
    mutate(defaultDashboardLayout())
  }, [corrupted, mutate])

  const commit = useCallback(
    (next: DashboardLayoutItem[]) => {
      setLocal(next)
      mutate(next)
    },
    [mutate],
  )

  return { layout, isPending: query.isPending, commit }
}
