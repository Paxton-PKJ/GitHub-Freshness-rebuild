# Changelog

## v2.0.1 - 2026-04-21

- 修复搜索页前端时间已识别成功时仍错误弹出 API 提示的问题
- 搜索页改为优先识别结果主卡片中的前端更新时间，避免误扫次级仓库链接
- 搜索页与 Awesome 列表的 API 回退提示改为只记录一次，重置配置后可重新选择

## v2.0.0 - 2026-04-21

- 重写用户脚本，移除对 jQuery、SweetAlert、Pickr、Luxon 的依赖
- 仓库页和 `tree` 页改为优先读取 `relative-time[datetime]`
- 搜索页改为按仓库链接请求 GitHub API 的 `updated_at`
- Awesome 列表改为按仓库链接请求 GitHub API
- 新增对 GitHub PJAX、Turbo、History 和 DOM 变更的监听
- 配置入口改为 Tampermonkey / ScriptCat 菜单命令
- 删除原 `docs` 站点内容，精简文档并改为根目录维护

## v1.1.5 - 2025-02-24

- 修复多页切换时只有单页生效的问题
- 调整 AWESOME Token 默认值

## v1.1.4 - 2025-02-24

- 修复部分子页面未生效的问题

## v1.0.3 - 2025-02-20

- 小幅优化脚本加载与文档内容

## v1.0.1 - 2025-02-18

- 新增文件排序
- 新增 Awesome 列表支持
- 支持通过 GitHub API 显示 star 与最近更新时间

## v1.0.0 - 2025-02-14

- 首个可用版本
- 支持仓库页和搜索页基础高亮
- 支持时间阈值、主题和时间格式化
