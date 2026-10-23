# ROADMAP · Pioneer Agent
> **工程研发里程碑、功能优先级矩阵与 jj 工作流指南 (2026.09 — 2027.06)**
> 课题：模块化 AI Agent 交互系统的设计与实现
> 项目代号：Pioneer · Canonical local checkout：`D:\Projects\Pioneer`

---

## 一、阶段里程碑规划 (Milestones)

```
[2026-09] 阶段 1: 定题、设计规范与开题汇报 (M1: 开题定音) [COMPLETE]
   │  - 完成开题文稿与开题汇报（2026-09-11 起权威源为 Figma `Pioneer-PPT`）
   │  - 完成 Pioneer 核心交互原型 (00-pioneer-workbench.html 等)
   │  - 建立 Pioneer 的规范身份与独立仓库；活动工作副本可暂保留旧物理目录名，直至 post-M2 operational runbook 与受控改名门禁通过
   ▼
[2026-09] 阶段 1.5: 仓库规范化与证据边界 (M1.5) [COMPLETE]
   │  - 统一公开身份、仓库相对链接、权威文档职责与验证层级
   │  - M1.5 质量门禁已通过；测试真相、路径与权威文档职责已规范化
   ▼
[2026-10 ~ 11] 阶段 2: 桌面只读基础切片 (M2) [COMPLETE]
   │  - Electron + React + TypeScript skeleton，以及即时子目录的只读扫描
   │  - 受限 IPC/preload、Jellyfin 风格项目海报墙、唯一项目概览 Tabs 与最小 Settings
   │  - Contract Tests 与跨越 Electron main → preload → renderer 的 Real E2E
   ▼
[2026-11 ~ 12] 阶段 3: 任务执行与受控工作区操作 (M3) [IN PROGRESS]
   │  - 已完成：输入 → Intent Review → READY → Runtime Session INITIALIZED
   │  - 已完成第三条纵向切片：INITIALIZED → START REQUESTED + 本地 append-only lifecycle event stream
   │  - 顶层场景冻结为：输入 / 审阅 / 输出 / 自定；Intent Review 与 Runtime 请求仍属于「输入」
   │  - 下一步：START REQUESTED → 受控 Runtime adapter handshake；模型接入、工具执行、文件写入仍保持关闭
   │  - 文件变更、可逆快照、Agent Files / Diff 与 Artifacts 继续按独立授权边界渐进实现
   ▼
[2026-12 ~ 2027-01] 阶段 4: Pi-Agent 微内核底座桥接与插件库 (M4: 调度与扩展闭环)
   │  - 双向 WebSocket/SSE 事件总线通信打通
   │  - 会话分支树 (Session Tree) 与时光机回退
   │  - Zod Schema 原子插件库（文件处理、工程整理、Runbook 沉淀）
   ▼
[2027-02 ~ 03] 阶段 5: 论文撰写与实验数据固化 (M5: 毕业论文初稿 + 评测数据)
   │  - 210 项冻结 M1 Prototype Tests 数据图表化写入论文第三、四章
   │  - 整理完成《需求分析》、《界面设计》与《系统实现》
   ▼
[2027-04 ~ 05] 阶段 6: 答辩演练与最终封版 (M6: 毕业答辩 + 完整工程归档)
   │  - 开题与结题演练、高清交互演示视频录制、工程最终归档
```

### 当前里程碑状态

| Milestone | Status | 状态边界 |
|---|---|---|
| M1 | **COMPLETE** | M1 设计原型与开题材料已完成设计基线收敛；后续产品工作区语义已在 Figma / M3 工程契约中冻结为「输入 / 审阅 / 输出 / 自定」，原型测试保持 100% PASS。 |
| M1.5 | **COMPLETE** | 仓库规范化、三层测试真相与 `pnpm check:m15` 门禁已完成。 |
| M2 | **COMPLETE** | Electron + React + TypeScript 只读桌面基础切片已完成；Contract Tests、Real Electron E2E、Windows Native Picker 人工验收、Package Smoke 与最终 Windows Quality Gate 均已通过。M2 不包含文件写入、工作区重组或快照；其只读安全边界继续作为 M3 基线。 |
| M3 | **IN PROGRESS** | 已完成 `Input → Intent Review → READY → Runtime Session INITIALIZED → START REQUESTED` 三条纵向切片，并建立确定性 append-only 本地生命周期事件流。事件只记录授权边界，不代表真实 Agent 执行；模型接入、工具执行、文件写入、通用文件系统 IPC 与 Runtime 进程仍保持关闭。下一步是受控 Runtime adapter handshake。 |

---

## 二、基于 jj (Jujutsu) 的 Masterplan 工作流规范

本项目采用 **Jujutsu (jj) + Git 协同工作流**，严格对齐 The Masterplan 研发节奏：

1. **工作副本快照机制 (Zero Commit Friction)**：
   * 日常开发无需频繁手动 `git add`，`jj` 会在每一次命令执行前自动快照当前修改；
   * 每完成一个里程碑小步，使用 `jj describe -m "feat/fix: ..."` 显式添加语义化说明。
2. **分支管理与匿名变更 (Branchless Evolution)**：
   * 探索性原型与临时试验直接基于匿名变更（`jj new`）进行，验证通过后使用 `jj bookmark create <name>` 锁定；
   * 主线保持在 `main` 书签，通过 `jj bookmark set main -r @` 持续同步前进。
3. **安全回滚与撤销网络 (Operation Log)**：
   * 若实验过程中出现代码或状态混乱，使用 `jj op log` 查看操作历史，通过 `jj op restore <op_id>` 一秒恢复，杜绝数据损坏。
4. **与 GitHub 协同**：
   * 本地借助 `jj` 的原子性和变更 ID 进行开发，通过 `jj git push`（或 `git push`）同步至远程 GitHub。

---

## 三、反倦怠与防风险机制 (Anti-Burnout Protocol)

1. **核心交互前置**：在 2026 年底前把最富成就感的前端“Jellyfin 海报墙”与“PR 模块化面板”打磨至高保真，保持高昂创作动力。
2. **4–6 周可运行里程碑**：每个阶段必须产出一个能双击运行、可录屏、具备独立闭环的原型。
3. **文档与测试常态化**：测试用例（`tests/`）与开发进度同步推进，严禁留到答辩前夕临时补材料。
