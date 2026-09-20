import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient } from '@zentao/api-client'
import { useResolvedThemeMode } from '@zentao/app-shell'
import type { ThemeConfig } from '@zentao/design-system'
import {
  AppProvider,
  antdLocaleZhCN,
  ColumnPrefContext,
  ConfigProvider,
  createTheme,
  loadAntdLocale,
} from '@zentao/design-system'
import { type ReactNode, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useColumnPrefStore } from '../../shared/column-pref'

/** 列设置能力必须挂在 QueryClientProvider 内侧（store 用 react-query），故单列一层。 */
function ColumnPrefProvider({ children }: { children: ReactNode }) {
  const store = useColumnPrefStore()
  return <ColumnPrefContext.Provider value={store}>{children}</ColumnPrefContext.Provider>
}

/** 组合根（01 §3.2 app/）：i18n 在 main.tsx 先于本树初始化；antd 组件文案 locale 随语言联动（06 A4-1）。 */
export function AppProviders({ children }: { children: ReactNode }) {
  const resolvedMode = useResolvedThemeMode()
  const { i18n } = useTranslation()
  const [queryClient] = useState(createQueryClient)
  const [antdLocale, setAntdLocale] = useState(antdLocaleZhCN)
  const themeConfig: ThemeConfig = createTheme(resolvedMode)

  useEffect(() => {
    let alive = true
    void loadAntdLocale(i18n.language).then((locale) => {
      if (alive) setAntdLocale(locale)
    })
    return () => {
      alive = false
    }
  }, [i18n.language])

  return (
    <ConfigProvider theme={themeConfig} locale={antdLocale}>
      <QueryClientProvider client={queryClient}>
        <ColumnPrefProvider>
          <AppProvider>{children}</AppProvider>
        </ColumnPrefProvider>
      </QueryClientProvider>
    </ConfigProvider>
  )
}
