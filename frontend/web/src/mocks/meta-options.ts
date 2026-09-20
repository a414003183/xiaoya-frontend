/**
 * meta 枚举选项（mock 侧唯一清单）：与 backend 各 `*Registrar` 声明的 `options` 逐字对齐，
 * `GET /meta/{domain}` 从这里取选项——前端筛选下拉在 mock 下与真实后端同源。
 * 全项目选项 i18n 键都是 `<前缀>.<取值>`（02 §2），故统一用 opts() 生成；个别不规则键（@null 等）手写。
 */
export type MockMetaOption = { value: string | number; i18n: string }

/** `<prefix>.<value>` 一族选项（取值含 `/`、数字同样适用）。 */
const opts = (prefix: string, values: readonly (string | number)[]): MockMetaOption[] =>
  values.map((value) => ({ value, i18n: `${prefix}.${value}` }))

/** 优先级 1–4 全项目一张表（common.priority.*），各域 meta 复用同一份。 */
export const PRIORITY_OPTIONS = opts('common.priority', [1, 2, 3, 4])

// ── quality（QualityRegistrar）──
export const BUG_STATUS_OPTIONS = opts('bug.status', ['active', 'resolved', 'closed'])
export const BUG_SEVERITY_OPTIONS = opts('bug.severity', [1, 2, 3, 4])
export const BUG_TYPE_OPTIONS = opts('bug.type', [
  'codeerror',
  'config',
  'install',
  'security',
  'performance',
  'standard',
  'automation',
  'designdefect',
  'others',
])
export const BUG_RESOLUTION_OPTIONS = opts('bug.resolution', [
  'bydesign',
  'duplicate',
  'external',
  'fixed',
  'notrepro',
  'postponed',
  'willnotfix',
  'tostory',
])
/** 契约 filters[confirmed] 的值为 1/0（bool 列），不是 yes/no。 */
export const BUG_CONFIRMED_OPTIONS: MockMetaOption[] = [
  { value: '1', i18n: 'bug.confirmed.yes' },
  { value: '0', i18n: 'bug.confirmed.no' },
]
/** 内建字典 timezones（§3.9：值为 IANA 时区，label 直接下发译文）。 */
export const TIMEZONE_DICT_ITEMS = [
  { value: 'Asia/Shanghai', label: '(GMT+08:00) 北京' },
  { value: 'Asia/Taipei', label: '(GMT+08:00) 台北' },
  { value: 'Asia/Tokyo', label: '(GMT+09:00) 东京' },
  { value: 'Asia/Singapore', label: '(GMT+08:00) 新加坡' },
  { value: 'Europe/London', label: '(GMT+00:00) 伦敦' },
  { value: 'Europe/Berlin', label: '(GMT+01:00) 柏林' },
  { value: 'America/New_York', label: '(GMT-05:00) 纽约' },
  { value: 'America/Los_Angeles', label: '(GMT-08:00) 洛杉矶' },
  { value: 'UTC', label: '(GMT+00:00) UTC' },
]

/** 字典 bug-os / bug-browser（§3.9：后端 DictProvider 只给值与文案键）。 */
export const BUG_OS_DICT_ITEMS = opts('bug.os', ['windows', 'osx', 'android', 'ios', 'linux', 'others'])
export const BUG_BROWSER_DICT_ITEMS = opts('bug.browser', ['ie', 'chrome', 'firefox', 'safari', 'edge', 'others'])
export const TEST_CASE_STATUS_OPTIONS = opts('testCase.status', ['wait', 'normal', 'blocked', 'investigate'])
export const TEST_CASE_TYPE_OPTIONS = opts('testCase.type', [
  'unit',
  'interface',
  'feature',
  'install',
  'config',
  'performance',
  'security',
  'other',
])
export const TEST_CASE_STAGE_OPTIONS = opts('testCase.stage', [
  'unittest',
  'feature',
  'intergrate',
  'system',
  'smoke',
  'bvt',
])
/** 用例最近结果与测试单执行结果同词表（§3.5）。 */
export const TEST_CASE_RESULT_OPTIONS = opts('testCase.result', ['pass', 'fail', 'blocked', 'n/a'])
/** 执行清单筛选的第五档：@null = 尚未登记结果的关联用例（03 §3 特殊量）。 */
export const TEST_RUN_RESULT_OPTIONS: MockMetaOption[] = [
  ...TEST_CASE_RESULT_OPTIONS,
  { value: '@null', i18n: 'testRun.summary.none' },
]
export const TEST_RUN_STATUS_OPTIONS = opts('testRun.status', ['wait', 'doing', 'done', 'blocked'])
export const TEST_RUN_TYPE_OPTIONS = opts('testRun.type', [
  'integrate',
  'system',
  'acceptance',
  'performance',
  'safety',
])
export const SUITE_TYPE_OPTIONS = opts('suite.type', ['public', 'private'])

// ── requirement（StoryRegistrar）──
export const STORY_STATUS_OPTIONS = opts('story.status', [
  'draft',
  'reviewing',
  'active',
  'changing',
  'changed',
  'closed',
])
export const STORY_TYPE_OPTIONS = opts('story.type', ['story', 'epic', 'requirement'])
export const STORY_STAGE_OPTIONS = opts('story.stage', ['wait', 'developing', 'testing', 'released'])
export const STORY_SOURCE_OPTIONS = opts('story.source', ['manual', 'customer', 'market', 'bug', 'other'])
export const STORY_CLOSE_REASON_OPTIONS = opts('story.closeReason', [
  'done',
  'duplicate',
  'rejected',
  'willnotfix',
  'postponed',
])

// ── task（TaskRegistrar）──
export const TASK_STATUS_OPTIONS = opts('task.status', ['wait', 'doing', 'done', 'pause', 'cancel', 'closed'])
export const TASK_TYPE_OPTIONS = opts('task.type', [
  'design',
  'devel',
  'request',
  'test',
  'study',
  'discuss',
  'ui',
  'affair',
  'misc',
])
export const TASK_CLOSE_REASON_OPTIONS = opts('task.closeReason', ['done', 'cancel'])

// ── workspace（WorkspaceRegistrar）──
export const TODO_STATUS_OPTIONS = opts('todo.status', ['wait', 'doing', 'done', 'closed'])
/** 字典 todoType（§5）同时是 meta/todo.type 的 options。 */
export const TODO_TYPE_DICT_ITEMS = opts('todo.type', [
  'custom',
  'bug',
  'task',
  'story',
  'epic',
  'requirement',
  'testRun',
])
export const MY_TASK_ROLE_OPTIONS = opts('my.role.tasks', ['assignee', 'creator', 'finisher', 'closer'])
export const MY_BUG_ROLE_OPTIONS = opts('my.role.bugs', ['assignee', 'creator', 'resolver', 'closer'])
export const MY_STORY_ROLE_OPTIONS = opts('my.role.stories', ['assignee', 'creator', 'reviewer', 'closer'])

// ── product（ProductRegistrar）──
export const PRODUCT_STATUS_OPTIONS = opts('product.status', ['normal', 'closed'])
export const PRODUCT_TYPE_OPTIONS = opts('product.type', ['normal', 'branch', 'platform'])
export const PRODUCT_ACL_OPTIONS = opts('product.acl', ['public', 'private', 'custom'])
export const BRANCH_STATUS_OPTIONS = opts('branch.status', ['active', 'closed'])
export const CATEGORY_TYPE_OPTIONS = opts('category.type', ['story', 'bug', 'case'])
export const PLAN_STATUS_OPTIONS = opts('plan.status', ['wait', 'doing', 'done', 'closed'])
export const PLAN_CLOSE_REASON_OPTIONS = opts('plan.closeReason', ['done', 'cancel'])
export const RELEASE_STATUS_OPTIONS = opts('release.status', ['normal', 'terminated'])

// ── project（ProjectRegistrar）──
export const PROJECT_STATUS_OPTIONS = opts('project.status', ['wait', 'doing', 'suspended', 'delay', 'closed'])
export const PROJECT_MODEL_OPTIONS = opts('project.model', ['scrum', 'waterfall', 'kanban'])
export const PROJECT_BUDGET_UNIT_OPTIONS = opts('project.budgetUnit', ['CNY', 'USD'])
export const PROJECT_ACL_OPTIONS = opts('project.acl', ['open', 'private', 'program'])
/** 三型各自合法的 filters[type] 值域（项目集/项目只有自身一型，执行三型）。 */
export const PROGRAM_TYPE_OPTIONS = opts('project.type', ['program'])
export const PROJECT_TYPE_OPTIONS = opts('project.type', ['project'])
export const EXECUTION_TYPE_OPTIONS = opts('project.type', ['sprint', 'stage', 'kanban'])
export const BOARD_SPACE_STATUS_OPTIONS = opts('board.status', ['active', 'closed'])
export const BOARD_SPACE_TYPE_OPTIONS = opts('board.spaceType', ['cooperation', 'public', 'private'])
export const BOARD_SPACE_ACL_OPTIONS = opts('board.acl', ['open', 'private'])
export const BOARD_ACL_OPTIONS = opts('board.acl', ['open', 'private', 'extend'])
export const CARD_STATUS_OPTIONS = opts('board.cardStatus', ['doing', 'done'])
/** 干系人类型（project 卡 §3.8 filterable）。 */
export const STAKEHOLDER_TYPE_OPTIONS = opts('stakeholder.type', ['inside', 'outside'])

// ── doc（DocRegistrar）──
export const DOC_STATUS_OPTIONS = opts('doc.status', ['draft', 'published'])
export const DOC_TYPE_OPTIONS = opts('doc.type', ['markdown', 'html'])
export const DOC_ACL_OPTIONS = opts('doc.acl', ['open', 'private'])
export const DOC_SPACE_TYPE_OPTIONS = opts('docSpace.type', ['product', 'project', 'execution', 'custom', 'mine'])
export const DOC_SPACE_ACL_OPTIONS = opts('docSpace.acl', ['open', 'default', 'private'])
export const DOC_SPACE_DOC_SORT_OPTIONS = opts('docSpace.docSort', ['id_asc', 'id_desc'])

// ── org（OrgRegistrar）──
export const ACCOUNT_STATUS_OPTIONS = opts('org.account.status', ['active', 'disabled'])
export const ACCOUNT_GENDER_OPTIONS = opts('org.account.gender', ['m', 'f'])

// ── platform（NotificationMetaRegistrar）──
export const NOTIFICATION_READ_AT_OPTIONS: MockMetaOption[] = [
  { value: '@null', i18n: 'platform.notification.tab.unread' },
  { value: '@notNull', i18n: 'platform.notification.status.read' },
]
/** 个人通知开关目录（§3.7：设置页 notify.<type> 键）。 */
export const NOTIFICATION_TYPE_OPTIONS = opts('platform.notification.type', [
  'story-created',
  'story-changed',
  'task-assigned',
  'task-finished',
  'bug-created',
  'bug-resolved',
  'account-reset-password',
])
