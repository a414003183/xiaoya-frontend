import { describe, expect, test } from 'vitest'
import type { DomainMeta } from '../meta'
import { metaOptions } from '../meta-options'

/** 筛选选项映射（03 §5）：字段选项 → antd Select options；缺字段/未载入一律空数组，不阻塞页面。 */
const meta = (fields: DomainMeta['fields']): DomainMeta => ({
  domain: 'demo',
  fields,
  actions: [],
  statusVisuals: {},
})

/** t 的真实形态：命中语言包给文案，未命中回退键名（i18next 缺键行为）。 */
const t = (key: string) => (key === 'demo.status.a' ? '甲' : key)

describe('metaOptions', () => {
  test('按字段取 options，value 一律字符串（与 URL 同形），label 走 t(i18n)', () => {
    const domain = meta([
      {
        key: 'status',
        type: 'select',
        options: [
          { value: 'a', i18n: 'demo.status.a' },
          { value: 2, i18n: 'demo.status.2' },
        ],
      },
    ])
    expect(metaOptions(domain, 'status', t)).toEqual([
      { value: 'a', label: '甲' },
      { value: '2', label: 'demo.status.2' },
    ])
  })

  test('meta 未载入 / 字段缺失 / 字段无 options 都返回空数组', () => {
    expect(metaOptions(undefined, 'status', t)).toEqual([])
    expect(metaOptions(meta([]), 'status', t)).toEqual([])
    expect(metaOptions(meta([{ key: 'title', type: 'text' }]), 'title', t)).toEqual([])
  })

  test('选项无 i18n 键时回落取值本身（后端漏键不至于渲染空标签）', () => {
    expect(metaOptions(meta([{ key: 'acl', options: [{ value: 'open' }] }]), 'acl', t)).toEqual([
      { value: 'open', label: 'open' },
    ])
  })
})
