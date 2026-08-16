mod auth;
mod error;
mod routes;
mod run_registry;
mod state;

use axum::routing::get;
use axum::{middleware, Router};
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

use state::AppState;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let state = AppState::from_env();

    // `/api/health` is intentionally NOT behind the bearer-auth layer --
    // K8s liveness/readiness probes (deploy/kubernetes/api.yaml) call it
    // with no credentials, matching the Python server's behavior.
    let public_routes = Router::new().route("/api/health", get(routes::health::health));

    let authenticated_routes = Router::new()
        .route("/api/configs", get(routes::configs::list_configs))
        .route(
            "/api/runs",
            get(routes::runs::list_runs).post(routes::runs::start_run),
        )
        .route("/api/runs/:id", get(routes::runs::get_run))
        .route("/api/runs/:id/snapshots", get(routes::runs::get_snapshots))
        .route("/api/runs/:id/timeline", get(routes::runs::get_timeline))
        .route("/api/runs/:id/events", get(routes::runs::get_events))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth::require_bearer_token,
        ));

    let app = public_routes
        .merge(authenticated_routes)
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = "0.0.0.0:8080";
    tracing::info!("zyvor-janus-api listening on {addr}");
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("bind 0.0.0.0:8080");

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("server error");
}

async fn shutdown_signal() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("failed to install Ctrl+C handler");
    };

    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("failed to install signal handler")
            .recv()
            .await;
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
    tracing::info!("shutting down");
}
