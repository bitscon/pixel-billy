#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CHECK_SCRIPT="${SCRIPT_DIR}/check-billy-only.sh"

usage() {
  cat <<'EOF'
Usage:
  scripts/upstream-sync.sh prepare [--tag <upstream-tag>] [--sync-branch <branch>] [--push-mirror]
  scripts/upstream-sync.sh candidates --from-ref <ref> [--to-ref <ref>]
  scripts/upstream-sync.sh verify-commit <commit-sha>
  scripts/upstream-sync.sh backport <commit-sha>
  scripts/upstream-sync.sh validate
  scripts/upstream-sync.sh help

Commands:
  prepare       Fetch remotes, update mirror/upstream-main, and create a sync branch from origin/main.
  candidates    List upstream commits to evaluate for backport.
  verify-commit Run Billy-only diff guards for a specific upstream commit.
  backport      Guard-check and cherry-pick one upstream commit with -x provenance.
  validate      Run full Billy-only guard check and project build.
EOF
}

die() {
  echo "Error: $*" >&2
  exit 1
}

ensure_repo() {
  git -C "${REPO_ROOT}" rev-parse --git-dir >/dev/null 2>&1 || die "Not a git repository: ${REPO_ROOT}"
}

ensure_remote() {
  local name="$1"
  git -C "${REPO_ROOT}" remote get-url "${name}" >/dev/null 2>&1 || die "Missing git remote '${name}'"
}

ensure_upstream_no_push() {
  local push_url
  push_url="$(git -C "${REPO_ROOT}" remote get-url --push upstream)"
  if [[ "${push_url}" != "no_push" ]]; then
    die "Remote 'upstream' push URL must be 'no_push' (found '${push_url}')."
  fi
}

ensure_clean_worktree() {
  if [[ -n "$(git -C "${REPO_ROOT}" status --short)" ]]; then
    die "Working tree is not clean. Commit or stash local changes first."
  fi
}

run_prepare() {
  local tag=""
  local sync_branch=""
  local push_mirror=0

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --tag)
        [[ $# -ge 2 ]] || die "--tag requires a value"
        tag="$2"
        shift 2
        ;;
      --sync-branch)
        [[ $# -ge 2 ]] || die "--sync-branch requires a value"
        sync_branch="$2"
        shift 2
        ;;
      --push-mirror)
        push_mirror=1
        shift
        ;;
      *)
        die "Unknown option for prepare: $1"
        ;;
    esac
  done

  git -C "${REPO_ROOT}" fetch origin --prune
  git -C "${REPO_ROOT}" fetch upstream --tags --prune

  ensure_upstream_no_push

  git -C "${REPO_ROOT}" checkout -B mirror/upstream-main upstream/main >/dev/null

  if [[ "${push_mirror}" -eq 1 ]]; then
    git -C "${REPO_ROOT}" push -u origin mirror/upstream-main --force-with-lease
  else
    echo "Mirror branch updated locally: mirror/upstream-main"
    echo "To publish mirror/upstream-main run:"
    echo "  git push -u origin mirror/upstream-main --force-with-lease"
  fi

  if [[ -n "${sync_branch}" ]]; then
    :
  elif [[ -n "${tag}" ]]; then
    sync_branch="sync/backport-${tag}"
  else
    sync_branch="sync/backport-$(date +%Y%m%d)"
  fi

  git -C "${REPO_ROOT}" checkout -B "${sync_branch}" origin/main >/dev/null

  echo "Prepared sync branch: ${sync_branch}"
  if [[ -n "${tag}" ]]; then
    if git -C "${REPO_ROOT}" rev-parse --verify "refs/tags/${tag}" >/dev/null 2>&1; then
      echo
      echo "Candidate commits from ${tag}..upstream/main:"
      git -C "${REPO_ROOT}" log --reverse --oneline "${tag}..upstream/main"
    else
      echo "Warning: Tag '${tag}' not found locally. Fetch tags or provide --from-ref later."
    fi
  else
    echo "Next step:"
    echo "  scripts/upstream-sync.sh candidates --from-ref <last-synced-upstream-ref>"
  fi
}

run_candidates() {
  local from_ref=""
  local to_ref="upstream/main"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --from-ref)
        [[ $# -ge 2 ]] || die "--from-ref requires a value"
        from_ref="$2"
        shift 2
        ;;
      --to-ref)
        [[ $# -ge 2 ]] || die "--to-ref requires a value"
        to_ref="$2"
        shift 2
        ;;
      *)
        die "Unknown option for candidates: $1"
        ;;
    esac
  done

  [[ -n "${from_ref}" ]] || die "candidates requires --from-ref <ref>"
  git -C "${REPO_ROOT}" rev-parse --verify "${from_ref}" >/dev/null 2>&1 || die "Unknown ref: ${from_ref}"
  git -C "${REPO_ROOT}" rev-parse --verify "${to_ref}" >/dev/null 2>&1 || die "Unknown ref: ${to_ref}"

  git -C "${REPO_ROOT}" log --reverse --oneline "${from_ref}..${to_ref}"
}

run_verify_commit() {
  local sha="${1:-}"
  [[ -n "${sha}" ]] || die "verify-commit requires <commit-sha>"
  git -C "${REPO_ROOT}" rev-parse --verify "${sha}^{commit}" >/dev/null 2>&1 || die "Unknown commit: ${sha}"
  "${CHECK_SCRIPT}" --diff "${sha}^..${sha}"
}

run_backport() {
  local sha="${1:-}"
  [[ -n "${sha}" ]] || die "backport requires <commit-sha>"
  git -C "${REPO_ROOT}" rev-parse --verify "${sha}^{commit}" >/dev/null 2>&1 || die "Unknown commit: ${sha}"

  "${CHECK_SCRIPT}" --diff "${sha}^..${sha}"
  git -C "${REPO_ROOT}" cherry-pick -x "${sha}"
}

run_validate() {
  "${CHECK_SCRIPT}"
  (cd "${REPO_ROOT}" && npm run build)
}

main() {
  ensure_repo
  ensure_remote origin
  ensure_remote upstream

  local cmd="${1:-help}"
  shift || true

  case "${cmd}" in
    prepare)
      ensure_clean_worktree
      run_prepare "$@"
      ;;
    candidates)
      run_candidates "$@"
      ;;
    verify-commit)
      run_verify_commit "$@"
      ;;
    backport)
      ensure_clean_worktree
      run_backport "$@"
      ;;
    validate)
      run_validate
      ;;
    help|-h|--help)
      usage
      ;;
    *)
      die "Unknown command: ${cmd}"
      ;;
  esac
}

main "$@"
