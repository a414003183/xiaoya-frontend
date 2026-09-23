import { ApiError } from '@zentao/api-client'
import { Form, Input, InputNumber, Select } from '@zentao/design-system'
import {
  type Control,
  Controller,
  type FieldError,
  type FieldValues,
  type Path,
  type UseFormSetError,
} from 'react-hook-form'
import { useTranslation } from 'react-i18next'

/**
 * RHF + zod 表单一族（T-3/T-5/T-7）：project 与 board 域的抽屉/弹窗共用（shared 归属），
 * zod 的 message 落 i18n key，错误态交给 design-system 的 Form.Item（与 login 页同构）。
 */

type FieldProps<T extends FieldValues> = {
  control: Control<T>
  name: Path<T>
  label: string
  'aria-label'?: string
}

type Option = { value: string | number; label: string }

/** 错误 → Form.Item 入参（exactOptionalPropertyTypes 下不用显式 undefined）。内联 Controller 的字段也用它。 */
export function errorProps(error: FieldError | undefined, t: (key: string) => string) {
  return error ? { validateStatus: 'error' as const, help: t(error.message ?? 'common.message.required') } : {}
}

/**
 * 原因码的通用文案表（T63 词表全量登记，与后端 `platform/error/FieldReasons` 同词同义）：
 * `required`/`duplicate` 有专属键；`invalid`/`tooLong`/`tooSmall`/`tooLarge`/`pattern` 尚无专属文案键，
 * 按行为冻结解析到「未通过校验」（将来引入专属键只改本表一行，不动调用方）。
 * 域内专属原因码（如 `invalidJson`/`reused`）走 per-form `keys`，不进本表。
 */
const SERVER_FIELD_ERROR_KEYS: Readonly<Record<string, string>> = {
  required: 'common.message.required',
  duplicate: 'error.duplicate',
  invalid: 'common.message.validationFailed',
  tooLong: 'common.message.validationFailed',
  tooSmall: 'common.message.validationFailed',
  tooLarge: 'common.message.validationFailed',
  pattern: 'common.message.validationFailed',
}

/**
 * 服务端 422 字段错误 → RHF 字段错误（FE-05 / T70）：`ApiError.fields` 是「字段 → 原因码」
 * （`platform/error/ApiException#keyed`），message 与 zod 同轨存 **i18n key**，渲染处 `t()`。
 * 原因码先查 per-form `keys`（域内文案），再查通用表，其余回落 `common.message.validationFailed`。
 * 无字段错误返回 `false`：调用方保留整体错误段落/提示（`errorText`），不双报。
 */
export function applyServerFields<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  keys: Record<string, string> = {},
): boolean {
  const fields = error instanceof ApiError ? error.fields : undefined
  if (!fields || Object.keys(fields).length === 0) return false
  for (const [name, reason] of Object.entries(fields)) {
    setError(name as Path<T>, {
      type: 'server',
      message: keys[reason] ?? SERVER_FIELD_ERROR_KEYS[reason] ?? 'common.message.validationFailed',
    })
  }
  return true
}

export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  maxLength,
  placeholder,
  disabled,
  extra,
  'aria-label': ariaLabel,
}: FieldProps<T> & { maxLength?: number; placeholder?: string; disabled?: boolean; extra?: string }) {
  const { t } = useTranslation()
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Form.Item label={label} {...(extra === undefined ? {} : { extra })} {...errorProps(fieldState.error, t)}>
          <Input
            {...field}
            value={field.value ?? ''}
            maxLength={maxLength}
            {...(placeholder === undefined ? {} : { placeholder })}
            {...(disabled === undefined ? {} : { disabled })}
            aria-label={ariaLabel ?? String(name)}
          />
        </Form.Item>
      )}
    />
  )
}

export function TextAreaField<T extends FieldValues>({
  control,
  name,
  label,
  rows,
  maxLength,
  extra,
  'aria-label': ariaLabel,
}: FieldProps<T> & { rows?: number; maxLength?: number; extra?: string }) {
  const { t } = useTranslation()
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Form.Item label={label} {...(extra === undefined ? {} : { extra })} {...errorProps(fieldState.error, t)}>
          <Input.TextArea
            {...field}
            value={field.value ?? ''}
            rows={rows ?? 4}
            {...(maxLength === undefined ? {} : { maxLength })}
            aria-label={ariaLabel ?? String(name)}
          />
        </Form.Item>
      )}
    />
  )
}

export function DateField<T extends FieldValues>({ control, name, label, 'aria-label': ariaLabel }: FieldProps<T>) {
  const { t } = useTranslation()
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Form.Item label={label} {...errorProps(fieldState.error, t)}>
          <Input {...field} value={field.value ?? ''} placeholder="YYYY-MM-DD" aria-label={ariaLabel ?? String(name)} />
        </Form.Item>
      )}
    />
  )
}

export function NumberField<T extends FieldValues>({
  control,
  name,
  label,
  min,
  max,
  extra,
  'aria-label': ariaLabel,
}: FieldProps<T> & { min?: number; max?: number; extra?: string }) {
  const { t } = useTranslation()
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Form.Item label={label} {...(extra === undefined ? {} : { extra })} {...errorProps(fieldState.error, t)}>
          <InputNumber
            {...(field.value === null || field.value === undefined ? {} : { value: field.value })}
            {...(min === undefined ? {} : { min })}
            {...(max === undefined ? {} : { max })}
            className="tw:w-full"
            aria-label={ariaLabel ?? String(name)}
            onChange={(value) => field.onChange(value === null ? null : Number(value))}
            onBlur={field.onBlur}
          />
        </Form.Item>
      )}
    />
  )
}

export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  options,
  multiple,
  disabled,
  extra,
  'aria-label': ariaLabel,
}: FieldProps<T> & { options: Option[]; multiple?: boolean; disabled?: boolean; extra?: string }) {
  const { t } = useTranslation()
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Form.Item label={label} {...(extra === undefined ? {} : { extra })} {...errorProps(fieldState.error, t)}>
          <Select
            {...(multiple ? { mode: 'multiple' as const, value: field.value ?? [] } : { value: field.value ?? null })}
            options={options}
            {...(disabled === undefined ? {} : { disabled })}
            allowClear
            showSearch
            optionFilterProp="label"
            aria-label={ariaLabel ?? String(name)}
            onChange={(value) => field.onChange(value ?? null)}
            onBlur={field.onBlur}
          />
        </Form.Item>
      )}
    />
  )
}
