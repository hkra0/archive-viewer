# archive-viewer

A local-first reader for AI conversation exports. Files are processed in the browser and are never uploaded by the application.

## MVP features

- Drag-and-drop ZIP, JSON, and Markdown import
- ChatGPT and Claude adapters, plus generic JSON and Markdown fallbacks
- In-memory full-text search, time ordering, Markdown, code highlighting, and ZIP image attachments
- Editable local Context Snapshot, with copy and Markdown download
- Cloudflare Pages-compatible static build

The app has no account system, database, server-side file storage, analytics SDK, or automatic remote AI call.

## Development

```bash
npm install
npm run dev
```

## Build and deploy

```bash
npm run build
```

Deploy the generated `dist` directory to Cloudflare Pages. No database, authentication, or server-side file storage is used.

## Supported inputs

The importer detects ChatGPT `conversations.json`, common Claude JSON exports, generic JSON collections, Markdown files, and ZIP archives containing those formats. Gemini, DeepSeek, and Kimi exports with conventional `title`/`messages`/`role`/`content` fields use the generic JSON adapter; provider-specific adapters can be added independently.
