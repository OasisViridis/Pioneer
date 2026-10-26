# Issue #12 输入与继承资产交付核对

核对日期：2026-10-24。来源：[Issue #12](https://github.com/OasisViridis/Pioneer/issues/12)。远程状态通过 GitHub connector 与 `gh api` 只读复核。合同见 [P2 运行合同 v1](../specs/2026-10-24-p2-run-contract.md)。

## 版本与候选

| 输入 | 已核对版本 | 本地候选处置 |
| --- | --- | --- |
| 远程 main / 已合并 PR #8 | `336f8f8f031bae7ea460937ce7e93d2d7f856911`；PR head `868411ae17d88b59d003e8febf71d94511a0f632` | 新建隔离工作树，以远程 main 为基底 |
| #10 宿主研究 | `527c4c12df2c9985bb9d3f2ad71988255818a8f8`，2 个新增文件 | cherry-pick 为 `03481fb`，内容完整保留 |
| #11 只读预检 | `1ba2f6adb7b2bb4e1d340b6e45969fbca58830e2`，4 个新增文件 | cherry-pick 为 `c1be66b`，内容完整保留 |
| 继承主工作树 | HEAD `1ba2f6a` + 已修改/未跟踪 P0/P1、设计与学术等资产 | 原地保留；本候选不整包提交，不复用它的 node_modules/构建结果 |

候选分支为 `codex/issue12-run-contract`。#10/#11 的六个新增文件与 PR #8 的十二个变更文件无路径覆盖，cherry-pick 无冲突。历史文档中的 P1 测试数字仍是原 dirty tree 证据，不升级为本候选测试结果。#10 文档指向 P1 session IPC 的路径在远程基线尚不存在；那是当时继承树的研究上下文，不是 clean candidate 具备 P1 的证明。

## 继承树与 PR #8 的实质冲突及处理决定

| 文件/领域 | 差异 | 本次决定与 #13 接续规则 |
| --- | --- | --- |
| renderer/state/intent-workspace.ts | P1 将状态迁至 shared/contracts/intent-workspace，字段为 session、SUBMIT 增 ownerId；PR #8 为 runtime lifecycle、REQUEST_RUNTIME_START 并防重复 BOOTSTRAP | 本候选保留远程文件。#13 移入 P1 时保留独立产品会话和 ownerId；保留防重复初始化/历史不可变的行为，不能用旧 reducer 覆盖 PR #8 保护 |
| tests/e2e/m3-intent.e2e.spec.ts | P1 走 SessionWorkbench、可选摘要与持久化；PR #8 走旧 ProjectWorkspace 并断言两条生命周期事件 | 两组验证目的分别保留。P1 集成测试迁至新工作台；PR #8 的纯 lifecycle Contract Tests 保持通过，不把旧启动占位符映射成 running |
| App、main/preload/ipc、session store、window lifecycle、playwright config | P1 是大范围未提交接线，含独立会话/布局/关闭保存与恢复 | #12 仅固定独立 Run 合同，不改旧会话 schema；#13 实施前先做 P1 窄范围交付清单/整合门禁，禁止把未跟踪资产自动纳入发布 |
| docs/design、renderer/assets、学术资料、.drops、历史文档重排 | 不属于运行合同的继承资产 | 留在原工作树；本候选不复制、不删除、不上传 |

P1 的 session 状态与 PR #8 的两事件 lifecycle 都不是 main 授权源。新 Run 引用产品 sessionId + 本轮 revision，旧意图/生命周期只读保存；迁移不启动、不授予能力、不产生模型输出。该处理决定固定了兼容路径，具体工作台迁移留在 #13 的 A07，不扩展 #12 成为全量 P1 重交付。

## 交付状态与限制

- #12 本轮原生 blocked_by 返回空列表；#13 的 open blocker 为 #12。#10/#11 已归并关闭。
- 本候选合并了远程 PR #8 与本地 #10/#11，随后经用户授权以 PR #15 合并入远程 `main`（merge commit `0410d5a`）；远程 main 已包含 #10/#11 与 #12 新增合同。原文「尚未推送、创建 PR 或合并」为 2026-10-24 候选交付时的状态，不再成立。
- 继承主工作树不发生 checkout/reset/clean，未修改用户文件。隔离候选的干净检出验证及日志单独记录在 [验证报告](issue12-verification.md)。
- Issue #12 已于 2026-10-24 关闭（决策见关票评论）；#13 随后启动。真实 Provider、Pi 成品加载与生产运行注册表均由 #13 另行实施/验证。
