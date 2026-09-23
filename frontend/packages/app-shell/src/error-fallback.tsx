import { Button, Result, Space } from '@zentao/design-system'
import { useTranslation } from 'react-i18next'

/**
 * 运行时错误兜底页（FE-P0-1）：路由级 errorElement 与应用级 ErrorBoundary 共用同一份 UI。
 * 两个动作都不依赖 router 上下文（整页刷新 / 整页跳转），故壳层内外都能用。
 */
export function ErrorFallback() {
  const { t } = useTranslation()
  return (
    <Result
      status="error"
      title={t('common.error.title')}
      subTitle={t('common.error.message')}
      extra={
        <Space>
          <Button type="primary" onClick={() => window.location.reload()}>
            {t('common.error.reload')}
          </Button>
          <Button onClick={() => window.location.assign('/')}>{t('common.error.home')}</Button>
        </Space>
      }
    />
  )
}
