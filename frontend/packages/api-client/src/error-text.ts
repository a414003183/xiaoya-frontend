import { ApiError } from './http'

/**
 * 03 §4 错误码 → i18n key（06 §七 决策⑧：后端 message 仅开发兜底，界面文案一律按 code 映射，
 * en 界面才不冒中文）。新增错误码四处同步：`ErrorCode.java` / 03 §4 表 / 本表 / i18n 双语 `common.message.*`。
 */
export const ERROR_CODE_KEY: Readonly<Record<number, string>> = {
  40001: 'common.message.badRequest',
  40101: 'common.message.unauthenticated',
  40301: 'common.message.forbidden',
  40302: 'common.message.dataForbidden',
  40401: 'common.message.notFound',
  40901: 'common.message.lockConflict',
  42201: 'common.message.validationFailed',
  42202: 'common.message.stateActionNotAllowed',
  42203: 'common.message.guardNotSatisfied',
  42901: 'common.message.rateLimited',
  50001: 'common.message.internal',
}

/** 只要能把 key 翻成文案即可——不引 i18next 类型，api-client 不为 UI 依赖买单。 */
export type Translator = (key: string) => string

/**
 * 错误统一文案：ApiError 按码映射 i18n；网络/超时/未知（非 ApiError）回落调用方兜底 key。
 * 页面有更贴切的域内文案时（如 publish 守卫）自行保留分支，只把兜底分支交给本函数。
 */
export function errorText(error: unknown, t: Translator, fallbackKey = 'common.message.failed'): string {
  const key = error instanceof ApiError ? ERROR_CODE_KEY[error.code] : undefined
  return t(key ?? fallbackKey)
}
