<div align="center">
  <img src="web/public/zyvor-logo.png" alt="Zyvor Janus" width="320">

  ### A discrete-event simulator for Kubernetes-native GPU scheduling

  [![Rust](https://github.com/hypersdk/zyvor-janus/actions/workflows/rust.yml/badge.svg)](https://github.com/hypersdk/zyvor-janus/actions/workflows/rust.yml)
  [![Python](https://github.com/hypersdk/zyvor-janus/actions/workflows/python.yml/badge.svg)](https://github.com/hypersdk/zyvor-janus/actions/workflows/python.yml)
  [![Benchmark Gates](https://github.com/hypersdk/zyvor-janus/actions/workflows/benchmark.yml/badge.svg)](https://github.com/hypersdk/zyvor-janus/actions/workflows/benchmark.yml)
  [![Publish container images](https://github.com/hypersdk/zyvor-janus/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/hypersdk/zyvor-janus/actions/workflows/docker-publish.yml)
  [![Release](https://img.shields.io/github/v/release/hypersdk/zyvor-janus?sort=semver)](https://github.com/hypersdk/zyvor-janus/releases)
  [![License: Apache-2.0](https://img.shields.io/github/license/hypersdk/zyvor-janus)](LICENSE)

  **[▶ Watch the demo](https://youtu.be/p0GQVaZ_X1A)** · [Quick start](#quick-start) · [Docs](docs/)
</div>

---

Zyvor Janus is a discrete-event simulator for Kubernetes-native GPU scheduling inspired by [Zyvor Forge](https://zyvor.dev/forge). It models clusters, MIG, topology, tenants, quotas, gang scheduling, and AI workloads, enabling scheduler development, RL research, and performance evaluation without requiring physical NVIDIA GPUs.

[![Watch the Forge + Zyvor Janus demo](https://img.youtube.com/vi/p0GQVaZ_X1A/maxresdefault.jpg)](https://youtu.be/p0GQVaZ_X1A "Watch the Forge + Zyvor Janus demo on YouTube")

**▶ [Watch the demo](https://youtu.be/p0GQVaZ_X1A)** — Forge (production GPU/Kubernetes control plane) and Zyvor Janus (its simulator) running side by side, ~3 min.

## Why Zyvor Janus

- **No GPUs required** — full discrete-event simulation of cluster placement, MIG slicing, NVLink/PCIe topology penalties, and gang scheduling
- **Forge-native** — imports real `FabricAIJob` / `FabricGPUNode` / `FabricQuota` CRDs and replays production scheduler traces for oracle-vs-live diffing
- **Pluggable schedulers** — `fifo`, `priority`, `preemptive`, `bestfit`, and Forge's own policy, swappable with one CLI flag
- **RL-ready** — Gymnasium environment + PPO baseline for scheduler policy research
- **Full observability stack** — Rich terminal dashboard, Next.js web UI (runs, benchmark, what-if), and an OpenAI-compatible inference shim for calibrated LLM serving metrics

## Table of contents

- [Architecture](#architecture)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Project layout](#project-layout)
- [Milestones](#milestones)
- [Dual-node "migrate" demo](#dual-node-migrate-demo-placement-not-live-cuda)
- [Forge input](#forge-input)
- [Enterprise & support](#enterprise--support)
- [License](#license)

## Architecture

- **Rust core** — event engine, cluster model, schedulers, metrics, Forge bundle loader, inference timing model
- **Python API** — PyO3 bindings, Forge CRD adapters, Gymnasium env, visualization, FastAPI server, AIPerf adapters
- **Web UI** — Next.js dashboard (runs, benchmark, what-if) + Rich CLI live dashboard

## Installation

### Container images (GHCR)

Pre-built images are published to GitHub Container Registry on every release:

```bash
docker pull ghcr.io/hypersdk/zyvor-janus-api:latest
docker pull ghcr.io/hypersdk/zyvor-janus-web:latest

# Run the API + web dashboard locally:
docker network create zyvor-janus 2>/dev/null || true
docker run -d --name zyvor-janus-api --network zyvor-janus -p 8080:8080 \
  ghcr.io/hypersdk/zyvor-janus-api:latest
docker run -d --name zyvor-janus-web --network zyvor-janus -p 3000:3000 \
  -e ZYVOR_JANUS_API_URL=http://zyvor-janus-api:8080 \
  ghcr.io/hypersdk/zyvor-janus-web:latest
```

Then open http://localhost:3000 (default login `Admin` / `Admin@321` — override via
`ZYVOR_JANUS_DASHBOARD_USER` / `ZYVOR_JANUS_DASHBOARD_PASSWORD` env vars on the web container).

Pin a specific release instead of `latest` with `ghcr.io/hypersdk/zyvor-janus-api:vX.Y.Z`.

### Kubernetes

```bash
cd deploy/kubernetes
cp secret.example.yaml secret.yaml   # edit credentials
kubectl apply -f secret.yaml
kubectl apply -k .
```

See [`deploy/kubernetes/README.md`](deploy/kubernetes/README.md) for the full guide
(local `kind`/`minikube` cluster, Ingress, remote k3s deploy via
`scripts/deploy-remote.sh`).

### From source (Rust CLI + Python bindings)

```bash
git clone https://github.com/hypersdk/zyvor-janus.git
cd zyvor-janus
cargo build --release -p zyvor-janus-cli

# Optional: Python bindings + web API (builds the PyO3 extension)
./scripts/setup_dev.sh
source .venv/bin/activate
pip install -e '.[server]'     # FastAPI / uvicorn (web API)
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full dev setup, including
optional `viz`, `rl`, and `dashboard` extras.

## Quick start

### Internal workload (M1)

```bash
cargo run -p zyvor-janus-cli -- run --config configs/clusters/small_h100.yaml
```

### Forge export bundle (M2 — test Forge without GPUs)

1. Export from a Forge cluster:

```bash
mkdir -p forge-export/{jobs,cluster,quotas}
kubectl get fabricaijobs -A -o yaml > forge-export/jobs/all.yaml
kubectl get fabricgpunodes -o yaml > forge-export/cluster/nodes.yaml
kubectl get fabricquotas -A -o yaml > forge-export/quotas/all.yaml
```

2. Add calibrated runtime profiles in `configs/profiles/` (see `configs/profiles/gpt-13b.yaml`).

3. Run simulation:

```bash
cargo run -p zyvor-janus-cli -- run \
  --forge-bundle forge-export \
  --profiles-dir configs/profiles
```

Or use the included fixture:

```bash
cargo run -p zyvor-janus-cli -- run \
  --forge-bundle tests/fixtures/forge \
  --profiles-dir configs/profiles
```

### Scheduler policies (M6)

```bash
# Priority: highest priority first, no preemption
cargo run -p zyvor-janus-cli -- run --config configs/clusters/priority_scheduler.yaml

# Preemptive: evict lower-priority running jobs for higher-priority arrivals
cargo run -p zyvor-janus-cli -- run --config configs/clusters/preemption_preemptive.yaml

# Forge bundle with scheduler flag (fifo | priority | preemptive | forge | bestfit)
cargo run -p zyvor-janus-cli -- run \
  --forge-bundle tests/fixtures/forge \
  --scheduler forge
```

### Scheduler trace replay (M3 — compare vs production Forge)

```bash
cargo run -p zyvor-janus-cli -- replay \
  --trace tests/fixtures/traces/fifo_match.jsonl \
  --config configs/clusters/single_gpu.yaml
```

Writes `outputs/trace_diff.json` with oracle vs FIFO placement diffs.

### MIG simulation (M4)

```bash
cargo run -p zyvor-janus-cli -- run --config configs/clusters/mig_single.yaml
```

MIG jobs use `mig_profile` and `mig_count` (Forge `spec.mig`) to allocate fractional GPU slices with a simulated reconfiguration delay.

### Topology + gang placement (M5 / M6)

```bash
# NVLink-domain-aware placement; cross-domain jobs inflate runtime
cargo run -p zyvor-janus-cli -- run --config configs/clusters/topology_penalty.yaml

# Gang jobs require GPUs spread across gang_size_nodes distinct nodes
cargo run -p zyvor-janus-cli -- run --config configs/clusters/gang_m6.yaml

# Gang timeout fails jobs that cannot be placed in time (jobs_failed metric)
cargo run -p zyvor-janus-cli -- run --config configs/clusters/gang_timeout_m6.yaml
```

### Inference + LLM serving metrics (P1)

```bash
cargo run -p zyvor-janus-cli -- run \
  --config configs/clusters/inference_llama.yaml \
  --output outputs/inference_metrics.json
```

Uses profile v2 fields (`prefill_ms_per_token`, `decode_tps`) to estimate TTFT/TPS. See [docs/benchmark_platform.md](docs/benchmark_platform.md).

### Visualization (M8)

```bash
cargo run -p zyvor-janus-cli -- run \
  --config configs/clusters/small_h100.yaml \
  --jobs-output outputs/jobs.json

pip install -e '.[viz]'
python python/examples/plot_run.py outputs/jobs.json
```

### Live CLI dashboard (Phase 1 UI)

Rich terminal dashboard — see **[docs/ui_dashboard.md](docs/ui_dashboard.md)** for full setup, scripts, and troubleshooting.

```bash
./scripts/setup_dev.sh
./scripts/run_live_dashboard.sh --config configs/clusters/small_h100.yaml
```

### Web dashboard (Phase 2 + benchmark UI)

FastAPI + Next.js — see **[docs/ui_dashboard.md](docs/ui_dashboard.md)** for API reference and scripts.

```bash
./scripts/setup_dev.sh
cd web && npm install && cd ..
./scripts/run_web_dashboard.sh    # http://localhost:3000
```

Routes: `/` (runs + compare), `/benchmark`, `/what-if`, `/login`. Or run API and UI separately: `./scripts/run_web_api.sh` · `./scripts/run_web_ui.sh`

### Deploy (Docker / Kubernetes)

```bash
./deploy/build-images.sh
kubectl apply -k deploy/kubernetes
```

See **[docs/deploy.md](docs/deploy.md)** and **[deploy/kubernetes/README.md](deploy/kubernetes/README.md)**.

### Python + RL (M7)

On macOS Homebrew Python, use the setup script if `venv` fails on `pyexpat`:

```bash
./scripts/setup_dev.sh
source .venv/bin/activate
pip install -e '.[rl]'
python python/examples/run_rl_env.py
python python/baselines/ppo_cleanrl.py --config configs/clusters/rl_small.yaml
```

### AIPerf calibration (P7)

```bash
PYTHONPATH=python python -m zyvor_janus.benchmarks.aiperf_adapter \
  import tests/fixtures/aiperf/sample_result.json --profile llama-70b
```

### OpenAI-compatible shim (P6)

With the web API running (`./scripts/run_web_api.sh`):

```bash
curl -s http://127.0.0.1:8080/v1/chat/completions \
  -H "Authorization: Bearer dev-zyvor-janus-key" \
  -H "Content-Type: application/json" \
  -d '{"model":"llama-70b","messages":[{"role":"user","content":"hi"}],"stream":false}'
```

See [docs/openai_shim.md](docs/openai_shim.md).

### Test layout

| Layer | Location | What it covers |
|-------|----------|----------------|
| Rust unit | `crates/*/src/` (`#[test]` modules) | Models, MIG, resource manager, FIFO, trace parsing |
| Rust integration | `crates/zyvor-janus-config/tests/integration.rs` | Full sim pipelines (YAML, Forge bundle, trace, MIG, RL, topology) |
| CLI integration | `crates/zyvor-janus-cli/tests/cli_integration.rs` | `zyvor-janus run` / `replay` binary |
| Python unit | `python/tests/test_unit_adapters.py` | CRD mapping, profiles, bundle, trace adapters |
| Python integration | `python/tests/test_integration_cli.py` | CLI via `cargo run -p zyvor-janus-cli` |
| Benchmark / UI | `python/tests/test_*benchmark*`, `test_server_*`, `test_openai_*` | API, shim, AIPerf, score |

```bash
cargo test --workspace --exclude zyvor-janus-py
cargo test -p zyvor-janus-config --test integration
cargo test -p zyvor-janus-cli --test cli_integration
PYTHONPATH=python python3 -m unittest discover -s python/tests -v
bash benchmarks/ci/run_golden.sh
```

## Project layout

```
crates/              Rust workspace (core, scheduler, config, metrics, cli, py)
python/zyvor_janus/     Adapters, envs, viz, dashboard, server, benchmarks, workloads
web/                 Next.js web dashboard (/ , /benchmark, /what-if)
scripts/             setup_dev.sh, run_*_dashboard.sh, clean.sh
deploy/              Docker images + Kubernetes manifests
benchmarks/ci/       Golden sim regression script
configs/
  profiles/          Calibrated model runtimes (v1 + inference v2)
  clusters/          Cluster + workload YAML examples
  analytics/         Cost model (score weights optional)
tests/fixtures/      Forge, traces, AIPerf, benchmark goldens
docs/                Architecture, milestones, UI, benchmark platform, deploy
```

## Milestones

See [docs/milestones.md](docs/milestones.md). **M1–M8 complete**, including topology runtime inflation, gang timeout, RL (M7), and visualization (M8).

**Benchmark platform (MVP shipped):** [docs/benchmark_platform.md](docs/benchmark_platform.md) — inference model, serving traces, score vector, `/benchmark` + `/what-if` UI, OpenAI shim, AIPerf adapter, twin store API, CI golden script. Remaining gaps (full sim-vs-measured UI, CLI `--serving-trace`, twin library page) are listed in that doc and the [manual test guide](docs/manual_test_benchmark_platform.md).

Schedulers: `fifo`, `priority`, `preemptive`, `forge` (alias for preemptive), `bestfit`.

## Dual-node "migrate" demo (placement, not live CUDA)

Preemptive scheduler moves a low-priority job across **machines** after preemption:

```bash
cargo run -p zyvor-janus-cli -- run --config configs/clusters/dual_node_preempt.yaml
# Dashboard + wow reel (writes ~/Desktop/zyvor-janus-client-dual-node-migrate-wow-reel.mp4)
./scripts/run_web_dashboard.sh   # separate terminal
ZYVOR_JANUS_DEMO_CONFIG=dual_node_preempt.yaml \
  node scripts/demo-videos/record-zyvor-janus-2gpu-migrate-wow-reel.mjs
```

This is a **digital-twin placement migrate**. Forge's production live migrate is KubeVirt VMs (Path A); pod checkpoint/restore is experimental Path B — see Forge [`docs/product/POD_VS_VM_MIGRATION.md`](https://github.com/ssahani/forge/blob/main/docs/product/POD_VS_VM_MIGRATION.md).

## Forge input

See [docs/forge_input.md](docs/forge_input.md) for CRD mapping rules, export workflow, and adapter levels.

## Enterprise & support

Zyvor Janus is the free digital-twin simulator for [Zyvor Forge](https://zyvor.dev/forge), the production GPU/Kubernetes control plane. Janus lets you develop and validate scheduling policy entirely offline; Forge is what runs it against real GPUs.

| | Zyvor Janus (this repo) | Zyvor Forge ([zyvor.dev/forge](https://zyvor.dev/forge)) |
|---|---|---|
| **What it is** | Discrete-event simulator / digital twin | Production GPU/Kubernetes control plane |
| **GPUs required** | None — fully simulated | Real GPU fleet |
| **Use case** | Scheduler R&D, RL research, capacity planning, CI regression gates | Live cluster scheduling, MIG/topology-aware placement, gang scheduling in production |
| **Input** | Forge CRD export bundles, YAML configs, trace replay | Live cluster via `FabricAIJob` / `FabricGPUNode` / `FabricQuota` CRDs |
| **Support** | [GitHub Issues](https://github.com/hypersdk/zyvor-janus/issues) | SLA, onboarding, migration support — [zyvor.dev/contact](https://zyvor.dev/contact?utm_source=github&utm_medium=zyvor-janus) |

Looking for enterprise support, managed deployments, or the full Forge platform? Visit **[zyvor.dev](https://zyvor.dev)**.

## License

Apache-2.0 — see [LICENSE](LICENSE).
