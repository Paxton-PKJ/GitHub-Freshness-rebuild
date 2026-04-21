# GitHub-Freshness-rebuild

GitHub-Freshness-rebuild 是一个用于 GitHub 页面增强的用户脚本，用来快速判断仓库、文件树和 Awesome 列表是否仍在持续更新。

## 功能

- 在仓库页、文件树和搜索结果中直观标记最近仍在更新的项目
- 帮助快速区分活跃仓库、低活跃仓库和长期未维护的内容
- 支持在 Awesome 列表中补充仓库的星标数和最近更新时间
- 支持按时间阈值、高亮颜色和时间格式自定义展示效果
- 支持按更新时间排序文件列表，便于快速定位最近变动的内容
- 通过 Tampermonkey 或 ScriptCat 菜单完成配置

## 安装

先安装任一脚本管理器：

Tampermonkey:

[<img alt="Available in the Chrome Web Store" src="https://developer.chrome.com/static/docs/webstore/branding/image/iNEddTyWiMfLSwFD6qGq.png" height="48">](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)

[<img alt="Get it from Microsoft Edge Add-ons" src="https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/add-ons-badge-images/microsoft-edge-add-ons-badge.png" height="48">](https://microsoftedge.microsoft.com/addons/detail/%E7%AF%A1%E6%94%B9%E7%8C%B4/iikmkjmpaadaobahmlepeloendndfphd)

ScriptCat:

[<img alt="Available in the Chrome Web Store" src="https://developer.chrome.com/static/docs/webstore/branding/image/iNEddTyWiMfLSwFD6qGq.png" height="48">](https://chrome.google.com/webstore/detail/scriptcat/ndcooeababalnlpkfedmmbbbgkljhpjf)

[<img alt="Get it from Microsoft Edge Add-ons" src="https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/add-ons-badge-images/microsoft-edge-add-ons-badge.png" height="48">](https://microsoftedge.microsoft.com/addons/detail/scriptcat/liilgpjgabokdklappibcjfablkpcekh)

安装脚本：

- 直接点击安装：
  [https://raw.githubusercontent.com/Paxton-PKJ/GitHub-Freshness-rebuild/main/GitHub-Freshness-rebuild.user.js](https://raw.githubusercontent.com/Paxton-PKJ/GitHub-Freshness-rebuild/main/GitHub-Freshness-rebuild.user.js)

## 使用

打开 GitHub 页面后，从 Tampermonkey 或 ScriptCat 菜单选择 `GitHub-Freshness-rebuild:*` 系列命令进行配置。

常用配置项：

- 主题模式：`auto` / `light` / `dark`
- 当前主题时间阈值：例如 `30 day`
- 当前主题排序：`asc` / `desc`
- 当前主题时间格式化
- 当前主题 Awesome 模式
- GitHub Token
- 编辑浅色 / 深色主题 JSON

## Token

- GitHub Token 获取文档见 [TOKEN.md](./TOKEN.md)
- 未配置 Token 时，GitHub API 仍可使用，但速率限制更低
- 搜索页和 Awesome 列表的数据来自 GitHub API，仓库文件列表数据来自页面内的 `relative-time[datetime]`

## 更新日志

- 见 [CHANGELOG.md](./CHANGELOG.md)

## 声明

本脚本在任何支持油猴的浏览器皆可使用，并秉承「不作恶」的原则， 无需用户注册登录，不跟踪不记录任何用户信息，无需关注公众号，不添加广告。

本脚本修改自[rational-stars/GitHub-Freshness](https://github.com/rational-stars/GitHub-Freshness)，
无任何隐藏、混淆和加密代码，所有代码开源可供用户查阅学习。不需要的用户可以无视。