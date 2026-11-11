# Issue #20 · 连续编辑与纠错验证

同一次 Run 可以多次修改已授权的一个已有 UTF-8 文本文件。Pi 把每次工具结果交回模型，由模型决定是否再读取和修正。Pioneer 校验文件权限、路径和版本并核对实际写入。Diff 按需打开，记录本次 Run 初次写入前到最后一次确认写入后的差异。写入未确认时明确标记，停止不会撤销已完成的写入。

| 验证 | 覆盖行为 |
| --- | --- |
| Contract Tests | 两次写入之间回读新内容；匹配失败后修正参数并继续；第二次写入确认失败时保留前次结果；在首次或后续写入受阻时停止或退出，终态和记录不被迟到的结果改写。 |
| Real Electron E2E | 通过界面授权、启动及停止，跨 main → preload → renderer。受控适配器驱动真实文件 IO，验证按需 Diff、磁盘内容、历史恢复和固定 fixture 不变。 |
| 真实 Provider | 2026-11-11 使用 OpenCode Go 的 `deepseek-v4.1-flash`，经 Pi 1.4.0 驱动真实 Electron。用户批准外发测试任务与合成 README，写入范围仅该文件。 |

真实试用中，Run 记录依次出现成功的读取、写入、读取、写入、读取。模型先将 `status: draft` 改为 `status: reviewed`，再将 `count: 1` 改为 `count: 2`。Run 完成后，临时副本内容与预期一致，writer journal 有两条 `applied` 记录。Diff 默认关闭，用户打开后显示原始值与最终值。

首次接入收到 OpenCode Go 的会话标识缺失错误，文件未改动。Pioneer 现把会话标识传给 Pi，由内置 Provider 生成请求头。连接参数沿用应用已有的环境变量入口，凭据通过进程环境传入。[OpenCode Go 客户端要求](https://opencode.ai/docs/console/go/#where-can-i-use-it)

真实试用验证了连续写入与回读。错误反馈后的重试和受阻写入的停止由上述自动测试覆盖。通用快照、自动回滚和跨重启文件恢复按 [#20 的范围决定](https://github.com/OasisViridis/Pioneer/issues/20) 暂缓。
