#!/usr/bin/env bash
# Build and optionally push ForgeSim container images.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

REGISTRY="${REGISTRY:-}"
TAG="${TAG:-0.1.0}"
PUSH="${PUSH:-0}"
API_IMAGE="${API_IMAGE:-forgesim-api:${TAG}}"
WEB_IMAGE="${WEB_IMAGE:-forgesim-web:${TAG}}"
FORGESIM_API_URL="${FORGESIM_API_URL:-http://forgesim-api:8080}"

if [[ -n "$REGISTRY" ]]; then
  API_IMAGE="${REGISTRY}/forgesim-api:${TAG}"
  WEB_IMAGE="${REGISTRY}/forgesim-web:${TAG}"
fi

echo "Building API image: ${API_IMAGE}"
docker build -f deploy/docker/Dockerfile.api -t "$API_IMAGE" .

echo "Building Web image: ${WEB_IMAGE} (FORGESIM_API_URL=${FORGESIM_API_URL})"
docker build -f web/Dockerfile \
  --build-arg "FORGESIM_API_URL=${FORGESIM_API_URL}" \
  -t "$WEB_IMAGE" \
  web

if [[ "$PUSH" == "1" ]]; then
  echo "Pushing ${API_IMAGE}"
  docker push "$API_IMAGE"
  echo "Pushing ${WEB_IMAGE}"
  docker push "$WEB_IMAGE"
fi

KUSTOMIZATION="$ROOT/deploy/kubernetes/kustomization.yaml"
API_NAME="${API_IMAGE%:*}"
WEB_NAME="${WEB_IMAGE%:*}"

python3 - "$KUSTOMIZATION" "$API_NAME" "$WEB_NAME" "$TAG" <<'PYEOF'
import re
import sys

path, api_name, web_name, tag = sys.argv[1:5]
with open(path) as f:
    content = f.read()

block = (
    "  # BEGIN forgesim-images (managed by deploy/build-images.sh — do not hand-edit)\n"
    f"  - name: forgesim-api\n    newName: {api_name}\n    newTag: \"{tag}\"\n"
    f"  - name: forgesim-web\n    newName: {web_name}\n    newTag: \"{tag}\"\n"
    "  # END forgesim-images\n"
)
new_content, count = re.subn(
    r"  # BEGIN forgesim-images.*?  # END forgesim-images\n",
    block,
    content,
    flags=re.S,
)
if count != 1:
    sys.exit(f"expected exactly one forgesim-images marker block in {path}, found {count}")
with open(path, "w") as f:
    f.write(new_content)
PYEOF

echo "Synced image refs into ${KUSTOMIZATION}"

cat <<EOF

Images ready:
  API: ${API_IMAGE}
  Web: ${WEB_IMAGE}

kustomization.yaml image refs were updated automatically to match the images just built.

Deploy:
  cd deploy/kubernetes
  cp secret.example.yaml secret.yaml   # edit credentials
  kubectl apply -f secret.yaml
  kubectl apply -k .
EOF
