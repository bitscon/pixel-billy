# UPSTREAM_SYNC.md

This repository is Billy-only. Upstream imports from `pablodelucca/pixel-agents` must stay Billy-only.

## Remotes

- `origin`: `https://github.com/bitscon/pixel-billy.git`
- `upstream`: `https://github.com/pablodelucca/pixel-agents.git` (fetch-only)
- `upstream` push URL is set to `no_push` and must not be changed.

## Exclusion Policy (Option B: manifest-driven)

Policy source: `claude_excluded/manifest.txt`

- `path:` rules: files requiring explicit manual review before import.
- `id:` rules: blocked identifiers that must not appear in repository code.

Validation tool: `scripts/check-billy-only.sh`

- Full-tree validation:
  - `scripts/check-billy-only.sh`
- Diff-only validation (for upstream candidates):
  - `scripts/check-billy-only.sh --diff <git-range>`

## Safe Upstream Sync Workflow

1. Fetch upstream changes

```bash
git fetch upstream
```

2. Create a sync branch

```bash
git checkout -b sync/upstream-$(date +%Y%m%d)
```

3. Inspect incoming commits

```bash
git log --reverse --oneline origin/main..upstream/main
```

4. Pre-screen candidate commits (paths + identifiers)

```bash
# Example: validate a specific commit before applying
scripts/check-billy-only.sh --diff <commit-sha>^..<commit-sha>
```

If validation fails, do not import that commit as-is.

5. Apply only safe changes

- Preferred: `git cherry-pick -x <commit-sha>`
- Alternative: generate/apply a filtered patch for selected hunks only.

6. Re-run validations

```bash
scripts/check-billy-only.sh
npm run build
```

7. Commit with provenance

```bash
git commit -m "chore(upstream): sync from pablodelucca/pixel-agents (claude-free)"
```

## Non-Negotiable Rules

- Never push to `upstream`.
- Never import any change that introduces blocked identifiers from `claude_excluded/manifest.txt`.
- Never import changes to blocked paths without explicit manual review and local edits to keep Billy-only behavior.
