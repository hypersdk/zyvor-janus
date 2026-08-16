#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
cargo test -p zyvor-janus-config integration_inference_workload_reports_ttft_metrics -- --nocapture
cargo test -p zyvor-janus-config integration_serving_trace_import_roundtrip -- --nocapture
echo "golden inference benchmark ok"
