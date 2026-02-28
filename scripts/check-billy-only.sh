#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
MANIFEST="${REPO_ROOT}/claude_excluded/manifest.txt"

if [[ ! -f "${MANIFEST}" ]]; then
  echo "Manifest not found: ${MANIFEST}" >&2
  exit 1
fi

readarray -t PATH_RULES < <(awk -F: '/^path:/{sub(/^path:/,""); print}' "${MANIFEST}")
readarray -t ID_RULES < <(awk -F: '/^id:/{sub(/^id:/,""); print}' "${MANIFEST}")

scan_scope=(
  --glob '!.git/**'
  --glob '!node_modules/**'
  --glob '!dist/**'
  --glob '!claude_excluded/**'
  --glob '!UPSTREAM_SYNC.md'
  --glob '!scripts/check-billy-only.sh'
)

fail=0

if [[ "${1:-}" == "--diff" ]]; then
  if [[ -z "${2:-}" ]]; then
    echo "Usage: $0 --diff <git-range>" >&2
    exit 2
  fi
  range="$2"

  mapfile -t changed_files < <(git -C "${REPO_ROOT}" diff --name-only "${range}")

  for path_rule in "${PATH_RULES[@]}"; do
    [[ -z "${path_rule}" ]] && continue
    for changed in "${changed_files[@]}"; do
      if [[ "${changed}" == "${path_rule}" ]]; then
        echo "Blocked path touched in diff (${range}): ${changed}"
        fail=1
      fi
    done
  done

  diff_text="$(git -C "${REPO_ROOT}" diff --unified=0 "${range}" -- .)"
  for id_rule in "${ID_RULES[@]}"; do
    [[ -z "${id_rule}" ]] && continue
    if printf '%s\n' "${diff_text}" | rg -n -i --pcre2 "^\+.*(${id_rule})" >/dev/null; then
      echo "Blocked identifier added in diff (${range}): ${id_rule}"
      fail=1
    fi
  done
else
  for id_rule in "${ID_RULES[@]}"; do
    [[ -z "${id_rule}" ]] && continue
    if rg -n -i "${id_rule}" "${REPO_ROOT}" "${scan_scope[@]}" >/dev/null; then
      echo "Blocked identifier present in repository: ${id_rule}"
      fail=1
    fi
  done
fi

if [[ "${fail}" -ne 0 ]]; then
  echo "Billy-only guard check failed."
  exit 1
fi

echo "Billy-only guard check passed."
