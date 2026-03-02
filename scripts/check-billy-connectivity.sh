#!/usr/bin/env bash
set -euo pipefail

BASE_URL="http://127.0.0.1:5001"
HEALTH_PATH="/health"
ASK_PATH="/ask"
TIMEOUT_SECONDS=15
SKIP_ASK=0

usage() {
  cat <<'EOF'
Usage:
  scripts/check-billy-connectivity.sh [options]

Options:
  --base-url <url>          Billy Runtime base URL (default: http://127.0.0.1:5001)
  --health-path <path>      Health path (default: /health)
  --ask-path <path>         Ask path (default: /ask)
  --timeout-seconds <n>     Request timeout in seconds (default: 15)
  --skip-ask                Only run health check
  --help                    Show help
EOF
}

die() {
  echo "Error: $*" >&2
  exit 1
}

normalize_path() {
  local raw="$1"
  [[ -n "${raw}" ]] || die "Path cannot be empty"
  if [[ "${raw}" == /* ]]; then
    printf '%s' "${raw%/}"
  else
    printf '/%s' "${raw%/}"
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url)
      [[ $# -ge 2 ]] || die "--base-url requires a value"
      BASE_URL="$2"
      shift 2
      ;;
    --health-path)
      [[ $# -ge 2 ]] || die "--health-path requires a value"
      HEALTH_PATH="$2"
      shift 2
      ;;
    --ask-path)
      [[ $# -ge 2 ]] || die "--ask-path requires a value"
      ASK_PATH="$2"
      shift 2
      ;;
    --timeout-seconds)
      [[ $# -ge 2 ]] || die "--timeout-seconds requires a value"
      TIMEOUT_SECONDS="$2"
      shift 2
      ;;
    --skip-ask)
      SKIP_ASK=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      die "Unknown option: $1"
      ;;
  esac
done

command -v curl >/dev/null 2>&1 || die "curl is required"

if ! [[ "${TIMEOUT_SECONDS}" =~ ^[0-9]+$ ]] || [[ "${TIMEOUT_SECONDS}" -lt 1 ]]; then
  die "--timeout-seconds must be a positive integer"
fi

BASE_URL="${BASE_URL%/}"
HEALTH_PATH="$(normalize_path "${HEALTH_PATH}")"
ASK_PATH="$(normalize_path "${ASK_PATH}")"

health_url="${BASE_URL}${HEALTH_PATH}"
ask_url="${BASE_URL}${ASK_PATH}"

health_code="$(curl -sS -o /dev/null -w '%{http_code}' -m "${TIMEOUT_SECONDS}" "${health_url}" || true)"
if [[ ! "${health_code}" =~ ^2[0-9][0-9]$ ]]; then
  die "Health check failed at ${health_url} (HTTP ${health_code:-n/a})"
fi

echo "Health check passed at ${health_url} (HTTP ${health_code})"

if [[ "${SKIP_ASK}" -eq 1 ]]; then
  echo "Skipped ask check (--skip-ask)."
  exit 0
fi

session_id="pixel-billy-smoke-$(date +%s)"
payload="$(printf '{"prompt":"Connectivity smoke test. Reply with ok.","session_id":"%s"}' "${session_id}")"
ask_code="$(curl -sS -o /dev/null -w '%{http_code}' -m "${TIMEOUT_SECONDS}" \
  -X POST "${ask_url}" \
  -H 'Content-Type: application/json' \
  -d "${payload}" || true)"

if [[ ! "${ask_code}" =~ ^2[0-9][0-9]$ ]]; then
  die "Ask check failed at ${ask_url} (HTTP ${ask_code:-n/a})"
fi

echo "Ask check passed at ${ask_url} (HTTP ${ask_code})"
echo "Billy connectivity smoke check passed."
