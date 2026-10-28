# #37 本地 Codex 接手入口

2026-10-28。分支 `codex/issue37-design-evidence`，PR [#51](https://github.com/OasisViridis/Pioneer/pull/51)。用户已要求准备 GitHub 代码交给本地 Codex；没有授权合并、部署接收器或购买服务。不要再次要求用户逐张审阅本轮已受托接受的四张截图。

## 当前事实

- Windows 视觉、真实行为检查与基线审阅已完成，具体最终 SHA/CI 在 PR 正文。
- 新增 `design:external`：真正的 Dev Resources GET/POST 客户端、写入前证据核验、只补缺项、部分成功/超时回读、容量检查；默认只预览，显式 `--apply` 且审批记录 `approved: true` 才写入。
- 新增事件检查器：passcode、Webhook ID、白名单/发布标签、服务端历史版本顺序、分页、固定版本节点读取、已有 S2 PR 查找、确定性快照及 S2 请求转换。没有第二个业务状态库。
- **事件检查器不是已部署的接收器，也不是无人值守实现 Agent。** 新事件返回 `awaiting-local-agent`（退出码 1），现有 PR 返回 `existing-delivery`。快照材料不会自行创建 PR。当前可走本地 Codex 的 S2 实现/发布流程；全自动 `repository_dispatch` 消费者仍需本地选择获准执行环境后实现与验收。
- Code Connect 只读探测 `get_code_connect_suggestions(921:706)` 再次返回套餐/seat 限制。保留 S1 轻量映射，不设置 `officialCodeConnectPublished`。官方当前套餐文档与 MCP 提示存在差异，须核验实际文件所属团队与授权；不能仅凭旧提示要求购买。
- 自动测试使用受控服务边界，不能代替真实 Figma 投递/写入记录。#37、#33 仍 Open；未设置 COMPLETED。

## 本地开工

先读根部 `AGENTS.md`、`themasterplan/THEMASTERPLAN.md` 和本文件。保留用户已有工作副本修改，必要时建独立 worktree；不要使用强制重置。确认远端 PR head，拉取此分支，执行：

```powershell
pnpm install --frozen-lockfile
pnpm verify:repository
pnpm design:check
pnpm check
```

这里只需要 Node 24、仓库锁定的 pnpm 和已登录的 `gh`。新工具没有新增 npm 依赖。Windows 环境指纹漂移时单独检查，不自动接受新截图。

## A. 合并后的 Dev Resources 回填

**对象必须是经 S2 交付的 PR**：`codex/design-<featureId>` 分支、固定 package 和 S2 元数据必须一致。PR #51 是基础设施 PR，不含自己的 S2 package，不能把 `51 + s2-design-delivery` 伪装成关联交付。旧 #36 的历史 PR 若没有同 merge SHA 的完整视觉门禁，也会拒绝；先取得真实符合条件的试点。

1. 取得明确合并/外部发布授权；目标 S2 PR 合并后，同一 merge SHA 的 main quality 两个 job 必须通过。不能用 PR head 的绿灯替代 merge SHA。
2. 准备目标 merge commit 中已存在的 `docs/**/*.md` 验收记录，注明实际人工/受托/Provider 范围。审批文件复制到忽略的 `tmp/`，填入真实 PR、featureId、merge SHA 和固定文档 URL。审批文件不是凭证，也不能由 CI 自动改为已批准。
3. 通过本地安全环境注入 `FIGMA_ACCESS_TOKEN`，需要 `file_dev_resources:read` 和 `file_dev_resources:write`。不要把令牌放进命令行、截图、PR、日志或示例文件。

```powershell
New-Item -ItemType Directory -Force tmp/design-external
Copy-Item design/delivery/writeback-approval.example.json tmp/design-external/approval.json
# 编辑 approval.json；先保留 approved:false 查看预览。
pnpm design:external writeback <S2_PR_NUMBER> <FEATURE_ID> tmp/design-external/approval.json
# 已有具体授权且预览正确后，才把 approved 设为 true：
pnpm design:external writeback <S2_PR_NUMBER> <FEATURE_ID> tmp/design-external/approval.json --apply
```

输出 `tmp/design-external/receipt.json`。`links-verified` 只表示所有目标链接已实际回读；Code Connect、Provider 和人工验收不会自动变为成功。403/429/部分失败会非零退出；429 遵守回执 `retryAfter`，修复后重跑同一命令。POST 不自动重试，下一次调用先读已有资源。每节点最多十个 Dev Resources；容量不足返回 `capacity-blocked`，不删除人工链接，也不覆盖资源名。一次成功后重跑三次，确认零新增链接。

该命令只允许 GitHub GET 与 Figma Dev Resources GET/POST，不评论、不删资源、不创建命名版本。不要替换成通用任意 URL 的客户端。

## B. 真实版本事件 → 固定材料 → 本地 S2

先在现有 feature registry 审阅一个**真实未完成任务**；不要复用已关闭 #36 当作新产品任务。配置只取注册的 Issue、文件、节点、变更类型和行为边界。下面是配置结构，不是可直接启用的试点：

```json
{
  "schemaVersion": 1,
  "enabled": true,
  "webhookId": "实际已获准Webhook的ID",
  "routes": [
    {
      "featureId": "已审阅并登记的featureId",
      "label": "Pioneer READY 已审阅并登记的featureId",
      "nodes": ["921:706"],
      "changeType": "ui",
      "behaviorChanges": []
    }
  ]
}
```

`events.example.json` 默认 disabled、空路由。复制到 `tmp/design-external/events.json` 后配置，环境注入至少 16 字符随机 `FIGMA_WEBHOOK_PASSCODE`。读取固定版本还需要 `file_versions:read`、`file_content:read`。没有凭证/权限时保留阻塞，不下载活画布冒充历史版本。

获准的 n8n/HTTPS 接收器应保留原始 `FILE_VERSION_UPDATE` JSON 供本地检查，含 passcode 的原始事件只在受控本地保存，**不上传 GitHub 或 Actions artifacts**。配置接收器关闭请求正文/成功数据日志；正式启用前核验该设置，不能只在下游删掉 passcode。未验证 passcode 的请求不得触发实现。

```powershell
pnpm design:external event-inspect tmp/design-external/received-event.json tmp/design-external/events.json
```

输出同一事件键下的 `<KEY>.snapshot.json` 和 `<KEY>.material.json`。字段含固定 version、节点、base SHA 和 snapshot hash；不会保存事件 passcode/description/user 信息或下载远程图片。三次重放复用键；收到旧版本按 Figma 历史时间忽略，不能依靠事件 timestamp 排序。普通编辑/PING 明确忽略；任意事件自带 nodes/featureId/issue/command/prompt 被拒绝。

首次保存后，即使 main 前进，重放仍保留最初的 base SHA；后续 S2 会独立检查基线是否过期。若材料不完整、内容冲突或同一事件的写入锁仍存在，返回 `review-required`，保留现场供人工检查；确认无进程正在写入并核对材料后，再由操作员处理中断留下的锁或不完整文件。

当状态为 `awaiting-local-agent` 时：

1. 审阅快照范围和设计差异。文件只包含节点结构与部分文字/布局，缺少图像/矢量等视觉输入时补充受审材料，不声称能够离线还原像素。
2. 按 material 的 `snapshotPath` 将对应 snapshot **原样复制**到专用分支，只暂存这一个文件。常规 Git 提交后记录 snapshot commit，不能把未提交材料当固定输入。复制后不要通过格式化改变字节；若确需修订须重新取证/计算与审核。
3. 使用以下命令重新通过现有 S2 校验；工具会按 commit 读取 snapshot、核对 hash/节点/映射，不能直接信任可编辑的 material。

```powershell
pnpm design:external event-request tmp/design-external/<KEY>.material.json <SNAPSHOT_COMMIT>
pnpm design:delivery prepare tmp/design-external/<FEATURE_ID>.request.json
# 仅 ready-for-agent 才允许本地 Codex 实现。materials-only 要先解决原 Issue 阻塞。
# 实现后只暂存获准的代码；snapshot 应已独立提交，不混入输出 Diff。
pnpm verify:repository
pnpm check
pnpm design:delivery capture tmp/design-external/<FEATURE_ID>.request.json
pnpm design:delivery deliver tmp/design-external/<FEATURE_ID>.request.json tmp/design-delivery/<FEATURE_ID>-output.json
pnpm design:delivery verify <RETURNED_PR>
```

注意：`capture` 相对 baseSha 读取整个暂存树。快照提交必须在独立 source worktree，实际实现 worktree 从 material 的 baseSha 开始；用 `git fetch` 取得 snapshot commit 供 `git show` 读取，**不要将快照 commit 合并入实现 worktree**，否则会把快照混入实现 Diff。S2 发布仍复用稳定分支与单活跃 PR；同一输入已有 PR 返回同一 PR，有不同活动版本返回 `review-required`，不覆盖人工修改。

这条路径完成的是本地接手流程。最终验收仍必须使用接收器捕获的真实 Figma 命名版本事件，不能用手工 JSON 宣称自动链路已完成。

## C. 自动消费者与 Code Connect：明确待接手

自动消费者不是加一个打印 payload 的 workflow。依照原 #37 顺序，**先验收 A，再部署事件入口**。本地 Codex 必须在获准执行环境中完成：

1. 让成熟接收器校验 passcode、Webhook ID 与事件白名单后，只将受限 file/version 引用交给 GitHub dispatch；原始 passcode 不进入 GitHub。接收器 HTTP 成功响应必须晚于可靠交接，失败保留重试；限制请求体和并发，不把 label/description 拼为 shell 或系统指令。
2. 将 GitHub dispatch 消费者与这里的固定版本核验/S2 prepare 接通。消费者再次核验服务端版本和节点，按 feature 串行，复用 S2 分支去重；不以收到事件就视为成功。选择本地 Codex 或官方受支持执行环境，明确成本、令牌权限与隔离方式后再启用。当前仓库没有自动调用模型的凭证或授权，不提供默认开启的付费工作流。
3. 固化快照 commit 后，由隔离实现过程产出 S2 output，再由独立发布传输执行 S2 deliver。模型不接收 Figma/GitHub 发布令牌。失败状态保留在现有任务/PR/运行证据，不能新造已完成业务记录。
4. Code Connect：先核验组件已发布到团队库以及实际套餐/权限。按 Figma `figma-code-connect` 技能读取已发布组件属性，沿用 `component-mappings.json` 与 `component-examples.tsx` 中保留的差异，生成 `.figma.ts` 模板。不要猜 props，也不要把 PanelTab 伪装成不存在的运行时 Tabs 接口。
5. 在独立临时工具目录安装并锁定获准的官方 `@figma/code-connect` CLI 版本，使用环境令牌。先 `figma connect parse` 和 `figma connect publish --dry-run --exit-on-unreadable-files`；核对范围后实际 publish 并在目标节点回读。不使用 `--force`、`--skip-validation` 或自动标记 COMPLETED。未发布成功前 `officialCodeConnectPublished` 保持 false。

本次没有生成猜测的 Code Connect 模板：实际 MCP 拒绝了属性/发布能力探测，不能把已有快照当作已发布组件的实时定义。待本地连接解除限制后按上述入口补齐；若仍无权益，保留阻塞即可。

## 最后验收与回交

| 项目           | 必须保留的真实证据                                                                                  |
| -------------- | --------------------------------------------------------------------------------------------------- |
| 回填           | merge SHA、同 SHA CI、原节点上的 Issue/PR/commit/CI/package/验收链接、回读结果                      |
| 重试           | 真实部分失败/超时或可审计失败演练；恢复后只补缺项、不重复评论、不删除人工资源                       |
| Code Connect   | 官方 CLI 版本、dry-run、发布输出、节点读回；账户拒绝则保持 blocked                                  |
| 事件成功       | Figma 投递记录 → 获准接收器 → S2 → Draft PR → 最终 head CI                                          |
| 去重与错误路径 | 同一真实事件重放三次只有一个 PR；错 passcode、文件/节点越界、旧版本、普通编辑、循环、过期凭证、限流 |
| 状态边界       | #33 Open、无自动 COMPLETED、真人/Provider 验收按实际记录，不借自动测试冒充                          |

证据脱敏后写入 `docs/testing/issue37-verification.md` 并更新 PR；没有真实结果的格子保留未完成。所有提交最终重新执行 Windows `pnpm check` 与视觉 job。不要自动关闭 #37，直到它的回传、事件和错误路径全部满足。

## 官方接口依据

- [Dev Resources：部分 200、每节点容量和 URL 去重](https://developers.figma.com/docs/rest-api/dev-resources-endpoints/)
- [Webhook 事件字段](https://developers.figma.com/docs/rest-api/webhooks-events/)与[passcode](https://developers.figma.com/docs/rest-api/webhooks-security/)
- [版本历史与分页](https://developers.figma.com/docs/rest-api/version-history-endpoints/)
- [Code Connect CLI](https://developers.figma.com/docs/code-connect/cli-reference/)

## 给本地 Codex 的接手提示

> 继续 OasisViridis/Pioneer Issue #37，检出 PR #51 的最新 head，先阅读 docs/workflow/issue37-local-handoff.md。视觉核验已由用户委托 Codex 完成，不要再让用户看图验收。保留已有修改，按文档先验证 Dev Resources 回填，再接获准的真实事件接收器与 S2 消费者。使用现有凭证时不打印或提交秘密；没有具体合并/外部发布授权时先准备可审阅结果。所有未执行的真实集成都保留 blocked，不关闭 #33、不标记 Figma COMPLETED。最后回读新 head 的完整 Windows CI，并把真实链接更新到 PR。
