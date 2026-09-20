import { ok } from '@zentao/api-client'
import { getMeta } from '@zentao/api-client/generated'

/**
 * meta 消费（03 §6）：动作目录与工作流 YAML 同源，前端按钮显隐只认它；字段目录供表单渲染。
 * orval 生成物把 actions/fields 声明为松散 map，这里收窄成域内使用的形状。
 */
export type MetaAction = {
  code?: string
  action: string
  i18n?: string
  allowedStatus?: string[]
}

/** 枚举字段的一个取值（03 §5）：value 是下发给接口的原值，i18n 是文案 key（前端 t() 后展示）。 */
export type MetaOption = {
  value?: string | number
  i18n?: string
}

export type MetaField = {
  key: string
  type?: string
  required?: boolean
  maxLength?: number
  i18n?: string
  source?: string
  options?: MetaOption[]
}

export type DomainMeta = {
  domain: string
  fields: MetaField[]
  actions: MetaAction[]
  statusVisuals: Record<string, { tone?: string; i18n?: string } | undefined>
}

export async function fetchMeta(domain: string): Promise<DomainMeta> {
  return ok(await getMeta(domain)).data as unknown as DomainMeta
}

/** meta actions 过滤：allowedStatus 缺省或为空 = 任何状态可用。 */
export function actionsFor(actions: readonly MetaAction[] | undefined, status: string | undefined): MetaAction[] {
  if (!actions) {
    return []
  }
  return actions.filter((metaAction) => {
    const allowed = metaAction.allowedStatus
    if (!allowed || allowed.length === 0) {
      return true
    }
    return status !== undefined && allowed.includes(status)
  })
}
