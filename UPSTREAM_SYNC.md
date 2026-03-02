# Upstream Sync Runbook

This repository is Billy-only. Upstream imports from `pablodelucca/pixel-agents` must remain Billy-only.

## Operating Model

- Sync model: `mirror + backport`
- Cadence: `tag-driven`
- `main`: production Billy branch
- `mirror/upstream-main`: read-only mirror of `upstream/main`
- `sync/backport-<tag-or-date>`: working branch for selected upstream backports

Do not merge or rebase `upstream/main` directly into `main`. Histories are unrelated after cutover.

## Required Remote Configuration

- `origin`: `https://github.com/bitscon/pixel-billy.git`
- `upstream`: `https://github.com/pablodelucca/pixel-agents.git` (fetch-only)
- `upstream` push URL must remain `no_push`

Check configuration:

```bash
git remote -v
git remote get-url --push upstream
```

## Guardrails

Policy source: `claude_excluded/manifest.txt`

- `path:` rules: paths that require manual review before import
- `id:` rules: blocked identifiers that must not be added

Validation script:

- Full repository: `scripts/check-billy-only.sh`
- Diff only: `scripts/check-billy-only.sh --diff <git-range>`

## Standard Tag-Driven Sync Flow

1. Create a tracking issue using `.github/ISSUE_TEMPLATE/upstream-sync.md`
2. Prepare mirror + sync branch:

```bash
scripts/upstream-sync.sh prepare --tag <upstream-tag> --push-mirror
```

3. List candidate commits since last synced upstream ref:

```bash
scripts/upstream-sync.sh candidates --from-ref <last-synced-upstream-ref>
```

4. For each candidate commit, run diff guard:

```bash
scripts/upstream-sync.sh verify-commit <commit-sha>
```

5. Import safe commits with provenance:

```bash
scripts/upstream-sync.sh backport <commit-sha>
```

6. If a commit fails path/identifier guard:

- Do not import as-is
- Manually adapt safe hunks only, or reject the commit and record reason

7. Validate sync branch:

```bash
scripts/upstream-sync.sh validate
```

8. Run Billy connectivity gate:

```bash
# Health-only quick check
npm run check:billy-connectivity

# Full endpoint smoke test (health + ask)
bash scripts/check-billy-connectivity.sh
```

9. Open PR from `sync/backport-<...>` to `main` using `.github/PULL_REQUEST_TEMPLATE/upstream-sync.md`

10. In the PR, record:

- Upstream tag consumed
- Imported commits
- Adapted commits
- Rejected commits and rationale
- Guard/build/connectivity results

## Non-Negotiable Rules

- Never push to `upstream`
- Never bypass `check-billy-only.sh` for backports
- Never import blocked identifiers or blocked-path edits without manual adaptation
- Keep provenance with `cherry-pick -x` or explicit backport commit message
