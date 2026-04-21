# GitHub Token 获取说明

GitHub-Freshness-rebuild 在搜索页和 Awesome 列表中会调用 GitHub API。未登录状态的 API 频率限制较低，建议配置一个个人访问令牌。

## 官方入口

- GitHub Token 页面：[https://github.com/settings/tokens](https://github.com/settings/tokens)
- GitHub 官方文档：[https://docs.github.com/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens](https://docs.github.com/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)

## 推荐做法

1. 登录 GitHub 后打开 `Settings > Developer settings > Personal access tokens`。
2. 选择创建 `Fine-grained personal access token`，如果你更习惯旧版，也可以创建经典令牌。
3. 对本脚本，只需要能读取公开仓库元数据即可；如果只查询公开仓库，保持最小权限即可，不需要额外仓库写权限。
4. 生成后复制 Token。
5. 在 Tampermonkey 或 ScriptCat 菜单中点击 `GitHub-Freshness-rebuild: GitHub Token`，粘贴保存。

## 说明

- Token 只保存在本地脚本管理器存储中。
- 清空输入并保存即可删除已配置的 Token。
- 如果只是偶尔使用，也可以不配置 Token，只是更容易碰到 GitHub API 限流。
