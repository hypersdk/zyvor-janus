use std::path::PathBuf;
use std::sync::Arc;

/// Shared application state, mirroring the env-driven paths the Python
/// server resolves today (`ZYVOR_JANUS_ROOT`/`CONFIG_DIR`/`RUNS_DIR`/`PROFILES_DIR`).
#[derive(Clone)]
pub struct AppState {
    pub inner: Arc<AppStateInner>,
}

pub struct AppStateInner {
    pub repo_root: PathBuf,
    pub config_dir: PathBuf,
    // Read starting in Phase 2 (run JSON persistence) / Phase 4 (MIG/model
    // profile loading for run submission).
    #[allow(dead_code)]
    pub runs_dir: PathBuf,
    #[allow(dead_code)]
    pub profiles_dir: PathBuf,
    pub api_key: String,
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

        Self {
            inner: Arc::new(AppStateInner {
                repo_root,
                config_dir,
                runs_dir,
                profiles_dir,
                api_key,
            }),
        }
    }
}
