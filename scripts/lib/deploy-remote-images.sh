#!/usr/bin/env bash
# shellcheck shell=bash
# Remote image build + k3s import helpers (sourced by deploy-remote.sh on the build host).
# Pattern copied from ../forge/scripts/lib/deploy-remote-images.sh (slimmed for API + Web).

set -euo pipefail
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PATH:-}"

FORGESIM_IMAGE_TAG="${FORGESIM_IMAGE_TAG:-0.1.0}"

forgesim_k3s_ctr() {
  if [ -n "${FORGESIM_K3S_CTR_CMD:-}" ]; then
    "${FORGESIM_K3S_CTR_CMD[@]}" "$@"
    return
  fi
  if [ -x /usr/local/bin/k3s ]; then
    sudo /usr/local/bin/k3s ctr "$@"
  else
    sudo k3s ctr "$@"
  fi
}

forgesim_detect_k3s_ctr() {
  if [ -x /usr/local/bin/k3s ] && sudo /usr/local/bin/k3s ctr images ls &>/dev/null; then
    FORGESIM_K3S_CTR_CMD=(sudo /usr/local/bin/k3s ctr)
  elif command -v k3s &>/dev/null && sudo k3s ctr images ls &>/dev/null; then
    FORGESIM_K3S_CTR_CMD=(sudo k3s ctr)
  elif command -v k3s &>/dev/null && k3s ctr images ls &>/dev/null; then
    FORGESIM_K3S_CTR_CMD=(k3s ctr)
  else
    return 1
  fi
}

forgesim_container_cmd() {
  if command -v podman &>/dev/null; then
    echo podman
  elif command -v docker &>/dev/null; then
    echo docker
  else
    return 1
  fi
}

forgesim_import_image() {
  local tag="$1"
  local ctr="$2"
  echo "  Importing ${tag} into k3s..."
  # Short names like forgesim-web:0.1.0 resolve to docker.io/library/<name> in k3s.
  for ref in "docker.io/library/${tag}" "docker.io/${tag}" "${tag}" "localhost/${tag}"; do
    forgesim_k3s_ctr images rm "${ref}" 2>/dev/null || true
  done
  "$ctr" save "$tag" | forgesim_k3s_ctr images import -
  forgesim_k3s_ctr images tag "localhost/${tag}" "docker.io/library/${tag}" 2>/dev/null || true
  forgesim_k3s_ctr images tag "localhost/${tag}" "docker.io/${tag}" 2>/dev/null || true
  forgesim_k3s_ctr images tag "localhost/${tag}" "${tag}" 2>/dev/null || true
}

forgesim_build_api() {
  local ctr="$1"
  local tag="forgesim-api:${FORGESIM_IMAGE_TAG}"
  echo "  Building ${tag}..."
  "$ctr" build -t "$tag" -f deploy/docker/Dockerfile.api .
  forgesim_import_image "$tag" "$ctr"
}

forgesim_build_web() {
  local ctr="$1"
  local tag="forgesim-web:${FORGESIM_IMAGE_TAG}"
  local api_url="${FORGESIM_API_URL:-http://forgesim-api:8080}"
  local ws_url="${NEXT_PUBLIC_FORGESIM_WS_URL:-}"
  echo "  Building ${tag} (FORGESIM_API_URL=${api_url} NEXT_PUBLIC_FORGESIM_WS_URL=${ws_url:-unset})..."
  local args=(
    -t "$tag"
    -f web/Dockerfile
    --build-arg "FORGESIM_API_URL=${api_url}"
  )
  if [ -n "$ws_url" ]; then
    args+=(--build-arg "NEXT_PUBLIC_FORGESIM_WS_URL=${ws_url}")
  fi
  "$ctr" build "${args[@]}" web
  forgesim_import_image "$tag" "$ctr"
}

forgesim_build_all_images() {
  local ctr
  ctr="$(forgesim_container_cmd)" || {
    echo "MISSING: podman or docker required to build images"
    return 1
  }
  forgesim_detect_k3s_ctr || {
    echo "MISSING: k3s ctr required to import images (tried sudo /usr/local/bin/k3s ctr)"
    return 1
  }
  echo "  Container runtime: ${ctr}"
  forgesim_build_api "$ctr"
  forgesim_build_web "$ctr"
  echo "  Images ready: forgesim-api:${FORGESIM_IMAGE_TAG} forgesim-web:${FORGESIM_IMAGE_TAG}"
}
