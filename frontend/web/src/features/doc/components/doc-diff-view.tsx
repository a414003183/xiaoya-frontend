import type { DocVersionView } from '@zentao/api-client/generated/model/docVersionView'
import { EmptyState, Typography } from '@zentao/design-system'
import { diffLines } from 'diff'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * 双栏行级比对（T-5 / doc §5：diff 无后端端点，前端各取两版快照后渲染）。
 * 行级 diff 用 `diff` 包；左右两栏按 equal/add/remove 对齐，新增行留空左侧、删除行留空右侧。
 */

export type DiffRow = {
  key: number
  kind: 'equal' | 'add' | 'remove'
  left: string | null
  right: string | null
}

/** diffLines 的分段 value 带行尾换行 → 拆行并丢弃末尾空段（否则每段多渲染一行空行）。 */
function splitLines(value: string): string[] {
  const lines = value.split('\n')
  if (lines.length > 1 && lines.at(-1) === '') {
    lines.pop()
  }
  return lines
}

export function buildLineDiff(from: string, to: string): DiffRow[] {
  const rows: DiffRow[] = []
  let key = 0
  const push = (kind: DiffRow['kind'], left: string | null, right: string | null) => {
    rows.push({ key, kind, left, right })
    key += 1
  }
  for (const part of diffLines(from, to)) {
    for (const line of splitLines(part.value)) {
      if (part.added) {
        push('add', null, line)
      } else if (part.removed) {
        push('remove', line, null)
      } else {
        push('equal', line, line)
      }
    }
  }
  return rows
}

const ROW_CLASS: Record<DiffRow['kind'], string> = {
  equal: '',
  add: 'tw:bg-diff-add',
  remove: 'tw:bg-diff-remove',
}

export function DocDiffView({ from, to }: { from: DocVersionView; to: DocVersionView }) {
  const { t } = useTranslation()
  const rows = useMemo(() => buildLineDiff(from.content ?? '', to.content ?? ''), [from.content, to.content])

  return (
    <div className="tw:flex tw:flex-col tw:gap-2">
      <div className="tw:grid tw:grid-cols-2 tw:gap-2">
        <Typography.Text strong>
          {t('docVersion.field.version')} v{from.version} · {from.title}
        </Typography.Text>
        <Typography.Text strong>
          {t('docVersion.field.version')} v{to.version} · {to.title}
        </Typography.Text>
      </div>
      {rows.length === 0 ? (
        <EmptyState description={t('docVersion.message.noContent')} />
      ) : (
        <div className="tw:overflow-x-auto tw:rounded tw:border tw:border-solid tw:border-border">
          {rows.map((row) => (
            <div key={row.key} className={`tw:grid tw:grid-cols-2 ${ROW_CLASS[row.kind]}`}>
              <pre
                data-kind={row.left === null ? 'empty' : row.kind}
                className="tw:m-0 tw:overflow-x-auto tw:border-r tw:border-solid tw:border-border tw:px-2 tw:text-xs"
              >
                {row.left ?? ''}
              </pre>
              <pre
                data-kind={row.right === null ? 'empty' : row.kind}
                className="tw:m-0 tw:overflow-x-auto tw:px-2 tw:text-xs"
              >
                {row.right ?? ''}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
