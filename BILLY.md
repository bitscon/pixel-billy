# Pixel Agents — Billy Integration Reference

Pixel Agents is a VS Code extension with a React webview that renders animated office characters for each Billy Runtime terminal session.

## Architecture

```
src/
  extension.ts                 - Extension entrypoint
  PixelAgentsViewProvider.ts   - Webview provider + message routing + terminal lifecycle
  billyConfig.ts               - VS Code settings reader/validator for Billy Runtime
  billyRunner.ts               - Terminal REPL runner that calls Billy /ask and writes JSONL
  agentManager.ts              - Agent create/remove/restore + session/transcript persistence
  fileWatcher.ts               - Per-agent transcript watch (fs.watch + polling fallback)
  transcriptParser.ts          - Transcript semantic parser -> webview state messages
  timerManager.ts              - Waiting/permission timer helpers
  constants.ts                 - Extension constants
  types.ts                     - Agent and persistence types

webview-ui/src/
  App.tsx                      - Root app composition
  hooks/useExtensionMessages.ts- Extension message state sink
  hooks/useEditorActions.ts    - UI actions (+Billy, layout tools)
  components/BottomToolbar.tsx - +Billy button, Layout, Settings
  components/AgentLabels.tsx   - Character labels + mode tags
  components/DebugView.tsx     - Debug cards with mode/status
  office/*                     - Canvas engine, layout editor, sprites, rendering
```

## Billy Runtime Flow

1. User clicks `+ Billy`.
2. Extension creates one terminal + one agent + one transcript file.
3. Extension launches `dist/billy-runner.js` using extension-host Node runtime.
4. Runner opens REPL prompts (`you>` / `billy>`).
5. Each user prompt is sent to Billy Runtime `POST /ask` with `session_id`.
6. Runner writes JSONL records; extension watches file; parser emits UI events.

## Session and Transcript Paths

Per workspace transcript root:

`~/.pixel-billy/sessions/<workspace-hash>/`

Per agent transcript file:

`<agent-id>.jsonl`

## Transcript Semantics

The runner emits JSONL metadata records:

1. `system.agent_identity` once at session start
2. `system.billy_mode` when Billy returns `foreman_mode`
3. `system.approval_required` when Billy signals confirmation is needed
4. `system.turn_duration` for turn completion timing

Parser handling:

- `user` -> active state
- `system.turn_duration` -> waiting state
- `system.billy_mode` -> `agentMode` webview message
- `system.approval_required` -> permission bubble message
- `system.agent_identity` -> stored only, no direct UI action

## VS Code Settings

- `pixel-billy.billy.baseUrl`
- `pixel-billy.billy.askPath`
- `pixel-billy.billy.healthPath`
- `pixel-billy.billy.requestTimeoutMs`

## Key Constraint

Billy Runtime remains non-executing and external to this repository. Pixel Agents only visualizes transcript semantics and terminal session state.
