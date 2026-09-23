/** @route /admin/settings @title platform.settings.title @perm setting-manage @menu admin/system @order 1 */
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button, Card, Input, PageContainer, PageLoading, Select, Typography, useMessage } from '@zentao/design-system'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchSettings, fetchTimezoneOptions, saveSettings } from '../api/platform.api'

/** 系统设置页（platform 卡 §3.7 存储实例：时区/默认工时/密码安全策略；分区表单）。 */
const SETTING_KEYS = [
  'common.timezone',
  'execution.defaultWorkhours',
  'safe.changeWeak',
  'safe.modifyPasswordFirstLogin',
]

export default function SettingPage() {
  const { t } = useTranslation()
  const message = useMessage()
  const settings = useQuery({ queryKey: ['getSettings', 'admin'], queryFn: () => fetchSettings(SETTING_KEYS) })
  // 时区值域唯一来源（§3.9 字典）：GET /dicts/timezones，前端不留清单。
  const timezones = useQuery({ queryKey: ['getDict', 'timezones'], queryFn: fetchTimezoneOptions })
  const [draft, setDraft] = useState<Record<string, string>>({})
  const save = useMutation({
    mutationFn: (next: Record<string, unknown>) => saveSettings(next),
    onSuccess: () => message.success(t('common.message.saved')),
    onError: (error) => message.error(error instanceof Error ? error.message : t('common.loading')),
  })

  useEffect(() => {
    if (settings.data) {
      setDraft(Object.fromEntries(SETTING_KEYS.map((key) => [key, String(settings.data[key] ?? '')])))
    }
  }, [settings.data])

  if (settings.isPending) {
    return (
      <PageContainer variant="narrow">
        <PageLoading />
      </PageContainer>
    )
  }

  const field = (key: string, label: string, control: React.ReactNode) => (
    <div key={key} className="tw:flex tw:items-center tw:justify-between tw:gap-4">
      <Typography.Text>{label}</Typography.Text>
      {control}
    </div>
  )

  return (
    <PageContainer variant="narrow">
      <Card>
        <div className="tw:flex tw:flex-col tw:gap-4">
          {field(
            'common.timezone',
            t('platform.settings.timezone'),
            <Select
              aria-label={t('platform.settings.timezone')}
              className="tw:min-w-[220px]"
              value={draft['common.timezone'] || undefined}
              options={timezones.data ?? []}
              onChange={(value) => setDraft((prev) => ({ ...prev, 'common.timezone': String(value) }))}
            />,
          )}
          {field(
            'execution.defaultWorkhours',
            t('platform.settings.workhours'),
            <Input
              aria-label={t('platform.settings.workhours')}
              type="number"
              className="tw:w-[220px]"
              value={draft['execution.defaultWorkhours'] ?? ''}
              onChange={(event) => setDraft((prev) => ({ ...prev, 'execution.defaultWorkhours': event.target.value }))}
            />,
          )}
          {field(
            'safe.changeWeak',
            t('platform.settings.changeWeak'),
            <Input
              aria-label={t('platform.settings.changeWeak')}
              className="tw:w-[220px]"
              value={draft['safe.changeWeak'] ?? ''}
              onChange={(event) => setDraft((prev) => ({ ...prev, 'safe.changeWeak': event.target.value }))}
            />,
          )}
          {field(
            'safe.modifyPasswordFirstLogin',
            t('platform.settings.modifyPasswordFirstLogin'),
            <Input
              aria-label={t('platform.settings.modifyPasswordFirstLogin')}
              className="tw:w-[220px]"
              value={draft['safe.modifyPasswordFirstLogin'] ?? ''}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, 'safe.modifyPasswordFirstLogin': event.target.value }))
              }
            />,
          )}
        </div>
        <Button type="primary" className="tw:mt-6" loading={save.isPending} onClick={() => save.mutate(draft)}>
          {t('common.action.submit')}
        </Button>
      </Card>
    </PageContainer>
  )
}
