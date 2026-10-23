# P2 只读工具与项目路径边界（Issue #11）

来源：[Issue #11](https://github.com/OasisViridis/Pioneer/issues/11)，属于 [主地图 #9](https://github.com/OasisViridis/Pioneer/issues/9)。承接 [#10 宿主适配器研究](../research/2026-10-23-p2-pi-host-adapter.md)。本次用户通过 implement 指令授权落实，并确认以「主进程只读工具请求边界」为 TDD seam。

## 本次决策与实现范围

固定三个工具名、严格参数与脱敏拒绝协议，实现 [main 私有预检](../../apps/desktop/src/main/harness/read-only-tool-policy.ts) 和 [共享数据契约](../../apps/desktop/src/shared/contracts/read-only-tools.ts)。预检只读取文件系统元数据，不读取文件正文、不遍历目录、不调度 SDK，也不授予执行权限。

本次没有增加 IPC、preload 方法、Provider 或工具执行器。`RuntimeSession` 仍为 initialized，三个 capabilities 仍为 false；M3/P2 状态不因此升级。#12 继续决定运行与取消事件，#13 实现工具执行、受控适配器及 Electron 接线。GitHub 票据与地图保持原状态。

## 1. 精确白名单

main 创建工具注册表时只能注册下列三个 Pioneer 自有实现，默认空表；不加载 Pi 内建工具、插件、工作区脚本或动态工具注册。每次调用都经过策略边界，未知名默认拒绝，匹配区分大小写，不存在别名或回退执行。

| 工具名            | 唯一参数对象                      | 预检目标                       | 后续执行语义                                                                                                                       |
| ----------------- | --------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `read_file`       | `{ path: string }`                | 普通文件，hard-link 数必须为 1 | 有界 UTF-8 文本读取，单次最多 64 KiB；拒绝二进制，明确标记截断                                                                     |
| `list_directory`  | `{ path: string }`                | 目录                           | 仅即时子项，最多 200 项；逐项过滤与复检，不跟随链接                                                                                |
| `search_in_files` | `{ path: string, query: string }` | 目录                           | 字面量文本搜索，不解释正则、glob 或命令；最多 16 层、1,000 文件、每文件 64 KiB、累计读取 4 MiB、100 条命中，达到任一上限即明确截断 |

这张表的执行预算是 #13 的实现约束，当前预检只实施参数、路径与条目类型检查。不得把通过预检当作已经实施内容、遍历或输出预算。

参数契约严格拒绝额外字段（包括 root、projectRoot、recursive、command、URL、headers）；`path` 长度 1–1,024，最多 32 个组件，`query` 长度 1–256，均按 JavaScript 字符串长度计。不提供自定义预算字段。调用方通过 main 的 runId 注册表关联请求，不允许模型覆盖项目、调用窗口或授权上下文。

shell、bash、命令启动、文件写入/删除/改名、浏览器、HTTP/fetch、其他网络工具均不在白名单。模型传输是另外的授权边界；工具结果进入模型上下文前仍需检查本次批准的外发材料范围，只读许可不能代替数据外发许可。

## 2. 项目根目录与路径遏制

宿主必须从 main 自身的目录册和当前会话绑定解析项目根目录，不能用模型或 renderer 提供的路径。授权范围是单个项目，不能使用媒体库父目录、相邻项目、用户主目录或磁盘根。已有 catalog 可以识别根内项目别名；工具边界只接受其已解析的物理项目路径。

`checkReadOnlyToolRequest(projectRoot, input)` 是 main 内部函数，不是 IPC 方法。其成功结果中的 `absolutePath` 仅用于 main，禁止直接发到 renderer/模型。检查顺序固定为：

1. 验证工具名与 strict schema；格式错误或越界工具在文件系统探测前拒绝。
2. 路径只接受普通项目相对组件，分隔符支持 `/` 和 `\`。单独 `.` 可表示目录根；`read_file` 对目录另行拒绝。不折叠 `..` 或内嵌 `.`，而是直接拒绝，包括最终仍落在项目内的穿透写法。
3. 拒绝绝对路径、盘符相对路径、UNC、扩展/设备路径、NTFS ADS（冒号）、NUL/控制字符、通配字符、组件尾点/尾空格、空组件、Windows 保留设备名。不做 URL 解码、环境变量、`~`、glob 或 shell 展开。
4. 默认拒绝任何隐藏组件、`node_modules`、`auth`/`credential(s)`/`secret(s)` 及其点扩展名、`id_rsa`/`id_dsa`/`id_ecdsa`/`id_ed25519` 及其点扩展名，以及 `.pem/.key/.p12/.pfx/.keystore` 后缀，匹配忽略大小写。敏感文件规则是保守的名称过滤，不能识别任意文件内的密钥或个人数据；宿主仍须限制批准的材料集合。
5. 根目录必须存在且为真实目录，`lstat` 不得显示链接，`realpath` 必须与传入的规范物理路径一致；不接受磁盘根。失败统一为 `PROJECT_UNAVAILABLE`。
6. 从根逐组件 `lstat`，拒绝所有 symlink/junction，包括根内链接和坏链接。每个组件经 `realpath` 后，复用 [路径 helper](../../apps/desktop/src/main/catalog/path-policy.ts) 按组件检查 containment，不能用字符串前缀匹配。路径别名导致解析位置变化时也拒绝。
7. 最终 `lstat` 再检查类型与链接：read 仅接受普通单链接文件，list/search 仅接受目录。设备、FIFO、socket 等非普通类型均不作为文件读取；无法查询或丢失的路径默认拒绝。

选择「全拒绝链接」使 P2 不必定义跨项目链接的权限继承，也避免根内链接访问隐藏源。hard link 无法通过 `realpath` 找到其他名称，因此普通文件的链接数不为 1 时也拒绝。`lstat`、`realpath` 与链接数含义依据 [Node.js 文件系统文档](https://nodejs.org/docs/latest-v24.x/api/fs.html#fspromiseslstatpath-options)、[realpath](https://nodejs.org/docs/latest-v24.x/api/fs.html#fspromisesrealpathpath-options) 和 [stats.nlink](https://nodejs.org/docs/latest-v24.x/api/fs.html#statsnlink)。

### 并发替换与后续执行要求

此预检在文件系统稳定时阻止请求语法、静态链接与目录穿透；它不是原子句柄，也不是抵御同权限恶意本地进程的操作系统沙箱。检查与后续打开之间、甚至检查内部的异步调用之间，都存在 TOCTOU。Node 的 [文件访问文档](https://nodejs.org/docs/latest-v24.x/api/fs.html#fspromisesaccesspath-mode) 也指出检查后再打开存在竞态。

#13 不能缓存本次 `ok` 结果作为长期许可，或直接把路径交给 Pi 内建工具。每次文件访问必须在 main 内重新检查；目录枚举和递归搜索必须检查每个候选条目，过滤被拒绝项，不能只检查起始目录。执行器应以只读方式打开文件，以同一 handle 核对普通文件、身份、链接数和大小并读取，检查失败时不发布内容；每次读取及发布都遵守预算和材料授权。

这些复检可缩小竞态窗口，但不能声称消除路径祖先被恶意反复替换的竞态。首条确定性任务限定于隔离、执行期间不变的 fixture，持续核对其哈希。若真实运行的威胁模型包含敌对并发文件替换，则须先提供经验证的原生句柄/目录相对访问隔离或受隔离的不可变读取副本；在此前不能将此预检升级为该威胁模型下的安全沙箱。当前没有启用真实运行，因此不存在预检后旁路执行。

## 3. 拒绝协议

所有拒绝返回可序列化对象，不抛出原始 OS 异常，也不反射工具名、参数、绝对路径、目标位置、文件内容、调用栈或凭证：

```json
{
  "ok": false,
  "error": {
    "code": "TOOL_NOT_ALLOWED",
    "message": "This tool is not available in the read-only policy.",
    "retryable": false
  }
}
```

| code                    | 含义                                      |
| ----------------------- | ----------------------------------------- |
| `TOOL_NOT_ALLOWED`      | 工具名不在精确白名单                      |
| `INVALID_TOOL_REQUEST`  | 请求结构、长度或字段不符合契约            |
| `INVALID_PATH`          | 路径含穿透或特殊语法                      |
| `SENSITIVE_PATH`        | 默认排除的源                              |
| `PROJECT_UNAVAILABLE`   | main 绑定的根不可用、非目录或位置发生变化 |
| `PATH_UNAVAILABLE`      | 请求条目缺失或元数据查询失败              |
| `PATH_OUTSIDE_PROJECT`  | 物理解析结果位于项目外                    |
| `LINK_NOT_ALLOWED`      | 链接、物理路径别名或多链接文件            |
| `PATH_TYPE_NOT_ALLOWED` | 工具与条目类型不匹配                      |

message 来自固定映射，供 UI 或适配器使用；调用方只依赖 code。`retryable: false` 表示不能自动重试原请求或提升权限；修改为合法参数后可提交新请求。适配器将其映射为失败的 tool_result，不能伪造空内容成功、降级为 shell、偷偷切换根目录或误报整个任务已完成。runId、callId、事件顺序和取消终态由 #12 定义，不能用模型给出的 ID 作为授权证据。

## 4. 验证记录

[Contract Tests](../../tests/contract/read-only-tool-policy.test.ts) 直接调用 main 预检，在自动清理的临时项目中验证放行与结构化拒绝。真实 Windows junction、文件 symlink、坏链接与 hard link 均在正常宿主运行；不以 mock 或跳过替代。该证据属于 Contract Tests，不能作为 Harness 运行或 Electron 端到端执行的证明。

TDD red/green 与最终门禁日志位于本地 `tmp/issue11/`。最初沙箱创建 junction 被 EPERM 拒绝的记录保留在 `red-link.log`；宿主 red 测到了错误放行，实施检查后转绿。

2026-10-24 验证结果：

- `pnpm typecheck`、`pnpm test:contract:types` 通过；定向策略测试 67/67 通过。
- `pnpm verify:repository`：6/6 通过；`git diff --check` 与本次暂存区差异检查通过。
- 正常 Windows 宿主 `pnpm check` 退出码 0：267 项 Contract Tests、Prototype Tests: 210/210 passed、21 项 Real Electron E2E 及最终 package smoke 通过。原始日志为 `tmp/issue11/full-check-host.log`；E2E teardown 核对原有 fixture 哈希未变。
- code-review 的 Standards 与 Spec 两个独立子代理均为 0 findings，审查范围仅本次四个新增文件；基点为接手时 `527c4c12df2c9985bb9d3f2ad71988255818a8f8`，审查暂存候选后提交。

完整门禁针对包含继承修改与未跟踪 P1 资产的当前工作副本，不是干净 HEAD 重建验证。本次提交仅收纳上述策略、契约、测试与本文，不收纳其他继承文件；未运行真实 Provider，也未将已有 Electron E2E 升称为新工具执行的 E2E。
