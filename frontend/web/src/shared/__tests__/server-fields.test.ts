import { ApiError } from '@zentao/api-client'
import { describe, expect, test, vi } from 'vitest'
import { applyServerFields } from '../form-fields'

/** applyServerFields（T70 / FE-05）：422 `fields`（字段 → 原因码）→ RHF 字段错误，message 存 i18n key。 */
describe('applyServerFields', () => {
  const setError = vi.fn()

  test('ApiError 带 fields → 逐字段 setError，message=i18n key（未知原因码回落 validationFailed）', () => {
    setError.mockClear()
    const error = new ApiError(42201, 'x', { title: 'tooLong', steps: 'itemEmpty' })
    expect(applyServerFields(error, setError)).toBe(true)
    expect(setError).toHaveBeenCalledTimes(2)
    expect(setError).toHaveBeenCalledWith('title', { type: 'server', message: 'common.message.validationFailed' })
    expect(setError).toHaveBeenCalledWith('steps', { type: 'server', message: 'common.message.validationFailed' })
  })

  test('per-form keys 覆盖原因码文案', () => {
    setError.mockClear()
    const error = new ApiError(42201, 'x', { percent: 'percent-over-total' })
    expect(applyServerFields(error, setError, { 'percent-over-total': 'stage.message.percentExceeded' })).toBe(true)
    expect(setError).toHaveBeenCalledWith('percent', { type: 'server', message: 'stage.message.percentExceeded' })
  })

  test('required / duplicate 走通用表的现成键', () => {
    setError.mockClear()
    expect(applyServerFields(new ApiError(42201, 'x', { name: 'required' }), setError)).toBe(true)
    expect(setError).toHaveBeenCalledWith('name', { type: 'server', message: 'common.message.required' })
    expect(applyServerFields(new ApiError(42201, 'x', { code: 'duplicate' }), setError)).toBe(true)
    expect(setError).toHaveBeenCalledWith('code', { type: 'server', message: 'error.duplicate' })
  })

  test('非 ApiError / 无 fields / 空 fields → false 且不误报', () => {
    setError.mockClear()
    expect(applyServerFields(new Error('boom'), setError)).toBe(false)
    expect(applyServerFields(new ApiError(50001, 'boom'), setError)).toBe(false)
    expect(applyServerFields(new ApiError(42201, 'x', {}), setError)).toBe(false)
    expect(setError).not.toHaveBeenCalled()
  })
})
