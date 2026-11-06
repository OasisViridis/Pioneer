# Agent 按任务修改文本（Issue #91）

来源：[Issue #91](https://github.com/OasisViridis/Pioneer/issues/91)。业主于 2026-11-05 明确要求参考成熟 Agent 应用，Diff 保留查看入口，不作为每次修改的审批步骤。实现基线为 `6c494ddfa00fc083317a06d2abb1c3c0b9eedfe5`。

## 用户行为与边界

在运行控制中选择“工作区内修改”、一个已有文本文件，再输入任务并启动。默认只读；权限选择不跨应用重启恢复。任务完成或停止后，界面显示实际文件结果；“查看改动”主动打开改动面板，结果到达不会自动开面板或移动焦点。

本片支持一个已有 UTF-8 文本文件、一次精确文本替换，修改后最多 64 KiB。Agent 先读取或搜索，`edit_file` 的 `oldText` 必须在当前文件唯一匹配；保留其余字节和换行。没有创建、删除、重命名、任意命令、多文件编辑或自动撤销。多个任务可以继续修改同一文件。

权限选择在当前运行控制中保留。启动时由 main 把显式选择与 Session、Project、窗口代次、材料清单一起绑定；模型没有权限字段。运行中先停止，再切换模式。只有读权限的 Grant 不会自动获得写权限。本片将显式的写入选择保存在 main 的运行授权记录，再为已有 writer 构造限定目标的 WritePermission；它没有宣称完成 #18 的四档、可独立升降级的会话权限服务。#18 中完整模式与恢复的规划不作为此片已实现能力。

## 复用与检查

- 复用 Pi 的工具桥接、串行调用队列和停止收敛；工具只传路径与旧/新文本，权限、原文件状态和写后哈希由 main 生成。
- 复用 #19 的路径、链接、敏感文件、UTF-8、身份/内容、原子替换、写后核对和 journal。所有 writer 调用共用队列，防止两个 Run 或旧受控入口交错通过检查。
- 写入前核对授权材料哈希；最终写入前再次核对文件身份和内容。成功后只将已核实的自身写入内容加入本次可读材料，不扩大文件范围。
- 原子写入在创建临时文件前及 rename 前检查取消。停止不回滚：已写入的结果保留并展示；终态等待已开始的写入核对结束。未知或核对失败不得显示已写入成功。
- 修改前后文本与结果随现有最新 RunSnapshot 保存，受既有会话文件大小上限约束；不另存无人消费的完整源码副本。原 journal 保留写入意图与哈希结果。进程崩溃且快照尚未保存时不承诺恢复 Diff；自动恢复执行器仍属 #20。
- 原固定 marker 的审批演示 UI 和对应 UI 测试已退役；writer/IPC 的安全契约测试保留。历史 #19 验证记录仍描述当时的候选，不能作为当前 UI 说明。

## 技术选择

[Claude Code permissions](https://code.claude.com/docs/en/permissions) 的编辑授权与 [Cursor Agent review](https://cursor.com/docs/agent/agent-review) 的审阅入口提供交互参考：明确授权后执行，审阅作为可选操作。这里不引入它们的完整权限框架。

Diff 使用 [jsdiff](https://github.com/kpdecker/jsdiff) `9.0.0` 的 `diffLines`，保留空白与换行差异，设置耗时和差异长度上限；超限展示前后文本。不自建通用 Diff 算法。依赖无新增传递包；锁文件只增加这一直接依赖，保留原锁定版本。移除依赖和改动面板即可撤回展示层；关闭写入选择即可退回只读流程。

## 验证入口

- `tests/contract/agent-edit.test.ts`：真实文件修改、精确匹配、并发冲突、非法内容、写入前后停止、只读拒绝、自身修改后再次读取、跨窗口结果隔离。
- `tests/contract/pi-adapter-tools.test.ts`：离线 Pi 替身验证工具注册与参数转交，不调用真实 Provider。
- `tests/e2e/agent-edit.e2e.spec.ts`：真实 Electron main → preload → renderer → 文件系统；完成、写后停止、主动查看 Diff、重启后结果恢复；只修改复制的 fixture，并核对其余文件不变。
- 完整门禁：`pnpm verify:repository`、`pnpm check`；另跑 `pnpm test:visual` 与 `pnpm acceptance:packaged`。打包验收仍为现有只读启动场景，不能冒充真实 Provider 编辑验收。

实际输出、候选 SHA、独立审阅与 CI 在关联 PR 中记录。真实 Provider 编辑、人工 Windows 体验与恢复执行器未验证，不记作通过。
