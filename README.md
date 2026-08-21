# archive-viewer

[English](README.md) | [中文](README.zh-CN.md)

A reader for AI conversation exports. Files are processed in the browser and are never uploaded by the application.

## Features

- Drag-and-drop ZIP, JSON, HTML, Markdown, and folder import
- ChatGPT, Claude, Grok, DeepSeek, and Google Takeout Gemini adapters, plus generic JSON and Markdown fallbacks
- Local groups with account/profile hints extracted from packaged exports when available
- Persistent browser-local storage, full-text search, time ordering, Markdown, code highlighting, and image attachments
- Re-import merging: identical messages are skipped, while conflicting content is preserved as a branch revision
- Copy the currently selected conversation branch with configurable metadata and an optional AI continuation prompt
- Delete one group or clear every local group and attachment in one action
- Cloudflare Pages-compatible static build

The app has no sign-in, server-side database, server-side file storage, analytics SDK, or automatic remote AI call. Groups and imported data are stored only in the browser's IndexedDB database until removed by the user.

## Development

```bash
npm install
npm run dev
```

## Build and deploy

```bash
npm run build
```

Deploy the generated `dist` directory to Cloudflare Pages. No server-side database, authentication, or server-side file storage is used.

## Supported inputs

The importer detects ChatGPT `conversations.json` and current sharded exports such as `conversations-000.json` with their packaged attachments, common Claude JSON exports, Grok backend exports, DeepSeek fragment mappings, Google Takeout Gemini activity HTML, generic JSON collections, Markdown files, folders containing those files, and ZIP archives containing those formats. Other exports with conventional `title`/`messages`/`role`/`content` fields use the generic JSON adapter; provider-specific adapters can be added independently.
