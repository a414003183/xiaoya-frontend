/** @route /login @title auth.login.title @hide */
import { zodResolver } from '@hookform/resolvers/zod'
import { ApiError, ok } from '@zentao/api-client'
import { useLogin } from '@zentao/api-client/generated'
import { authCardWidth, Button, Card, Form, Input, Typography, useMessage } from '@zentao/design-system'
import type { ChangeEvent, ReactNode } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router'
import { z } from 'zod'
import { safeRedirect } from '../model'

const loginSchema = z.object({
  account: z.string().min(1),
  password: z.string().min(1),
})

type LoginValues = z.infer<typeof loginSchema>

export default function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  // 回跳目标从**路由**取而非 window.location：路由才是 URL 态真源（MemoryRouter/子路径部署下二者会分叉）
  const [searchParams] = useSearchParams()
  const login = useLogin()
  const message = useMessage()
  const { control, handleSubmit } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { account: '', password: '' },
  })

  const onSubmit = handleSubmit((values) => {
    login.mutate(
      { data: values },
      {
        onSuccess: (response) => {
          const realName = ok(response).data.realName
          message.success(t('auth.login.message.welcome', { name: realName }))
          const redirect = searchParams.get('redirect')
          void navigate(safeRedirect(redirect))
        },
        onError: (error) => {
          if (error instanceof ApiError && error.code === 40101) {
            message.error(t('auth.login.message.invalid'))
          }
        },
      },
    )
  })

  const field = (
    name: keyof LoginValues,
    label: string,
    render: (value: string, onChange: (event: ChangeEvent<HTMLInputElement>) => void) => ReactNode,
  ) => (
    <Controller
      name={name}
      control={control}
      render={({ field: { value, onChange }, fieldState }) => (
        <Form.Item
          label={label}
          {...(fieldState.error
            ? { validateStatus: 'error' as const, help: t('auth.login.message.required', { field: label }) }
            : {})}
        >
          {render(value, onChange)}
        </Form.Item>
      )}
    />
  )

  return (
    <div className="tw:flex tw:min-h-screen tw:items-center tw:justify-center tw:bg-layout">
      <Card className="tw:shadow-md" style={{ width: authCardWidth }}>
        <Typography.Title level={4} className="tw:text-center">
          {t('auth.login.title')}
        </Typography.Title>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void onSubmit(event)
          }}
        >
          {field('account', t('auth.login.field.account'), (value, onChange) => (
            <Input
              aria-label={t('auth.login.field.account')}
              autoComplete="username"
              value={value}
              onChange={onChange}
            />
          ))}
          {field('password', t('auth.login.field.password'), (value, onChange) => (
            <Input.Password
              aria-label={t('auth.login.field.password')}
              autoComplete="current-password"
              value={value}
              onChange={onChange}
            />
          ))}
          <Button type="primary" htmlType="submit" block loading={login.isPending}>
            {t('auth.login.action.submit')}
          </Button>
        </form>
      </Card>
    </div>
  )
}
