# Jujutsu (jj) 工作流规范 · Pioneer

> 本文档记录 Pioneer 项目在具备 Jujutsu 环境时的协同与提交规范。当前默认工作副本为 Git-only，如工作副本包含 `.jj/`，优先使用本指南。

## 核心原则

1. **单一交付责任人**：所有变更由主交付责任人统管，子代理可协助编码与调研。
2. **Git 远端兼容**：通过 `jj` 管理本地变更树，但对远程推送（`jj git push`）保持严格的人类明确授权要求。
3. **质量门禁先行**：在推进书签（bookmark）与创建新修订前，必须确保 `pnpm check` 全门禁 exit 0。

## 常用工作流命令

```powershell
# 1. 检查当前工作副本状态与快照
jj status

# 2. 执行当前完整质量门禁
pnpm check

# 3. 添加语义化变更说明
jj describe -m "feat/fix/docs: <description>"

# 4. 锁定当前阶段并将 main 书签推进至此
jj bookmark set main -r "@"
jj new

# 5. 推送至远程 GitHub（须经人类明确授权）
jj git push
```

## 注意事项

- 当前环境未安装或未初始化 Jujutsu 时，切勿强行转换现有 Git 仓库。
- 无论使用 Git 还是 Jujutsu，严禁执行破坏性重置（如 `git reset --hard`、`jj abandon` 丢弃未备份工作区）或覆盖未跟踪候选。
