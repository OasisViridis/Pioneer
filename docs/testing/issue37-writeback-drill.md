# #37 · 回填故障恢复演练（本地，非真实 Figma）

2026-11-03。对象是 `tools/design-writeback-apply.mjs` 的 Dev Resources 回填与重试路径，关联 [#37](https://github.com/OasisViridis/Pioneer/issues/37)。本记录不关闭 #33，也不把本地演练算作真实 Figma 验收。

## 边界

演练在 localhost 启动一个有状态的假 Dev Resources 服务，经生产传输 `figmaApi`（真实 `fetch`、请求头、状态码、`AbortSignal` 和错误分类）调用生产 `writeback`，再读回、再执行。GitHub 的合并、CI 与验收证据使用固定 fixture，不访问真实仓库接口；没有读取或写入真实 Figma，也没有使用 `FIGMA_ACCESS_TOKEN`。

它验证的是客户端在远端部分提交、连接中断、回读失败、限流、授权失败与容量不足时的行为。它不是真实 Figma 超时记录，不是 Webhook 投递，也不是 Windows 或真实 Provider 人工验收。

## 覆盖与结果

测试文件：`tests/design-sync/writeback-drill.test.mjs`，随 `pnpm design:check` 执行。

| 场景                        | 远端行为                                                       | 客户端结果                                                                                             | 关键断言                                                                 |
| --------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| HTTP 200 部分成功           | 18 条中只提交 2 条，响应同时带 `links_created` 与 `errors`      | `partial-write`，`missing: 16`；再次执行只提交缺失的 16 条，最终 `links-verified`                      | POST 2 次，最终 18 条唯一链接，无覆盖                                     |
| 提交后连接中断              | 先写入全部资源，再销毁 socket                                  | 回读发现全部链接，返回 `links-verified`；重放 `created: 0`                                             | POST 1 次，不盲目重发                                                    |
| 写入后回读失败              | 写入全部资源，下一次 GET 返回 500                              | `retryable-error`，`phase: readback`，`writeOutcome: unknown`；再次执行读回并完成                     | POST 1 次，重跑不重复写                                                  |
| 429 限流                    | POST 返回 429 与 `retry-after: 45`                             | `rate-limited`，`retryable: true`，`retryAfter: '45'`                                                  | 不创建链接，响应体不外泄，POST 1 次                                      |
| 403 授权失败                | POST 返回 403                                                  | `permission-denied`，`retryable: false`（先修凭证）                                                    | 不创建链接，响应体不外泄，POST 1 次                                      |
| 预检 GET 403                | 第一次读取就返回 403                                           | `permission-denied`，`retryable: false`，`phase: preflight`                                            | 0 次 POST，响应体不外泄                                                  |
| 单节点容量不足              | 目标节点已有 5 条人工链接，待补 6 条                           | `capacity-blocked`                                                                                     | 0 次 POST，5 条人工链接原样保留                                          |
| 成功后的三次重放            | 链接已齐全                                                     | 三次均 `links-verified`、`created: 0`                                                                  | POST 总数 1，19 条链接，人工链接仍为第一条，资源集合哈希不变             |
| 回传循环的结构性排除        | 记录全部请求路径                                               | 每个场景只出现 `GET/POST /v1/dev_resources`                                                            | 回填传输没有创建命名版本的接口；Dev Resources 写入不能产生 `FILE_VERSION_UPDATE` |

另外，`tests/design-sync/writeback.test.mjs` 新增了错误分类断言：HTTP 400/422 归类为 `invalid-input`，401/403 为 `permission-denied`，404 为 `missing-input`，429 为 `rate-limited`，5xx 与连接错误为 `retryable-error`。`retryableState()` 只把 `rate-limited` 与 `retryable-error` 视为可直接重试；回填结果另把 `partial-write` 视为可通过“先读再补”重跑，403/400 等永久错误返回 `retryable: false`，需要先修凭证、输入或范围。

## 运行与记录

```powershell
node --test tests/design-sync/writeback-drill.test.mjs
```

2026-11-03 本机 Windows 结果：7/7 通过。该命令不访问外网（仅 localhost）、不读凭证，可在普通本地会话复跑。

## 仍未覆盖

- 真实 Figma 的部分失败或超时（需要获准令牌与真实 Dev Resources 写入）。
- 真实 Figma 命名版本事件经获准接收器到 S2 的链路。
- 跨进程并发回填：当前单操作员流程没有加锁，同一节点被两个进程同时写入时未演练，文档也不声称具备并发保护。
- Code Connect 官方发布与真实节点读回；当前只有 S1 轻量映射。
