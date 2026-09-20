import zhCN from 'antd/locale/zh_CN'

/**
 * antd 组件文案 locale（06 A4-1）：zh_CN 急切（antd 缺省是 en，首帧必须钉死中文），
 * en_US 走动态导入不进首屏（与 i18n 包 en 语言包同策略，P6 T-8 首屏预算）。
 * 业务代码禁直引 antd/locale（Biome D8 规则），统一经本出口。
 */
export const antdLocaleZhCN = zhCN

export async function loadAntdLocale(language: string): Promise<typeof zhCN> {
  if (language === 'en') {
    return (await import('antd/locale/en_US')).default
  }
  return zhCN
}
