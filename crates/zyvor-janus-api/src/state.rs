use std::path::PathBuf;
use std::sync::Arc;

use crate::run_registry::{new_registry, RunRegistry};

/// Shared application state, mirroring the env-driven paths the Python
/// server resolves today (`ZYVOR_JANUS_ROOT`/`CONFIG_DIR`/`RUNS_DIR`/`PROFILES_DIR`).
#[derive(Clone)]
pub struct AppState {
    pub inner: Arc<AppStateInner>,
}

pub struct AppStateInner {
    pub repo_root: PathBuf,
    pub config_dir: PathBuf,
    pub runs_dir: PathBuf,
    // Reserved: no route accepts explicit MIG/model profile overrides yet
    // (Python's server doesn't either -- both always resolve profiles from
    // the config file). Kept for parity with the env vars Python already
    // reads, and for whenever that override lands.
    #[allow(dead_code)]
    pub profiles_dir: PathBuf,
    pub api_key: String,
    pub ws_ticket_secret: String,
    pub runs: RunRegistry,
}

impl AppState {
    pub fn from_env() -> Self {
        let repo_root =
            PathBuf::from(std::env::var("ZYVOR_JANUS_ROOT").unwrap_or_else(|_| ".".to_string()));
        let config_dir = std::env::var("ZYVOR_JANUS_CONFIG_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| repo_root.join("configs").join("clusters"));
        let runs_dir = std::env::var("ZYVOR_JANUS_RUNS_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| repo_root.join("outputs").join("runs"));
        let profiles_dir = std::env::var("ZYVOR_JANUS_PROFILES_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| repo_root.join("configs").join("profiles"));
        let api_key = std::env::var("ZYVOR_JANUS_API_KEY")
            .unwrap_or_else(|_| "dev-zyvor-janus-key".to_string());
        let ws_ticket_secret = std::env::var("ZYVOR_JANUS_WS_TICKET_SECRET")
            .unwrap_or_else(|_| "dev-zyvor-janus-ws-ticket-secret".to_string());

        Self {
            inner: Arc::new(AppStateInner {
                repo_root,
                config_dir,
                runs_dir,
                profiles_dir,
                api_key,
                ws_ticket_secret,
                runs: new_registry(),
            }),
        }
    }
}
