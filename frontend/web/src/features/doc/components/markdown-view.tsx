import { EmptyState } from '@zentao/design-system'
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { useMemo } from 'react'

/**
 * Markdown 渲染（T-5 / 前置-6 选型定案：marked）。doc §1：正文统一 Markdown；迁移存量 html 型同样过 marked
 * （marked 默认透传内联 HTML，保存后落为 markdown），故不做 type 分支。
 *
 * 安全（A7-3 定案：渲染端消毒）：marked 自 v5 不再内置消毒，而正文可由任意持 doc-edit 权限的账号写入，
 * 故渲染前统一过 DOMPurify（剥 script/事件属性/javascript: 协议），兜住存储型 XSS。
 * 存储端保留原始 Markdown 不改写——版本历史与动态流 diff 依赖原文逐字节可比。
 */
const MARKDOWN_CLASS = [
  'tw:text-sm tw:leading-relaxed',
  'tw:[&_h1]:mt-4 tw:[&_h1]:mb-2 tw:[&_h1]:text-xl tw:[&_h1]:font-semibold',
  'tw:[&_h2]:mt-4 tw:[&_h2]:mb-2 tw:[&_h2]:text-lg tw:[&_h2]:font-semibold',
  'tw:[&_h3]:mt-3 tw:[&_h3]:mb-1 tw:[&_h3]:font-semibold',
  'tw:[&_p]:my-2',
  'tw:[&_ul]:my-2 tw:[&_ul]:list-disc tw:[&_ul]:pl-6',
  'tw:[&_ol]:my-2 tw:[&_ol]:list-decimal tw:[&_ol]:pl-6',
  'tw:[&_a]:text-primary',
  'tw:[&_code]:rounded tw:[&_code]:bg-fill tw:[&_code]:px-1',
  'tw:[&_pre]:my-2 tw:[&_pre]:overflow-x-auto tw:[&_pre]:rounded tw:[&_pre]:bg-fill tw:[&_pre]:p-3',
  'tw:[&_blockquote]:border-l-4 tw:[&_blockquote]:border-border-strong tw:[&_blockquote]:pl-3 tw:[&_blockquote]:text-tertiary',
  'tw:[&_table]:my-2 tw:[&_table]:border-collapse',
  'tw:[&_th]:border tw:[&_th]:border-border-strong tw:[&_th]:px-2',
  'tw:[&_td]:border tw:[&_td]:border-border-strong tw:[&_td]:px-2',
].join(' ')

export function MarkdownView({ content, emptyText }: { content?: string | null | undefined; emptyText: string }) {
  const html = useMemo(() => (content ? DOMPurify.sanitize(marked.parse(content, { async: false })) : ''), [content])
  if (html === '') {
    return <EmptyState description={emptyText} />
  }
  // biome-ignore lint/security/noDangerouslySetInnerHtml: 需求即渲染 Markdown（契约 content 为富文本源码），注入前已过 DOMPurify.sanitize（见上方安全说明）
  return <div className={MARKDOWN_CLASS} data-testid="markdown-view" dangerouslySetInnerHTML={{ __html: html }} />
}
