import { authHandlers, resetMockSession } from './auth-handlers'
import { boardHandlers } from './board-handlers'
import { columnPrefHandlers } from './column-pref-handlers'
import { docHandlers } from './doc-handlers'
import { orgHandlers } from './org-handlers'
import { platformHandlers } from './platform-handlers'
import { productHandlers } from './product-handlers'
import { projectHandlers } from './project-handlers'
import { qualityHandlers } from './quality-handlers'
import { qualitySuiteHandlers } from './quality-suite-handlers'
import { qualityTestRunHandlers } from './quality-testrun-handlers'
import { storyHandlers } from './story-handlers'
import { taskHandlers } from './task-handlers'
import { workspaceHandlers } from './workspace-handlers'

/** MSW handlers 全集：与 contract/openapi.yaml 端点一一对应，新增端点先补 mock。 */
export const handlers = [
  ...authHandlers,
  ...platformHandlers,
  ...columnPrefHandlers,
  ...orgHandlers,
  ...productHandlers,
  ...storyHandlers,
  ...projectHandlers,
  ...boardHandlers,
  ...taskHandlers,
  ...qualityHandlers,
  ...qualitySuiteHandlers,
  ...qualityTestRunHandlers,
  ...docHandlers,
  ...workspaceHandlers,
]
export { resetMockData } from './db'
export { resetMockSession }
