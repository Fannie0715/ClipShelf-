# Publishing To GitHub

This project should be published as source code in the repository and as packaged downloads in GitHub Releases.

## Repository Homepage

The repository should contain:

- `README.md` as the public project homepage
- `LICENSE`
- `PRIVACY.md`
- `CONTRIBUTING.md`
- source code under `electron/`, `src/`, and `scripts/`
- `package.json` and `package-lock.json`

Do not commit:

- `node_modules/`
- `dist/`
- generated `.app`, `.dmg`, or `.zip` files
- local clipboard history
- screenshots containing private content
- Obsidian vault contents

## Suggested GitHub Settings

- Visibility: public, if the goal is open source
- Repository name: `ClipShelf-`
- Description: `A context-aware shelf for everything you copy.`
- Topics: `clipboard`, `electron`, `macos`, `obsidian`, `productivity`, `react`, `typescript`

## First Push

```bash
git init
git add .
git commit -m "Initial open source release"
git branch -M main
git remote add origin git@github.com:Fannie0715/ClipShelf-.git
git push -u origin main
```

Use the HTTPS remote instead if SSH is not configured:

```bash
git remote add origin https://github.com/Fannie0715/ClipShelf-.git
```

## Release Downloads

GitHub Releases are the right place for built app downloads. A future packaging step should produce files such as:

```text
ClipShelf-mac-arm64.dmg
ClipShelf-mac-arm64.zip
```

The repository should not store these binaries directly.

## Pre-Release Checklist

```bash
npm install
npm run typecheck
npm run build
rg -n "token|secret|password|local user path|private vault" . --glob '!node_modules/**' --glob '!dist/**'
```

Review all matches before publishing.
