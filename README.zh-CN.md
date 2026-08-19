# archive-viewer

[English](README.md) | [中文](README.zh-CN.md)

一个用于阅读 AI 对话导出文件的工具。所有文件均在浏览器中处理，应用不会上传任何文件。

## 功能

- 支持拖放导入 ZIP、JSON、HTML、Markdown 文件及文件夹
- 内置 ChatGPT、Claude、Grok、DeepSeek 和 Google Takeout Gemini 适配器，并提供通用 JSON 与 Markdown 兜底解析
- 支持本地分组；可在导出包中存在相关信息时提取账号或个人资料提示
- 使用浏览器本地持久化存储，提供全文搜索、时间排序、Markdown 渲染、代码高亮和图片附件支持
- 再次导入时自动合并：跳过完全相同的消息，并将内容冲突保留为分支修订
- 可复制当前选中的对话分支，并按需附带可配置的元数据和 AI 续写提示词
- 支持删除单个分组，或一次清除全部本地分组和附件
- 可构建为兼容 Cloudflare Pages 的静态站点

应用不包含登录功能、服务端数据库、服务端文件存储、分析 SDK 或自动远程 AI 调用。分组和导入的数据仅保存在浏览器的 IndexedDB 中，直至由用户自行删除。

## 本地开发

```bash
npm install
npm run dev
```

## 构建与部署

```bash
npm run build
```

将生成的 `dist` 目录部署至 Cloudflare Pages。项目不使用服务端数据库、身份验证或服务端文件存储。

## 支持的输入格式

导入器可识别 ChatGPT 的 `conversations.json`、常见 Claude JSON 导出、Grok 后端导出、DeepSeek 片段映射、Google Takeout Gemini 活动 HTML、通用 JSON 集合、Markdown 文件、包含上述格式的文件夹，以及 ZIP 压缩包。对于具有常规 `title`、`messages`、`role`、`content` 字段的其他导出文件，将使用通用 JSON 适配器；也可按需独立添加特定平台的适配器。
