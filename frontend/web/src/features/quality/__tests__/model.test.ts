import { describe, expect, test } from 'vitest'
import {
  actionI18nKey,
  activateAssigneeFallback,
  bugTone,
  canPatchStatus,
  MAX_STEPS,
  normalizeSteps,
  requiresDuplicateOf,
  requiresResolvedBuild,
  reviewAllowed,
  STEP_TEXT_MAX,
  severityKey,
  testCaseTone,
  validateSteps,
} from '../model'

describe('bugTone', () => {
  test('状态映射与未知回退', () => {
    expect(bugTone('active')).toBe('error')
    expect(bugTone('resolved')).toBe('pending')
    expect(bugTone('closed')).toBe('closed')
    expect(bugTone('nope')).toBe('neutral')
  })
})

describe('severityKey', () => {
  test('1–4 取 bug.severity.*，越界与缺省回退 3', () => {
    expect(severityKey(1)).toBe('bug.severity.1')
    expect(severityKey(4)).toBe('bug.severity.4')
    expect(severityKey(9)).toBe('bug.severity.3')
    expect(severityKey(undefined)).toBe('bug.severity.3')
  })
})

describe('resolve 联动守卫（quality §4.1）', () => {
  test('仅 duplicate 要求 duplicateOfId', () => {
    expect(requiresDuplicateOf('duplicate')).toBe(true)
    expect(requiresDuplicateOf('fixed')).toBe(false)
    expect(requiresDuplicateOf('tostory')).toBe(false)
  })

  test('仅 fixed 要求 resolvedBuild', () => {
    expect(requiresResolvedBuild('fixed')).toBe(true)
    expect(requiresResolvedBuild('duplicate')).toBe(false)
  })

  test('activate assignee 缺省回派原解决人', () => {
    expect(activateAssigneeFallback('dev1')).toBe('dev1')
    expect(activateAssigneeFallback(null)).toBeNull()
    expect(activateAssigneeFallback(undefined)).toBeNull()
  })
})

describe('testCaseTone / canPatchStatus（quality §4.2）', () => {
  test('用例四状态映射', () => {
    expect(testCaseTone('wait')).toBe('pending')
    expect(testCaseTone('normal')).toBe('active')
    expect(testCaseTone('blocked')).toBe('warning')
    expect(testCaseTone('investigate')).toBe('neutral')
  })

  test('PATCH status 仅标记态可直改，wait 不行（03 §1 唯一例外）', () => {
    expect(canPatchStatus('normal')).toBe(true)
    expect(canPatchStatus('blocked')).toBe(true)
    expect(canPatchStatus('investigate')).toBe(true)
    expect(canPatchStatus('wait')).toBe(false)
    expect(canPatchStatus(undefined)).toBe(false)
  })
})

describe('reviewAllowed', () => {
  test('meta actions 里 review 按 allowedStatus 判定', () => {
    const actions = [{ action: 'review', allowedStatus: ['wait'] }]
    expect(reviewAllowed(actions, 'wait')).toBe(true)
    expect(reviewAllowed(actions, 'normal')).toBe(false)
    expect(reviewAllowed(undefined, 'wait')).toBe(false)
  })

  test('无 allowedStatus 的 review 任何状态可用', () => {
    expect(reviewAllowed([{ action: 'review' }], 'normal')).toBe(true)
  })
})

describe('步骤子表约束（quality §3.2）', () => {
  test('normalizeSteps 丢空行并按行号重排 sort', () => {
    const next = normalizeSteps([
      { sort: 5, description: '打开登录页', expects: null },
      { sort: 6, description: '', expects: '' },
      { sort: 7, description: '输入密码', expects: '跳转首页' },
    ])
    expect(next).toEqual([
      { sort: 1, description: '打开登录页', expects: null },
      { sort: 2, description: '输入密码', expects: '跳转首页' },
    ])
  })

  test('validateSteps：缺描述记行号，超长记字段', () => {
    const long = 'a'.repeat(STEP_TEXT_MAX + 1)
    const errors = validateSteps([
      { sort: 1, description: '', expects: null },
      { sort: 2, description: long, expects: long },
    ])
    expect(errors).toContainEqual({ index: 0, field: 'description', message: 'steps.descriptionRequired' })
    expect(errors).toContainEqual({ index: 1, field: 'description', message: 'steps.textTooLong' })
    expect(errors).toContainEqual({ index: 1, field: 'expects', message: 'steps.textTooLong' })
    expect(validateSteps([{ sort: 1, description: 'ok', expects: null }])).toEqual([])
  })

  test('上限常量与领域卡一致', () => {
    expect(MAX_STEPS).toBe(100)
    expect(STEP_TEXT_MAX).toBe(2000)
  })
})

describe('actionI18nKey', () => {
  test('kebab 动作名转 camel i18n key，bug/testCase 两域', () => {
    expect(actionI18nKey('bug', 'confirm')).toBe('bug.action.confirm')
    expect(actionI18nKey('bug', 'activate')).toBe('bug.action.activate')
    expect(actionI18nKey('testCase', 'review')).toBe('testCase.action.review')
  })
})
