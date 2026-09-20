import { render, screen } from '@testing-library/react'
import { initI18n } from '@zentao/i18n'
import { describe, expect, test } from 'vitest'
import { MarkdownView } from '../components/markdown-view'

/** Markdown 渲染的消毒边界（A7-3）：marked 透传的原始 HTML 必须过 DOMPurify 后才能注入。 */
initI18n()

function renderMarkdown(content: string) {
  render(<MarkdownView content={content} emptyText="暂无正文" />)
  return screen.getByTestId('markdown-view')
}

describe('MarkdownView 消毒（A7-3）', () => {
  test('内联 HTML 的 onerror 事件属性被剥离', () => {
    const view = renderMarkdown('正文\n\n<img src=x onerror=alert(1)>')
    expect(view).toHaveTextContent('正文')
    expect(view.querySelector('img')).not.toBeNull()
    expect(view.querySelector('img')?.hasAttribute('onerror')).toBe(false)
    expect(view.innerHTML).not.toContain('onerror')
  })

  test('script 标签连内容一并移除，不落进 DOM', () => {
    const view = renderMarkdown('正文\n\n<script>alert(1)</script>')
    expect(view).toHaveTextContent('正文')
    expect(view.querySelector('script')).toBeNull()
    expect(view.innerHTML).not.toContain('<script')
    expect(view.textContent).not.toContain('alert')
  })

  test('javascript: 协议的链接保留文字但去掉 href', () => {
    const view = renderMarkdown('[点我](javascript:alert(1))\n\n<a href="javascript:alert(1)">点我两次</a>')
    const links = view.querySelectorAll('a')
    expect(links).toHaveLength(2)
    for (const link of links) {
      expect(link.hasAttribute('href')).toBe(false)
    }
    expect(view.innerHTML).not.toContain('javascript:')
  })

  test('正常 Markdown（标题/加粗/内联 HTML/表格/外链）原样渲染', () => {
    const view = renderMarkdown(
      '# 标题\n\n**加粗** <u>下划线</u>\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n[官网](https://example.com)',
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('标题')
    expect(view.querySelector('strong')).toHaveTextContent('加粗')
    expect(view.querySelector('u')).toHaveTextContent('下划线')
    expect(view.querySelector('th')).toHaveTextContent('a')
    expect(view.querySelector('td')).toHaveTextContent('1')
    expect(screen.getByRole('link', { name: '官网' })).toHaveAttribute('href', 'https://example.com')
  })

  test('空正文落空态', () => {
    render(<MarkdownView content="" emptyText="暂无正文" />)
    expect(screen.queryByTestId('markdown-view')).toBeNull()
    expect(screen.getByText('暂无正文')).toBeInTheDocument()
  })
})
