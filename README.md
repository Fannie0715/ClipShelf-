# ClipShelf

**A context-aware shelf for everything you copy.**

ClipShelf is a local-first macOS clipboard companion. Once it is running, every `Command + C` can be gathered into a floating sidebar: text, links, images, source apps, browser URLs, and screenshot context. You can search, preview, edit, delete, pause capture, and save useful items into Obsidian.

**中文简介**

我做了一个「复制收集」插件：只要你按下 `Command + C`，复制过的文字、链接、图片都会自动汇总到侧边栏收藏夹里。

ClipShelf 会记录每一次复制的内容，并尽量保留当时的网页链接；如果链接无法读取，也会用截图留下页面上下文。你可以在本地收藏夹里浏览、搜索、二次编辑这些复制素材，把真正有用的内容一键保存到 Obsidian 的「复制素材库」里。

> MVP status: this is a local-first macOS prototype. It is useful today, but packaging and first-run configuration are still intentionally lightweight.

## Why This Exists

Copying is easy. Finding the thing you copied five minutes ago is not.

If you collect writing material, product references, screenshots, links, and snippets all day, your clipboard usually remembers only the latest item. ClipShelf turns those short-lived copies into a temporary material shelf, then lets you decide what deserves to become a permanent Obsidian note.

## Highlights

- Captures copied text, links, and images from the system clipboard.
- Shows a floating launcher plus a dense sidebar for search, filters, preview, save, delete, pause, refresh, and clear-all.
- Keeps unsaved local history for 7 days by default.
- Deduplicates previously captured text and links so repeated copies do not crowd the library.
- Captures source app, timestamp, active-window title, browser URL when available, and a screenshot fallback.
- Lets you edit copied content before saving.
- Saves selected items into an Obsidian project library called `复制素材库`.
- Stores data locally only. There is no server, account, telemetry, or cloud sync.

## Preview

The current UI has two surfaces:

- A floating macOS-style launcher for daily access.
- A Raycast-like sidebar with history, filters, selected-item preview, source context, and Obsidian actions.

Screenshots are not committed yet because copied content can contain private material. Add sanitized images under `docs/images/` before publishing a polished release.

## Requirements

- macOS
- Node.js 20+
- npm
- Obsidian, if you want to use the Markdown save flow

## Quick Start

```bash
npm install
npm run dev
```

For daily use, build the renderer and create a desktop launcher:

```bash
npm run build
npm run make-launcher
```

This creates `复制素材库.app` on your Desktop. Double-click it to open the floating launcher. Click `复制库` or the bottom arrow to open the full sidebar.

## Obsidian Setup

By default, the app looks for an Obsidian vault at:

```text
~/Documents/Obsidian Vault
```

You can override it with an environment variable:

```bash
CLIPBOARD_OBSIDIAN_VAULT="/path/to/your/vault" npm run dev
```

Saved materials are written to:

```text
复制素材库/
  复制素材库.md
  素材/
  附件/
```

Each saved item becomes a standalone Markdown note, and the project index links to it.

## macOS Permissions

Clipboard capture works without extra setup once the app is running.

For source screenshots and browser URLs, macOS may ask for additional permissions:

- Screen Recording: required for active-window or screen thumbnails.
- Automation: required for reading the current browser URL from Chrome, Arc, Edge, Brave, Vivaldi, or Safari.

If permission is denied, the app still captures clipboard content. It simply shows a missing screenshot or URL fallback.

## Privacy

Clipboard content can be sensitive. This app is intentionally local-first:

- Clipboard history is stored under the Electron user data directory on your Mac.
- Unsaved local history is automatically cleaned after the retention window.
- Obsidian export writes only to your local vault.
- No network request is made by the app itself.
- No analytics or tracking is included.

See [PRIVACY.md](PRIVACY.md) for more detail.

## Scripts

```bash
npm run dev           # start Vite and Electron for development
npm run build         # type-check and build the renderer
npm run typecheck     # run TypeScript checks only
npm run start         # start Electron against the built/local app
npm run make-launcher # create the Desktop launcher on macOS
```

## Project Structure

```text
electron/       Electron main process and preload bridge
src/            React UI
scripts/        dev server and macOS launcher helpers
dist/           generated build output, ignored by git
```

## Roadmap

- First-run vault picker instead of environment-variable configuration.
- Packaged `.dmg` release for non-developer installation.
- Global shortcut for opening and hiding the sidebar.
- Safer sensitive-content pause modes.
- Optional classification rules for Obsidian categories.
- Import/export tools for local history backups.

## Contributing

Issues and pull requests are welcome. Please avoid attaching real clipboard history, private screenshots, personal URLs, or Obsidian notes when reporting bugs.

## License

MIT
