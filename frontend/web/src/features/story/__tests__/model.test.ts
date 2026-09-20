import { describe, expect, test } from 'vitest'
import { actionI18nKey, priorityKey, requiresDuplicate, reviewModeFor, storyTone } from '../model'

describe('storyTone', () => {
  test('状态映射与未知回退', () => {
    expect(storyTone('draft')).toBe('neutral')
    expect(storyTone('reviewing')).toBe('pending')
    expect(storyTone('active')).toBe('active')
    expect(storyTone('changing')).toBe('warning')
    expect(storyTone('changed')).toBe('warning')
    expect(storyTone('closed')).toBe('closed')
    expect(storyTone('nope')).toBe('neutral')
  })
})

describe('priorityKey', () => {
  test('1–4 取 common.priority.*，越界与缺省回退 3', () => {
    expect(priorityKey(1)).toBe('common.priority.1')
    expect(priorityKey(4)).toBe('common.priority.4')
    expect(priorityKey(9)).toBe('common.priority.3')
    expect(priorityKey(undefined)).toBe('common.priority.3')
  })
})

describe('requiresDuplicate', () => {
  test('仅 duplicate 关闭原因要求 duplicateOfId', () => {
    expect(requiresDuplicate('duplicate')).toBe(true)
    expect(requiresDuplicate('done')).toBe(false)
  })
})

describe('reviewModeFor', () => {
  test('draft 状态取 submit-review（双分支守卫在后端）', () => {
    const actions = [
      { action: 'submit-review', allowedStatus: ['draft', 'changed'] },
      { action: 'pass', allowedStatus: ['reviewing'] },
      { action: 'reject', allowedStatus: ['reviewing'] },
    ]
    expect(reviewModeFor(actions, 'draft')).toBe('submit-review')
    expect(reviewModeFor(actions, 'reviewing')).toBe('pass')
    expect(reviewModeFor(actions, 'closed')).toBeNull()
  })

  test('无 allowedStatus 的动作任何状态可用', () => {
    expect(reviewModeFor([{ action: 'reject' }], 'closed')).toBe('reject')
  })

  test('无评审动作时返回 null', () => {
    expect(reviewModeFor([{ action: 'close' }], 'active')).toBeNull()
    expect(reviewModeFor(undefined, 'active')).toBeNull()
  })
})

describe('actionI18nKey', () => {
  test('kebab 动作名转 camel i18n key', () => {
    expect(actionI18nKey('submit-review')).toBe('story.action.submitReview')
    expect(actionI18nKey('change-done')).toBe('story.action.changeDone')
    expect(actionI18nKey('close')).toBe('story.action.close')
  })
})
