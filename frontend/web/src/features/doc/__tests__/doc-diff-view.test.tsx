import { cleanup, render, screen } from '@testing-library/react'
import type { DocVersionView } from '@zentao/api-client/generated/model/docVersionView'
import { initI18n } from '@zentao/i18n'
import { afterEach, describe, expect, test } from 'vitest'
import { buildLineDiff, DocDiffView } from '../components/doc-diff-view'

/** 双栏行级比对（T-5）：行拆分/对齐 + 渲染标记。 */
initI18n()

afterEach(cleanup)

function version(version: number, content: string): DocVersionView {
  return {
    id: version,
    docId: 1,
    version,
    title: `v${version} 标题`,
    content,
    digest: content,
    files: [],
    createdBy: 'admin',
    createdAt: '2026-09-01T00:00:00Z',
  }
}

describe('buildLineDiff', () => {
  test('同/删/增三类行对齐，删除行右侧留空、新增行左侧留空', () => {
    const rows = buildLineDiff('# 标题\n旧内容\n', '# 标题\n新内容\n补充\n')
    expect(rows.map((row) => [row.kind, row.left, row.right])).toEqual([
      ['equal', '# 标题', '# 标题'],
      ['remove', '旧内容', null],
      ['add', null, '新内容'],
      ['add', null, '补充'],
    ])
  })

  test('内容一致时全部为 equal；两侧空串无行', () => {
    expect(buildLineDiff('a\nb', 'a\nb').every((row) => row.kind === 'equal')).toBe(true)
    expect(buildLineDiff('', '')).toEqual([])
  })
})

describe('DocDiffView', () => {
  test('删除行左栏标 remove 右栏空、新增行右栏标 add、未变行两栏同级', () => {
    render(<DocDiffView from={version(1, '# 标题\n旧内容')} to={version(2, '# 标题\n新内容')} />)
    expect(screen.getByText('旧内容')).toHaveAttribute('data-kind', 'remove')
    expect(screen.getByText('新内容')).toHaveAttribute('data-kind', 'add')
    expect(screen.getAllByText('# 标题')).toHaveLength(2)
    expect(screen.getByText(/v1 标题/)).toBeInTheDocument()
    expect(screen.getByText(/v2 标题/)).toBeInTheDocument()
  })

  test('无正文时给空态', () => {
    render(<DocDiffView from={version(1, '')} to={version(2, '')} />)
    expect(screen.queryAllByText('旧内容')).toHaveLength(0)
  })
})
