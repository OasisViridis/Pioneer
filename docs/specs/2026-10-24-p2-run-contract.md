# P2 运行合同与安全边界 v1（Issue #12）

依据：[当前任务 #12](https://github.com/OasisViridis/Pioneer/issues/12)、[#10 版本化宿主研究](../research/2026-10-23-p2-pi-host-adapter.md)、[#11 只读预检](2026-10-24-p2-read-only-tool-policy.md)。实现与验收交给 [#13](https://github.com/OasisViridis/Pioneer/issues/13)。交付基线与继承资产处置见[核对记录](../testing/issue12-input-reconciliation.md)。

本文固定实施决策。[共享 schema](../../apps/desktop/src/shared/contracts/pioneer-run.ts)定义 wire 数据；[异步探针](../../tests/helpers/run-protocol-probe.ts)与[授权决策探针](../../tests/helpers/run-launch-probe.ts)仅在测试中执行，不是 main 运行注册表，也没有 Pi、Provider、IPC 或工具文件读取。旧 RuntimeSession/RuntimeLifecycle 保持兼容，三个 capabilities 仍为 false。

## 1. 身份、所有权与授权

main 是运行状态与授权的唯一写入者。它持有 SessionRecord、ProjectRecord、GrantRecord 和 RunRecord。renderer 只能提交固定请求；SDK 回调与模型给出的 ID 不参与身份或权限判断。

| 记录 | 固定内容与规则 |
| --- | --- |
| SessionRecord | 独立的产品 `sessionId`、`projectId`、当前任务 `revision`、任务内容摘要 hash、可选的旧 intent id/revision。每次修改任务或上下文递增 revision，单调且不复用；澄清摘要不是必需步骤 |
| ProjectRecord | main 目录册中的项目 id、canonical root、rootRevision、根的设备/文件身份；根变化使旧授权失效。请求不携带绝对路径 |
| WindowBinding | main 取得的 webContents id、主 frame、可信 origin、每次导航/重建变化的 windowEpoch；一个会话只由一个窗口持有执行所有权 |
| RunRecord | main 随机生成 runId，锁定 session/project/revision/windowEpoch/rootRevision、授权引用、adapter 类型、资源与事件 seq；每次显式新运行使用新 runId |
| GrantRecord | main 生成不可猜测 grantId，绑定上述身份、任务 hash、执行许可、只读策略版本、模型/endpoint/材料清单、有效期和撤销状态；不持久化密钥或可重放许可 |

身份字符串是 main 分配的 ASCII opaque ID，最长 512 字符；旧数据不符合新语法时创建持久映射，不能把历史绝对路径或旧 RuntimeSession id 直接当作授权键。`revision` 是本轮产品任务修订，不是 seq，也不是旧 READY 布尔值。旧 `RuntimeSession.id = session:<intent>:r<revision>` 保留为历史引用，不能替代 P1 产品会话 id。

权限必须分别表达：

| 权限 | 授予方式和范围 |
| --- | --- |
| 意图摘要 READY | 仅表示历史意图已确认；不授予运行、模型、外发、写入、发布 |
| execution | 用户针对当前任务显式启动/确认，由 main 记录；任务或材料变更后需新授权 |
| read-only | 仅单个项目的既定三个工具和本次批准材料；没有 shell、写入、浏览器或网络工具 |
| model | 明确 provider id、model id、HTTPS endpoint（禁止凭证放 URL）、受限内存凭证引用。传输仅该 endpoint，重定向到其他 origin 拒绝，不探测环境/全局 auth 文件 |
| egress | 明确提示文本及文件材料清单；每项具有 materialId、相对路径引用、SHA-256、字节数与允许用途。工具可读不代表结果可发往模型 |
| mutation / publication | P2 永远不授予；独立后续决策，不从 READY、模型或读权限派生 |

授权 UI 在 #13 使用可信主窗口的固定动作；main 从自己的任务/目录/模型目录生成待确认摘要并保存确认记录，不接受 renderer 上传 `approved:true`、根路径、密钥、工具集合或任意 endpoint 作为已授权对象。权限不是防御已完全被控制的可信 renderer 的 OS 安全边界；不可信页面、子 frame、导航后的旧 sender 必须被 IPC 层拒绝。

Grant 最长 5 分钟、单次使用，在主进程串行 admission 中消费。相同 requestId + 完全相同请求在原所有者/当前 revision 校验后返回同一 runId，仅返回历史回执，不重新使用授权或创建资源；同 requestId 不同载荷返回 REQUEST_CONFLICT。新 requestId 使用旧 grant 拒绝。记录保留期内保证幂等，过期请求只能得到 RUN_NOT_FOUND/AUTHORIZATION_REQUIRED，不能自动重跑。

同 session 同时一个未收敛 run；同窗口最多两个、进程最多四个；starting/running/stopping/unknown 都占位。新请求遇到占位返回 RUN_ACTIVE，超进程/窗口上限返回 CAPACITY_EXCEEDED，不自动排队。先校验来源、身份、修订、授权和容量，再原子预留 run/消费 grant/写启动记录，最后构造适配器；失败不得留下一次隐式重试。写启动记录失败时不启动，返回 JOURNAL_UNAVAILABLE。

新修订仅影响未来运行；已运行的任务仍锁定旧修订，UI 按 run 身份展示。材料被修改、根变化、授权撤销或有效期到期会关闭新模型/工具准入并发起停止。观察历史结果按 run 绑定校验，不因当前编辑修订变化而丢弃旧 run 的停止确认。

## 2. 固定边界与适配器

以下是 #13 要实现的方法形状，不在 #12 注册任何新 IPC：

```ts
startRun(request: RunStartRequest): Promise<StartReply>;
stopRun(request: RunIdentity & { requestId: string }): Promise<StopReply>;
getRun(request: RunIdentity & { afterSeq: number }): Promise<RunPage>;
subscribeRun(request: RunIdentity & { afterSeq: number }, listener): () => void;
```

StartReply 为 `{ok:true,runId}` 或 `{ok:false,code}`；code 固定为 INVALID_REQUEST、UNTRUSTED_SENDER、BINDING_MISMATCH、STALE_REVISION、REQUEST_CONFLICT、AUTHORIZATION_REQUIRED、RUN_ACTIVE、CAPACITY_EXCEEDED、JOURNAL_UNAVAILABLE。StopReply 为 `{ok:true,status}` 或固定拒绝（INVALID_REQUEST、UNTRUSTED_SENDER、BINDING_MISMATCH、RUN_NOT_FOUND）；收到 stop 回执仅表示 main 处理了请求，不能显示“已停止”。get/subscribe 使用同一来源和所有权检查。停止不要求尚未过期的启动 grant，以免过期授权阻止用户停止。

RunPage 包含 identity、status、lastSeq、oldestSeq、gap、最多 32 条 events、nextAfterSeq、hasMore。运行已被保留上限清退时返回 RUN_NOT_FOUND，不能以空事件暗示从未运行。preload 包装固定 channels，只交付通过 schema 校验后的结构化数据；unsubscribe 撤销 listener、ACK 与 main 订阅。没有任意 channel、SDK 对象、Node 对象或通用文件入口。

main 私有 HarnessAdapter seam 固定为 `create(context, emit) -> handle`，同步构造 handle 并在可能产生首个回调之前建立缓冲；`handle.start(): Promise<Outcome>`、`handle.requestStop(): void`、`handle.quiescent: Promise<void>`、`handle.dispose(): Promise<void>`。构造函数不得启动网络或工具；start 才能启动。context 由 main 创建，包含不可变身份、批准材料、预算、受限模型传输、自有工具及 AbortSignal。`emit` 只接受已限定的 adapter 消息；main 生成完整事件身份、callId、seq、时间和来源。

Outcome 与 quiescent 独立：前者是归一化结果（success/failure/aborted），后者只在模型流关闭、Agent idle、所有工具/回调和待处理输出结束后 resolve。拒绝的 quiescent Promise/断连不能证明结束。`dispose` 只在 quiescent 确认后正常释放；宽限到期后的强制结束记录固定错误码（STOP_TIMEOUT 等）并尽力释放，不伪造释放成功。订阅撤销或收到 `agent_end`、prompt resolve 均不能单独证明收敛。

Pi 适配沿用 #10 的 `Agent + Models + 显式 streamFn` 方向与候选 1.4.0 快照。#13 引入时复核 exports/认证默认行为，固定精确版本与锁文件；没有本轮 Pi 安装或成品兼容性结论。唯一替换点是 main 的 HarnessAdapter factory，可替换成受控适配器；控制入口只由测试启动配置注入，不能由 renderer 请求切换。真实 E2E 保留实际 main/preload/renderer/文件 IO。

## 3. 事件与顺序

每个事件含 `version:1,sessionId,projectId,runId,revision,seq,at,source,adapter,body`。seq 由 main 为每个 run 从 1 连续分配，安全整数且不回绕。at 为 main 的 UTC ISO 时间，只用于展示；排序只使用 seq。adapter 明确 controlled 或 pi；source 是 host/model/tool，由 main 按 body 类型赋值。不能直接转发 SDK 原始 event、错误、headers、工具参数或调用栈。

| body.type | 含义/额外字段 |
| --- | --- |
| run.accepted | 已预留身份和资源槽；第一条事件，仍未运行 |
| run.started | 适配器 start 已进入运行，允许后续文本和工具请求 |
| text.delta | UTF-8 有界安全文本，source=model |
| tool.requested | main callId、白名单工具名；未知工具为 null，原始名/参数不反射 |
| tool.result | 对应 callId；succeeded 含安全 text/truncated；rejected/failed/cancelled 只含固定 code，无原始错误 |
| run.stop_requested | 已阻止新准入并发送 Abort，reason=user/window_closed/deadline/authorization_revoked/host_failure |
| run.unknown | 仅 host_restarted；崩溃/重启后对历史 run 的墓碑标注，不是活状态 |
| run.completed | 成功且资源全部收敛；usage 数字分别可为 null，未报告不能填零 |
| run.failed | 已知失败且资源全部收敛；固定 failure code |
| run.stopped | 停止请求已接受且资源全部收敛 |

已接受 run 必须有且只有一个收敛终态（completed/failed/stopped）；终态后回调一律丢弃，不改写历史。拒绝 admission 不创建 run/seq。启动同步失败是 accepted → failed(START_FAILED)，不能生成 started。工具请求/结果按 callId 配对、每个 call 仅一个结果，callId 由 main 分配；模型侧 callId 只驻留适配器内部。拒绝工具本身允许模型解释并继续，绝不能输出假空成功或退回 shell。执行器失败停止本 run。

main 在 start 之前保留事件，避免早到丢失。重复 seq 忽略；缺序暂停增量并 getRun 补页；foreign session/project/run/revision 拒绝；事件版本或 schema 不合法拒绝并展示协议错误，不能修改运行状态。旧 run 的迟到文本、未知 call result、终态后回调均丢弃并计入本地限额诊断，不追加第二终态。历史 run 的正确修订不能被当前编辑修订误滤掉。

## 4. 停止、竞态与故障

状态迁移：starting → running → completed/failed；starting/running → stopping → stopped/failed(固定错误码)。`stopping` 只通向 `stopped` 或 `failed(固定错误码)`，不存在活的 `unknown` 等待态；`unknown` 仅在崩溃/重启后作为历史墓碑标注出现（见下）。同 session 的新运行仍须等当前 run 进入终态。

main 串行 reducer 的处理顺序决定竞态：终态先提交，后到 stop 返回已有状态；stop 先提交，后来 success 不能翻回 completed。停止前已确定的失败优先保留 failed；停止后由 Abort 引起的拒绝不升级为新的模型失败。工具已开始时必须等待结束，停止后不发布其正文，只追加 cancelled 结果。取消不回滚只读扫描，也不能宣称远端 Provider 已停止计费；确认的是本地模型传输与工具收敛。

停止过程固定为：关新准入 → 记录 stop_requested → Abort → 等模型流和工具/回调全部结束 → 追加唯一终态 → 释放资源。准备中取消也执行同一规则；adapter 迟到构造成功后不得 start，须释放该未运行 handle。正常结果在 quiescent 前到达时继续显示运行/停止中，不能提前确认。

停止宽限 5 秒：宽限内资源全部收敛则按通常规则落 stopped/failed；宽限到期仍未收敛由主进程强制结束并记 failed(STOP_TIMEOUT)——不新增等待态、不自动重试、不把超时当 stopped。停止时已确定的失败原因（RUN_DEADLINE/AUTHORIZATION_REVOKED/OUTPUT_LIMIT 等）在强制结束时保留原错误码。适配器通道断连走同一停止路径：宽限内本地资源可证收敛则 stopped，否则 failed(ADAPTER_DISCONNECTED)。运行总时限 120 秒触发 RUN_DEADLINE 失败原因与停止。有限静态诊断不能混入路径、密钥或原始异常。

用户可见结果仅五种：运行中 / 正在停止 / 已停止 / 已完成 / 失败（附固定错误码）。停止按钮自身承担即时反馈（点击后显示"停止中…"并不可再点，属界面本地反应）；真正"已停止"以后台收敛确认为准，不因回执提前显示。

关闭 panel/tab 只隐藏内容，不停止 run；关闭真正所属窗口或 renderer 崩溃则撤销授权和订阅、请求停止。正常应用退出先走最多 5 秒停止等待；仍未收敛即由主进程强制结束并记 failed(STOP_TIMEOUT)，不能阻塞到无限等待或声称成功。窗口重建增加 epoch，旧窗口不能订阅/控制，新窗口通过 main 显式恢复只读历史访问。

main 在 userData 中单独存有界运行日志，接受记录在 adapter start 前完成原子写入；终态也是原子写入。日志保存失败时不再接受新运行，当前 run 停止并显示错误。启动恢复凡没有已提交收敛终态的 run 一律标注 unknown/host_restarted 墓碑，清除所有授权、SDK、订阅和自动执行计划；只恢复历史材料。墓碑不占资源槽、不等待、不自动重跑。新 host 无旧资源，但必须提示上次未知并由用户重新授权新 run；绝不重放旧 request/grant。未知 schema/坏档沿用保留原件与显式恢复原则。

## 5. 预算、背压与材料复检

schema 的 RUN_LIMITS 是默认硬上限，renderer/模型不得覆盖。单工具并发 1；每 run 最多 32 次请求（包括拒绝）；时限 120 秒，模型输出最多 4,096 tokens，发往 Provider 的任务材料与消息正文每次及累计新材料最多 64 KiB（SDK/协议 framing 不计入材料字节，token usage 单独实录）。工具正文计入模型输入预算；任一不能计量的入口拒绝。

单个 text/tool-success chunk 最多 4 KiB，整个 wire event 最多 16 KiB，单 run 累计发布正文 256 KiB。超限关闭准入并停止，收敛后 failed(OUTPUT_LIMIT)。工具正文最多展示 4 KiB，超出标记 truncated；模型内部可消费更长但不超过工具和本轮输入预算。

每 run 环形事件缓冲最多 512 条且 1 MiB，先满足的约束生效；淘汰旧前缀但序号不重排、保留当前状态/lastSeq/终态快照。每 subscriber 一批最多 32 条，只允许一批未 ACK；2 秒无 ACK 断开该订阅，模型仍受自身总预算约束。缓冲淘汰导致 afterSeq < oldestSeq-1 时返回 gap 与当前快照，UI 明示“部分历史已省略”，不能拼接成完整输出。终态后保留 10 分钟，最多 32 个已结束 run，按结束时间淘汰；活动/unknown 不按终态清退。持久历史同样有界，不保存无限流式原文。

复用 #11 参数/元数据预检，执行预算不变：read_file 单文件 64 KiB；list_directory 最多 200 项；search 字面量、深度 16、1,000 文件、每文件 64 KiB、累计 4 MiB、100 hits，限额到达明确 truncated。搜索每个条目复检且跳过被拒项；不得先枚举敏感路径再向外发送目录名。项目访问与每次工具输出/模型发送前重新验证授权与材料身份，不能缓存预检 ok 当永久许可。

使用只读 handle 核对普通文件、identity/nlink/大小；读取前后 metadata 与清单 hash 不一致时不发布结果、使旧材料授权失效。每次访问、每个遍历条目及发布前复检 root、路径、链接、内容类型、预算与材料清单。执行期间变化即失败；这仍不能防御敌对进程反复替换祖先路径。P2 首条任务限定执行期间不变的隔离 fixture；敌对并发工作区需另行验证 OS 句柄隔离或不可变副本后才能支持。

原始参数、OS/Provider 异常不进入事件；固定 code 对应 UI 文案。输出仅来自批准材料，已知本次凭证值及认证头内容必须在 main 投影前移除，不能依赖 renderer 日志脱敏。材料本身可能含敏感信息，只有明确清单和范围才构成外发授权；字符串脱敏不是任意秘密识别保证。未授权正文拒绝为 MATERIAL_NOT_ALLOWED，不静默扩大清单，不以只读权限绕过外发确认。

## 6. #13 验收清单与独立真实记录

| 编号 | 必须观察的行为 | 证据层 |
| --- | --- | --- |
| A01 | main 原子 admission、重复请求、陈旧修订、跨 session/window/epoch、过期/撤销授权、unknown 占位、容量上限 | Contract + Electron |
| A02 | Pi 无凭证 import/构造/释放；固定依赖；开发入口与脱离源码的打包成品均通过，fuses/asar 保持 | 开发/成品加载探针 |
| A03 | 启动前订阅、文本与工具流、失败/拒绝、主进程分配顺序、早到/迟到/缺序、订阅撤销、ACK/保留上限 | 真实 Electron + 受控 adapter |
| A04 | 成功先于停止、停止先于成功、工具先停/模型先停、构造失败、超时/断连 unknown、关闭/崩溃恢复无重放 | 异步 Contract + 真实 Electron |
| A05 | 三工具真实文件 IO、静态/变化路径与权限复检、敏感源/二进制/链接拒绝、预算/truncation、外发材料拒绝 | Contract + 真实 Electron |
| A06 | committed fixture 前后 hash 相同，用户全局配置/凭证未读取或修改，错误/事件不泄密 | 文件不变量与受限环境探针 |
| A07 | P1 持久化迁移保留草稿/布局/历史；按需面板，不自动导航/抢焦点；运行状态显示真实来源与未知状态 | 真实 Electron，人工项另记 |
| A08 | pnpm verify:repository、完整 pnpm check、独立审阅；干净检出复建和成品启动的版本绑定 | 门禁/审阅/成品证据 |
| A09 | 明确获准的真实 Provider 启动、至少一个真实只读工具结果、完成和中途停止；usage 未提供则 null | 单独真实 Provider 记录 |

#12 探针只验证协议决策，不能替代 A01—A09 的生产实现验收。当前 #13 仍由 #12 阻塞；代码交付须核对最终远端版本后再处理票据，不通过修改 label 或关闭 #12 跳过交付门。

真实 Provider 记录固定字段：evidenceKind=real-provider、软件 commit/dirty 状态、包 SHA-256、平台与 Node/Electron/Pi 版本、provider/model/endpoint origin（无凭证）、授权时间与范围摘要/hash、run/session/revision、开始/停止请求/本地收敛时间、工具调用与结果摘要、结果状态、fixture 前后 hash、input/output tokens（nullable）、限制及脱敏日志路径。拒绝外发/无凭证/服务不可用分别记录原因与 NOT_RUN/FAILED，不用 controlled 或 replay 补票。#12 不调用真实 Provider。
