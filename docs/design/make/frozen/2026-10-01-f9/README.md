# Pioneer-Make-F9 · 只读参考归档

2026-10-01 冻结 `Version 9 · 完善对话功能与布局`。不再在 Make 上继续生成或发布修订；后续工程实现与修复在 Pioneer 中进行。

- [原样源码 ZIP](pioneer-make-f9.zip)：用户提供，7,134,970 bytes。
- [清单／逐文件哈希](manifest.json)。ZIP SHA-256：`fd1758332c24001ad36949fd7e96850d107a507589b5bd5587bfdbc630b5d1cd`。
- [最终浏览器验收](../../../../research/figma-make-final-acceptance-2026-10-01.md)。
- [工程开发计划](../../../../plans/2026-10-01-pioneer-frozen-prototype-development-plan.md)。

ZIP 保留源文件、lockfile 和素材，未安装、启动或提取到活动应用目录。包内 `AGENTS.md`、`CLAUDE.md` 和 `.figma` 脚本是 Make 的历史环境资料，不是 Pioneer 仓库指令，不执行它们。

这是 React + Vite + Tailwind 浏览器原型，不是可直接安装的 Electron 产品。字体仍是远程 CSS 引用，没有包含离线字体二进制；网页模拟状态和 localStorage 也不替代 Pioneer 的真实合同、权限和存储。
