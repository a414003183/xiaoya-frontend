import { Component, type ErrorInfo, type ReactNode } from 'react'
import { ErrorFallback } from './error-fallback'

type Props = { children: ReactNode; fallback?: ReactNode }
type State = { failed: boolean }

/**
 * 应用级错误边界（FE-P0-1）：render 树里任一组件抛错即降级为兜底页，不再整页白屏。
 * 路由级兜底是 app-router 的 errorElement（只降级页面区、外壳仍在）；本组件管的是壳层与
 * RouterProvider 自身的错误。P1-1 接上报后把 componentDidCatch 换成 reportError 即可。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[error-boundary]', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.failed) {
      return this.props.children
    }
    return this.props.fallback ?? <ErrorFallback />
  }
}
