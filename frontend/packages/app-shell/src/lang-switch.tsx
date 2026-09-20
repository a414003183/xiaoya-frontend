import { Button, Dropdown, GlobalOutlined } from '@zentao/design-system'
import { loadLanguage, type SupportedLanguage } from '@zentao/i18n'
import { useTranslation } from 'react-i18next'

/**
 * 界面语言切换（06 A4-1）：hover 下拉（用户裁决 2026-09-19：顶栏切换类入口一律下拉，与头像一致）。
 * 标签用 ISO 码（语言原生名不进 i18n——en.json 禁 CJK 的门禁前置）；切换 = loadLanguage
 * （i18n 资源装载 + 持久化），antd locale 由 app-providers 跟随 i18n.language 联动。
 */
export function LangSwitch() {
  const { i18n, t } = useTranslation()
  const current: SupportedLanguage = i18n.language === 'en' ? 'en' : 'zh-CN'
  return (
    <Dropdown
      trigger={['hover']}
      menu={{
        selectable: true,
        selectedKeys: [current],
        items: [
          { key: 'zh-CN', label: 'ZH' },
          { key: 'en', label: 'EN' },
        ],
        onClick: ({ key }) => void loadLanguage(key as SupportedLanguage),
      }}
    >
      <Button type="text" aria-label={t('nav.language.label')} icon={<GlobalOutlined />}>
        {current === 'en' ? 'EN' : 'ZH'}
      </Button>
    </Dropdown>
  )
}
