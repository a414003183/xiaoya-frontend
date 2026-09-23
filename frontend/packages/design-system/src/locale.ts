import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import zhCN from 'antd/locale/zh_CN'

/**
 * antd 组件文案 locale（06 A4-1）：zh_CN 急切（antd 缺省是 en，首帧必须钉死中文），
 * en_US 走动态导入不进首屏（与 i18n 包 en 语言包同策略，P6 T-8 首屏预算）。
 * 业务代码禁直引 antd/locale（Biome D8 规则），统一经本出口。
 *
 * dayjs 全局 locale 与 antd locale 在同一出口联动（FE-07）：DatePicker 面板的月份/星期名
 * 取自 dayjs locale（rc-picker 经 generateConfig 用它生成面板文本），只接 antd locale 不接
 * dayjs 时面板仍英文。zh-cn 随模块急切注册（与 antdLocaleZhCN 同口径钉首帧），en 是 dayjs 内置。
 */
export const antdLocaleZhCN = zhCN

/** i18n 语言码 → dayjs locale 名（i18next 用 zh-CN/en，dayjs 用 zh-cn/en）。 */
export function dayjsLocaleFor(language: string): 'zh-cn' | 'en' {
  return language === 'en' ? 'en' : 'zh-cn'
}

export async function loadAntdLocale(language: string): Promise<typeof zhCN> {
  dayjs.locale(dayjsLocaleFor(language))
  if (language === 'en') {
    return (await import('antd/locale/en_US')).default
  }
  return zhCN
}

// 首帧钉死中文（dayjs 缺省 locale 是 en）
dayjs.locale('zh-cn')
