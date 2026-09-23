// 域出口白名单（01 §3.2）：跨域只准 import 本文件。

// T19 P2-1：侧栏菜单源。app 组装层取 /menus/my 的合并菜单树（失败回落静态 navigation），
// 管理页改完菜单后按 MY_MENUS_KEY 失效重取。
// T26：MENU_ROUTES_KEY 是路由表缓存（动态路由 + 菜单表单的页面选择器共用）。
export {
  fetchMenuRoutes,
  fetchMyMenus,
  fileDownloadUrl,
  MENU_ROUTES_KEY,
  MENU_TREE_KEY,
  MY_MENUS_KEY,
  NOTIFICATION_STREAM_URL,
} from './api/platform.api'
export { ActivityTimeline } from './components/activity-timeline'
export { CommentPanel } from './components/comment-panel'
export { FileUploadField } from './components/file-upload-field'
export { eventSourceFactory, NotificationBell } from './components/notification-bell'
