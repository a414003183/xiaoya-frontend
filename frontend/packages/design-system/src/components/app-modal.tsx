import { Modal as AntModal, type ModalProps } from 'antd'
import type { CSSProperties } from 'react'
import { modalBodyMaxHeight, modalBodyScrollBarGap, modalDefaultWidth } from '../tokens/spacing'

/** 滚动体 = `.ant-modal-body`（styles.body 落点）：超高才滚，右侧给滚动条留一格，别贴着输入框右沿。 */
const scrollBody: CSSProperties = {
  maxHeight: modalBodyMaxHeight,
  overflowY: 'auto',
  paddingInlineEnd: modalBodyScrollBarGap,
}

/**
 * 页面骨架 · 弹窗（UI 三项修订 2026-09-20「弹窗高度统一」）：全站弹窗共用一条高度口径——
 * 内容超过视口时**在弹窗体内滚动**（标题与底部按钮恒定可见），不再出现长表单把「确定」顶出屏幕的形态。
 *
 * 为什么是包一层而不是逐页写 styles：68 个弹窗体一律是 `<Form>`，逐个写 68 份同样的 maxHeight 既冗长
 * 又必然漂移；缺省在此钉死，个别弹窗要覆盖时照旧传 `styles={{ body: … }}`（本组件不吞调用方样式）。
 * 静态 `Modal.confirm` 未随本包装导出：静态函数拿不到 ConfigProvider 上下文（亮暗/语言失效），
 * 确认框走 `useModal()`（use-feedback.ts）的主题感知实例。
 *
 * 缺省宽（用户要求「所有的弹窗……可以小一点，不用小太多」）：antd 无 size 属性，故在包装层把缺省宽
 * 从 520 收到 `modalDefaultWidth`(480)；页面显式传 width 的照旧覆盖（560/640/760 这类保持不动）。
 */
export function Modal({ styles, width, ...rest }: ModalProps) {
  const merged = typeof styles === 'function' ? styles : { body: scrollBody, ...styles }
  return <AntModal width={width ?? modalDefaultWidth} {...rest} styles={merged} />
}
