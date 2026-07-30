#!/usr/bin/env bash
# ============================================================================
# deploy-remote.sh — Deploy ForgeSim (API + Web) to a remote k3s host
# ============================================================================
# Pattern copied from ../forge/scripts/deploy-remote.sh and slimmed for ForgeSim:
#   1. Rsync repo to remote ~/.deployment/ZyForgeSim
#   2. Build forgesim-api + forgesim-web with podman
#   3. Import images into k3s
#   4. Apply Kubernetes manifests + NodePort services
#   5. Verify health
#
# Usage:
#   ./scripts/deploy-remote.sh <host> [user] [password]
#   ./scripts/deploy-remote.sh 212.8.248.187 sus
#   ./scripts/deploy-remote.sh 212.8.248.187 sus --quick        # skip image rebuild
#   ./scripts/deploy-remote.sh 212.8.248.187 sus --skip-images  # manifests only
#   ./scripts/deploy-remote.sh 212.8.248.187 sus --uninstall
#
# Environment:
#   DEPLOY_HOST / DEPLOY_USER / DEPLOY_PASS
#   DEPLOY_DIR                 absolute remote checkout (overrides layout)
#   DEPLOYMENTS_SUBDIR         default: .deployment  (matches lab hosts)
#   FORGESIM_CHECKOUT          default: ZyForgeSim
#   FORGESIM_IMAGE_TAG         default: 0.1.0
#   FORGESIM_UI_NODE_PORT      default: 30300
#   FORGESIM_API_NODE_PORT     default: 30808
#   FORGESIM_DASHBOARD_USER    default: Admin
#   FORGESIM_DASHBOARD_PASSWORD default: Admin@321
#   FORGESIM_AUTH_SECRET       default: forgesim-dev-secret
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/deploy-remote-ui.sh
source "${SCRIPT_DIR}/lib/deploy-remote-ui.sh"
FORGESIM_DEPLOY_START=${SECONDS}

QUICK_MODE=false
UNINSTALL_MODE=false
SKIP_IMAGES=false
SKIP_SYNC=false
POSITIONAL=()
for arg in "$@"; do
  case "$arg" in
    --quick)       QUICK_MODE=true; SKIP_IMAGES=true ;;
    --skip-images) SKIP_IMAGES=true ;;
    --skip-sync)   SKIP_SYNC=true ;;
    --uninstall)   UNINSTALL_MODE=true ;;
    --help|-h)
      sed -n '2,35p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) POSITIONAL+=("$arg") ;;
  esac
done

HOST="${POSITIONAL[0]:-${DEPLOY_HOST:-}}"
USER="${POSITIONAL[1]:-${DEPLOY_USER:-root}}"
PASS="${POSITIONAL[2]:-${DEPLOY_PASS:-}}"

[ -n "$HOST" ] || error "Usage: $0 <host> [user] [password] [--quick|--skip-images|--uninstall]"

DEPLOYMENTS_SUBDIR="${DEPLOYMENTS_SUBDIR:-.deployment}"
FORGESIM_CHECKOUT="${FORGESIM_CHECKOUT:-ZyForgeSim}"
FORGESIM_IMAGE_TAG="${FORGESIM_IMAGE_TAG:-0.1.0}"
UI_NODE_PORT="${FORGESIM_UI_NODE_PORT:-30300}"
API_NODE_PORT="${FORGESIM_API_NODE_PORT:-30808}"
DASH_USER="${FORGESIM_DASHBOARD_USER:-Admin}"
DASH_PASS="${FORGESIM_DASHBOARD_PASSWORD:-Admin@321}"
AUTH_SECRET="${FORGESIM_AUTH_SECRET:-forgesim-dev-secret}"

REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
[ -f "$REPO_DIR/deploy/docker/Dockerfile.api" ] || error "Not in ZyForgeSim repo: $REPO_DIR"
[ -f "$REPO_DIR/web/Dockerfile" ] || error "Missing web/Dockerfile in $REPO_DIR"

if [ -n "${DEPLOY_DIR:-}" ]; then
  REMOTE_DIR="$DEPLOY_DIR"
  RSYNC_DEST="${USER}@${HOST}:${DEPLOY_DIR}/"
  REMOTE_RM_TARGET="$(printf '%q' "$DEPLOY_DIR")"
else
  REMOTE_DIR="\$HOME/${DEPLOYMENTS_SUBDIR}/${FORGESIM_CHECKOUT}"
  RSYNC_DEST="${USER}@${HOST}:${DEPLOYMENTS_SUBDIR}/${FORGESIM_CHECKOUT}/"
  REMOTE_RM_TARGET="\"\$HOME/${DEPLOYMENTS_SUBDIR}/${FORGESIM_CHECKOUT}\""
fi

REMOTE_SH_PREFIX="cd \"${REMOTE_DIR}\""

_SSH_KEEPALIVE_OPTS="-o ServerAliveInterval=15 -o ServerAliveCountMax=6"
_KUBECONFIG_PREFIX='if [ -r "$HOME/.kube/config" ]; then export KUBECONFIG="$HOME/.kube/config"; fi;'

_ssh() {
  if [ -n "$PASS" ]; then
    SSHPASS="$PASS" sshpass -e ssh -o StrictHostKeyChecking=accept-new ${_SSH_KEEPALIVE_OPTS} "${USER}@${HOST}" "$_KUBECONFIG_PREFIX" "$@"
  else
    ssh -o StrictHostKeyChecking=accept-new ${_SSH_KEEPALIVE_OPTS} "${USER}@${HOST}" "$_KUBECONFIG_PREFIX" "$@"
  fi
}

_rsync() {
  local ssh_cmd="ssh -o StrictHostKeyChecking=accept-new ${_SSH_KEEPALIVE_OPTS}"
  if [ -n "$PASS" ]; then
    SSHPASS="$PASS" sshpass -e rsync -az --delete \
      -e "sshpass -e $ssh_cmd" \
      --exclude '.git/' \
      --exclude 'node_modules/' \
      --exclude 'web/node_modules/' \
      --exclude 'web/.next/' \
      --exclude '.venv/' \
      --exclude 'target/' \
      --exclude 'outputs/' \
      --exclude '*.pyc' \
      --exclude '__pycache__/' \
      "$@"
  else
    rsync -az --delete \
      -e "$ssh_cmd" \
      --exclude '.git/' \
      --exclude 'node_modules/' \
      --exclude 'web/node_modules/' \
      --exclude 'web/.next/' \
      --exclude '.venv/' \
      --exclude 'target/' \
      --exclude 'outputs/' \
      --exclude '*.pyc' \
      --exclude '__pycache__/' \
      "$@"
  fi
}

forgesim_ui_set_total 6
forgesim_ui_banner "ForgeSim Remote Deploy" "${USER}@${HOST}"
forgesim_ui_kv "Checkout" "${DEPLOYMENTS_SUBDIR}/${FORGESIM_CHECKOUT}"
forgesim_ui_kv "Image tag" "${FORGESIM_IMAGE_TAG}"
forgesim_ui_kv "UI port" "NodePort ${UI_NODE_PORT}"
forgesim_ui_kv "API port" "NodePort ${API_NODE_PORT}"
forgesim_ui_kv "Mode" "$($UNINSTALL_MODE && echo uninstall || ($SKIP_IMAGES && echo skip-images || echo full))"

# ── Uninstall ──
if $UNINSTALL_MODE; then
  step 1 2 "Remove ForgeSim from cluster"
  _ssh "${REMOTE_SH_PREFIX}; kubectl delete -k deploy/kubernetes --ignore-not-found; kubectl delete -f deploy/kubernetes/secret.yaml --ignore-not-found; kubectl delete ns forgesim --ignore-not-found" || true
  info "Namespace/resources deleted"
  step 2 2 "Optional: remove remote checkout"
  warn "Leaving ${REMOTE_DIR} in place (re-run with: ssh ${USER}@${HOST} rm -rf ${REMOTE_RM_TARGET})"
  forgesim_ui_success "$HOST" "$USER"
  exit 0
fi

# ── Sync ──
step 1 6 "Rsync source → remote"
if $SKIP_SYNC; then
  warn "Skipping rsync (--skip-sync)"
else
  _ssh "mkdir -p \"\$HOME/${DEPLOYMENTS_SUBDIR}/${FORGESIM_CHECKOUT}\""
  _rsync "${REPO_DIR}/" "${RSYNC_DEST}"
  info "Synced to ${REMOTE_DIR}"
fi

# ── Auth secret ──
step 2 6 "Configure dashboard auth secret"
_ssh "${REMOTE_SH_PREFIX}; cat > deploy/kubernetes/secret.yaml <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: forgesim-auth
  namespace: forgesim
  labels:
    app.kubernetes.io/name: forgesim
type: Opaque
stringData:
  FORGESIM_DASHBOARD_USER: ${DASH_USER}
  FORGESIM_DASHBOARD_PASSWORD: ${DASH_PASS}
  FORGESIM_AUTH_SECRET: ${AUTH_SECRET}
EOF
kubectl apply -f deploy/kubernetes/namespace.yaml
kubectl apply -f deploy/kubernetes/secret.yaml"
info "Secret forgesim-auth applied (user=${DASH_USER})"

# ── Images ──
step 3 6 "Build + import container images"
if $SKIP_IMAGES; then
  warn "Skipping image builds (--quick / --skip-images)"
else
  WS_URL="ws://${HOST}:${API_NODE_PORT}"
  _ssh "export FORGESIM_IMAGE_TAG='${FORGESIM_IMAGE_TAG}' FORGESIM_API_URL='http://forgesim-api:8080' NEXT_PUBLIC_FORGESIM_WS_URL='${WS_URL}'; ${REMOTE_SH_PREFIX}; . scripts/lib/deploy-remote-images.sh; forgesim_build_all_images"
  info "Images imported into k3s"
fi

# ── Apply manifests ──
step 4 6 "Apply Kubernetes manifests"
_ssh "export FORGESIM_IMAGE_TAG='${FORGESIM_IMAGE_TAG}' FORGESIM_UI_NODE_PORT='${UI_NODE_PORT}' FORGESIM_API_NODE_PORT='${API_NODE_PORT}'; ${REMOTE_SH_PREFIX}; \
cat > deploy/kubernetes/nodeport.yaml <<EOF
apiVersion: v1
kind: Service
metadata:
  name: forgesim-web
  namespace: forgesim
  labels:
    app.kubernetes.io/name: forgesim
    app.kubernetes.io/component: web
spec:
  type: NodePort
  selector:
    app.kubernetes.io/name: forgesim
    app.kubernetes.io/component: web
  ports:
    - name: http
      port: 3000
      targetPort: http
      nodePort: ${UI_NODE_PORT}
---
apiVersion: v1
kind: Service
metadata:
  name: forgesim-api
  namespace: forgesim
  labels:
    app.kubernetes.io/name: forgesim
    app.kubernetes.io/component: api
spec:
  type: NodePort
  selector:
    app.kubernetes.io/name: forgesim
    app.kubernetes.io/component: api
  ports:
    - name: http
      port: 8080
      targetPort: http
      nodePort: ${API_NODE_PORT}
EOF
python3 - <<'PY'
from pathlib import Path
import os, re
path = Path('deploy/kubernetes/kustomization.yaml')
tag = os.environ['FORGESIM_IMAGE_TAG']
content = path.read_text()
block = (
    '  # BEGIN forgesim-images (managed by deploy/build-images.sh — do not hand-edit)\n'
    f'  - name: forgesim-api\n    newName: forgesim-api\n    newTag: \"{tag}\"\n'
    f'  - name: forgesim-web\n    newName: forgesim-web\n    newTag: \"{tag}\"\n'
    '  # END forgesim-images\n'
)
new, n = re.subn(r'  # BEGIN forgesim-images.*?  # END forgesim-images\n', block, content, flags=re.S)
assert n == 1, n
path.write_text(new)
print('kustomization tag ->', tag)
PY
kubectl apply -k deploy/kubernetes
kubectl apply -f deploy/kubernetes/nodeport.yaml
kubectl -n forgesim rollout restart deploy/forgesim-api deploy/forgesim-web || true
kubectl -n forgesim rollout status deploy/forgesim-api --timeout=300s
kubectl -n forgesim rollout status deploy/forgesim-web --timeout=300s"
info "Workloads rolled out"

# ── Firewall (best effort) ──
step 5 6 "Open NodePorts (best-effort ufw)"
_ssh "sudo ufw allow ${UI_NODE_PORT}/tcp comment forgesim-ui 2>/dev/null || true; sudo ufw allow ${API_NODE_PORT}/tcp comment forgesim-api 2>/dev/null || true; true" || true
info "Firewall rules attempted for ${UI_NODE_PORT}/${API_NODE_PORT}"

# ── Verify ──
step 6 6 "Verify health endpoints"
sleep 3
UI_URL="http://${HOST}:${UI_NODE_PORT}"
API_URL="http://${HOST}:${API_NODE_PORT}"
if curl -fsS --connect-timeout 8 "${UI_URL}/login" >/dev/null; then
  info "UI reachable: ${UI_URL}/login"
else
  warn "UI not reachable yet at ${UI_URL}/login — check: kubectl -n forgesim get pods,svc"
fi
if curl -fsS --connect-timeout 8 "${API_URL}/api/health" >/dev/null; then
  info "API healthy: ${API_URL}/api/health"
else
  warn "API health check failed at ${API_URL}/api/health"
fi

forgesim_ui_success "$HOST" "$USER"
forgesim_ui_panel "Access" \
  "Web UI:  ${UI_URL}" \
  "API:     ${API_URL}/api/health" \
  "Login:   ${DASH_USER} / ${DASH_PASS}" \
  "WS URL:  ws://${HOST}:${API_NODE_PORT}" \
  "" \
  "Redeploy fast: ./scripts/deploy-remote.sh ${HOST} ${USER} --quick"
