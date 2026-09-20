import type { ReactNode } from 'react'
import { Empty, Typography } from './ui'

/** 列表/详情空态统一出口。 */
export function EmptyState({ description }: { description: ReactNode }) {
  return (
    <Empty
      image={Empty.PRESENTED_IMAGE_SIMPLE}
      description={<Typography.Text type="secondary">{description}</Typography.Text>}
    />
  )
}
