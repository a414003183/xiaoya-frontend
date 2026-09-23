/** @route /admin/api-docs @title platform.apiDoc.title @perm api-doc-view @menu admin/monitor @order 2 */
import { Button, Card, PageContainer, Space, Typography } from '@zentao/design-system'
import { useTranslation } from 'react-i18next'

/**
 * 系统接口（T14）：运行时接口文档的入口页。
 *
 * 不做内嵌 iframe：SecurityHeadersFilter 全站发 `X-Frame-Options: DENY`，同源内嵌同样被拦，
 * 为一个页面放开防点击劫持头不划算（RuoYi 是内嵌的，本仓改成新标签页打开）。
 * 两条地址是 springdoc 的缺省路径（application.yml 的 springdoc.* 只管分组与守卫）：
 * 改那里的路径配置要连带改这里。
 */
const SWAGGER_UI_PATH = '/swagger-ui/index.html'
const API_DOCS_PATH = '/v3/api-docs'

export default function ApiDocPage() {
  const { t } = useTranslation()
  return (
    <PageContainer variant="narrow">
      <Card>
        <Space direction="vertical" size="middle">
          <Typography.Title level={5}>{t('platform.apiDoc.title')}</Typography.Title>
          <Typography.Paragraph type="secondary">{t('platform.apiDoc.description')}</Typography.Paragraph>
          <Space wrap>
            <Button type="primary" href={SWAGGER_UI_PATH} target="_blank" rel="noopener noreferrer">
              {t('platform.apiDoc.action.open')}
            </Button>
            <Button href={API_DOCS_PATH} target="_blank" rel="noopener noreferrer">
              {t('platform.apiDoc.action.json')}
            </Button>
          </Space>
          <Typography.Paragraph type="secondary">{t('platform.apiDoc.hint')}</Typography.Paragraph>
        </Space>
      </Card>
    </PageContainer>
  )
}
