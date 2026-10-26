# Pioneer · 文档导航

## 现役入口

| 找什么                 | 入口                                                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 里程碑完成状态         | [ROADMAP](../themasterplan/ROADMAP.md)                                                                                      |
| 复工顺序与完成条件     | [Wayfinder 端到端开发计划](plans/2026-10-10-pioneer-wayfinder-development-plan.md)（接替 [10-01 计划](plans/2026-10-01-pioneer-frozen-prototype-development-plan.md)）；P0、P1 于 2026-10-03 完成，P2 只读 Harness 于 2026-10-26 合并（PR #16），当前前沿为 P3 |
| 设计与原型             | [Make F9 原生写回](design/figma-make-f9-writeback-2026-10-02.md)、[冻结源码](design/make/frozen/2026-10-01-f9/README.md)    |
| 工程实际状态与历史测试 | [证据账本](testing/pioneer-evidence-ledger.md)、[P0 收口](testing/p0-integration-closeout-2026-10-03.md)、[P1 收口](testing/p1-session-closeout-2026-10-03.md) |
| 测试怎么分层           | [TEST_INFRA](../TEST_INFRA.md)                                                                                              |
| Windows 待验项目       | [WC1 人工清单](testing/wc1-windows-manual-2026-10-01.md)                                                                    |

设计交付、当前 `main`、未整合的本地候选分别判断。旧候选的测试通过，不自动证明当前入口已接入。

## 历史与素材

- [历史计划和规格](archive/README.md)：保留迁出的 Superpowers 来源原件，现役版本在 `plans/`、`specs/`。
- `design/` 中的 v2、v3、v3.1/v3.2 和旧写回记录是历史证据；不要用旧稿重置 F9。
- [冻结 M1 demos](../demos/README.md) 与 `tests/prototype/` 保持参考和模拟器边界。
- 本地电影、渲染缓存、ThreeUI 来源与 Make 过程截图统一由 [工作区索引](../tmp/WORKSPACE-INDEX.md) 分类；当前 v8 验证见 [10/3 交付记录](testing/cinematic-v8-closeout-2026-10-03.json)。视频是交互展示，不是 Electron / Pi 实现证据。

不为归档移动当前源码、继承候选或素材依赖；不在整理任务中恢复应用开发。
