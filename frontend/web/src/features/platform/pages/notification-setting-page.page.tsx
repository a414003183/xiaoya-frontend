/** @route /notifications/settings @title platform.notification.settings.title @hide @activeMenu /notifications */
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  Button,
  Card,
  PageContainer,
  PageHeader,
  PageLoading,
  Switch,
  Typography,
  useMessage,
} from '@zentao/design-system'
import { useTranslation } from 'react-i18next'
import { metaOptions, useDomainMeta } from '../../../shared/meta-options'
import { fetchSettings, saveSettings } from '../api/platform.api'

/** 个人通知开关（platform 卡 §3.7：写个人级 notify.<type> 键，owner=@me）；开关目录来自 meta/notification.type。 */
export default function NotificationSettingPage() {
  const { t } = useTranslation()
  const message = useMessage()
  const notificationMeta = useDomainMeta('notification')
  const typeOptions = metaOptions(notificationMeta.data, 'type', t)
  const keys = typeOptions.map((option) => `notify.${option.value}`)
  const settings = useQuery({
    queryKey: ['getSettings', 'notify', keys.join(',')],
    queryFn: () => fetchSettings(keys),
    enabled: keys.length > 0,
  })
  const save = useMutation({
    mutationFn: (next: Record<string, unknown>) => saveSettings(next),
    onSuccess: () => message.success(t('common.message.saved')),
    onError: (error) => message.error(error instanceof Error ? error.message : t('common.loading')),
  })

  if (settings.isPending) {
    return (
      <PageContainer variant="narrow">
        <PageLoading />
      </PageContainer>
    )
  }

  const values = settings.data ?? {}

  return (
    <PageContainer variant="narrow">
      <PageHeader title={t('platform.notification.settings.title')} backTo="/notifications" />
      <Card>
        <Typography.Paragraph type="secondary">{t('platform.notification.settings.description')}</Typography.Paragraph>
        <div className="tw:flex tw:flex-col tw:gap-3">
          {typeOptions.map((option) => {
            const key = `notify.${option.value}`
            const checked = values[key] === true
            return (
              <div key={key} className="tw:flex tw:items-center tw:justify-between">
                <Typography.Text>{option.label}</Typography.Text>
                <Switch
                  aria-label={option.label}
                  checked={checked}
                  onChange={(next) => save.mutate({ ...values, [key]: next })}
                />
              </div>
            )
          })}
        </div>
        <Button className="tw:mt-4" loading={save.isPending} onClick={() => save.mutate(values)}>
          {t('common.action.submit')}
        </Button>
      </Card>
    </PageContainer>
  )
}
