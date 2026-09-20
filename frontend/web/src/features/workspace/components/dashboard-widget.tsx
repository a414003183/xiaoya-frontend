import { useQuery } from '@tanstack/react-query'
import type { ActivityView } from '@zentao/api-client/generated/model/activityView'
import type { BugView } from '@zentao/api-client/generated/model/bugView'
import type { StoryView } from '@zentao/api-client/generated/model/storyView'
import type { TaskView } from '@zentao/api-client/generated/model/taskView'
import type { TodoView } from '@zentao/api-client/generated/model/todoView'
import { Card, EmptyState, Space, Spin, StatusTag, Typography } from '@zentao/design-system'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { statusTone as taskStatusTone } from '../../task'
import {
  fetchMyActivities,
  fetchMyBugs,
  fetchMyStories,
  fetchMySummary,
  fetchMyTasks,
  fetchTodos,
  qk,
} from '../api/workspace.api'
import { activityDateKey, type DashboardWidgetKind, todoDisplayTitle, todoStatusKey, todoStatusTone } from '../model'

/** widget 取数条数（§3.5：数据全部复用既有端点，limit=10，口径与对应列表页一致）。 */
const WIDGET_LIMIT = 10

/** 计数卡目录（§3.4 summary 口径）：卡片点击跳对应 /my/* 列表。 */
const COUNT_CARDS = [
  { key: 'todoCount', path: '/my/todos', label: 'my.card.todos' },
  { key: 'taskCount', path: '/my/tasks', label: 'my.card.tasks' },
  { key: 'bugCount', path: '/my/bugs', label: 'my.card.bugs' },
  { key: 'storyCount', path: '/my/stories', label: 'my.card.stories' },
] as const

/**
 * 地盘 widget 分发（T-15 / §3.5 六种固定目录）：每种一个子组件（各自持有 hooks，遵守 hooks 规则）。
 * 列表卡统一 limit=10 且复用对应列表页的取数函数与 qk，保证口径一致。
 */
export default function DashboardWidget({ widget }: { widget: DashboardWidgetKind }) {
  switch (widget) {
    case 'summary':
      return <SummaryWidget />
    case 'myTodos':
      return <TodoWidget />
    case 'myTasks':
      return <TaskWidget />
    case 'myBugs':
      return <BugWidget />
    case 'myStories':
      return <StoryWidget />
    default:
      return <ActivityWidget />
  }
}

function SummaryWidget() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const summary = useQuery({ queryKey: qk.workspace.mySummary(), queryFn: fetchMySummary })
  if (summary.isPending) {
    return <Spin size="small" />
  }
  return (
    <div className="tw:grid tw:grid-cols-2 tw:gap-3 tw:md:grid-cols-4">
      {COUNT_CARDS.map((card) => (
        <Card key={card.key} hoverable size="small" onClick={() => navigate(card.path)}>
          <Typography.Text type="secondary">{t(card.label)}</Typography.Text>
          <div className="tw:text-2xl tw:font-semibold">{summary.data?.[card.key] ?? 0}</div>
        </Card>
      ))}
    </div>
  )
}

/** 列表卡骨架：空数据回落 EmptyState，否则渲染行列表。 */
function WidgetList({ empty, children }: { empty: boolean; children: ReactNode }) {
  const { t } = useTranslation()
  return empty ? (
    <EmptyState description={t('dashboard.empty')} />
  ) : (
    <ul className="tw:m-0 tw:flex tw:list-none tw:flex-col tw:gap-2 tw:p-0">{children}</ul>
  )
}

function TodoWidget() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const todos = useQuery({
    queryKey: qk.workspace.todoList({ limit: WIDGET_LIMIT }),
    queryFn: () => fetchTodos({ limit: WIDGET_LIMIT }),
  })
  if (todos.isPending) {
    return <Spin size="small" />
  }
  return (
    <WidgetList empty={(todos.data?.items.length ?? 0) === 0}>
      {(todos.data?.items ?? []).map((todo: TodoView) => (
        <li key={todo.id}>
          <Space size="small" wrap>
            <Typography.Link onClick={() => navigate(`/todos/${todo.id}`)}>{todoDisplayTitle(todo)}</Typography.Link>
            <StatusTag tone={todoStatusTone(todo.status)}>{t(todoStatusKey(todo.status))}</StatusTag>
            <Typography.Text type="secondary">{todo.date ?? t('common.field.none')}</Typography.Text>
          </Space>
        </li>
      ))}
    </WidgetList>
  )
}

function TaskWidget() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const tasks = useQuery({
    queryKey: qk.workspace.myTasks({ role: 'assignee', limit: WIDGET_LIMIT }),
    queryFn: () => fetchMyTasks('assignee', { limit: WIDGET_LIMIT }),
  })
  if (tasks.isPending) {
    return <Spin size="small" />
  }
  return (
    <WidgetList empty={(tasks.data?.items.length ?? 0) === 0}>
      {(tasks.data?.items ?? []).map((task: TaskView) => (
        <li key={task.id}>
          <Space size="small" wrap>
            <Typography.Link onClick={() => navigate(`/tasks/${task.id}`)}>{task.title}</Typography.Link>
            <StatusTag tone={taskStatusTone(task.status)}>{t(`task.status.${task.status}`)}</StatusTag>
            <Typography.Text type="secondary">{task.deadline ?? t('common.field.none')}</Typography.Text>
          </Space>
        </li>
      ))}
    </WidgetList>
  )
}

function BugWidget() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const bugs = useQuery({
    queryKey: qk.workspace.myBugs({ role: 'assignee', limit: WIDGET_LIMIT }),
    queryFn: () => fetchMyBugs('assignee', { limit: WIDGET_LIMIT }),
  })
  if (bugs.isPending) {
    return <Spin size="small" />
  }
  return (
    <WidgetList empty={(bugs.data?.items.length ?? 0) === 0}>
      {(bugs.data?.items ?? []).map((bug: BugView) => (
        <li key={bug.id}>
          <Space size="small" wrap>
            <Typography.Link onClick={() => navigate(`/bugs/${bug.id}`)}>{bug.title}</Typography.Link>
            <Typography.Text type="secondary">{t(`bug.severity.${bug.severity}`)}</Typography.Text>
            <Typography.Text type="secondary">{t(`bug.status.${bug.status}`)}</Typography.Text>
          </Space>
        </li>
      ))}
    </WidgetList>
  )
}

function StoryWidget() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const stories = useQuery({
    queryKey: qk.workspace.myStories({ role: 'assignee', limit: WIDGET_LIMIT }),
    queryFn: () => fetchMyStories('assignee', { limit: WIDGET_LIMIT }),
  })
  if (stories.isPending) {
    return <Spin size="small" />
  }
  return (
    <WidgetList empty={(stories.data?.items.length ?? 0) === 0}>
      {(stories.data?.items ?? []).map((story: StoryView) => (
        <li key={story.id}>
          <Space size="small" wrap>
            <Typography.Link onClick={() => navigate(`/stories/${story.id}`)}>{story.title}</Typography.Link>
            <Typography.Text type="secondary">{t(`story.status.${story.status}`)}</Typography.Text>
          </Space>
        </li>
      ))}
    </WidgetList>
  )
}

function ActivityWidget() {
  const { t } = useTranslation()
  const activities = useQuery({
    queryKey: qk.workspace.myActivities({ limit: WIDGET_LIMIT }),
    queryFn: () => fetchMyActivities({ limit: WIDGET_LIMIT }),
  })
  if (activities.isPending) {
    return <Spin size="small" />
  }
  return (
    <WidgetList empty={(activities.data?.items.length ?? 0) === 0}>
      {(activities.data?.items ?? []).map((item: ActivityView) => (
        <li key={item.id}>
          <Space size="small" wrap>
            <Typography.Text type="secondary">{activityDateKey(item.occurredAt)}</Typography.Text>
            <Typography.Text strong>{item.actor}</Typography.Text>
            <Typography.Text>
              {t(`platform.activity.action.${item.action}`, { defaultValue: item.action })}
            </Typography.Text>
            {item.remark ? <Typography.Text type="secondary">{item.remark}</Typography.Text> : null}
          </Space>
        </li>
      ))}
    </WidgetList>
  )
}
