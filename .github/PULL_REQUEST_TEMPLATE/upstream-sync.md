## Upstream Sync Summary

- Upstream tag: `<tag>`
- Sync branch: `sync/backport-<tag-or-date>`
- Last synced upstream ref: `<ref>`

## Commit Accounting

### Imported commits

- `<sha> <subject>`

### Adapted commits

- `<sha> <subject> -> adapted in <new-sha>`

### Rejected commits

- `<sha> <subject> (reason)`

## Validation

- [ ] `scripts/check-billy-only.sh` passed
- [ ] `npm run build` passed
- [ ] `npm run check:billy-connectivity` passed
- [ ] Full ask smoke check passed (`bash scripts/check-billy-connectivity.sh`)

## Notes

- Any manual adaptations are described here with rationale.
