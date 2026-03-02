# Pixel Agents

A VS Code extension that turns Billy Runtime coding sessions into animated pixel art characters in a virtual office.

Each Billy terminal you open spawns a character that walks around, sits at desks, and visually reflects session state (active, waiting, or needs confirmation).

![Pixel Agents screenshot](webview-ui/public/Screenshot.jpg)

## Features

- One agent, one character terminal model
- Live transcript-driven activity updates
- Plan/build mode visualization from Billy metadata
- Confirmation bubble support when Billy requires approval
- Office layout editor with floors, walls, and furniture
- Persistent layouts shared across VS Code windows
- Optional sound notifications on waiting transitions

## Requirements

- VS Code 1.109.0 or later
- Billy Runtime available over HTTP (default: `http://127.0.0.1:5001`)

## Billy Runtime Settings

Configured in VS Code settings:

- `pixel-billy.billy.baseUrl` (default `http://127.0.0.1:5001`)
- `pixel-billy.billy.askPath` (default `/ask`)
- `pixel-billy.billy.healthPath` (default `/health`)
- `pixel-billy.billy.requestTimeoutMs` (default `60000`)

## Install from Source

```bash
git clone https://github.com/bitscon/pixel-billy.git
cd pixel-billy
npm install
cd webview-ui && npm install && cd ..
npm run build
```

## Package and Install (.vsix)

Build and package the extension:

```bash
npm run package
```

Install the generated `.vsix` in a normal VS Code window:

```bash
code --install-extension pixel-billy-*.vsix
```

Or use **Extensions: Install from VSIX...** from the VS Code Command Palette.

After install:

1. Open Settings and configure Billy endpoint values if needed (`pixel-billy.billy.*`).
2. Open the **Pixel Agents** panel.
3. Click **+ Billy** to spawn a terminal-backed Billy session.

## Usage

1. Open the **Pixel Agents** panel.
2. Click **+ Billy** to spawn a Billy terminal and character.
3. Chat in the terminal (`you>` prompt).
4. Watch character state update from transcript semantics.
5. Use **Layout** to edit and save your office.

## How It Works

Pixel Agents launches a bundled Billy terminal runner. The runner sends prompts to Billy Runtime (`/ask`) and writes JSONL transcript records under:

`~/.pixel-billy/sessions/<workspace-hash>/<agent-id>.jsonl`

The extension watches each transcript file and maps semantic records to UI state:

- `system.agent_identity`
- `system.billy_mode`
- `system.approval_required`
- `system.turn_duration`

No direct execution is performed by Pixel Agents.

## Tech Stack

- Extension: TypeScript, VS Code Webview API, esbuild
- Runner: Node.js terminal REPL + HTTP client
- Webview: React 19, TypeScript, Vite, Canvas 2D

## Layout Editor

- Floor and wall painting with color controls
- Furniture placement, rotation, and state toggling
- Undo/redo and import/export layout JSON
- Grid expansion up to 64x64 tiles

## Development Commands

```bash
npm run check-types
npm run lint
npm run build
```

## Upstream Sync Operations

This project uses a tag-driven mirror + backport model to bring in updates from `pablodelucca/pixel-agents` while keeping `main` Billy-only.

- Runbook: `UPSTREAM_SYNC.md`
- Guard checks: `scripts/check-billy-only.sh`
- Sync helper: `scripts/upstream-sync.sh`
- Issue template: `.github/ISSUE_TEMPLATE/upstream-sync.md`
- PR template: `.github/PULL_REQUEST_TEMPLATE/upstream-sync.md`

### Quick start

```bash
# Prepare mirror and sync branch for a specific upstream tag
scripts/upstream-sync.sh prepare --tag <upstream-tag> --push-mirror

# List candidate commits from your last synced upstream ref
scripts/upstream-sync.sh candidates --from-ref <last-synced-upstream-ref>

# Validate branch before PR
scripts/upstream-sync.sh validate

# Billy runtime connectivity smoke check (health only)
npm run check:billy-connectivity
```

### Full sync cycle (recommended)

1. Open an issue using `.github/ISSUE_TEMPLATE/upstream-sync.md` and fill:
   - upstream tag you are targeting
   - last synced upstream ref
2. Prepare the mirror branch and a backport branch:

```bash
npm run sync:prepare -- --tag <upstream-tag> --push-mirror
```

3. List candidate upstream commits since your last synced ref:

```bash
npm run sync:candidates -- --from-ref <last-synced-upstream-ref>
```

4. For each candidate, run the diff guard:

```bash
scripts/upstream-sync.sh verify-commit <commit-sha>
```

5. Import only approved commits:

```bash
scripts/upstream-sync.sh backport <commit-sha>
```

6. Validate Billy-only rules and build:

```bash
npm run sync:validate
```

7. Run Billy connectivity checks:

```bash
# Health endpoint check
npm run check:billy-connectivity

# Full smoke check (health + ask)
bash scripts/check-billy-connectivity.sh
```

8. Open a PR using `.github/PULL_REQUEST_TEMPLATE/upstream-sync.md` and include:
   - imported commits
   - adapted commits
   - rejected commits with rationale
   - validation and connectivity evidence

### Safety rules

- Never push to `upstream`
- Never merge `upstream/main` directly into `main`
- Never bypass `scripts/check-billy-only.sh`
- Keep provenance for imported commits (`git cherry-pick -x`)

## License

MIT. See [LICENSE](LICENSE).
