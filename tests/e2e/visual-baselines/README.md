# Windows 已审阅视觉基线

这些文件来自真实 Windows Electron 截图。2026-10-28，用户明确委托 Codex 完成剩余视觉核验；Codex 已逐张复核并接受本组当前实现的回归基线，详见[委托视觉复核](../../../docs/testing/issue37-visual-review.md)。这不代表 Windows 真人/真实 Provider 验收或合并授权。后续更新必须经过明确的图片 Diff 审阅，CI 不写入本目录。

- 候选来源：[quality run 130](https://github.com/OasisViridis/Pioneer/actions/runs/40447866725)，`Capture missing baseline candidates (not acceptance)` 成功。
- PR head：`7c42c7c978ec4643bdc1d9d8097666442bf1e907`；实际截图 checkout 为 PR 合并测试提交 `4034f96d7c6adb65ae80c8ec36bf37835e6a7b2f`，包含 main `c12a20a03f7debe3060b7f8993cae0ebd85e1212`。
- 原始产物：[visual-comparison artifact](https://github.com/OasisViridis/Pioneer/actions/runs/40447866725/artifacts/12709261457)，ZIP SHA-256 `f14f8823da6ece9fc7c665ae63bed3b09ca2e3961069fde70b4fc799675cc794`。
- 初始 `environment.txt` 与四张 PNG 原样复制，没有重编码、修图或使用 Figma 图片代替应用截图。三张正常图与环境文件继续保留；长文本图采用下述焦点修复后的 Windows 原图。

2026-10-27 的 Codex 目视检查：1440、900、640 宽度下标题、Hazel、运行提示和输入区均可见，无横向裁切或重叠；640 宽度工具栏正常换行。长文本位于 textarea 内并有滚动条，滚动位置为输入末尾；Tab / Shift+Tab 后焦点边框可见，保存按钮仍可见。四图均使用 reduced motion，行为用例另行断言该媒体设置。

此来源 run 的严格比较因为尚无基线而失败，不能作为比较通过证据。加入提案后的最终 SHA 必须重新运行严格比较、故意反色失败和恢复通过检查；实际结果链接放在 PR，避免记录结果的提交不断改变待验证 SHA。

## 2026-10-28 焦点修复复核

- 来源：[quality run 161](https://github.com/OasisViridis/Pioneer/actions/runs/40649302450)，PR head `254b5f671565a0d3b0bc962e77b92248a94beadd`；实际 checkout `fc8bf2cff2b760d37c5caaaf9230fe240959a62c`，同步 main `b93d8e9832608e26eff7c76e2b3bec0ffa95576a`。
- [原始 artifact](https://github.com/OasisViridis/Pioneer/actions/runs/40649302450/artifacts/12799431091)，ZIP SHA-256 `a2c77950bde886edb2ccfd85c7d5e3659e8a40cf9260d0ad7291f03f521455a1`。
- 环境文件与三张 `NORMAL conversation` 附件均逐字节等于原基线。长文本的 `NORMAL` 附件等于此次比较失败的 actual；失败发生在故障注入之前，因此这张 actual 是正常界面。
- 原样复制长文本图，SHA-256 `3bb40f3bc81b5ba8c240b3766a6f8d3c773592fb12308dd8e68872d028c34bee`。目视确认蓝色键盘焦点清晰，文本、滚动条与保存按钮可见。所有变化限于输入框区域 `(34, 810)–(606, 895)`；严格像素比较报告 5084 个差异像素，原始 RGB 比较为 6389 个，差异来自抗锯齿阈值。
- 本次来源 run 因焦点样式与旧图不同而正确失败；接受新图后仍须运行最终同提交 CI，检查四图、故意失败与恢复通过。最终结果记录在 PR，不能拿此来源 run 冒充通过。

## 2026-10-29 main 更新后的复核

- #57 已合并，空会话中的入口从“运行日志”改为“运行控制”，说明文字也随实际交互更新。旧基线在 [quality run 40822616038](https://github.com/OasisViridis/Pioneer/actions/runs/40822616038) 的严格比较中正确报差异。
- 四张候选来自 [Windows candidate run 40822905201](https://github.com/OasisViridis/Pioneer/actions/runs/40822905201)，[原始 artifact](https://github.com/OasisViridis/Pioneer/actions/runs/40822905201/artifacts/12874988963) 的 ZIP SHA-256 为 `0affefae0ab4f1612dac63e8f1ef1018ec062bd73c510e0bb4388f08ab3bdb28`。候选提交 `89740e20c58041ce4bf8669e679083e9dc545101` 相对待验证 head `7d5501fe2df755eba672a50e9e9fce06da664e48` 仅更改 CI 配置以采集候选，应用代码和测试未变。
- Codex 逐张检查 1440、900、640 正常图及 640 长文本焦点图；窄窗说明正常换行，焦点、滚动条和保存按钮可见，无重叠或裁切。环境文件与旧基线逐字节相同。逐像素 RGB 比较每张 2503 像素不同，仅落在入口名称和运行说明文字的行内；旧图的故障高亮不是正常界面。
- 四张 PNG 从原始 artifact 原样复制，未重编码。按上面顺序的 SHA-256 为 `2230a72a40cbbc30a031973454e38a1f01688dedb1555d49af811c0677865ae1`、`a61a956f24231f9d232dd4b95703f2a68432cd5de532b64106a561f4b222924d`、`fe06a0a58e363dd73719b2c6c13245e2e9cc147ecf478e446cc55d755438493c`、`a92d58d4e028b9477aa986027b4551c82015d2507ea837050253a6516f0cc8f3`。
- 候选截图通过不等于严格回归通过；更新基线后的最终 head 仍需 Windows 质量与视觉检查，包括故意反色失败及恢复。真人 Windows／Provider 验收不在本次范围。
