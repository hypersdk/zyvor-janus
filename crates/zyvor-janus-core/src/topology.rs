use std::collections::{HashSet};

use crate::cluster::Cluster;
use crate::models::Job;

/// Synthetic cluster topology derived from hardware profile bandwidth constants.
#[derive(Debug, Clone)]
pub struct TopologyGraph {
    pub nvlink_bw_gbs: f64,
    pub pcie_bw_gbs: f64,
}

impl Default for TopologyGraph {
    fn default() -> Self {
        Self {
            nvlink_bw_gbs: 900.0,
            pcie_bw_gbs: 64.0,
        }
    }
}

impl TopologyGraph {
    pub fn from_profile_bandwidths(nvlink_bw_gbs: f64, pcie_bw_gbs: f64) -> Self {
        Self {
            nvlink_bw_gbs: nvlink_bw_gbs.max(1.0),
            pcie_bw_gbs: pcie_bw_gbs.max(1.0),
        }
    }

    /// Inflate runtime when a topology-aware job spans NVLink domains or nodes.
    pub fn runtime_multiplier(
        &self,
        cluster: &Cluster,
        job: &Job,
        gpu_ids: &[String],
        used_topology_fallback: bool,
    ) -> f64 {
        if !used_topology_fallback && !spans_multiple_domains(cluster, gpu_ids) {
            return 1.0;
        }
        if !job.gang_enabled && job.network_bw_gbps.is_none() && !used_topology_fallback {
            return 1.0;
        }

        let groups = distinct_nvlink_groups(cluster, gpu_ids);
        let nodes = distinct_nodes(cluster, gpu_ids);
        if groups <= 1 && nodes <= 1 {
            return 1.0;
        }

        let mut multiplier = 1.0;
        if groups > 1 {
            let pcie_ratio = self.pcie_bw_gbs / self.nvlink_bw_gbs;
            multiplier += (groups - 1) as f64 * pcie_ratio * 0.25;
        }
        if nodes > 1 {
            let inter_node_penalty = if let Some(req) = job.network_bw_gbps {
                (400.0 / req.max(1.0)).max(1.0) * 0.1
            } else {
                0.15
            };
            multiplier += (nodes - 1) as f64 * inter_node_penalty;
        }
        multiplier
    }
}

fn distinct_nvlink_groups(cluster: &Cluster, gpu_ids: &[String]) -> usize {
    gpu_ids
        .iter()
        .filter_map(|id| cluster.gpu(id))
        .map(|g| g.nvlink_group)
        .collect::<HashSet<_>>()
        .len()
}

fn distinct_nodes(cluster: &Cluster, gpu_ids: &[String]) -> usize {
    gpu_ids
        .iter()
        .filter_map(|id| cluster.gpu(id))
        .map(|g| g.node_id.as_str())
        .collect::<HashSet<_>>()
        .len()
}

fn spans_multiple_domains(cluster: &Cluster, gpu_ids: &[String]) -> bool {
    distinct_nvlink_groups(cluster, gpu_ids) > 1 || distinct_nodes(cluster, gpu_ids) > 1
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{Gpu, Node};

    #[test]
    fn single_domain_has_unit_multiplier() {
        let cluster = Cluster::new(vec![Node {
            id: "n0".into(),
            gpus: vec![
                Gpu {
                    id: "g0".into(),
                    node_id: "n0".into(),
                    profile: "H100".into(),
                    memory_gb: 80.0,
                    nvlink_group: Some(0),
                    running_job_id: None,
                    mig_capable: false,
                    active_mig_profile: None,
                    slices: Vec::new(),
                },
                Gpu {
                    id: "g1".into(),
                    node_id: "n0".into(),
                    profile: "H100".into(),
                    memory_gb: 80.0,
                    nvlink_group: Some(0),
                    running_job_id: None,
                    mig_capable: false,
                    active_mig_profile: None,
                    slices: Vec::new(),
                },
            ],
        }]);
        let topo = TopologyGraph::default();
        let mut job = Job::new("j1", "net", 0.0, 10.0, 2);
        job.network_bw_gbps = Some(200.0);
        let mult = topo.runtime_multiplier(&cluster, &job, &["g0".into(), "g1".into()], false);
        assert_eq!(mult, 1.0);
    }

    #[test]
    fn cross_domain_inflates_runtime() {
        let cluster = Cluster::new(vec![Node {
            id: "n0".into(),
            gpus: vec![
                Gpu {
                    id: "g0".into(),
                    node_id: "n0".into(),
                    profile: "H100".into(),
                    memory_gb: 80.0,
                    nvlink_group: Some(0),
                    running_job_id: None,
                    mig_capable: false,
                    active_mig_profile: None,
                    slices: Vec::new(),
                },
                Gpu {
                    id: "g1".into(),
                    node_id: "n0".into(),
                    profile: "H100".into(),
                    memory_gb: 80.0,
                    nvlink_group: Some(1),
                    running_job_id: None,
                    mig_capable: false,
                    active_mig_profile: None,
                    slices: Vec::new(),
                },
            ],
        }]);
        let topo = TopologyGraph::from_profile_bandwidths(900.0, 64.0);
        let mut job = Job::new("j1", "net", 0.0, 10.0, 2);
        job.network_bw_gbps = Some(200.0);
        let mult = topo.runtime_multiplier(&cluster, &job, &["g0".into(), "g1".into()], true);
        assert!(mult > 1.0);
    }
}
