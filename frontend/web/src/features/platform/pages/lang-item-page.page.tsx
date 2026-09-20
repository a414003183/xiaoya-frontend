/** @route /admin/lang-items @title platform.lang.title @perm lang-manage @menu admin/lang @order 1 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Card,
  Input,
  PageContainer,
  PageHeader,
  PageLoading,
  Segmented,
  Tree,
  Typography,
} from '@zentao/design-system'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  fetchLangItems,
  fetchLocaleOptions,
  fetchPrivilegeDomains,
  restoreLangItems,
  saveLangItems,
} from '../api/platform.api'

/** 域内常用 field 维度（沿用旧树的两节：字段/动作文案）。 */
const FIELD_SECTIONS = ['field', 'action'] as const

/** 覆盖层视图（左域+字段树 / 右键值表；platform 卡 §6 旧 custom-set）。
 * B-PLT-12：域清单动态来自 GET /dicts/privileges（按 domain 去重），语言切换走 API lang 参数。 */
export default function LangItemPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [lang, setLang] = useState('zh-cn')
  const [selected, setSelected] = useState('common/field')
  const [draft, setDraft] = useState<Record<string, string>>({})

  const [domainPart, sectionPart] = selected.split('/')
  const domain = domainPart ?? 'common'
  const section = sectionPart ?? ''

  const domains = useQuery({ queryKey: ['getDict', 'privileges', 'domains'], queryFn: fetchPrivilegeDomains })
  const locales = useQuery({ queryKey: ['getDict', 'locales'], queryFn: fetchLocaleOptions })
  const items = useQuery({
    queryKey: ['getLangItems', lang, selected],
    queryFn: () => fetchLangItems(lang, domain, section),
  })
  const save = useMutation({
    mutationFn: (next: Record<string, string>) => saveLangItems(lang, domain, section, next),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['getLangItems'] }),
  })
  const restore = useMutation({
    mutationFn: () => restoreLangItems(lang, domain, section),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['getLangItems'] }),
  })

  // 目录返回后若默认选中域不在清单内（如 'common'），回退到首个域
  useEffect(() => {
    const list = domains.data ?? []
    if (list.length > 0 && !list.includes(domain)) {
      setSelected(`${list[0]}/field`)
    }
  }, [domains.data, domain])

  const domainList = domains.data ?? []
  const treeData = domainList.map((name) => ({
    title: name,
    key: name,
    children: FIELD_SECTIONS.map((field) => ({ title: field, key: `${name}/${field}` })),
  }))

  if (items.isPending) {
    return (
      <PageContainer>
        <PageLoading />
      </PageContainer>
    )
  }
  const overrides = items.data?.items ?? {}

  return (
    <PageContainer>
      <PageHeader
        title={t('platform.lang.title')}
        extra={
          <Segmented
            aria-label={t('platform.lang.language')}
            value={lang}
            onChange={(value) => {
              setLang(String(value))
              setDraft({})
            }}
            options={(locales.data ?? []).map((item) => ({ value: item.value, label: item.label }))}
          />
        }
      />
      <Card>
        <div className="tw:flex tw:gap-6">
          <Tree
            key={domainList.join(',')}
            defaultExpandedKeys={domainList.slice(0, 1)}
            selectedKeys={[selected]}
            onSelect={(keys) => {
              const key = keys[0]
              if (typeof key === 'string' && key.includes('/')) {
                setSelected(key)
                setDraft({})
              }
            }}
            treeData={treeData}
          />
          <div className="tw:flex-1 tw:flex tw:flex-col tw:gap-3">
            {items.data?.overridden ? (
              <Typography.Text type="secondary">{t('platform.lang.overridden')}</Typography.Text>
            ) : null}
            {Object.entries({ ...overrides, ...draft }).map(([key, value]) => (
              <div key={key} className="tw:flex tw:items-center tw:gap-3">
                <Typography.Text className="tw:w-48">{key}</Typography.Text>
                <Input
                  aria-label={key}
                  value={value}
                  onChange={(event) => setDraft((prev) => ({ ...prev, [key]: event.target.value }))}
                />
              </div>
            ))}
            <div className="tw:flex tw:gap-2">
              <Input
                aria-label={t('platform.lang.newKey')}
                placeholder={t('platform.lang.newKey')}
                className="tw:w-48"
                value=""
                onChange={() => undefined}
              />
              <Button
                onClick={() => {
                  const key = (draft[''] ?? '').trim()
                  if (key.length > 0) {
                    setDraft((prev) => ({ ...prev, [key]: '' }))
                  }
                }}
              >
                {t('platform.lang.addKey')}
              </Button>
              <Button
                type="primary"
                loading={save.isPending}
                onClick={() => {
                  if (Object.keys(draft).length > 0) {
                    void save.mutateAsync(draft)
                  }
                }}
              >
                {t('common.action.submit')}
              </Button>
              <Button danger loading={restore.isPending} onClick={() => restore.mutate()}>
                {t('platform.lang.restore')}
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </PageContainer>
  )
}
