import { EmptyState, Typography } from '@zentao/design-system'
import { useTranslation } from 'react-i18next'
import type { StoryView } from '../api/product.api'

/** 关联需求简表（plan/release/build 详情页共用，跨域只读）。 */
export function StoryTable({ stories, onOpen }: { stories: StoryView[]; onOpen: (storyId: number) => void }) {
  const { t } = useTranslation()
  if (stories.length === 0) {
    return <EmptyState description={t('common.empty')} />
  }
  return (
    <table className="tw:w-full tw:border-collapse tw:text-sm">
      <thead>
        <tr className="tw:text-left">
          <th className="tw:py-1">{t('story.field.id')}</th>
          <th className="tw:py-1">{t('story.field.title')}</th>
          <th className="tw:py-1">{t('story.field.status')}</th>
          <th className="tw:py-1">{t('story.field.stage')}</th>
        </tr>
      </thead>
      <tbody>
        {stories.map((story) => (
          <tr key={story.id} className="tw:border-t tw:border-border">
            <td className="tw:py-1">{story.id}</td>
            <td className="tw:py-1">
              <Typography.Link onClick={() => onOpen(story.id)}>{story.title}</Typography.Link>
            </td>
            <td className="tw:py-1">{t(`story.status.${story.status}`)}</td>
            <td className="tw:py-1">{t(`story.stage.${story.stage}`)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
