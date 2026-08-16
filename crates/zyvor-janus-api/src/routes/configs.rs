use axum::extract::State;
use axum::response::IntoResponse;
use axum::Json;
use serde::Serialize;

use crate::error::ApiError;
use crate::state::AppState;

#[derive(Serialize)]
pub struct ConfigEntry {
    id: String,
    path: String,
}

/// `GET /api/configs` -- lists `configs/clusters/*.yaml`, matching the
/// Python server's `_list_configs()` (id = filename, path = relative to
/// repo root, sorted).
pub async fn list_configs(State(state): State<AppState>) -> Result<impl IntoResponse, ApiError> {
    let config_dir = &state.inner.config_dir;
    if !config_dir.exists() {
        return Ok(Json(Vec::<ConfigEntry>::new()));
    }

    let mut entries: Vec<ConfigEntry> = std::fs::read_dir(config_dir)?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| path.extension().and_then(|e| e.to_str()) == Some("yaml"))
        .map(|path| {
            let id = path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            let rel = path
                .strip_prefix(&state.inner.repo_root)
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|_| path.to_string_lossy().to_string());
            ConfigEntry { id, path: rel }
        })
        .collect();

    entries.sort_by(|a, b| a.id.cmp(&b.id));

    Ok(Json(entries))
}
