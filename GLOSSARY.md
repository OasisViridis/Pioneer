# Pioneer

Pioneer 的会话与任务运行术语。中文说明含义，英文名称用于标识技术概念。

## Language

**Harness（运行层）**：
组织上下文、模型调用和工具使用的运行层。
_Avoid_: 用 Runtime 或模型代称整个 Harness。

**Runtime（任务运行时）**：
管理任务启动、运行状态、停止和结束的运行环境。
_Avoid_: 用 Session 或单次 Run 代称 Runtime。

**Session（会话）**：
围绕一个项目保存的对话和工作记录，可包含多次 Run。
_Avoid_: 用窗口、标签页或 Run 代称 Session。

**Run（一次执行）**：
Session 中一次从启动到结束的任务执行，可因完成、失败或停止而结束。
_Avoid_: 用 Session 代称 Run。

**Provider（模型服务）**：
向 Pioneer 提供模型访问的服务或接入方；一个 Provider 可以提供多个模型。
_Avoid_: 用具体模型代称 Provider。

**Diff（文件改动对比）**：
文件修改前后的差异，供用户审阅新增、删除和修改的内容。
_Avoid_: 用批准结果或保存状态代称 Diff。

**Grant（运行授权）**：
主进程签发的单次运行许可，绑定当前任务、可外发材料与有效期；任务或材料变更后须重新授予。
_Avoid_: 把意图确认（READY）、读取许可或模型接入当作 Grant。

**外发材料清单（Egress Manifest）**：
一次 Run 中允许发送给模型的具体文本与文件范围；可读取不等于可外发。
_Avoid_: 用读取权限或会话内容代称外发范围。

**收敛（Quiescent）**：
模型调用与工具执行全部结束、不再产生输出的确认状态。正常停止要等到收敛才落终态；停止宽限（默认 5 秒）到期仍未收敛时由主进程强制结束，记停止前已确定的失败原因（如 `RUN_DEADLINE`/`OUTPUT_LIMIT`），没有既定原因才记 `failed(STOP_TIMEOUT)`；不把超时当作收敛。
_Avoid_: 把 Abort 信号、停止按钮反馈、收到停止回执或宽限到期当作收敛。

**未正常结束（Unknown）**：
崩溃或重启时没有留下终止记录的历史 Run 标注；仅存在于历史，不占运行位置，也不等待确认。
_Avoid_: 把 Unknown 当作运行中的状态、界面状态或可恢复的执行。
