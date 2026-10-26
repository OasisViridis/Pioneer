# B1 · 本机会话活动合同

依据：[统一计划 B1](../plans/2026-09-30-pioneer-unified-development-plan.md)、[当前产品合同](../design/workbench-product-spec.md)。测试 seam 沿用已授权计划中的纯 reducer/领域、userData store、可信 main IPC、真实 Electron 重启，不以文件存在或 mock renderer 代替集成结果。

## 语义

- v3 会话增加 `lastActivityAt: number | null`，UTC epoch 毫秒，有限安全整数、0 到 Date 可表示上界。`null` 表示旧档没有活动证据，不从项目 mtime、载入时间或数组位置伪造。
- 计活动：成功创建；从其他标签激活/恢复此会话；确实修改草稿、保留消息、改变名称。重复创建、已激活会话重复点击、空/越界输入、未知对象等 no-op 不计。
- 不计活动：关闭标签、改变/保存/恢复/移动布局和面板、重排标签、产物局部视图、打开库/设置、启动时恢复档案。关闭不删除会话，也不把关闭当最近使用。
- 时钟来源为 renderer host 的 `Date.now()`，在 dispatch 边界注入 `occurredAt`；纯 reducer 不读取时钟。字段仅为本机 UI 排序，不是任务权限、系统审计或远程事件时间。
- 相同或回退时钟以全体已知会话的高水位 +1 毫秒推进；到 Date 上界时饱和，不溢出。非法/缺失时间不伪造活动，操作原语义保留。该逻辑时间不保证与外部绝对时间精确一致。
- 查询按已知时间降序、未知置后，同值/未知按 session ID 的 codepoint 顺序稳定决定；不会借用目录 `lastModifiedAt`。工作区聚合使用其首个排序会话，返回最近会话 ID 与活动时间；未知始终为 null。

## 存储与 IPC

- v1/v2 严格解析后无损迁移到 v3，原消息、草稿、布局、标题和打开集合保留，活动为 null。load 不重写原件；下一次明确 save 原子写 v3。未知未来版本、非法时间/引用或超限仍拒绝，原件不改。
- 新增固定、无参数 `session-state:activity` 查询，复用主 frame / contents / URL 的可信 sender 检查。读当前 store 经过严格 schema 的状态，返回 session/workspace 摘要，不包含消息和草稿；不改变关闭连接状态或触发文件写入。
- preload 只暴露 `getSessionActivity()`，不暴露动态 channel、路径、Node 或事件对象。已有 `loadSessionState` / `saveSessionState` 保持原边界。
- B1 证明记录、持久化与后端查询；库过滤/排序、继续入口和全部会话列表的用户可见接入由 F1/W 单独证明。上下文引用留给 B2，不能同时修改迁移版本。

## 验收

1. 可控时钟的正常/相同/回退/非法/上界；事件/no-op/关闭与布局不计；不修改输入。
2. 多会话/工作区、关闭仍在查询、同值/null 稳定回退，不使用项目 mtime。
3. v1/v2 内容保留和只读迁移、v3 round-trip/非法拒绝、失败保存保护原件。
4. activity IPC 无参、可信 sender、损坏档失败、空状态、与实际保存后状态一致，无消息泄露/写入。
5. 真实 Electron 由 UI 产生活动，关闭/重启同一隔离 profile，preload 查询顺序和活动值一致，工作区 fixture 不变。
