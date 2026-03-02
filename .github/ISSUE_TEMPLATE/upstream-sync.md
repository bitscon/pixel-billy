---
name: Upstream Sync
about: Track a tag-driven upstream sync cycle
title: "Upstream Sync: <upstream-tag>"
labels: ["upstream-sync"]
assignees: []
---

## Scope

- Upstream tag: `<tag>`
- Last synced upstream ref: `<ref>`
- Sync branch: `sync/backport-<tag-or-date>`

## Candidate Review

- [ ] Candidate list generated with `scripts/upstream-sync.sh candidates --from-ref <ref>`
- [ ] Each candidate commit reviewed for Billy compatibility
- [ ] Each candidate commit checked with `scripts/upstream-sync.sh verify-commit <sha>`

## Backport Ledger

### Imported commits

- [ ] `<sha> <subject>`

### Adapted commits

- [ ] `<sha> <subject> -> adapted in <new-sha>`

### Rejected commits

- [ ] `<sha> <subject> (reason)`

## Validation Evidence

- [ ] `scripts/upstream-sync.sh validate` passed
- [ ] `npm run check:billy-connectivity` passed
- [ ] Full ask smoke check passed: `bash scripts/check-billy-connectivity.sh`

## PR Link

- [ ] PR opened: `<url>`
