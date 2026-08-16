mod bestfit;
mod common;
mod fifo;
mod forge;
mod preemptive;
mod priority;
pub mod resource;

pub use bestfit::BestFitScheduler;
pub use fifo::FifoScheduler;
pub use forge::ForgeScheduler;
pub use preemptive::PreemptivePriorityScheduler;
pub use priority::PriorityScheduler;
pub use resource::{GpuSelectionPolicy, ResourceManager};

use zyvor_janus_model::cluster::Cluster;
use zyvor_janus_model::models::Placement;

pub trait Scheduler {
    fn schedule(
        &mut self,
        cluster: &mut Cluster,
        resource_manager: &ResourceManager,
    ) -> Vec<Placement>;
}
