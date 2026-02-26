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

- `pixel-agents.billy.baseUrl` (default `http://127.0.0.1:5001`)
- `pixel-agents.billy.askPath` (default `/ask`)
- `pixel-agents.billy.healthPath` (default `/health`)
- `pixel-agents.billy.requestTimeoutMs` (default `60000`)

## Install from Source

```bash
git clone https://github.com/bitscon/pixel-agent.git
cd pixel-agent
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
code --install-extension pixel-agents-*.vsix
```

Or use **Extensions: Install from VSIX...** from the VS Code Command Palette.

After install:

1. Open Settings and configure Billy endpoint values if needed (`pixel-agents.billy.*`).
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

`~/.pixel-agents/sessions/<workspace-hash>/<agent-id>.jsonl`

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

## License

MIT. See [LICENSE](LICENSE).
