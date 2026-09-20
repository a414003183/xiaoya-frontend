import { Button, DesktopOutlined, Dropdown, MoonOutlined, SunOutlined } from '@zentao/design-system'
import { useTranslation } from 'react-i18next'
import { type ThemeMode, useUiStore } from './ui-store'

const MODE_ICONS: Record<ThemeMode, typeof SunOutlined> = {
  light: SunOutlined,
  dark: MoonOutlined,
  system: DesktopOutlined,
}

/** 主题切换（亮/暗/跟随系统）：hover 下拉，与头像交互一致（用户裁决 2026-09-19）。 */
export function ThemeSwitch() {
  const { t } = useTranslation()
  const themeMode = useUiStore((state) => state.themeMode)
  const setThemeMode = useUiStore((state) => state.setThemeMode)
  const CurrentIcon = MODE_ICONS[themeMode]
  return (
    <Dropdown
      trigger={['hover']}
      menu={{
        selectable: true,
        selectedKeys: [themeMode],
        items: (['light', 'dark', 'system'] as const).map((mode) => {
          const Icon = MODE_ICONS[mode]
          return { key: mode, icon: <Icon />, label: t(`nav.theme.${mode}`) }
        }),
        onClick: ({ key }) => setThemeMode(key as ThemeMode),
      }}
    >
      <Button type="text" aria-label={t('nav.theme.label')} icon={<CurrentIcon />} />
    </Dropdown>
  )
}
