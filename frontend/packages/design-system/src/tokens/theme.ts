import { theme } from 'antd'

export type ThemeModeToken = 'light' | 'dark'

/**
 * 全局主题令牌（01 §3.1 / 06 A2-1）：antd cssVar 模式 + 种子 token；按模式产出完整 ThemeConfig
 * （亮暗算法内聚于此，消费方不再拼 algorithm）；Layout 底色不覆写——siderBg/headerBg 走算法 token 随亮暗翻转。
 */
export function createTheme(mode: ThemeModeToken = 'light'): import('antd').ThemeConfig {
  return {
    cssVar: { prefix: 'zt' },
    token: {
      colorPrimary: '#2f6bff',
      borderRadius: 6,
      fontSize: 14,
    },
    algorithm: [mode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm],
  }
}
