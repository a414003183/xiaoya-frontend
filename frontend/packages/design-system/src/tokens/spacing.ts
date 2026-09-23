/**
 * 语义令牌（06 A2-1 / D-A3）：间距与容器宽的唯一出口。
 * 规范：间距只取阶梯刻度（Tailwind 类用对应刻度：4=1、8=2、12=3、16=4、24=6、32=8）；
 * 页面宽度只有三态——全宽（列表/详情）、窄页 720（表单/设置类）、登录卡 360；
 * 颜色一律走 antd token / cssVar（--zt-*），裸色由 tools/contract-check/check-raw-styles.mjs 拦截。
 */
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const

export const pagePadding = 24
export const narrowPageWidth = 720
export const authCardWidth = 360
/** 列表页左侧部门树卡的固定宽（06 A3-4：240 侧树保留但宽度入令牌）。 */
export const sideTreeWidth = 240
/** 筛选表单控件宽度：输入类 200、选择类 160——同一页里同类控件等宽，不由每页各写一个数。 */
export const filterInputWidth = 200
export const filterSelectWidth = 160

/**
 * 应用外壳尺寸（UI 三项修订 2026-09-20：左列由侧栏独占——品牌 / 菜单搜索 / 菜单 / 底部工具条，
 * 右侧只有页签条与页面；侧栏底部收起钮不再占一行标题栏）。
 */
export const siderWidth = 232
export const siderCollapsedWidth = 80
/** 侧栏一级栏宽（用户裁决 2026-09-20：一级＝图标+名称的纵向栏，点击不下拉、只切换右侧二级栏）。
 *  收起态即整个侧栏宽度（只剩一级栏，图标居中）。 */
export const siderRailWidth = siderCollapsedWidth
/** 侧栏品牌区高度（与旧 Header 同高，折叠态只留品牌标记居中）。 */
export const siderBrandHeight = 56

/**
 * 弹窗内容区最大高（UI 三项修订 2026-09-20「弹窗高度统一」）：内容超出时在**弹窗体内**滚动，
 * 标题与底部按钮恒定可见；留白给标题（~57）+ 底部（~69）+ 视口上下呼吸位。
 */
export const modalBodyMaxHeight = 'calc(100vh - 220px)'

/**
 * 弹窗缺省宽（用户要求「所有的弹窗……可以小一点，不用小太多」）：antd 缺省 520，收到 480；
 * 页面显式传 width 的（560/640/760…）照旧覆盖，不受影响。
 */
export const modalDefaultWidth = 480

/**
 * 弹窗体右侧给滚动条留的间隙（用户要求「弹窗的滑动条离输入框太远一点，可以远一点」）：
 * antd 6 的内容内衬挂在 `.ant-modal-container` 上（20/24），真正滚动的 `.ant-modal-body` 自身
 * padding 为 0——滚动条因此紧贴输入框右沿，故在滚动体上补一格（spacing.md）间距。
 */
export const modalBodyScrollBarGap = spacing.md
