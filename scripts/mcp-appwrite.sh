#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ENV_FILE="$ROOT_DIR/.env.mcp"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

if [[ -z "${APPWRITE_API_KEY:-}" ]]; then
  APPWRITE_KEYCHAIN_SERVICE="${APPWRITE_KEYCHAIN_SERVICE:-tmctqs-appwrite-api-key}"
  APPWRITE_KEYCHAIN_ACCOUNT="${APPWRITE_KEYCHAIN_ACCOUNT:-appwrite}"
  APPWRITE_API_KEY="$(security find-generic-password -w -s "$APPWRITE_KEYCHAIN_SERVICE" -a "$APPWRITE_KEYCHAIN_ACCOUNT" 2>/dev/null || true)"
fi

if [[ -z "${APPWRITE_ENDPOINT:-}" || -z "${APPWRITE_PROJECT_ID:-}" || -z "${APPWRITE_API_KEY:-}" ]]; then
  ENV_FILE_FALLBACK="$ROOT_DIR/.env"
  if [[ -f "$ENV_FILE_FALLBACK" ]]; then
    set -a
    source "$ENV_FILE_FALLBACK"
    set +a
  fi
fi

if [[ -z "${APPWRITE_ENDPOINT:-}" || -z "${APPWRITE_PROJECT_ID:-}" || -z "${APPWRITE_API_KEY:-}" ]]; then
  echo "Faltam variáveis: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY" >&2
  exit 1
fi

# Appwrite 1.7.x usa Databases (collections); TablesDB exige 1.8+
UVX_BIN="${UVX_BIN:-uvx}"
MCP_APPWRITE_VERSION="${MCP_APPWRITE_VERSION:-0.2.3}"
APPWRITE_SDK_VERSION="${APPWRITE_SDK_VERSION:-11.1.0}"
exec "$UVX_BIN" --isolated --with "appwrite==${APPWRITE_SDK_VERSION}" "mcp-server-appwrite@${MCP_APPWRITE_VERSION}" --databases --users --storage --teams
