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

## 2026-11-02 runner image 退出环境门禁

- PR #63 把 `environment.txt` 的 image 更新到 `20261030.294.1` 后，PR 的视觉检查通过；合入 main 的 merge commit `2110444` 又被分到 image `20261021.278.1`，同一个提交因镜像分配不同而失败。
- GitHub 的 `windows-latest` 池混用两个镜像版本。`environment.txt` 现在只断言渲染相关字段：OS、Electron/Chrome、pixelRatio、字体哈希、locale、time、motion、colorScheme。runner image 仍写入附件 `environment`，供追溯，不再参与断言。
- 四张 PNG 未改；PR #63 在新镜像上已用同一组图片通过严格比较，说明镜像差异没有改变本次检查的像素。

## 2026-11-06 Agent 编辑权限文案复核

- #91 加入显式开启的文本编辑模式，首页说明由“工具仅限只读”改为“工具默认只读”。旧基线在 [quality run 42220805664](https://github.com/OasisViridis/Pioneer/actions/runs/42220805664) 正确报告差异；同次 Windows 功能门禁通过。
- 候选来自 [Windows candidate run 42220823653](https://github.com/OasisViridis/Pioneer/actions/runs/42220823653)，实际 checkout 为 `d70c540fa7b5144aaf4e7a692750c350f8197e09`。[原始 artifact](https://github.com/OasisViridis/Pioneer/actions/runs/42220823653/artifacts/13502923811) 的 SHA-256 为 `9c2391399d3481b34f69369d1e5551432a9b66dacd801a7de7f4d836c28c49a8`。
- Codex 逐张对照旧图检查 1440、900、640 正常图与长文本焦点图。标题、说明、输入框和保存按钮无重叠或裁切，窄窗正常换行，长文本焦点和滚动条清晰。环境文件逐字节相同，保持原文件。
- 原始 RGBA 像素比较：四图分别变化 286、299、286、298 个像素。每图 286 个位于“仅限”改为“默认”的字形内；900 图另有 13 个像素位于面板左下圆角 `(16, 943)–(27, 954)`，长文本图另有 12 个位于同一圆角 `(8, 947)–(19, 958)`，各颜色通道差不超过 2，未改变几何或可见布局。接受这些原始截图，不调整比较阈值。
- 四张 PNG 原样复制，未重编码。按上述顺序的 SHA-256 为 `a52624876cb42ee0b482349ef7f675e4294020d4203b905b44b77a6364f94741`、`e9cb97c691d0795fa7d81e19fd7fab1cf0740d8be6db87a5983e017735aa1548`、`db6a9e88f50aefeb7b68f689a220f037d3185ece33e470c076f97b88edf38619`、`f2dd1151584714666e9c3a79f2c46abee9ce516277c27a1624cf0cb83b4a6123`。
- 候选截图不等于回归通过。最终提交仍须通过严格比较、故意反色失败及恢复检查，结果记录在 PR #92；不据此宣称真实 Provider 编辑或真人 Windows 验收。
