# Contributing

Thanks for considering a contribution.

## Local Setup

```bash
npm install
npm run dev
```

Run checks before opening a pull request:

```bash
npm run typecheck
npm run build
```

## Development Notes

- Keep clipboard data local-first.
- Do not add telemetry or network sync without an explicit privacy discussion.
- Avoid committing generated builds, local history, screenshots, logs, or Obsidian notes.
- Keep macOS permission failures graceful. Clipboard capture should still work even if screenshots or browser URLs are unavailable.

## Pull Requests

Please include:

- what changed
- why it changed
- how it was tested
- screenshots or recordings only when they are sanitized
