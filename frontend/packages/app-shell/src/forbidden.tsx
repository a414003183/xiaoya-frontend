import { Result } from '@zentao/design-system'
import { useTranslation } from 'react-i18next'

/** 403 回退（app-layout 罕见路径）：独立模块懒加载，避免 antd Result 三张内嵌 SVG 插图进首屏（P6 T-8）。 */
export default function Forbidden() {
  const { t } = useTranslation()
  return <Result status="403" title={t('common.forbidden.title')} subTitle={t('common.forbidden.message')} />
}
