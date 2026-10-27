# Windows 初始基线提案

这些文件来自真实 Windows Electron 截图，作为 [PR #51](https://github.com/OasisViridis/Pioneer/pull/51) 中独立提交的初始基线提案。Codex 已逐张查看；**尚不代表人类设计验收或允许合并**。后续更新必须经过明确的图片 Diff 审阅，CI 不写入本目录。

- 候选来源：[quality run 130](https://github.com/OasisViridis/Pioneer/actions/runs/40447866725)，`Capture missing baseline candidates (not acceptance)` 成功。
- PR head：`7c42c7c978ec4643bdc1d9d8097666442bf1e907`；实际截图 checkout 为 PR 合并测试提交 `4034f96d7c6adb65ae80c8ec36bf37835e6a7b2f`，包含 main `c12a20a03f7debe3060b7f8993cae0ebd85e1212`。
- 原始产物：[visual-comparison artifact](https://github.com/OasisViridis/Pioneer/actions/runs/40447866725/artifacts/12709261457)，ZIP SHA-256 `f14f8823da6ece9fc7c665ae63bed3b09ca2e3961069fde70b4fc799675cc794`。
- `environment.txt` 与四张 PNG 原样复制，没有重编码、修图或使用 Figma 图片代替应用截图。

2026-10-27 的 Codex 目视检查：1440、900、640 宽度下标题、Hazel、运行提示和输入区均可见，无横向裁切或重叠；640 宽度工具栏正常换行。长文本位于 textarea 内并有滚动条，滚动位置为输入末尾；Tab / Shift+Tab 后焦点边框可见，保存按钮仍可见。四图均使用 reduced motion，行为用例另行断言该媒体设置。

此来源 run 的严格比较因为尚无基线而失败，不能作为比较通过证据。加入提案后的最终 SHA 必须重新运行严格比较、故意反色失败和恢复通过检查；实际结果链接放在 PR，避免记录结果的提交不断改变待验证 SHA。
