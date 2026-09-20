import { App, message } from 'antd'

/**
 * 主题感知的反馈入口（08 B3-3 / 00-governance D8）。
 *
 * 为什么不能直接用 `message` / `notification` 静态方法：antd 的静态函数**拿不到 ConfigProvider 上下文**，
 * 因而既不认主题（本项目亮/暗双轨 → 暗色下 toast 仍是亮色皮）也不认 locale，并在运行期打
 * "Static function can not consume context" 警告。`App.useApp()` 返回的是同一套 API 的上下文实例，
 * 用法一致（`message.success(...)`），故调用点无需改写。
 *
 * 用法：`const message = useMessage()` / `const notification = useNotification()`（**必须在组件或 hook 内调用**）。
 * 模块级/非 React 上下文需要提示时，把动作包成组件回调再调用本 hook，不要退回静态方法。
 */

/** `App.useApp().message`（主题/语言感知的轻提示）。 */
export function useMessage(): ReturnType<typeof App.useApp>['message'] {
  return App.useApp().message
}

/** `App.useApp().notification`（主题/语言感知的通知框）。 */
export function useNotification(): ReturnType<typeof App.useApp>['notification'] {
  return App.useApp().notification
}

/**
 * `App.useApp().modal`（主题/语言感知的确认框）：`Modal.confirm` 静态函数拿不到 ConfigProvider 上下文
 * （亮暗与语言双双失效），确认框一律走本 hook 的实例，用法与静态版一致（`modal.confirm({...})`）。
 */
export function useModal(): ReturnType<typeof App.useApp>['modal'] {
  return App.useApp().modal
}

/**
 * 清空静态轻提示容器（**仅测试清理用**）：antd 的 message 通知挂在独立容器上，RTL 的 `cleanup()` 不清它，
 * jsdom 无 motion 事件导致节点不自动摘除，残留会串到后续同文案断言。
 * 业务代码不得使用——业务提示一律走 `useMessage()`。
 */
export function destroyStaticMessages(): void {
  message.destroy()
}
