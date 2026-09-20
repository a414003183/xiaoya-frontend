import { Form, Input, InputNumber, Select } from '@zentao/design-system'
import { type Control, Controller, type FieldError, type FieldValues, type Path } from 'react-hook-form'
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

/** 错误 → Form.Item 入参（exactOptionalPropertyTypes 下不用显式 undefined）。 */
function errorProps(error: FieldError | undefined, t: (key: string) => string) {
  return error ? { validateStatus: 'error' as const, help: t(error.message ?? 'common.message.required') } : {}
}

export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  maxLength,
  placeholder,
  'aria-label': ariaLabel,
}: FieldProps<T> & { maxLength?: number; placeholder?: string }) {
  const { t } = useTranslation()
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Form.Item label={label} {...errorProps(fieldState.error, t)}>
          <Input
            {...field}
            value={field.value ?? ''}
            maxLength={maxLength}
            {...(placeholder === undefined ? {} : { placeholder })}
            aria-label={ariaLabel ?? String(name)}
          />
        </Form.Item>
      )}
    />
  )
}

export function TextAreaField<T extends FieldValues>({ control, name, label, 'aria-label': ariaLabel }: FieldProps<T>) {
  const { t } = useTranslation()
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Form.Item label={label} {...errorProps(fieldState.error, t)}>
          <Input.TextArea {...field} value={field.value ?? ''} rows={4} aria-label={ariaLabel ?? String(name)} />
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
  'aria-label': ariaLabel,
}: FieldProps<T> & { min?: number; max?: number }) {
  const { t } = useTranslation()
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Form.Item label={label} {...errorProps(fieldState.error, t)}>
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
  'aria-label': ariaLabel,
}: FieldProps<T> & { options: Option[]; multiple?: boolean }) {
  const { t } = useTranslation()
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Form.Item label={label} {...errorProps(fieldState.error, t)}>
          <Select
            {...(multiple ? { mode: 'multiple' as const, value: field.value ?? [] } : { value: field.value ?? null })}
            options={options}
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
