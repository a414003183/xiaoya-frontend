import type { AccountView } from '@zentao/api-client/generated/model/accountView'
import type { AuditLogView } from '@zentao/api-client/generated/model/auditLogView'
import type { BoardSpaceView } from '@zentao/api-client/generated/model/boardSpaceView'
import type { BoardView } from '@zentao/api-client/generated/model/boardView'
import type { BranchView } from '@zentao/api-client/generated/model/branchView'
import type { BugView } from '@zentao/api-client/generated/model/bugView'
import type { BuildView } from '@zentao/api-client/generated/model/buildView'
import type { CardView } from '@zentao/api-client/generated/model/cardView'
import type { CategoryView } from '@zentao/api-client/generated/model/categoryView'
import type { ColumnPrefItem } from '@zentao/api-client/generated/model/columnPrefItem'
import type { DocCategoryView } from '@zentao/api-client/generated/model/docCategoryView'
import type { DocSpaceView } from '@zentao/api-client/generated/model/docSpaceView'
import type { DocVersionView } from '@zentao/api-client/generated/model/docVersionView'
import type { DocView } from '@zentao/api-client/generated/model/docView'
import type { EffortView } from '@zentao/api-client/generated/model/effortView'
import type { LaneView } from '@zentao/api-client/generated/model/laneView'
import type { OnlineUserView } from '@zentao/api-client/generated/model/onlineUserView'
import type { PlanView } from '@zentao/api-client/generated/model/planView'
import type { ProductView } from '@zentao/api-client/generated/model/productView'
import type { ProjectView } from '@zentao/api-client/generated/model/projectView'
import type { ReleaseView } from '@zentao/api-client/generated/model/releaseView'
import type { ReportView } from '@zentao/api-client/generated/model/reportView'
import type { ResultView } from '@zentao/api-client/generated/model/resultView'
import type { RoleView } from '@zentao/api-client/generated/model/roleView'
import type { StageView } from '@zentao/api-client/generated/model/stageView'
import type { StakeholderView } from '@zentao/api-client/generated/model/stakeholderView'
import type { StoryView } from '@zentao/api-client/generated/model/storyView'
import type { SuiteView } from '@zentao/api-client/generated/model/suiteView'
import type { TaskView } from '@zentao/api-client/generated/model/taskView'
import type { TeamMemberView } from '@zentao/api-client/generated/model/teamMemberView'
import type { TestCaseView } from '@zentao/api-client/generated/model/testCaseView'
import type { TestRunView } from '@zentao/api-client/generated/model/testRunView'
import type { TodoView } from '@zentao/api-client/generated/model/todoView'
import type { WeeklyReportView } from '@zentao/api-client/generated/model/weeklyReportView'

/**
 * MSW 内存数据库：handlers 共享的会话态与种子数据。
 * node/browser 双环境通用；resetMockData() 由测试在用例间复位。
 */
export const ALL_PRIVILEGE_CODES = [
  'file-upload',
  'setting-manage',
  'lang-manage',
  // platform 域审计（platform 卡 §7.1：PrivilegeCatalog.register("audit", …)，只读流水查看码）
  'audit-log-view',
  // 在线用户（T13 P1-1：看列表与强退分开授权）
  'online-user-view',
  'online-user-kick',
  // 运行时接口文档（T14 P1-2：/v3/api-docs 与 /swagger-ui 的访问码）
  'api-doc-view',
  // 服务监控（T17 P1-5：/monitor/server 的读取码）
  'monitor-view',
  'account-view',
  'account-create',
  'account-edit',
  'account-password',
  'account-reset-password',
  'account-disable',
  'account-enable',
  'account-unlock',
  'account-delete',
  'department-view',
  'department-create',
  'department-edit',
  'department-delete',
  'personnel-view',
  // 角色（T23 统一实体：权限码 + 成员 + 数据权限一套；与后端 OrgRegistrar 同源）
  'role-view',
  'role-create',
  'role-edit',
  'role-delete',
  'role-copy',
  'role-priv-edit',
  'role-member-edit',
  // product 域（P2）：产品/分支/分类/计划/发布/构建（ProductRegistrar 六族权限码，与后端目录同源）
  'product-view',
  'product-create',
  'product-edit',
  'product-close',
  'product-activate',
  'product-delete',
  'branch-manage',
  'branch-delete',
  'category-manage',
  'plan-view',
  'plan-create',
  'plan-edit',
  'plan-start',
  'plan-finish',
  'plan-close',
  'plan-activate',
  'plan-link',
  'plan-delete',
  'release-view',
  'release-create',
  'release-edit',
  'release-terminate',
  'release-link',
  'release-delete',
  'build-view',
  'build-create',
  'build-edit',
  'build-delete',
  'build-link',
  // requirement 域（P2）：story（StoryRegistrar 权限码，与后端目录同源）
  'story-view',
  'story-create',
  'story-edit',
  'story-submit-review',
  'story-pass',
  'story-change',
  'story-assign',
  'story-close',
  'story-activate',
  'story-delete',
  // project 域（P3）：program / project / execution / stakeholder（project §5 权限码列）
  'program-view',
  'program-create',
  'program-edit',
  'program-start',
  'program-suspend',
  'program-resume',
  'program-delay',
  'program-close',
  'program-activate',
  'project-view',
  'project-create',
  'project-edit',
  'project-start',
  'project-suspend',
  'project-resume',
  'project-delay',
  'project-close',
  'project-activate',
  'project-link-story',
  'project-manage-members',
  'project-whitelist',
  'execution-view',
  'execution-create',
  'execution-edit',
  'execution-start',
  'execution-suspend',
  'execution-resume',
  'execution-delay',
  'execution-close',
  'execution-activate',
  'execution-manage-members',
  'stakeholder-view',
  'stakeholder-manage',
  // board / stage 域（P3 · T-7）：看板空间/看板/列/卡片 + 阶段类型字典（project §5 权限码列）
  'board-view',
  'board-space-create',
  'board-space-edit',
  'board-space-close',
  'board-create',
  'board-edit',
  'board-close',
  'board-card-create',
  'board-card-edit',
  'stage-view',
  'stage-manage',
  // task / effort 域（P3 · T-10/T-11）：任务八动作与工时（task §5 权限码列）
  'task-view',
  'task-create',
  'task-edit',
  'task-start',
  'task-finish',
  'task-pause',
  'task-resume',
  'task-cancel',
  'task-close',
  'task-activate',
  'task-assign',
  'task-effort',
  'task-effort-edit',
  'task-effort-delete',
  'task-delete',
  // quality 域（P4）：Bug/TestCase/Suite/Library/TestRun/Result/Report（quality §5 权限码列全量）
  'bug-view',
  'bug-create',
  'bug-edit',
  'bug-confirm',
  'bug-resolve',
  'bug-activate',
  'bug-close',
  'bug-assign',
  'bug-delete',
  'testcase-view',
  'testcase-create',
  'testcase-edit',
  'testcase-review',
  'testcase-delete',
  'suite-view',
  'suite-create',
  'suite-edit',
  'suite-link-case',
  'suite-delete',
  'library-view',
  'library-create',
  'library-edit',
  'library-delete',
  'testrun-view',
  'testrun-create',
  'testrun-edit',
  'testrun-start',
  'testrun-block',
  'testrun-activate',
  'testrun-close',
  'testrun-link-case',
  'testrun-record-result',
  'testrun-assign-case',
  'testrun-delete',
  'report-view',
  'report-create',
  'report-edit',
  'report-delete',
  // doc 域（P5 · T-1）：文档库/文档双层 ACL 与动作（doc §5 权限码列）
  'doc-space-view',
  'doc-space-create',
  'doc-space-edit',
  'doc-space-delete',
  'doc-view',
  'doc-create',
  'doc-edit',
  'doc-delete',
  // workspace 域（P5 · T-1）：待办全生命周期 + 我的地盘 + 周报（workspace §5 权限码列；report-view 复用 quality 码）
  'todo-view',
  'todo-create',
  'todo-edit',
  'todo-start',
  'todo-finish',
  'todo-activate',
  'todo-close',
  'todo-assign',
  'todo-delete',
  'my-view',
  'weekly-report-view',
] as const

/** 权限码目录（org 矩阵页数据源 GET /dicts/privileges）。 */
export const PRIVILEGE_CATALOG = ALL_PRIVILEGE_CODES.map((code) => ({
  code,
  domain: code.split('-')[0],
  i18n: `priv.${code}`,
}))

export type MockAccount = AccountView & { password: string }

/** 角色行（T23 统一实体）：memberCount/privilegeCount 由关联表现算，不落库。 */
export type RoleRow = Omit<RoleView, 'memberCount' | 'privilegeCount'>

// ── P5 · T-1 doc / workspace 行类型：契约视图 + 软删列（deletedAt 不进响应，DB 语义见各领域卡 §3）──

/** 文档库行（doc §3.1）；docCount 为读侧派生，种子里恒 0 由 spaceView 现算。 */
export type DocSpaceRow = DocSpaceView & { deletedAt: string | null }
/** 文档行（doc §3.2）；正文/附件存 docVersions，不进主行。 */
export type DocRow = DocView & { deletedAt: string | null }
/** 待办行（workspace §3.1）；objectTitle 为读侧现算，不落库。 */
export type TodoRow = TodoView & { deletedAt: string | null }
/** 周报快照行（workspace §3.2）：存储列；weekSN/weekEnd/analysis/三表由读侧现算。 */
export type WeeklyReportRow = Omit<
  WeeklyReportView,
  'weekSN' | 'weekEnd' | 'analysis' | 'finished' | 'postponed' | 'nextWeek'
>
/** 燃尽日行（workspace §3.3）；taskId=0 为执行级汇总行。 */
export type BurnRow = {
  id: number
  executionId: number
  burnDate: string
  taskId: number
  estimateHours: number
  consumedHours: number
  leftHours: number
  storyPoint: number
}

let nextId = 1000
export function mockId(): number {
  nextId += 1
  return nextId
}

export const db = {
  sessionActive: false,
  currentAccountId: null as number | null,
  accounts: [] as MockAccount[],
  /** 角色（T23 统一实体）：超管角色 id=1 + 内置岗位角色（与后端 V33 迁移同码同名字）。 */
  roles: [] as RoleRow[],
  /** 角色 ↔ 权限码（role_priv）。 */
  rolePrivs: [] as { roleId: number; code: string }[],
  /** 账号 ↔ 角色（user_role）：账号的角色是成员关系。 */
  userRoles: [] as { accountId: number; roleId: number }[],
  /** 菜单行（T19 P2-1 / T21）：DB 菜单 = 内置菜单节点的覆盖层或新增节点（目录/菜单/按钮），见 mocks/menu-handlers.ts。 */
  menus: [] as {
    id: number
    nodeKey: string
    parentKey: string | null
    nodeType: 'dir' | 'menu' | 'button'
    title: string
    component: string | null
    path: string | null
    icon: string | null
    orderNo: number
    perm: string | null
    status: 'active' | 'disabled'
  }[],
  departments: [] as {
    id: number
    name: string
    parentId: number | null
    path: string
    grade: number
    sort: number
    manager: string | null
  }[],
  notifications: [] as {
    id: number
    recipient: string
    type: string
    objectType: string | null
    objectId: number
    activityId: number | null
    title: string
    content: string | null
    readAt: string | null
    createdBy: string
    createdAt: string
  }[],
  files: [] as {
    id: number
    title: string
    extension: string
    size: number
    objectType: string
    objectId: number
    downloads: number
    createdBy: string
    createdAt: string
    deletedAt: string | null
  }[],
  comments: [] as {
    id: number
    objectType: string
    objectId: number
    content: string
    createdBy: string
    createdAt: string
  }[],
  activities: [] as {
    id: number
    objectType: string
    objectId: number
    actor: string
    action: string
    detail: { field: string; oldValue: string; newValue: string }[] | null
    remark: string | null
    occurredAt: string
  }[],
  settings: new Map<string, unknown>(),
  /**
   * 审计流水（platform 卡 §3.13 / B1 §H3）：只读表——mock 里也没有任何 handler 会写它，
   * 行只由种子给出（真库由写请求的审计横切追加），故行类型就是响应视图本身。
   */
  auditLogs: [] as AuditLogView[],
  /** 字典类型与数据项（T16 P1-4）：真库 = dict_type / dict_data 两张表；内置字典在 handler 的 switch 里。 */
  dictTypes: [] as { code: string; name: string; status: string }[],
  dictData: [] as {
    id: number
    typeCode: string
    itemLabel: string
    itemValue: string
    sortNo: number
    status: string
  }[],
  /**
   * 在线会话（T13 P1-1）：真库 = session 表现存行，mock 里是种子数组。
   * 行 id 是 token 摘要（不是 cookie 值）；`current` 由 handler 按登录账号现算，不存种子。
   */
  onlineUsers: [] as OnlineUserView[],
  /** 个人列设置（platform「列设置」）：键 `${accountId}:${resource}`，GET/PUT/DELETE 三端点共用。 */
  columnPrefs: new Map<string, ColumnPrefItem[]>(),
  langOverrides: new Map<string, string>(),
  /** 语言包上传记录（platform 卡 §3.12：上传/失败都留痕，GET /lang-imports 数据源）。 */
  langImports: [] as {
    id: number
    lang: string
    fileName: string
    totalRows: number
    appliedRows: number
    failedRows: number
    status: 'success' | 'failed'
    message: string | null
    createdBy: string
    createdAt: string
  }[],
  // ── product / requirement 域（P2）──
  products: [] as ProductView[],
  branches: [] as BranchView[],
  categories: [] as CategoryView[],
  plans: [] as PlanView[],
  releases: [] as ReleaseView[],
  builds: [] as BuildView[],
  stories: [] as StoryView[],
  // ── project 域（P3）：一表三义 + 关联表 + 成员/干系人（project §2）──
  projects: [] as ProjectView[],
  projectProducts: [] as { projectId: number; productId: number }[],
  projectStories: [] as { projectId: number; storyId: number; productId: number; sort: number }[],
  teamMembers: [] as TeamMemberView[],
  stakeholders: [] as StakeholderView[],
  // ── board / stage 域（P3 · T-7）：看板四层 + 阶段字典（project §3.2–3.6）──
  stages: [] as StageView[],
  boardSpaces: [] as BoardSpaceView[],
  boards: [] as BoardView[],
  boardLanes: [] as LaneView[],
  boardCards: [] as CardView[],
  // ── task / effort 域（P3 · T-10/T-11）：任务全生命周期 + 工时流水（task §2/§3b）──
  tasks: [] as TaskView[],
  efforts: [] as EffortView[],
  // ── quality 域（P4）：Bug/TestCase/Suite(Library 同表双面)/TestRun/Result/Report（quality §2）──
  bugs: [] as BugView[],
  testCases: [] as TestCaseView[],
  /** Suite 与 Library 同表（§3.3）：Library 行 type='library' 且 productId=0。 */
  suites: [] as SuiteView[],
  testRuns: [] as TestRunView[],
  /** test_run_case（§3.5）：UNIQUE(testRunId, testCaseId) 幂等 upsert。 */
  testRunCases: [] as ResultView[],
  reports: [] as ReportView[],
  // ── doc 域（P5 · T-1）：库/文档/版本快照/库内目录（doc §2）──
  docSpaces: [] as DocSpaceRow[],
  docs: [] as DocRow[],
  /** doc_content（§3.3）：UNIQUE(docId, version)；version=0 草稿工作副本，≥1 不可变发布快照。 */
  docVersions: [] as DocVersionView[],
  docCategories: [] as DocCategoryView[],
  // ── workspace 域（P5 · T-1）：待办/周报快照/燃尽日行（workspace §2）──
  todos: [] as TodoRow[],
  weeklyReports: [] as WeeklyReportRow[],
  burns: [] as BurnRow[],
}

/** 种子：admin（超管角色）、dev1（成员角色）、guest（无角色无码）。密码均为 admin123。 */
export function seed(): void {
  seedRoles()
  db.accounts.push(
    mockAccount(1, 'admin', 'Admin User', 'active', null, [1]),
    mockAccount(2, 'dev1', 'Dev One', 'active', 2, [2]),
    mockAccount(3, 'guest', 'Guest User', 'active', null, []),
  )
  db.departments.push(
    { id: 1, name: 'Headquarters', parentId: null, path: ',1,', grade: 1, sort: 0, manager: 'admin' },
    { id: 2, name: 'R&D Department', parentId: 1, path: ',1,2,', grade: 2, sort: 0, manager: 'dev1' },
  )
  db.notifications.push(
    {
      id: 1,
      recipient: 'dev1',
      type: 'account-reset-password',
      objectType: 'account',
      objectId: 2,
      activityId: null,
      title: 'Your password was reset by admin',
      content: null,
      readAt: null,
      createdBy: 'admin',
      createdAt: '2026-09-01T08:00:00Z',
    },
    {
      id: 2,
      recipient: 'dev1',
      type: 'story-created',
      objectType: 'story',
      objectId: 9,
      activityId: null,
      title: 'New story pending',
      content: 'Login page refactor',
      readAt: '2026-09-02T08:00:00Z',
      createdBy: 'admin',
      createdAt: '2026-09-01T09:00:00Z',
    },
  )
  db.activities.push(
    {
      id: 1,
      objectType: 'account',
      objectId: 2,
      actor: 'admin',
      action: 'created',
      detail: null,
      remark: null,
      occurredAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 2,
      objectType: 'account',
      objectId: 2,
      actor: 'admin',
      action: 'enabled',
      detail: null,
      remark: 'Rejoined',
      occurredAt: '2026-02-01T00:00:00Z',
    },
    {
      id: 3,
      objectType: 'account',
      objectId: 2,
      actor: 'dev1',
      action: 'commented',
      detail: null,
      remark: 'Welcome',
      occurredAt: '2026-03-01T00:00:00Z',
    },
  )
  db.auditLogs.push(
    {
      id: 1,
      account: 'admin',
      action: 'login',
      category: 'auth',
      result: 'success',
      objectType: null,
      objectId: null,
      detail: null,
      ip: '10.0.0.1',
      traceId: 'trace-login-admin',
      createdAt: '2026-09-03T08:00:00Z',
    },
    {
      id: 2,
      account: null,
      action: 'login-failed',
      category: 'auth',
      result: 'fail',
      objectType: null,
      objectId: null,
      detail: null,
      ip: '10.0.0.9',
      traceId: 'trace-login-failed',
      createdAt: '2026-09-03T09:30:00Z',
    },
    {
      id: 3,
      account: 'admin',
      action: 'account-create',
      category: 'perm',
      result: 'success',
      objectType: 'account',
      objectId: 2,
      detail: 'POST /api/v1/accounts',
      ip: '10.0.0.1',
      traceId: 'trace-account-create',
      createdAt: '2026-09-04T10:00:00Z',
    },
  )
  // 系统参数种子（T15）：参数管理页的数据源；个人偏好键在 mock 里带 `<账号>:` 前缀，故不进那个面
  db.settings.set('common.timezone', 'Asia/Shanghai')
  db.settings.set('common.workhours', 8)
  db.settings.set('common.itemsPerPage', 20)
  // 字典种子（T16）：一条可用的 DB 字典，够看形状；内置字典（timezones/locales/…）在 handler 的 switch 里
  db.dictTypes.push({ code: 'demo-level', name: '演示等级', status: 'active' })
  db.dictData.push(
    { id: mockId(), typeCode: 'demo-level', itemLabel: '高', itemValue: 'high', sortNo: 20, status: 'active' },
    { id: mockId(), typeCode: 'demo-level', itemLabel: '中', itemValue: 'medium', sortNo: 10, status: 'active' },
    { id: mockId(), typeCode: 'demo-level', itemLabel: '低（停用）', itemValue: 'low', sortNo: 30, status: 'disabled' },
  )
  db.onlineUsers.push(
    {
      id: 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
      account: 'admin',
      ip: '10.0.0.1',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0',
      createdAt: '2026-09-21T02:10:00Z',
      lastSeenAt: '2026-09-21T04:12:30Z',
      expiresAt: '2026-09-28T02:10:00Z',
      current: false,
    },
    {
      id: '0f9e8d7c6b5a49382716f5e4d3c2b1a09f8e7d6c5b4a39281706f5e4d3c2b1a0',
      account: 'dev1',
      ip: '10.0.0.12',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) Safari/605.1.15',
      createdAt: '2026-09-21T03:40:00Z',
      lastSeenAt: '2026-09-21T04:05:10Z',
      expiresAt: '2026-09-28T03:40:00Z',
      current: false,
    },
  )
  seedProductDomain()
  seedProjectDomain()
  seedBoardDomain()
  seedTaskDomain()
  seedQualityDomain()
  seedDocWorkspaceDomain()
}

/**
 * 角色种子（T23 统一实体）：超管角色 id=1（全部权限码）+ 成员角色 id=2（只读两码）
 * + 旧岗位角色（研发/测试/…，与后端 V33 迁移同码同名字，内置不可删）。
 */
function seedRoles(): void {
  db.roles.push(
    {
      id: 1,
      code: null,
      name: '管理员',
      description: 'Built-in super admin role',
      acl: {},
      builtin: true,
      sort: 1,
      createdBy: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedBy: null,
      updatedAt: null,
      lockVersion: 0,
    },
    {
      id: 2,
      code: null,
      name: '成员',
      description: 'Basic read-only',
      acl: {},
      builtin: false,
      sort: 2,
      createdBy: 'admin',
      createdAt: '2026-01-01T00:00:00Z',
      updatedBy: null,
      updatedAt: null,
      lockVersion: 0,
    },
  )
  db.rolePrivs.push(...ALL_PRIVILEGE_CODES.map((code) => ({ roleId: 1, code })))
  db.rolePrivs.push({ roleId: 2, code: 'account-view' }, { roleId: 2, code: 'department-view' })
  db.userRoles.push({ accountId: 1, roleId: 1 }, { accountId: 2, roleId: 2 })

  const builtin: [string, string, number][] = [
    ['dev', '研发', 10],
    ['qa', '测试', 20],
    ['pm', '项目经理', 30],
    ['po', '产品经理', 40],
    ['td', '研发主管', 50],
    ['pd', '产品主管', 60],
    ['qd', '测试主管', 70],
    ['top', '高层管理', 80],
    ['others', '其他', 90],
  ]
  let id = 3
  for (const [code, name, sort] of builtin) {
    db.roles.push({
      id,
      code,
      name,
      description: '',
      acl: {},
      builtin: true,
      sort,
      createdBy: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedBy: null,
      updatedAt: null,
      lockVersion: 0,
    })
    id += 1
  }
}

/** P5 · T-1 种子：文档库（open/default/private/mine 四门禁）→ 目录 → 文档与版本快照；待办四状态 + 周报/燃尽快照。 */
function seedDocWorkspaceDomain(): void {
  db.docSpaces.push(
    {
      id: 1,
      name: 'Team Knowledge Base',
      type: 'custom',
      productId: 0,
      projectId: 0,
      executionId: 0,
      acl: 'open',
      whitelist: { accounts: [], groupIds: [] },
      description: 'Team-wide doc space, readable by all.',
      docSort: 'id_desc',
      isDefault: false,
      docCount: 0,
      sort: 0,
      createdBy: 'admin',
      createdAt: '2026-06-01T00:00:00Z',
      updatedBy: null,
      updatedAt: null,
      lockVersion: 0,
      deletedAt: null,
    },
    {
      id: 2,
      name: 'Demo Product Docs',
      type: 'product',
      productId: 1,
      projectId: 0,
      executionId: 0,
      acl: 'default',
      whitelist: { accounts: [], groupIds: [] },
      description: 'Inherits visibility from product "Demo Product".',
      docSort: 'id_asc',
      isDefault: true,
      docCount: 0,
      sort: 1,
      createdBy: 'admin',
      createdAt: '2026-06-02T00:00:00Z',
      updatedBy: null,
      updatedAt: null,
      lockVersion: 0,
      deletedAt: null,
    },
    {
      id: 3,
      name: 'Dev Project Docs',
      type: 'project',
      productId: 0,
      projectId: 3,
      executionId: 0,
      acl: 'private',
      whitelist: { accounts: ['dev1'], groupIds: [] },
      description: 'Private project space, whitelist readable.',
      docSort: 'id_asc',
      isDefault: false,
      docCount: 0,
      sort: 2,
      createdBy: 'admin',
      createdAt: '2026-06-03T00:00:00Z',
      updatedBy: null,
      updatedAt: null,
      lockVersion: 0,
      deletedAt: null,
    },
    {
      id: 4,
      name: "dev1's Personal Space",
      type: 'mine',
      productId: 0,
      projectId: 0,
      executionId: 0,
      acl: 'private',
      whitelist: { accounts: [], groupIds: [] },
      description: null,
      docSort: 'id_desc',
      isDefault: false,
      docCount: 0,
      sort: 3,
      createdBy: 'dev1',
      createdAt: '2026-06-04T00:00:00Z',
      updatedBy: null,
      updatedAt: null,
      lockVersion: 0,
      deletedAt: null,
    },
  )
  db.docCategories.push(
    { id: 1, docSpaceId: 1, parentId: 0, name: 'Design Docs', sort: 0 },
    { id: 2, docSpaceId: 1, parentId: 1, name: 'API Guides', sort: 0 },
    { id: 3, docSpaceId: 2, parentId: 0, name: 'Product Manual', sort: 0 },
    { id: 4, docSpaceId: 3, parentId: 0, name: 'Project Materials', sort: 0 },
  )
  db.docs.push(
    {
      id: 1,
      docSpaceId: 1,
      productId: 0,
      projectId: 0,
      executionId: 0,
      categoryId: 2,
      parentId: 0,
      path: ',1,',
      title: 'Sprint 1 API Guide',
      keywords: 'api login',
      type: 'markdown',
      status: 'published',
      acl: 'open',
      editors: { accounts: [], groupIds: [] },
      readers: { accounts: [], groupIds: [] },
      notifyAccounts: ['dev1'],
      views: 12,
      version: 2,
      hasDraft: true,
      sort: 0,
      createdBy: 'admin',
      createdAt: '2026-06-10T00:00:00Z',
      updatedBy: 'admin',
      updatedAt: '2026-09-10T00:00:00Z',
      lockVersion: 2,
      deletedAt: null,
    },
    {
      id: 2,
      docSpaceId: 1,
      productId: 0,
      projectId: 0,
      executionId: 0,
      categoryId: 1,
      parentId: 0,
      path: ',2,',
      title: 'Login Module Design Draft',
      keywords: null,
      type: 'markdown',
      status: 'draft',
      acl: 'open',
      editors: { accounts: [], groupIds: [] },
      readers: { accounts: [], groupIds: [] },
      notifyAccounts: [],
      views: 0,
      version: 0,
      hasDraft: true,
      sort: 1,
      createdBy: 'dev1',
      createdAt: '2026-09-12T00:00:00Z',
      updatedBy: null,
      updatedAt: null,
      lockVersion: 0,
      deletedAt: null,
    },
    {
      id: 3,
      docSpaceId: 1,
      productId: 0,
      projectId: 0,
      executionId: 0,
      categoryId: 0,
      parentId: 0,
      path: ',3,',
      title: 'Release Process (Private)',
      keywords: 'release',
      type: 'markdown',
      status: 'published',
      acl: 'private',
      editors: { accounts: ['admin'], groupIds: [] },
      readers: { accounts: ['dev1'], groupIds: [2] },
      notifyAccounts: [],
      views: 3,
      version: 1,
      hasDraft: false,
      sort: 2,
      createdBy: 'admin',
      createdAt: '2026-07-01T00:00:00Z',
      updatedBy: null,
      updatedAt: null,
      lockVersion: 1,
      deletedAt: null,
    },
    {
      id: 4,
      docSpaceId: 2,
      productId: 1,
      projectId: 0,
      executionId: 0,
      categoryId: 3,
      parentId: 0,
      path: ',4,',
      title: 'Product Manual',
      keywords: null,
      type: 'markdown',
      status: 'published',
      acl: 'open',
      editors: { accounts: [], groupIds: [] },
      readers: { accounts: [], groupIds: [] },
      notifyAccounts: [],
      views: 25,
      version: 1,
      hasDraft: false,
      sort: 0,
      createdBy: 'admin',
      createdAt: '2026-06-20T00:00:00Z',
      updatedBy: null,
      updatedAt: null,
      lockVersion: 1,
      deletedAt: null,
    },
    {
      id: 5,
      docSpaceId: 1,
      productId: 0,
      projectId: 0,
      executionId: 0,
      categoryId: 2,
      parentId: 1,
      path: ',1,5,',
      title: 'Appendix: Error Codes',
      keywords: 'error codes',
      type: 'markdown',
      status: 'published',
      acl: 'open',
      editors: { accounts: [], groupIds: [] },
      readers: { accounts: [], groupIds: [] },
      notifyAccounts: [],
      views: 4,
      version: 1,
      hasDraft: false,
      sort: 0,
      createdBy: 'admin',
      createdAt: '2026-08-01T00:00:00Z',
      updatedBy: null,
      updatedAt: null,
      lockVersion: 1,
      deletedAt: null,
    },
    {
      id: 6,
      docSpaceId: 3,
      productId: 0,
      projectId: 3,
      executionId: 0,
      categoryId: 4,
      parentId: 0,
      path: ',6,',
      title: 'Project Acceptance Checklist',
      keywords: null,
      type: 'markdown',
      status: 'published',
      acl: 'open',
      editors: { accounts: [], groupIds: [] },
      readers: { accounts: [], groupIds: [] },
      notifyAccounts: [],
      views: 2,
      version: 1,
      hasDraft: false,
      sort: 0,
      createdBy: 'admin',
      createdAt: '2026-08-05T00:00:00Z',
      updatedBy: null,
      updatedAt: null,
      lockVersion: 1,
      deletedAt: null,
    },
    {
      id: 7,
      docSpaceId: 4,
      productId: 0,
      projectId: 0,
      executionId: 0,
      categoryId: 0,
      parentId: 0,
      path: ',7,',
      title: "dev1's Scratch Notes",
      keywords: null,
      type: 'markdown',
      status: 'draft',
      acl: 'private',
      editors: { accounts: [], groupIds: [] },
      readers: { accounts: [], groupIds: [] },
      notifyAccounts: [],
      views: 0,
      version: 0,
      hasDraft: true,
      sort: 0,
      createdBy: 'dev1',
      createdAt: '2026-09-14T00:00:00Z',
      updatedBy: null,
      updatedAt: null,
      lockVersion: 0,
      deletedAt: null,
    },
  )
  db.docVersions.push(
    // 文档 1：v1/v2 发布快照 + v0 工作副本（含未发布修改 → hasDraft=true）
    {
      id: 1,
      docId: 1,
      version: 1,
      title: 'Sprint 1 API Guide',
      content: '# Sprint 1 API Guide\n\nLogin API returns a token.',
      digest: 'Sprint 1 API Guide Login API returns a token.',
      files: [],
      createdBy: 'admin',
      createdAt: '2026-06-10T00:00:00Z',
      updatedBy: null,
      updatedAt: null,
    },
    {
      id: 2,
      docId: 1,
      version: 2,
      title: 'Sprint 1 API Guide',
      content: '# Sprint 1 API Guide\n\nLogin API returns a token.\n\n## Changes\n\nAdd refresh API.',
      digest: 'Sprint 1 API Guide Login API returns a token. Changes Add refresh API.',
      files: [],
      createdBy: 'admin',
      createdAt: '2026-07-01T00:00:00Z',
      updatedBy: null,
      updatedAt: null,
    },
    {
      id: 3,
      docId: 1,
      version: 0,
      title: 'Sprint 1 API Guide',
      content:
        '# Sprint 1 API Guide\n\nLogin API returns a token.\n\n## Changes\n\nAdd refresh API.\n\n## Pending\n\nAdd error codes.',
      digest: 'Sprint 1 API Guide Login API returns a token. Changes Add refresh API. Pending Add error codes.',
      files: [],
      createdBy: 'admin',
      createdAt: '2026-09-10T00:00:00Z',
      updatedBy: 'admin',
      updatedAt: '2026-09-10T00:00:00Z',
    },
    // 文档 2：仅 v0 草稿工作副本
    {
      id: 4,
      docId: 2,
      version: 0,
      title: 'Login Module Design Draft',
      content: '## Goal\n\nSupport SMS captcha on login page.',
      digest: 'Goal Support SMS captcha on login page.',
      files: [],
      createdBy: 'dev1',
      createdAt: '2026-09-12T00:00:00Z',
      updatedBy: null,
      updatedAt: null,
    },
    // 文档 3/4/5/6：v1 快照 + 与快照一致的 v0（hasDraft=false）
    {
      id: 5,
      docId: 3,
      version: 1,
      title: 'Release Process (Private)',
      content: '# Release Process\n\n1. Freeze code\n2. Regression test\n3. Tag',
      digest: 'Release Process 1. Freeze code 2. Regression test 3. Tag',
      files: [],
      createdBy: 'admin',
      createdAt: '2026-07-01T00:00:00Z',
      updatedBy: null,
      updatedAt: null,
    },
    {
      id: 6,
      docId: 3,
      version: 0,
      title: 'Release Process (Private)',
      content: '# Release Process\n\n1. Freeze code\n2. Regression test\n3. Tag',
      digest: 'Release Process 1. Freeze code 2. Regression test 3. Tag',
      files: [],
      createdBy: 'admin',
      createdAt: '2026-07-01T00:00:00Z',
      updatedBy: null,
      updatedAt: null,
    },
    {
      id: 7,
      docId: 4,
      version: 1,
      title: 'Product Manual',
      content: '# Product Manual\n\nEnd-to-end process from story to release.',
      digest: 'Product Manual End-to-end process from story to release.',
      files: [],
      createdBy: 'admin',
      createdAt: '2026-06-20T00:00:00Z',
      updatedBy: null,
      updatedAt: null,
    },
    {
      id: 8,
      docId: 5,
      version: 1,
      title: 'Appendix: Error Codes',
      content: '| Code | Meaning |\n| --- | --- |\n| 40101 | Not signed in |',
      digest: 'Code Meaning 40101 Not signed in',
      files: [],
      createdBy: 'admin',
      createdAt: '2026-08-01T00:00:00Z',
      updatedBy: null,
      updatedAt: null,
    },
    {
      id: 9,
      docId: 6,
      version: 1,
      title: 'Project Acceptance Checklist',
      content: '# Project Acceptance Checklist\n\n- Story review done\n- Test runs closed',
      digest: 'Project Acceptance Checklist Story review done Test runs closed',
      files: [],
      createdBy: 'admin',
      createdAt: '2026-08-05T00:00:00Z',
      updatedBy: null,
      updatedAt: null,
    },
    // 文档 7：仅 v0（mine 库草稿）
    {
      id: 10,
      docId: 7,
      version: 0,
      title: "dev1's Scratch Notes",
      content: 'Quick note.',
      digest: 'Quick note.',
      files: [],
      createdBy: 'dev1',
      createdAt: '2026-09-14T00:00:00Z',
      updatedBy: null,
      updatedAt: null,
    },
  )
  db.todos.push(
    {
      id: 1,
      title: 'Prepare Sprint 1 acceptance materials',
      type: 'custom',
      objectId: 0,
      date: '2026-09-18',
      beginTime: '09:00',
      endTime: '10:30',
      priority: 1,
      description: 'Summarize acceptance results.',
      status: 'doing',
      isPrivate: false,
      assignee: 'admin',
      assignedBy: 'admin',
      assignedAt: '2026-09-18T01:00:00Z',
      finishedBy: null,
      finishedAt: null,
      closedBy: null,
      closedAt: null,
      createdBy: 'admin',
      createdAt: '2026-09-18T01:00:00Z',
      updatedBy: null,
      updatedAt: null,
      lockVersion: 0,
      deletedAt: null,
    },
    {
      id: 2,
      title: 'Fix login captcha not refreshing',
      type: 'bug',
      objectId: 1,
      date: '2026-09-18',
      beginTime: null,
      endTime: null,
      priority: 2,
      description: null,
      status: 'wait',
      isPrivate: false,
      assignee: 'dev1',
      assignedBy: 'admin',
      assignedAt: '2026-09-17T02:00:00Z',
      finishedBy: null,
      finishedAt: null,
      closedBy: null,
      closedAt: null,
      createdBy: 'admin',
      createdAt: '2026-09-17T02:00:00Z',
      updatedBy: null,
      updatedAt: null,
      lockVersion: 0,
      deletedAt: null,
    },
    {
      id: 3,
      title: 'Review login API integration results',
      type: 'task',
      objectId: 1,
      date: '2026-09-16',
      beginTime: '14:00',
      endTime: '15:00',
      priority: 2,
      description: null,
      status: 'done',
      isPrivate: false,
      assignee: 'dev1',
      assignedBy: 'dev1',
      assignedAt: '2026-09-15T02:00:00Z',
      finishedBy: 'dev1',
      finishedAt: '2026-09-16T07:00:00Z',
      closedBy: null,
      closedAt: null,
      createdBy: 'dev1',
      createdAt: '2026-09-15T02:00:00Z',
      updatedBy: null,
      updatedAt: null,
      lockVersion: 1,
      deletedAt: null,
    },
    {
      id: 4,
      title: 'History: upgrade build deps',
      type: 'custom',
      objectId: 0,
      date: null,
      beginTime: null,
      endTime: null,
      priority: 3,
      description: null,
      status: 'closed',
      isPrivate: false,
      assignee: 'admin',
      assignedBy: 'admin',
      assignedAt: '2026-09-01T01:00:00Z',
      finishedBy: null,
      finishedAt: null,
      closedBy: 'admin',
      closedAt: '2026-09-05T09:00:00Z',
      createdBy: 'admin',
      createdAt: '2026-09-01T01:00:00Z',
      updatedBy: null,
      updatedAt: null,
      lockVersion: 1,
      deletedAt: null,
    },
    {
      id: 5,
      title: "dev1's private todo",
      type: 'custom',
      objectId: 0,
      date: '2026-09-19',
      beginTime: null,
      endTime: null,
      priority: 3,
      description: 'Visible to creator/assignee only.',
      status: 'wait',
      isPrivate: true,
      assignee: 'dev1',
      assignedBy: 'dev1',
      assignedAt: '2026-09-19T01:00:00Z',
      finishedBy: null,
      finishedAt: null,
      closedBy: null,
      closedAt: null,
      createdBy: 'dev1',
      createdAt: '2026-09-19T01:00:00Z',
      updatedBy: null,
      updatedAt: null,
      lockVersion: 0,
      deletedAt: null,
    },
    {
      id: 6,
      title: 'Follow up SMS captcha login story',
      type: 'story',
      objectId: 1,
      date: '2026-09-21',
      beginTime: null,
      endTime: null,
      priority: 4,
      description: null,
      status: 'wait',
      isPrivate: false,
      assignee: 'admin',
      assignedBy: 'admin',
      assignedAt: '2026-09-18T01:00:00Z',
      finishedBy: null,
      finishedAt: null,
      closedBy: null,
      closedAt: null,
      createdBy: 'admin',
      createdAt: '2026-09-18T01:00:00Z',
      updatedBy: null,
      updatedAt: null,
      lockVersion: 0,
      deletedAt: null,
    },
  )
  // 周报快照：项目 3 的 2026-02-02（周一）那一周，数值与种子任务/工时口径一致（current 端点的重算结果同源）
  db.weeklyReports.push({
    id: 1,
    projectId: 3,
    weekStart: '2026-02-02',
    pv: 30,
    ev: 18,
    ac: 12,
    sv: -40,
    cv: -50,
    staff: 1,
    workload: { devel: 22, design: 6 },
    updatedAt: '2026-02-08T00:00:00Z',
  })
  // 燃尽日行：执行 5（迭代一）2026-02-02 起数日，末行 leftHours=16 与种子任务剩余合计一致
  db.burns.push(
    {
      id: 1,
      executionId: 5,
      burnDate: '2026-02-02',
      taskId: 0,
      estimateHours: 30,
      consumedHours: 0,
      leftHours: 40,
      storyPoint: 0,
    },
    {
      id: 2,
      executionId: 5,
      burnDate: '2026-02-03',
      taskId: 0,
      estimateHours: 30,
      consumedHours: 2,
      leftHours: 36,
      storyPoint: 0,
    },
    {
      id: 3,
      executionId: 5,
      burnDate: '2026-02-04',
      taskId: 0,
      estimateHours: 30,
      consumedHours: 4,
      leftHours: 28,
      storyPoint: 0,
    },
    {
      id: 4,
      executionId: 5,
      burnDate: '2026-02-05',
      taskId: 0,
      estimateHours: 30,
      consumedHours: 8,
      leftHours: 22,
      storyPoint: 0,
    },
    {
      id: 5,
      executionId: 5,
      burnDate: '2026-02-06',
      taskId: 0,
      estimateHours: 30,
      consumedHours: 10,
      leftHours: 16,
      storyPoint: 0,
    },
  )
}

/** P3 种子：项目集/项目/执行三级（一表三义，覆盖六状态与 acl 场景）+ 关联产品/需求 + 成员/干系人（project §2/§3.7/§3.8）。 */
function seedProjectDomain(): void {
  db.projects.push(
    {
      id: 1,
      type: 'program',
      parentId: 0,
      path: ',1,',
      grade: 1,
      name: 'Cloud Product Line',
      code: 'cloud-line',
      model: 'scrum',
      status: 'doing',
      priority: 1,
      beginDate: '2026-01-01',
      endDate: '2026-12-31',
      days: 200,
      acl: 'open',
      whitelist: [],
      sort: 0,
      pm: 'admin',
      progress: 30,
      estimateHours: 0,
      consumedHours: 0,
      leftHours: 0,
      createdBy: 'admin',
      createdAt: '2026-01-01T00:00:00Z',
      lockVersion: 0,
    },
    {
      id: 2,
      type: 'program',
      parentId: 1,
      path: ',1,2,',
      grade: 2,
      name: 'Cloud Platform Sub-Program',
      model: 'scrum',
      status: 'wait',
      priority: 2,
      beginDate: '2026-02-01',
      endDate: '2026-08-31',
      acl: 'open',
      whitelist: [],
      sort: 1,
      pm: 'dev1',
      progress: 0,
      createdBy: 'admin',
      createdAt: '2026-02-01T00:00:00Z',
      lockVersion: 0,
    },
    {
      id: 3,
      type: 'project',
      parentId: 1,
      path: ',1,3,',
      grade: 2,
      name: 'Demo Dev Project',
      code: 'zentao-dev',
      model: 'scrum',
      status: 'doing',
      priority: 1,
      beginDate: '2026-01-01',
      endDate: '2026-06-30',
      realBeganDate: '2026-01-05',
      days: 100,
      budget: 100000,
      budgetUnit: 'CNY',
      acl: 'open',
      whitelist: [],
      sort: 0,
      pm: 'admin',
      po: 'admin',
      qd: 'dev1',
      rd: 'admin',
      progress: 40,
      estimateHours: 120,
      consumedHours: 40,
      leftHours: 80,
      description: 'Demo project for execution and task flows.',
      createdBy: 'admin',
      createdAt: '2026-01-01T00:00:00Z',
      lockVersion: 0,
    },
    {
      id: 4,
      type: 'project',
      parentId: 2,
      path: ',1,2,4,',
      grade: 3,
      name: 'Cloud Private Project',
      model: 'waterfall',
      status: 'wait',
      priority: 2,
      beginDate: '2026-02-01',
      endDate: '2026-07-31',
      acl: 'private',
      whitelist: ['dev1'],
      sort: 1,
      pm: 'dev1',
      progress: 0,
      createdBy: 'admin',
      createdAt: '2026-02-02T00:00:00Z',
      lockVersion: 0,
    },
    {
      id: 5,
      type: 'sprint',
      parentId: 3,
      path: ',1,3,5,',
      grade: 3,
      name: 'Sprint 1',
      model: 'scrum',
      status: 'doing',
      priority: 1,
      beginDate: '2026-02-01',
      endDate: '2026-02-14',
      acl: 'open',
      whitelist: [],
      sort: 0,
      pm: 'admin',
      progress: 50,
      createdBy: 'admin',
      createdAt: '2026-02-01T00:00:00Z',
      lockVersion: 0,
    },
    {
      id: 6,
      type: 'stage',
      parentId: 3,
      path: ',1,3,6,',
      grade: 3,
      name: 'Milestone 1',
      model: 'waterfall',
      status: 'wait',
      priority: 3,
      beginDate: '2026-03-01',
      endDate: '2026-03-31',
      acl: 'open',
      whitelist: [],
      sort: 1,
      isMilestone: true,
      progress: 0,
      createdBy: 'admin',
      createdAt: '2026-03-01T00:00:00Z',
      lockVersion: 0,
    },
    {
      id: 7,
      type: 'kanban',
      parentId: 4,
      path: ',1,2,4,7,',
      grade: 4,
      name: 'Kanban Execution',
      model: 'kanban',
      status: 'wait',
      priority: 3,
      beginDate: '2026-02-10',
      endDate: '2026-04-30',
      acl: 'open',
      whitelist: [],
      sort: 0,
      progress: 0,
      createdBy: 'admin',
      createdAt: '2026-02-10T00:00:00Z',
      lockVersion: 0,
    },
  )
  db.projectProducts.push(
    { projectId: 3, productId: 1 },
    { projectId: 3, productId: 2 },
    { projectId: 4, productId: 2 },
  )
  db.projectStories.push(
    { projectId: 3, storyId: 1, productId: 1, sort: 0 },
    { projectId: 3, storyId: 2, productId: 1, sort: 1 },
  )
  db.teamMembers.push(
    {
      id: 1,
      objectType: 'project',
      objectId: 3,
      account: 'admin',
      role: 'PM',
      joinDate: '2026-01-01',
      days: 20,
      hours: 8,
      sort: 0,
    },
    {
      id: 2,
      objectType: 'project',
      objectId: 3,
      account: 'dev1',
      role: 'Dev',
      joinDate: '2026-01-02',
      days: 20,
      hours: 8,
      sort: 1,
    },
    {
      id: 3,
      objectType: 'execution',
      objectId: 5,
      account: 'dev1',
      role: 'Dev',
      joinDate: '2026-02-01',
      days: 10,
      hours: 8,
      sort: 0,
    },
  )
  db.stakeholders.push(
    {
      id: 1,
      objectType: 'program',
      objectId: 1,
      account: 'admin',
      type: 'inside',
      isKey: true,
      source: 'Internal',
      createdBy: 'admin',
      createdAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 2,
      objectType: 'project',
      objectId: 3,
      account: 'guest',
      type: 'outside',
      isKey: false,
      source: 'Customer',
      createdBy: 'admin',
      createdAt: '2026-01-03T00:00:00Z',
    },
  )
  db.activities.push({
    id: mockId(),
    objectType: 'project',
    objectId: 3,
    actor: 'admin',
    action: 'created',
    detail: null,
    remark: null,
    occurredAt: '2026-01-01T00:00:00Z',
  })
}

/** P3 · T-7 种子：看板空间（open/private 各一）→ 看板 → 列（含 WIP 上限）→ 卡片 + 阶段字典（累计 100）。 */
function seedBoardDomain(): void {
  db.stages.push(
    {
      id: 1,
      name: 'Requirements',
      percent: 20,
      type: 'request',
      projectModel: 'waterfall',
      sort: 0,
      createdBy: 'admin',
      createdAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 2,
      name: 'Design',
      percent: 20,
      type: 'design',
      projectModel: 'waterfall',
      sort: 1,
      createdBy: 'admin',
      createdAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 3,
      name: 'Development',
      percent: 40,
      type: 'dev',
      projectModel: 'waterfall',
      sort: 2,
      createdBy: 'admin',
      createdAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 4,
      name: 'Testing',
      percent: 20,
      type: 'qa',
      projectModel: 'waterfall',
      sort: 3,
      createdBy: 'admin',
      createdAt: '2026-01-01T00:00:00Z',
    },
  )
  db.boardSpaces.push(
    {
      id: 1,
      name: 'Dev Collaboration Space',
      type: 'cooperation',
      owner: 'admin',
      team: ['admin', 'dev1'],
      description: 'Team public board space.',
      acl: 'open',
      whitelist: [],
      status: 'active',
      sort: 0,
      createdBy: 'admin',
      createdAt: '2026-01-01T00:00:00Z',
      boards: [],
      lockVersion: 0,
    },
    {
      id: 2,
      name: 'Private Space',
      type: 'private',
      owner: 'dev1',
      team: ['dev1'],
      description: 'Visible to owner and whitelist only.',
      acl: 'private',
      whitelist: ['dev1'],
      status: 'active',
      sort: 1,
      createdBy: 'dev1',
      createdAt: '2026-02-01T00:00:00Z',
      boards: [],
      lockVersion: 0,
    },
  )
  db.boards.push(
    {
      id: 1,
      spaceId: 1,
      name: 'Sprint Board',
      owner: 'admin',
      team: ['admin', 'dev1'],
      description: 'Card flow within sprint.',
      acl: 'extend',
      whitelist: [],
      status: 'active',
      sort: 0,
      createdBy: 'admin',
      createdAt: '2026-01-02T00:00:00Z',
      lanes: [],
      cards: [],
      lockVersion: 0,
    },
    {
      id: 2,
      spaceId: 1,
      name: 'Bug Board',
      owner: 'dev1',
      acl: 'extend',
      whitelist: [],
      status: 'active',
      sort: 1,
      createdBy: 'dev1',
      createdAt: '2026-01-03T00:00:00Z',
      lanes: [],
      cards: [],
      lockVersion: 0,
    },
  )
  db.boardLanes.push(
    { id: 1, boardId: 1, name: 'To Do', color: '#1677ff', wipLimit: 3, archived: false, sort: 0 },
    { id: 2, boardId: 1, name: 'In Progress', color: '#faad14', wipLimit: 2, archived: false, sort: 1 },
    { id: 3, boardId: 1, name: 'Done', color: '#52c41a', wipLimit: -1, archived: false, sort: 2 },
    { id: 4, boardId: 2, name: 'New', color: '#ff4d4f', wipLimit: 1, archived: false, sort: 0 },
  )
  db.boardCards.push(
    {
      id: 1,
      boardId: 1,
      laneId: 1,
      name: 'SMS captcha login integration',
      status: 'doing',
      priority: 1,
      assignee: 'dev1',
      beginDate: '2026-02-02',
      endDate: '2026-02-06',
      estimateHours: 8,
      progress: 30,
      archived: false,
      sort: 0,
      lockVersion: 0,
    },
    {
      id: 2,
      boardId: 1,
      laneId: 1,
      name: 'API auth review',
      status: 'doing',
      priority: 2,
      assignee: 'admin',
      progress: 0,
      archived: false,
      sort: 1,
      lockVersion: 0,
    },
    {
      id: 3,
      boardId: 1,
      laneId: 2,
      name: 'Board drag-and-drop sorting',
      status: 'doing',
      priority: 1,
      assignee: 'dev1',
      estimateHours: 16,
      progress: 40,
      archived: false,
      sort: 0,
      lockVersion: 0,
    },
    {
      id: 4,
      boardId: 1,
      laneId: 3,
      name: 'Set up dev environment',
      status: 'done',
      priority: 3,
      progress: 100,
      archived: false,
      sort: 0,
      lockVersion: 0,
    },
    {
      id: 5,
      boardId: 2,
      laneId: 4,
      name: 'List pagination overflow',
      status: 'doing',
      priority: 2,
      assignee: 'dev1',
      progress: 0,
      archived: false,
      sort: 0,
      lockVersion: 0,
    },
    {
      id: 6,
      boardId: 1,
      laneId: 3,
      name: 'History card (archived)',
      status: 'done',
      priority: 4,
      progress: 100,
      archived: true,
      sort: 1,
      lockVersion: 0,
    },
  )
}

/** P3 · T-10 种子：执行下的任务（覆盖六状态、一层父子、逾期与工时三件套）+ 工时流水（task §3/§3b）。 */
function seedTaskDomain(): void {
  db.tasks.push(
    {
      id: 1,
      executionId: 5,
      projectId: 3,
      storyId: 1,
      parentId: 0,
      categoryId: 0,
      title: 'Login API integration',
      type: 'devel',
      priority: 1,
      status: 'doing',
      estimateHours: 16,
      consumedHours: 4,
      leftHours: 12,
      estStartedDate: '2026-02-02',
      deadline: '2026-02-10',
      assignee: 'dev1',
      assignedAt: '2026-02-01T00:00:00Z',
      startedAt: '2026-02-02T00:00:00Z',
      isParent: true,
      notifyAccounts: [],
      keywords: 'login integration',
      description: 'Integrate SMS captcha API with backend.',
      createdBy: 'admin',
      createdAt: '2026-02-01T00:00:00Z',
      lockVersion: 0,
    },
    {
      id: 2,
      executionId: 5,
      projectId: 3,
      storyId: 2,
      parentId: 0,
      categoryId: 0,
      title: 'WeCom login research',
      type: 'study',
      priority: 2,
      status: 'wait',
      estimateHours: 8,
      consumedHours: 0,
      leftHours: null,
      deadline: '2026-01-05',
      isParent: false,
      notifyAccounts: [],
      createdBy: 'admin',
      createdAt: '2026-01-04T00:00:00Z',
      lockVersion: 0,
    },
    {
      id: 3,
      executionId: 5,
      projectId: 3,
      storyId: 1,
      parentId: 1,
      categoryId: 0,
      title: 'Captcha API implementation',
      type: 'devel',
      priority: 1,
      status: 'done',
      estimateHours: 6,
      consumedHours: 4,
      leftHours: 0,
      assignee: 'dev1',
      startedAt: '2026-02-03T00:00:00Z',
      finishedBy: 'dev1',
      finishedAt: '2026-02-05T00:00:00Z',
      isParent: false,
      notifyAccounts: [],
      createdBy: 'admin',
      createdAt: '2026-02-01T00:00:00Z',
      lockVersion: 0,
    },
    {
      id: 4,
      executionId: 5,
      projectId: 3,
      storyId: 0,
      parentId: 1,
      categoryId: 0,
      title: 'Login page visual review',
      type: 'ui',
      priority: 3,
      status: 'pause',
      estimateHours: 4,
      consumedHours: 0,
      leftHours: 4,
      deadline: '2026-12-31',
      assignee: 'admin',
      isParent: false,
      notifyAccounts: [],
      createdBy: 'admin',
      createdAt: '2026-02-01T00:00:00Z',
      lockVersion: 0,
    },
    {
      id: 5,
      executionId: 5,
      projectId: 3,
      storyId: 0,
      parentId: 0,
      categoryId: 0,
      title: 'History task: legacy export',
      type: 'misc',
      priority: 4,
      status: 'cancel',
      estimateHours: 2,
      consumedHours: 0,
      leftHours: null,
      assignee: 'admin',
      canceledBy: 'admin',
      canceledAt: '2026-02-06T00:00:00Z',
      isParent: false,
      notifyAccounts: [],
      createdBy: 'admin',
      createdAt: '2026-02-05T00:00:00Z',
      lockVersion: 0,
    },
    {
      id: 6,
      executionId: 5,
      projectId: 3,
      storyId: 0,
      parentId: 0,
      categoryId: 0,
      title: 'Environment setup (closed)',
      type: 'affair',
      priority: 3,
      status: 'closed',
      estimateHours: 4,
      consumedHours: 4,
      leftHours: 0,
      closedBy: 'admin',
      closedAt: '2026-02-07T00:00:00Z',
      closedReason: 'done',
      isParent: false,
      notifyAccounts: [],
      createdBy: 'admin',
      createdAt: '2026-02-01T00:00:00Z',
      lockVersion: 0,
    },
    {
      id: 7,
      executionId: 5,
      projectId: 3,
      storyId: 0,
      parentId: 0,
      categoryId: 0,
      title: 'API auth review',
      type: 'design',
      priority: 2,
      status: 'done',
      estimateHours: 6,
      consumedHours: 6,
      leftHours: 0,
      assignee: 'dev1',
      startedAt: '2026-02-04T00:00:00Z',
      finishedBy: 'dev1',
      finishedAt: '2026-02-06T00:00:00Z',
      isParent: false,
      notifyAccounts: [],
      createdBy: 'admin',
      createdAt: '2026-02-02T00:00:00Z',
      lockVersion: 0,
    },
    {
      id: 8,
      executionId: 7,
      projectId: 4,
      storyId: 0,
      parentId: 0,
      categoryId: 0,
      title: 'Task under kanban execution',
      type: 'misc',
      priority: 3,
      status: 'wait',
      estimateHours: 2,
      consumedHours: 0,
      leftHours: null,
      isParent: false,
      notifyAccounts: [],
      createdBy: 'admin',
      createdAt: '2026-02-11T00:00:00Z',
      lockVersion: 0,
    },
  )
  db.efforts.push(
    {
      id: 1,
      taskId: 1,
      executionId: 5,
      projectId: 3,
      account: 'dev1',
      workDate: '2026-02-03',
      consumedHours: 2,
      leftHours: 14,
      work: 'API review',
      createdBy: 'dev1',
      createdAt: '2026-02-03T09:00:00Z',
    },
    {
      id: 2,
      taskId: 1,
      executionId: 5,
      projectId: 3,
      account: 'dev1',
      workDate: '2026-02-04',
      consumedHours: 2,
      leftHours: 12,
      work: 'Integration debugging',
      createdBy: 'dev1',
      createdAt: '2026-02-04T09:00:00Z',
    },
    {
      id: 3,
      taskId: 3,
      executionId: 5,
      projectId: 3,
      account: 'dev1',
      workDate: '2026-02-05',
      consumedHours: 4,
      leftHours: 0,
      work: 'Implementation done',
      createdBy: 'dev1',
      createdAt: '2026-02-05T09:00:00Z',
    },
    {
      id: 4,
      taskId: 7,
      executionId: 5,
      projectId: 3,
      account: 'admin',
      workDate: '2026-02-06',
      consumedHours: 6,
      leftHours: 0,
      work: 'Design review',
      createdBy: 'admin',
      createdAt: '2026-02-06T09:00:00Z',
    },
  )
  db.activities.push(
    {
      id: mockId(),
      objectType: 'task',
      objectId: 1,
      actor: 'admin',
      action: 'created',
      detail: null,
      remark: null,
      occurredAt: '2026-02-01T00:00:00Z',
    },
    {
      id: mockId(),
      objectType: 'task',
      objectId: 1,
      actor: 'dev1',
      action: 'started',
      detail: null,
      remark: null,
      occurredAt: '2026-02-02T00:00:00Z',
    },
  )
}

/** P2 种子：产品/分支/分类/计划/发布/构建/需求，覆盖各状态机状态与 ACL 场景（product §4、requirement §4）。 */
function seedProductDomain(): void {
  db.products.push(
    {
      id: 1,
      name: 'Demo Product',
      code: 'zentao',
      type: 'normal',
      status: 'normal',
      description: 'Demo product for story lifecycle.',
      po: 'admin',
      qd: 'dev1',
      rd: 'admin',
      acl: 'public',
      whitelist: [],
      sort: 0,
      createdBy: 'admin',
      createdAt: '2026-01-01T00:00:00Z',
      lockVersion: 0,
    },
    {
      id: 2,
      name: 'Cloud Platform',
      code: 'cloud',
      type: 'branch',
      status: 'normal',
      po: 'dev1',
      acl: 'private',
      whitelist: ['dev1'],
      sort: 1,
      createdBy: 'admin',
      createdAt: '2026-01-02T00:00:00Z',
      lockVersion: 0,
    },
    {
      id: 3,
      name: 'Archived Product',
      type: 'normal',
      status: 'closed',
      acl: 'public',
      whitelist: [],
      sort: 2,
      createdBy: 'admin',
      createdAt: '2026-01-03T00:00:00Z',
      closedAt: '2026-05-01T00:00:00Z',
      lockVersion: 0,
    },
  )
  db.branches.push(
    {
      id: 1,
      productId: 2,
      name: 'Trunk',
      isDefault: true,
      status: 'active',
      sort: 0,
      description: 'Default branch',
      lockVersion: 0,
    },
    { id: 2, productId: 2, name: 'feature-1', isDefault: false, status: 'active', sort: 1, lockVersion: 0 },
    {
      id: 3,
      productId: 2,
      name: 'legacy',
      isDefault: false,
      status: 'closed',
      sort: 2,
      closedAt: '2026-06-01T00:00:00Z',
      lockVersion: 0,
    },
  )
  db.categories.push(
    { id: 1, productId: 1, parentId: 0, type: 'story', name: 'User Center', owner: 'admin', sort: 0, lockVersion: 0 },
    { id: 2, productId: 1, parentId: 1, type: 'story', name: 'Sign In', sort: 0, lockVersion: 0 },
    { id: 3, productId: 1, parentId: 0, type: 'story', name: 'Orders', sort: 1, lockVersion: 0 },
    { id: 4, productId: 1, parentId: 0, type: 'bug', name: 'UI Defects', sort: 0, lockVersion: 0 },
    { id: 5, productId: 1, parentId: 0, type: 'case', name: 'Smoke Cases', sort: 0, lockVersion: 0 },
  )
  db.plans.push(
    {
      id: 1,
      productId: 1,
      parentId: 0,
      title: 'V1.0 Release Plan',
      status: 'doing',
      beginDate: '2026-09-01',
      endDate: '2026-10-31',
      createdBy: 'admin',
      createdAt: '2026-08-01T00:00:00Z',
      lockVersion: 0,
    },
    {
      id: 2,
      productId: 1,
      parentId: 1,
      title: 'V1.0 Sprint 1',
      status: 'wait',
      beginDate: '2026-09-01',
      endDate: '2026-09-20',
      lockVersion: 0,
    },
    {
      id: 3,
      productId: 1,
      parentId: 0,
      title: 'History Plan',
      status: 'closed',
      closedReason: 'done',
      finishedAt: '2026-07-01T00:00:00Z',
      closedAt: '2026-07-01T00:00:00Z',
      lockVersion: 0,
    },
  )
  db.releases.push(
    {
      id: 1,
      productId: 1,
      branchId: 0,
      buildId: 1,
      name: 'V0.9 Beta',
      status: 'normal',
      releaseDate: '2026-08-15',
      publishedAt: '2026-08-15',
      isMilestone: false,
      storyIds: [4],
      bugIds: [],
      notifyAccounts: ['admin'],
      lockVersion: 0,
    },
    {
      id: 2,
      productId: 1,
      branchId: 0,
      name: 'V1.0 Stable',
      status: 'normal',
      releaseDate: '2026-10-31',
      isMilestone: true,
      storyIds: [],
      bugIds: [],
      lockVersion: 0,
    },
  )
  db.builds.push(
    {
      id: 1,
      productId: 1,
      branchId: 0,
      name: 'build-20260815',
      buildDate: '2026-08-15',
      builder: 'admin',
      lockVersion: 0,
    },
    {
      id: 2,
      productId: 1,
      branchId: 0,
      name: 'build-20260901',
      buildDate: '2026-09-01',
      builder: 'dev1',
      lockVersion: 0,
    },
  )
  db.stories.push(
    {
      id: 1,
      productId: 1,
      branchId: 0,
      categoryId: 2,
      planId: 1,
      title: 'Support SMS captcha on login page',
      type: 'story',
      status: 'active',
      priority: 1,
      stage: 'developing',
      source: 'customer',
      assignee: 'dev1',
      assignedAt: '2026-08-02T00:00:00Z',
      reviewers: ['admin'],
      needNotReview: false,
      notifyAccounts: [],
      linkedStoryIds: [],
      version: 1,
      createdBy: 'admin',
      createdAt: '2026-08-01T00:00:00Z',
      lockVersion: 0,
    },
    {
      id: 2,
      productId: 1,
      branchId: 0,
      title: 'Support WeCom login',
      type: 'story',
      status: 'draft',
      priority: 2,
      stage: 'wait',
      source: 'manual',
      reviewers: ['admin'],
      linkedStoryIds: [],
      version: 1,
      createdBy: 'admin',
      createdAt: '2026-08-03T00:00:00Z',
      lockVersion: 0,
    },
    {
      id: 3,
      productId: 1,
      branchId: 0,
      title: 'Export order list',
      type: 'story',
      status: 'reviewing',
      priority: 3,
      stage: 'wait',
      source: 'market',
      reviewers: ['admin', 'dev1'],
      linkedStoryIds: [],
      version: 1,
      createdBy: 'dev1',
      createdAt: '2026-08-04T00:00:00Z',
      lockVersion: 0,
    },
    {
      id: 4,
      productId: 1,
      branchId: 0,
      title: 'Refactor login module',
      type: 'story',
      status: 'changed',
      priority: 2,
      stage: 'released',
      source: 'manual',
      reviewers: ['admin'],
      linkedStoryIds: [],
      version: 1,
      createdBy: 'admin',
      createdAt: '2026-07-20T00:00:00Z',
      lockVersion: 0,
    },
    {
      id: 5,
      productId: 1,
      branchId: 0,
      title: 'User center redesign (epic)',
      type: 'epic',
      status: 'active',
      priority: 1,
      stage: 'wait',
      source: 'manual',
      linkedStoryIds: [1, 2],
      version: 1,
      createdBy: 'admin',
      createdAt: '2026-07-01T00:00:00Z',
      lockVersion: 0,
    },
    {
      id: 6,
      productId: 1,
      branchId: 0,
      title: 'Business: unified login entry',
      type: 'requirement',
      status: 'active',
      priority: 2,
      stage: 'wait',
      source: 'customer',
      linkedStoryIds: [],
      version: 1,
      createdBy: 'admin',
      createdAt: '2026-07-02T00:00:00Z',
      lockVersion: 0,
    },
    {
      id: 7,
      productId: 1,
      branchId: 0,
      title: 'History story: legacy export',
      type: 'story',
      status: 'closed',
      priority: 4,
      stage: 'wait',
      source: 'other',
      closedBy: 'admin',
      closedAt: '2026-06-01T00:00:00Z',
      closedReason: 'done',
      linkedStoryIds: [],
      version: 1,
      createdAt: '2026-05-01T00:00:00Z',
      lockVersion: 0,
    },
    {
      id: 8,
      productId: 1,
      branchId: 0,
      title: 'Unassigned story: event tracking',
      type: 'story',
      status: 'active',
      priority: 3,
      stage: 'wait',
      source: 'manual',
      linkedStoryIds: [],
      version: 1,
      createdBy: 'admin',
      createdAt: '2026-08-10T00:00:00Z',
      lockVersion: 0,
    },
    {
      id: 9,
      productId: 2,
      branchId: 1,
      title: 'Cloud story: multi-tenant isolation',
      type: 'story',
      status: 'draft',
      priority: 2,
      stage: 'wait',
      source: 'manual',
      linkedStoryIds: [],
      version: 1,
      createdBy: 'admin',
      createdAt: '2026-08-11T00:00:00Z',
      lockVersion: 0,
    },
  )
  db.activities.push(
    {
      id: mockId(),
      objectType: 'product',
      objectId: 1,
      actor: 'admin',
      action: 'created',
      detail: null,
      remark: null,
      occurredAt: '2026-01-01T00:00:00Z',
    },
    {
      id: mockId(),
      objectType: 'story',
      objectId: 1,
      actor: 'admin',
      action: 'created',
      detail: null,
      remark: null,
      occurredAt: '2026-08-01T00:00:00Z',
    },
    {
      id: mockId(),
      objectType: 'story',
      objectId: 4,
      actor: 'admin',
      action: 'linked2release',
      detail: null,
      remark: 'V0.9 Beta',
      occurredAt: '2026-08-15T00:00:00Z',
    },
  )
}

/** P4 · T-2/T-5 种子：产品 1 下 Bug 三状态（confirmed/resolution 场景）+ 用例四状态（含步骤与 wait 评审场景）。 */
function seedQualityDomain(): void {
  db.bugs.push(
    {
      id: 1,
      productId: 1,
      branchId: 0,
      categoryId: 4,
      title: 'Login captcha not refreshing',
      keywords: 'login captcha',
      severity: 2,
      priority: 2,
      type: 'codeerror',
      os: 'windows',
      browser: 'chrome',
      steps: '1. Open login page\n2. Click captcha image',
      openedBuilds: 'build-20260815',
      status: 'active',
      confirmed: false,
      activatedCount: 0,
      assignee: 'dev1',
      assignedAt: '2026-09-01T08:00:00Z',
      relatedBugIds: [],
      notifyAccounts: [],
      createdBy: 'admin',
      createdAt: '2026-09-01T08:00:00Z',
      lockVersion: 0,
    },
    {
      id: 2,
      productId: 1,
      branchId: 0,
      categoryId: 4,
      title: 'Order export garbled text',
      severity: 3,
      priority: 3,
      type: 'others',
      openedBuilds: 'build-20260901',
      status: 'active',
      confirmed: true,
      activatedCount: 0,
      assignee: 'dev1',
      assignedAt: '2026-09-02T08:00:00Z',
      relatedBugIds: [3],
      notifyAccounts: [],
      createdBy: 'dev1',
      createdAt: '2026-09-02T08:00:00Z',
      lockVersion: 0,
    },
    {
      id: 3,
      productId: 1,
      branchId: 0,
      categoryId: 0,
      title: 'Homepage carousel occasionally blank',
      severity: 3,
      priority: 2,
      type: 'designdefect',
      openedBuilds: 'build-20260815',
      status: 'resolved',
      confirmed: true,
      activatedCount: 1,
      assignee: 'dev1',
      assignedAt: '2026-09-03T08:00:00Z',
      resolution: 'fixed',
      resolvedBy: 'dev1',
      resolvedAt: '2026-09-03T09:00:00Z',
      resolvedBuild: 'build-20260901',
      relatedBugIds: [2],
      notifyAccounts: [],
      createdBy: 'admin',
      createdAt: '2026-08-20T08:00:00Z',
      lockVersion: 0,
    },
    {
      id: 4,
      productId: 1,
      branchId: 0,
      categoryId: 0,
      title: 'History bug: legacy search crash',
      severity: 1,
      priority: 1,
      type: 'codeerror',
      openedBuilds: 'trunk',
      status: 'closed',
      confirmed: true,
      activatedCount: 0,
      assignee: 'dev1',
      assignedAt: '2026-08-01T08:00:00Z',
      resolution: 'duplicate',
      resolvedBy: 'dev1',
      resolvedAt: '2026-08-02T08:00:00Z',
      duplicateOfId: 1,
      closedBy: 'admin',
      closedAt: '2026-08-03T08:00:00Z',
      relatedBugIds: [],
      notifyAccounts: [],
      createdBy: 'admin',
      createdAt: '2026-08-01T08:00:00Z',
      lockVersion: 0,
    },
  )
  db.testCases.push(
    {
      id: 1,
      productId: 1,
      branchId: 0,
      libraryId: 0,
      categoryId: 5,
      title: 'Login success main flow',
      precondition: 'Account active with correct password',
      keywords: 'login smoke',
      priority: 1,
      type: 'feature',
      stage: ['smoke'],
      status: 'normal',
      steps: [
        { sort: 1, description: 'Open login page', expects: 'Login form visible' },
        { sort: 2, description: 'Submit correct credentials', expects: 'Redirects to home' },
      ],
      reviewers: ['admin'],
      reviewedAt: '2026-09-01T09:00:00Z',
      version: 1,
      createdBy: 'admin',
      createdAt: '2026-08-25T08:00:00Z',
      lockVersion: 0,
    },
    {
      id: 2,
      productId: 1,
      branchId: 0,
      libraryId: 0,
      categoryId: 5,
      title: 'Lockout after wrong password (pending review)',
      precondition: 'Repeated wrong password scenario',
      priority: 2,
      type: 'feature',
      stage: ['feature'],
      status: 'wait',
      steps: [{ sort: 1, description: 'Enter wrong password 6 times', expects: 'Account locked 10 minutes' }],
      reviewers: [],
      version: 1,
      createdBy: 'dev1',
      createdAt: '2026-09-05T08:00:00Z',
      lockVersion: 0,
    },
    {
      id: 3,
      productId: 1,
      branchId: 0,
      libraryId: 0,
      categoryId: 0,
      title: 'Export API performance case (blocked)',
      priority: 3,
      type: 'performance',
      stage: ['system'],
      status: 'blocked',
      steps: [],
      version: 1,
      createdBy: 'admin',
      createdAt: '2026-09-06T08:00:00Z',
      lockVersion: 0,
    },
    {
      id: 4,
      productId: 1,
      branchId: 0,
      libraryId: 0,
      categoryId: 0,
      title: 'Captcha refresh research',
      priority: 3,
      type: 'other',
      stage: [],
      status: 'investigate',
      steps: [],
      lastRunResult: 'fail',
      lastRunner: 'dev1',
      lastRunAt: '2026-09-10T08:00:00Z',
      version: 1,
      createdBy: 'dev1',
      createdAt: '2026-09-07T08:00:00Z',
      lockVersion: 0,
    },
  )
  db.activities.push(
    {
      id: mockId(),
      objectType: 'bug',
      objectId: 1,
      actor: 'admin',
      action: 'created',
      detail: null,
      remark: null,
      occurredAt: '2026-09-01T08:00:00Z',
    },
    {
      id: mockId(),
      objectType: 'testCase',
      objectId: 1,
      actor: 'admin',
      action: 'created',
      detail: null,
      remark: null,
      occurredAt: '2026-08-25T08:00:00Z',
    },
  )
}

function mockAccount(
  id: number,
  account: string,
  realName: string,
  status: NonNullable<AccountView['status']>,
  departmentId: number | null,
  roleIds: number[],
): MockAccount {
  return {
    id,
    account,
    realName,
    nickname: null,
    departmentId,
    email: `${account}@zentao.local`,
    mobile: null,
    phone: null,
    gender: 'm',
    birthday: null,
    joinedAt: null,
    avatarFileId: null,
    status,
    roleIds,
    fails: 0,
    lockedAt: null,
    lastActiveAt: null,
    createdBy: 'admin',
    createdAt: '2026-01-01T00:00:00Z',
    updatedBy: null,
    updatedAt: null,
    deletedAt: null,
    lockVersion: 0,
    password: 'admin123',
  }
}

export function resetMockData(): void {
  db.sessionActive = false
  db.currentAccountId = null
  db.accounts.length = 0
  db.roles.length = 0
  db.menus.length = 0
  db.rolePrivs.length = 0
  db.userRoles.length = 0
  db.departments.length = 0
  db.notifications.length = 0
  db.files.length = 0
  db.comments.length = 0
  db.activities.length = 0
  db.products.length = 0
  db.branches.length = 0
  db.categories.length = 0
  db.plans.length = 0
  db.releases.length = 0
  db.builds.length = 0
  db.stories.length = 0
  db.projects.length = 0
  db.projectProducts.length = 0
  db.projectStories.length = 0
  db.teamMembers.length = 0
  db.stakeholders.length = 0
  db.stages.length = 0
  db.boardSpaces.length = 0
  db.boards.length = 0
  db.boardLanes.length = 0
  db.boardCards.length = 0
  db.tasks.length = 0
  db.efforts.length = 0
  db.bugs.length = 0
  db.testCases.length = 0
  db.suites.length = 0
  db.testRuns.length = 0
  db.testRunCases.length = 0
  db.reports.length = 0
  db.docSpaces.length = 0
  db.docs.length = 0
  db.docVersions.length = 0
  db.docCategories.length = 0
  db.todos.length = 0
  db.weeklyReports.length = 0
  db.burns.length = 0
  db.auditLogs.length = 0
  db.dictTypes.length = 0
  db.dictData.length = 0
  db.onlineUsers.length = 0
  db.comments.push({
    id: 1,
    objectType: 'account',
    objectId: 2,
    content: 'Welcome',
    createdBy: 'dev1',
    createdAt: '2026-03-01T00:00:00Z',
  })
  db.settings.clear()
  db.columnPrefs.clear()
  db.langOverrides.clear()
  db.langImports.length = 0
  seed()
}

/** 测试夹具：给角色补权限码（等价于管理端在角色权限页勾上这些码）。 */
export function grantRolePrivileges(roleId: number, codes: string[]): void {
  for (const code of codes) {
    db.rolePrivs.push({ roleId, code })
  }
}

export function currentAccount(): MockAccount | null {
  if (!db.sessionActive || db.currentAccountId === null) {
    return null
  }
  return db.accounts.find((account) => account.id === db.currentAccountId) ?? null
}

export function privilegesOf(account: MockAccount | null): string[] {
  if (!account) {
    return []
  }
  if (account.roleIds.includes(1)) {
    return [...ALL_PRIVILEGE_CODES]
  }
  const roleIds = new Set(account.roleIds)
  return [...new Set(db.rolePrivs.filter((item) => roleIds.has(item.roleId)).map((item) => item.code))]
}

export function toAccountView(account: MockAccount): AccountView {
  const { password: _password, ...view } = account
  return view
}

/** 角色行 → 视图：成员数与权限码数现算（同后端 memberCount/privilegeCount）。 */
export function toRoleView(role: RoleRow): RoleView {
  return {
    ...role,
    memberCount: db.userRoles.filter((item) => item.roleId === role.id).length,
    privilegeCount: db.rolePrivs.filter((item) => item.roleId === role.id).length,
  }
}

export const error = (code: number, message: string) => ({
  error: { code, message, traceId: 'mock' },
})

export const UNAUTHENTICATED = error(40101, '未登录或会话已过期。')
export const MISSING_CSRF = error(40301, '缺少 CSRF 头。')
export const FORBIDDEN = (code: string) => error(40301, `缺少权限码 ${code}。`)
export const NOT_FOUND = error(40401, '资源不存在。')

seed()
