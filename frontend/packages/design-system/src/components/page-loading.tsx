import type { ReactNode } from 'react'
import { Spin } from './ui'

/** 页面/路由级加载态。 */
export function PageLoading({ tip }: { tip?: ReactNode }) {
  return (
    <div className="tw:flex tw:h-full tw:min-h-[240px] tw:items-center tw:justify-center">
      <Spin tip={tip}>{null}</Spin>
    </div>
  )
}
