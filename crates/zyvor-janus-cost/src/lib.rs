// Copyright 2026 ZyvorAI Labs Private Limited
// SPDX-License-Identifier: Apache-2.0

//! GPU cost model -- seed crate for future multi-provider cloud pricing.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CostModel {
    #[serde(default = "default_gpu_hour_usd")]
    pub gpu_hour_usd: f64,
}

fn default_gpu_hour_usd() -> f64 {
    3.50
}
