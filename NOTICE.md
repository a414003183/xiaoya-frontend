# 来源与许可（NOTICE）

## 上游项目

本仓库是[禅道（ZenTao）](https://www.zentao.net/)开源版**管理后台前端**的重写实现，
上游仓库为 <https://gitee.com/wwccss/zentaopms>。

上游项目的授权声明（上游 `COPYING` 原文）：

> The source code of zentao is covered by the following dual licenses:
> (1) ZPL  1.2: http://zpl.pub/page/zplv12.html
> (2) AGPL 3.0: https://www.gnu.org/licenses/agpl-3.0.en.html
> You can choose ZPL or AGPL to use zentao.

上游著作权人：禅道软件（青岛）有限公司。

## 本仓库与上游的关系

衍生自上游产品设计的内容：

- 领域模型与信息架构：产品 / 需求 / 项目 / 执行 / 任务 / Bug / 用例 / 文档等
- 文案与术语：`frontend/packages/i18n/src/locales/*.json`
- 菜单树、权限码与角色设计（决定页面与按钮的可见性）
- API 契约副本 `contract/openapi.yaml`，以及由它生成的 `frontend/packages/api-client/src/generated/**`

本仓库新写的内容：

- 前端实现代码（React / Vite / antd）、组件库、i18n 与工程配置、测试与端到端用例
- 工程门禁脚本 `tools/`（契约 diff、域边界、语言键、路由生成、bundle 预算等）

上游的前端实现未复制进本仓库。

## 许可

本仓库以 **AGPL-3.0**（GNU Affero General Public License, version 3）发布，全文见 [LICENSE](LICENSE)。
这是上游双授权中的一个可选分支：以该分支分发衍生作品需履行同许可开源与源码提供义务，本仓库本身即为完整源码；
以网络服务形式对外提供修改版时，须向使用者提供对应源码（AGPL 第 13 条）。

本仓库新实现部分的著作权归其作者所有（见提交历史），同样以 AGPL-3.0 授权。

## 修改说明

本仓库是对上游产品的**独立重写**，并非对上游源文件的逐行修改：实现语言、目录结构、依赖与内部设计均为新写。
若衍生内容与上游表述存在差异，以本仓库代码与其契约为准。

## 商标

`禅道`、`ZenTao`、`zentao` 等名称与标识归其权利人所有。本仓库仅在说明来源与兼容性时使用
（例如 npm 包名 `@zentao/*`、登录页标题），不表示获得商标授权，也不表示与上游存在隶属关系。

---

This repository is an independent re-implementation derived from the ZenTao open-source project
(<https://gitee.com/wwccss/zentaopms>), distributed under the GNU AGPL-3.0 (see [LICENSE](LICENSE)).
The upstream copyright holder is ZenTao Software (Qingdao) Co., Ltd. "ZenTao" and "禅道" are its marks.
